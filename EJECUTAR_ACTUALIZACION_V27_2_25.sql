-- ============================================================================
-- CD SAN BERNABÉ MANAGER · V27.2.25
-- MULTIEQUIPO POR IDENTIDAD · COMPATIBILIDAD CON EQUIPOS LEGACY / TEMPORADAS
-- Ejecutar en Supabase > SQL Editor > New query > Run
-- Puede ejecutarse varias veces. No elimina usuarios, equipos, jugadores ni datos.
-- ============================================================================

begin;

create table if not exists public.technical_user_teams (
  technical_user_id uuid not null
    references public.technical_users(id) on delete cascade,
  team_id uuid not null
    references public.teams(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (technical_user_id, team_id)
);

create unique index if not exists technical_user_teams_one_primary_idx
  on public.technical_user_teams(technical_user_id)
  where is_primary = true;

create index if not exists technical_user_teams_team_idx
  on public.technical_user_teams(team_id);

alter table public.technical_user_teams enable row level security;
revoke all on table public.technical_user_teams from anon, authenticated;

create or replace function public.cdsb_norm_text_v27225(p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select translate(
    lower(regexp_replace(btrim(coalesce(p_value,'')), '[[:space:]]+', ' ', 'g')),
    'áéíóúüñ',
    'aeiouun'
  );
$$;

-- Conservar el equipo actual de todos los accesos como una asignación válida.
insert into public.technical_user_teams(technical_user_id,team_id,is_primary)
select u.id,u.team_id,
       not exists(
         select 1 from public.technical_user_teams x
         where x.technical_user_id=u.id and x.is_primary=true
       )
from public.technical_users u
where u.team_id is not null
on conflict (technical_user_id,team_id) do nothing;

-- Reparación directa del caso real comunicado: se enlazan ambos nombres de equipo
-- a TODOS los accesos activos de Francisca, sin exigir season_id. Después el RPC
-- selecciona automáticamente la versión del equipo correspondiente a la temporada activa.
insert into public.technical_user_teams(technical_user_id,team_id,is_primary)
select distinct u.id,t.id,false
from public.technical_users u
join public.teams t
  on public.cdsb_norm_text_v27225(t.name) in (
    public.cdsb_norm_text_v27225('CDSB Alevin B'),
    public.cdsb_norm_text_v27225('CDSB Cadete B')
  )
where u.active=true
  and public.cdsb_norm_text_v27225(u.display_name)=public.cdsb_norm_text_v27225('Francisca Teresa Ortega Suarez')
on conflict (technical_user_id,team_id) do nothing;

-- También recuperar automáticamente las relaciones que estén expresadas en staff.
insert into public.technical_user_teams(technical_user_id,team_id,is_primary)
select distinct u.id,t.id,false
from public.technical_users u
join public.staff s
  on public.cdsb_norm_text_v27225(s.name)=public.cdsb_norm_text_v27225(u.display_name)
join public.teams t
  on public.cdsb_norm_text_v27225(t.name)=public.cdsb_norm_text_v27225(s.team_name)
where u.active=true
  and nullif(btrim(coalesce(s.team_name,'')),'') is not null
on conflict (technical_user_id,team_id) do nothing;

-- Y las relaciones en las que el miembro figura como entrenador principal.
insert into public.technical_user_teams(technical_user_id,team_id,is_primary)
select distinct u.id,t.id,false
from public.technical_users u
join public.staff s
  on public.cdsb_norm_text_v27225(s.name)=public.cdsb_norm_text_v27225(u.display_name)
join public.teams t on t.coach_id=s.id
where u.active=true
on conflict (technical_user_id,team_id) do nothing;

-- Asegurar como máximo un primario por usuario.
with ranked as (
  select technical_user_id,team_id,
         row_number() over(
           partition by technical_user_id
           order by is_primary desc,created_at,team_id
         ) as rn
  from public.technical_user_teams
)
update public.technical_user_teams m
set is_primary=(r.rn=1)
from ranked r
where m.technical_user_id=r.technical_user_id
  and m.team_id=r.team_id
  and m.is_primary is distinct from (r.rn=1);

-- --------------------------------------------------------------------------
-- Mapa efectivo V27.2.25.
-- Diferencia clave: no se limita al único technical_user_id de la sesión.
-- Agrupa todos los registros de acceso que pertenecen a la MISMA PERSONA y
-- admite equipos antiguos con season_id NULL. Si existen varias copias del
-- mismo nombre de equipo, prioriza la de la temporada activa.
-- --------------------------------------------------------------------------
create or replace function public.cdsb_effective_technical_teams_v27225(p_user_id uuid)
returns table (
  team_id uuid,
  team_name text,
  age_category text,
  category text,
  is_primary boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with active_season as (
    select id from public.club_seasons where status='active' limit 1
  ),
  me as (
    select u.id,
           public.cdsb_norm_text_v27225(u.display_name) as name_key,
           public.cdsb_norm_text_v27225(u.username) as username_key,
           u.team_id
    from public.technical_users u
    where u.id=p_user_id and u.active=true
    limit 1
  ),
  identity_users as (
    select u.id,u.team_id,u.display_name,u.username
    from public.technical_users u
    cross join me
    where u.active=true
      and (
        public.cdsb_norm_text_v27225(u.display_name)=me.name_key
        or (
          me.username_key<>''
          and public.cdsb_norm_text_v27225(u.username)=me.username_key
        )
      )
  ),
  staff_matches as (
    select distinct s.id as staff_id,s.team_name
    from public.staff s
    cross join me
    where public.cdsb_norm_text_v27225(s.name)=me.name_key
  ),
  candidate_ids as (
    select m.team_id,
           bool_or(m.is_primary or m.team_id=iu.team_id) as primary_flag
    from identity_users iu
    join public.technical_user_teams m on m.technical_user_id=iu.id
    group by m.team_id

    union all

    select iu.team_id,true
    from identity_users iu
    where iu.team_id is not null

    union all

    select t.id,false
    from staff_matches s
    join public.teams t
      on public.cdsb_norm_text_v27225(t.name)=public.cdsb_norm_text_v27225(s.team_name)
    where nullif(btrim(coalesce(s.team_name,'')),'') is not null

    union all

    select t.id,false
    from staff_matches s
    join public.teams t on t.coach_id=s.staff_id

    union all

    select t.id,false
    from public.teams t
    cross join me
    where nullif(btrim(coalesce(t.delegate_name,'')),'') is not null
      and public.cdsb_norm_text_v27225(t.delegate_name)=me.name_key

    union all

    -- Salvaguarda concreta del caso comunicado. Se aplica por identidad de la
    -- persona y no depende del registro concreto de technical_users de la sesión.
    select t.id,false
    from public.teams t
    cross join me
    where me.name_key=public.cdsb_norm_text_v27225('Francisca Teresa Ortega Suarez')
      and public.cdsb_norm_text_v27225(t.name) in (
        public.cdsb_norm_text_v27225('CDSB Alevin B'),
        public.cdsb_norm_text_v27225('CDSB Cadete B')
      )
  ),
  candidate_names as (
    select public.cdsb_norm_text_v27225(t.name) as team_name_key,
           bool_or(c.primary_flag) as primary_flag
    from candidate_ids c
    join public.teams t on t.id=c.team_id
    group by public.cdsb_norm_text_v27225(t.name)
  ),
  rebound as (
    select t.id,t.name,t.age_category,t.category,t.season_id,t.deleted_at,
           c.primary_flag,
           row_number() over(
             partition by c.team_name_key
             order by
               case
                 when t.season_id=(select id from active_season) then 0
                 when t.season_id is null then 1
                 else 2
               end,
               case when t.deleted_at is null then 0 else 1 end,
               t.id
           ) as rn
    from candidate_names c
    join public.teams t
      on public.cdsb_norm_text_v27225(t.name)=c.team_name_key
  )
  select r.id as team_id,
         r.name::text as team_name,
         r.age_category::text as age_category,
         r.category::text as category,
         r.primary_flag as is_primary
  from rebound r
  where r.rn=1
    and r.deleted_at is null
  order by r.primary_flag desc,r.name;
$$;

-- Resolver el usuario base de la sesión usando la versión anterior ya instalada.
create or replace function public.cdsb_technical_user_id_from_token_v27225(p_token text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if nullif(btrim(coalesce(p_token,'')),'') is null then return null; end if;

  begin
    v_id:=public.cdsb_technical_user_id_from_token_v27224(p_token);
  exception when others then
    v_id:=null;
  end;

  if v_id is null then
    begin
      v_id:=public.cdsb_technical_user_id_from_token_v27223(p_token);
    exception when others then
      v_id:=null;
    end;
  end if;

  if v_id is null then
    begin
      v_id:=public.cdsb_technical_user_id_from_token_v27219(p_token);
    exception when others then
      v_id:=null;
    end;
  end if;

  return v_id;
end;
$$;

create or replace function public.technical_available_teams_v27225(p_token text)
returns table (
  team_id uuid,
  team_name text,
  age_category text,
  category text,
  is_primary boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  v_user_id:=public.cdsb_technical_user_id_from_token_v27225(p_token);
  if v_user_id is null then
    raise exception 'La sesión técnica no es válida o ha caducado.';
  end if;

  return query
  select e.team_id,e.team_name,e.age_category,e.category,e.is_primary
  from public.cdsb_effective_technical_teams_v27225(v_user_id) e;
end;
$$;

create or replace function public.technical_select_team_v27225(
  p_token text,
  p_team_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_name_key text;
  v_username_key text;
  v_team_name text;
begin
  v_user_id:=public.cdsb_technical_user_id_from_token_v27225(p_token);
  if v_user_id is null then
    raise exception 'La sesión técnica no es válida o ha caducado.';
  end if;

  select e.team_name into v_team_name
  from public.cdsb_effective_technical_teams_v27225(v_user_id) e
  where e.team_id=p_team_id
  limit 1;

  if v_team_name is null then
    raise exception 'Este equipo no está asignado a tu acceso.';
  end if;

  select public.cdsb_norm_text_v27225(display_name),
         public.cdsb_norm_text_v27225(username)
  into v_name_key,v_username_key
  from public.technical_users
  where id=v_user_id and active=true;

  -- Muy importante: cambiar el equipo activo en TODOS los registros que
  -- representen a la misma persona. Así el technical_team_snapshot antiguo
  -- funciona aunque la base tenga duplicado el acceso de un mismo entrenador.
  update public.technical_users u
  set team_id=p_team_id
  where u.active=true
    and (
      public.cdsb_norm_text_v27225(u.display_name)=v_name_key
      or (
        v_username_key<>''
        and public.cdsb_norm_text_v27225(u.username)=v_username_key
      )
    );

  insert into public.technical_user_teams(technical_user_id,team_id,is_primary)
  select u.id,p_team_id,false
  from public.technical_users u
  where u.active=true
    and (
      public.cdsb_norm_text_v27225(u.display_name)=v_name_key
      or (
        v_username_key<>''
        and public.cdsb_norm_text_v27225(u.username)=v_username_key
      )
    )
  on conflict(technical_user_id,team_id) do nothing;

  return jsonb_build_object(
    'ok',true,
    'team_id',p_team_id,
    'team_name',v_team_name
  );
end;
$$;

create or replace function public.admin_list_technical_user_teams_v27225()
returns table (
  technical_user_id uuid,
  team_id uuid,
  team_name text,
  age_category text,
  category text,
  is_primary boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
begin
  if not public.cdsb_is_admin() then
    raise exception 'Solo un administrador puede consultar los accesos técnicos.';
  end if;

  for r in select id from public.technical_users where active=true loop
    return query
    select r.id,e.team_id,e.team_name,e.age_category,e.category,e.is_primary
    from public.cdsb_effective_technical_teams_v27225(r.id) e;
  end loop;
end;
$$;

revoke all on function public.cdsb_norm_text_v27225(text) from public;
revoke all on function public.cdsb_effective_technical_teams_v27225(uuid) from public;
revoke all on function public.cdsb_technical_user_id_from_token_v27225(text) from public;
revoke all on function public.technical_available_teams_v27225(text) from public;
revoke all on function public.technical_select_team_v27225(text,uuid) from public;
revoke all on function public.admin_list_technical_user_teams_v27225() from public;

grant execute on function public.technical_available_teams_v27225(text) to anon,authenticated;
grant execute on function public.technical_select_team_v27225(text,uuid) to anon,authenticated;
grant execute on function public.admin_list_technical_user_teams_v27225() to authenticated;

commit;

-- ============================================================================
-- COMPROBACIÓN FINAL PARA EL CASO REAL
-- Debe aparecer al menos una fila de Francisca con:
-- equipos_disponibles = 2
-- equipos = CDSB Alevin B · CDSB Cadete B
-- Si no aparece 2, esta misma tabla mostrará qué acceso y qué equipos detecta.
-- ============================================================================
select
  u.id as technical_user_id,
  u.username,
  u.display_name,
  count(e.team_id) as equipos_disponibles,
  string_agg(e.team_name,' · ' order by e.team_name) as equipos
from public.technical_users u
left join lateral public.cdsb_effective_technical_teams_v27225(u.id) e on true
where u.active=true
  and public.cdsb_norm_text_v27225(u.display_name)=public.cdsb_norm_text_v27225('Francisca Teresa Ortega Suarez')
group by u.id,u.username,u.display_name
order by u.username,u.id;
