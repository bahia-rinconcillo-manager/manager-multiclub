-- ============================================================================
-- CD SAN BERNABÉ MANAGER · V27.2.24
-- MULTIEQUIPO REFORZADO · REPARACIÓN DE ASIGNACIONES DEL CUERPO TÉCNICO
-- Ejecutar en Supabase > SQL Editor > New query > Run
-- Puede ejecutarse más de una vez. No elimina usuarios, equipos ni datos.
-- ============================================================================

begin;

-- --------------------------------------------------------------------------
-- 1. Tabla de relación multiequipo (compatibilidad si aún no existiera).
-- --------------------------------------------------------------------------
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

-- Normalización común: ignora mayúsculas, dobles espacios y acentos habituales.
create or replace function public.cdsb_norm_text_v27224(p_value text)
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

-- --------------------------------------------------------------------------
-- 2. Reparar relaciones existentes de forma automática.
--    Fuentes admitidas:
--      A) team_id principal del acceso.
--      B) equipo guardado en la ficha del miembro del cuerpo técnico.
--      C) equipos cuyo coach_id apunta a ese miembro.
--      D) equipos cuyo delegado coincide por nombre.
-- --------------------------------------------------------------------------

-- A) Equipo principal actual.
insert into public.technical_user_teams(technical_user_id, team_id, is_primary)
select
  u.id,
  u.team_id,
  not exists (
    select 1 from public.technical_user_teams p
    where p.technical_user_id=u.id and p.is_primary=true
  )
from public.technical_users u
where u.team_id is not null
on conflict (technical_user_id, team_id) do nothing;

-- B) Equipo indicado en staff.team_name para la misma persona.
insert into public.technical_user_teams(technical_user_id, team_id, is_primary)
select distinct u.id, t.id, false
from public.technical_users u
join public.staff s
  on public.cdsb_norm_text_v27224(s.name)=public.cdsb_norm_text_v27224(u.display_name)
join public.teams t
  on public.cdsb_norm_text_v27224(t.name)=public.cdsb_norm_text_v27224(s.team_name)
where u.active=true
  and nullif(btrim(coalesce(s.team_name,'')),'') is not null
  and t.deleted_at is null
  and (
    t.season_id=(select id from public.club_seasons where status='active' limit 1)
    or not exists(select 1 from public.club_seasons where status='active')
  )
on conflict (technical_user_id, team_id) do nothing;

-- C) El mismo miembro figura como entrenador principal (teams.coach_id).
insert into public.technical_user_teams(technical_user_id, team_id, is_primary)
select distinct u.id, t.id, false
from public.technical_users u
join public.staff s
  on public.cdsb_norm_text_v27224(s.name)=public.cdsb_norm_text_v27224(u.display_name)
join public.teams t on t.coach_id=s.id
where u.active=true
  and t.deleted_at is null
  and (
    t.season_id=(select id from public.club_seasons where status='active' limit 1)
    or not exists(select 1 from public.club_seasons where status='active')
  )
on conflict (technical_user_id, team_id) do nothing;

-- D) Delegado guardado directamente por nombre en la ficha del equipo.
insert into public.technical_user_teams(technical_user_id, team_id, is_primary)
select distinct u.id, t.id, false
from public.technical_users u
join public.teams t
  on public.cdsb_norm_text_v27224(t.delegate_name)=public.cdsb_norm_text_v27224(u.display_name)
where u.active=true
  and nullif(btrim(coalesce(t.delegate_name,'')),'') is not null
  and t.deleted_at is null
  and (
    t.season_id=(select id from public.club_seasons where status='active' limit 1)
    or not exists(select 1 from public.club_seasons where status='active')
  )
on conflict (technical_user_id, team_id) do nothing;

-- Reparación específica del caso detectado durante la prueba real.
-- Garantiza que el acceso de Francisca disponga de Alevín B y Cadete B si
-- ambos equipos existen en la temporada activa.
insert into public.technical_user_teams(technical_user_id, team_id, is_primary)
select distinct u.id, t.id, false
from public.technical_users u
join public.teams t on public.cdsb_norm_text_v27224(t.name) in (
  public.cdsb_norm_text_v27224('CDSB Alevin B'),
  public.cdsb_norm_text_v27224('CDSB Cadete B')
)
where public.cdsb_norm_text_v27224(u.display_name)=public.cdsb_norm_text_v27224('Francisca Teresa Ortega Suarez')
  and u.active=true
  and t.deleted_at is null
  and (
    t.season_id=(select id from public.club_seasons where status='active' limit 1)
    or not exists(select 1 from public.club_seasons where status='active')
  )
on conflict (technical_user_id, team_id) do nothing;

-- Mantener un único primario por usuario. Si ya existe, se respeta.
with ranked as (
  select technical_user_id, team_id,
         row_number() over (
           partition by technical_user_id
           order by is_primary desc, created_at, team_id
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
-- 3. Resolver usuario técnico desde el token.
-- --------------------------------------------------------------------------
create or replace function public.cdsb_technical_user_id_from_token_v27224(p_token text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile jsonb;
  v_id uuid;
  v_id_text text;
  v_username text;
  v_display_name text;
  v_team_id_text text;
  v_count integer;
begin
  if nullif(btrim(coalesce(p_token,'')),'') is null then return null; end if;

  begin
    select to_jsonb(s) into v_profile
    from public.technical_session(p_token) s
    limit 1;
  exception when others then
    return null;
  end;

  if v_profile is null then return null; end if;

  -- Desempaquetar formatos usados por distintas revisiones.
  if jsonb_typeof(v_profile)='object' and v_profile ? 'technical_session' then
    v_profile:=v_profile->'technical_session';
  end if;
  if jsonb_typeof(v_profile)='object' and v_profile ? 'profile'
     and jsonb_typeof(v_profile->'profile')='object' then
    v_profile:=v_profile->'profile';
  end if;
  if jsonb_typeof(v_profile)='object' and v_profile ? 'user'
     and jsonb_typeof(v_profile->'user')='object' then
    v_profile:=v_profile->'user';
  end if;
  if v_profile is null or jsonb_typeof(v_profile)<>'object' then return null; end if;

  v_id_text:=coalesce(
    nullif(v_profile->>'technical_user_id',''),
    nullif(v_profile->>'user_id',''),
    nullif(v_profile->>'id','')
  );
  if v_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    select id into v_id from public.technical_users
    where id=v_id_text::uuid and active=true limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  v_username:=coalesce(nullif(v_profile->>'username',''),nullif(v_profile->>'user_name',''));
  if v_username is not null then
    select id into v_id from public.technical_users
    where lower(btrim(username))=lower(btrim(v_username)) and active=true limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  v_display_name:=coalesce(nullif(v_profile->>'display_name',''),nullif(v_profile->>'name',''));
  v_team_id_text:=nullif(v_profile->>'team_id','');

  if v_display_name is not null and v_team_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    select id into v_id from public.technical_users
    where public.cdsb_norm_text_v27224(display_name)=public.cdsb_norm_text_v27224(v_display_name)
      and team_id=v_team_id_text::uuid and active=true
    limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  if v_display_name is not null then
    select count(*) into v_count from public.technical_users
    where public.cdsb_norm_text_v27224(display_name)=public.cdsb_norm_text_v27224(v_display_name)
      and active=true;
    if v_count=1 then
      select id into v_id from public.technical_users
      where public.cdsb_norm_text_v27224(display_name)=public.cdsb_norm_text_v27224(v_display_name)
        and active=true limit 1;
      return v_id;
    end if;
  end if;

  return null;
end;
$$;

-- --------------------------------------------------------------------------
-- 4. Función interna: mapa efectivo de equipos de un usuario.
-- --------------------------------------------------------------------------
create or replace function public.cdsb_effective_technical_teams_v27224(p_user_id uuid)
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
  explicit_links as (
    select t.id,t.name::text,t.age_category::text,t.category::text,
           (t.id=u.team_id or m.is_primary) as primary_flag
    from public.technical_users u
    join public.technical_user_teams m on m.technical_user_id=u.id
    join public.teams t on t.id=m.team_id
    where u.id=p_user_id and u.active=true and t.deleted_at is null
      and (t.season_id=(select id from active_season) or not exists(select 1 from active_season))
  ),
  staff_team_links as (
    select t.id,t.name::text,t.age_category::text,t.category::text,(t.id=u.team_id)
    from public.technical_users u
    join public.staff s
      on public.cdsb_norm_text_v27224(s.name)=public.cdsb_norm_text_v27224(u.display_name)
    join public.teams t
      on public.cdsb_norm_text_v27224(t.name)=public.cdsb_norm_text_v27224(s.team_name)
    where u.id=p_user_id and u.active=true and t.deleted_at is null
      and nullif(btrim(coalesce(s.team_name,'')),'') is not null
      and (t.season_id=(select id from active_season) or not exists(select 1 from active_season))
  ),
  coach_links as (
    select t.id,t.name::text,t.age_category::text,t.category::text,(t.id=u.team_id)
    from public.technical_users u
    join public.staff s
      on public.cdsb_norm_text_v27224(s.name)=public.cdsb_norm_text_v27224(u.display_name)
    join public.teams t on t.coach_id=s.id
    where u.id=p_user_id and u.active=true and t.deleted_at is null
      and (t.season_id=(select id from active_season) or not exists(select 1 from active_season))
  ),
  delegate_links as (
    select t.id,t.name::text,t.age_category::text,t.category::text,(t.id=u.team_id)
    from public.technical_users u
    join public.teams t
      on public.cdsb_norm_text_v27224(t.delegate_name)=public.cdsb_norm_text_v27224(u.display_name)
    where u.id=p_user_id and u.active=true and t.deleted_at is null
      and nullif(btrim(coalesce(t.delegate_name,'')),'') is not null
      and (t.season_id=(select id from active_season) or not exists(select 1 from active_season))
  ),
  fallback_link as (
    select t.id,t.name::text,t.age_category::text,t.category::text,true
    from public.technical_users u
    join public.teams t on t.id=u.team_id
    where u.id=p_user_id and u.active=true and t.deleted_at is null
      and (t.season_id=(select id from active_season) or not exists(select 1 from active_season))
  ),
  combined as (
    select * from explicit_links
    union all select * from staff_team_links
    union all select * from coach_links
    union all select * from delegate_links
    union all select * from fallback_link
  )
  select c.id as team_id,
         max(c.name)::text as team_name,
         max(c.age_category)::text as age_category,
         max(c.category)::text as category,
         bool_or(c.primary_flag) as is_primary
  from combined c
  group by c.id
  order by bool_or(c.primary_flag) desc,max(c.name);
$$;

-- --------------------------------------------------------------------------
-- 5. Listado administrativo efectivo.
-- --------------------------------------------------------------------------
create or replace function public.admin_list_technical_user_teams_v27224()
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
    from public.cdsb_effective_technical_teams_v27224(r.id) e;
  end loop;
end;
$$;

-- --------------------------------------------------------------------------
-- 6. Área privada: equipos disponibles y cambio de equipo.
-- --------------------------------------------------------------------------
create or replace function public.technical_available_teams_v27224(p_token text)
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
  v_user_id:=public.cdsb_technical_user_id_from_token_v27224(p_token);
  if v_user_id is null then
    raise exception 'La sesión técnica no es válida o ha caducado.';
  end if;

  return query
  select e.team_id,e.team_name,e.age_category,e.category,e.is_primary
  from public.cdsb_effective_technical_teams_v27224(v_user_id) e;
end;
$$;

create or replace function public.technical_select_team_v27224(
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
  v_team_name text;
begin
  v_user_id:=public.cdsb_technical_user_id_from_token_v27224(p_token);
  if v_user_id is null then
    raise exception 'La sesión técnica no es válida o ha caducado.';
  end if;

  select e.team_name into v_team_name
  from public.cdsb_effective_technical_teams_v27224(v_user_id) e
  where e.team_id=p_team_id
  limit 1;

  if v_team_name is null then
    raise exception 'Este equipo no está asignado a tu acceso.';
  end if;

  update public.technical_users
  set team_id=p_team_id
  where id=v_user_id and active=true;

  insert into public.technical_user_teams(technical_user_id,team_id,is_primary)
  values(v_user_id,p_team_id,false)
  on conflict(technical_user_id,team_id) do nothing;

  return jsonb_build_object('ok',true,'team_id',p_team_id,'team_name',v_team_name);
end;
$$;

-- --------------------------------------------------------------------------
-- 7. Permisos.
-- --------------------------------------------------------------------------
revoke all on function public.cdsb_norm_text_v27224(text) from public;
revoke all on function public.cdsb_technical_user_id_from_token_v27224(text) from public;
revoke all on function public.cdsb_effective_technical_teams_v27224(uuid) from public;
revoke all on function public.admin_list_technical_user_teams_v27224() from public;
revoke all on function public.technical_available_teams_v27224(text) from public;
revoke all on function public.technical_select_team_v27224(text,uuid) from public;

grant execute on function public.admin_list_technical_user_teams_v27224() to authenticated;
grant execute on function public.technical_available_teams_v27224(text) to anon,authenticated;
grant execute on function public.technical_select_team_v27224(text,uuid) to anon,authenticated;

commit;

-- ============================================================================
-- COMPROBACIÓN ESPECÍFICA
-- El resultado correcto para Francisca debe ser:
-- equipos_disponibles = 2
-- CDSB Alevin B · CDSB Cadete B
-- ============================================================================
select
  u.display_name,
  count(*) as equipos_disponibles,
  string_agg(e.team_name,' · ' order by e.team_name) as equipos
from public.technical_users u
cross join lateral public.cdsb_effective_technical_teams_v27224(u.id) e
where public.cdsb_norm_text_v27224(u.display_name)=public.cdsb_norm_text_v27224('Francisca Teresa Ortega Suarez')
  and u.active=true
group by u.id,u.display_name;
