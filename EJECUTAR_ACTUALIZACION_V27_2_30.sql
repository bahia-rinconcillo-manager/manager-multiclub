-- ============================================================================
-- CD SAN BERNABÉ MANAGER · V27.2.30
-- ACCESO TÉCNICO MULTIEQUIPO · VALIDACIÓN DIRECTA DE LA SESIÓN
-- Ejecutar en Supabase > SQL Editor > New query > Run
-- Puede ejecutarse varias veces. No elimina usuarios, equipos, jugadores ni datos.
-- ============================================================================

begin;

-- --------------------------------------------------------------------------
-- 1. Tabla multiequipo (se conserva si ya existe).
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

create or replace function public.cdsb_norm_text_v27230(p_value text)
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
-- 2. Equipos efectivos de UN usuario técnico.
--    Es general: usa asignaciones explícitas, equipo principal, ficha de staff,
--    entrenador y delegado. También reúne accesos antiguos duplicados de la
--    misma persona por nombre para no perder asignaciones históricas.
-- --------------------------------------------------------------------------
create or replace function public.cdsb_effective_technical_teams_v27230(
  p_technical_user_id uuid
)
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
  base_user as (
    select u.id,u.team_id,u.display_name,u.username,
           public.cdsb_norm_text_v27230(u.display_name) as name_key
    from public.technical_users u
    where u.id=p_technical_user_id and u.active=true
  ),
  identity_users as (
    select u.id,u.team_id,u.display_name,u.username
    from public.technical_users u
    join base_user b on true
    where u.active=true
      and (
        u.id=b.id
        or (
          b.name_key<>''
          and public.cdsb_norm_text_v27230(u.display_name)=b.name_key
        )
      )
  ),
  staff_matches as (
    select distinct s.id as staff_id,s.team_name
    from public.staff s
    join base_user b on true
    where b.name_key<>''
      and public.cdsb_norm_text_v27230(s.name)=b.name_key
  ),
  candidate_ids as (
    -- Equipos seleccionados desde Usuarios.
    select m.team_id,
           bool_or(m.is_primary or m.team_id=iu.team_id) as primary_flag
    from identity_users iu
    join public.technical_user_teams m on m.technical_user_id=iu.id
    group by m.team_id

    union all

    -- Equipo principal guardado en el acceso técnico.
    select iu.team_id,true
    from identity_users iu
    where iu.team_id is not null

    union all

    -- Equipo escrito en la ficha del miembro del cuerpo técnico.
    select t.id,false
    from staff_matches s
    join public.teams t
      on public.cdsb_norm_text_v27230(t.name)=public.cdsb_norm_text_v27230(s.team_name)
    where nullif(btrim(coalesce(s.team_name,'')),'') is not null

    union all

    -- Equipos en los que figura como entrenador principal.
    select t.id,false
    from staff_matches s
    join public.teams t on t.coach_id=s.staff_id

    union all

    -- Equipos en los que figura como delegado por nombre.
    select t.id,false
    from public.teams t
    join base_user b on true
    where b.name_key<>''
      and nullif(btrim(coalesce(t.delegate_name,'')),'') is not null
      and public.cdsb_norm_text_v27230(t.delegate_name)=b.name_key
  ),
  candidate_names as (
    select public.cdsb_norm_text_v27230(t.name) as team_name_key,
           bool_or(c.primary_flag) as primary_flag
    from candidate_ids c
    join public.teams t on t.id=c.team_id
    group by public.cdsb_norm_text_v27230(t.name)
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
      on public.cdsb_norm_text_v27230(t.name)=c.team_name_key
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

-- --------------------------------------------------------------------------
-- 3. Backfill general para TODOS los accesos técnicos existentes.
-- --------------------------------------------------------------------------
insert into public.technical_user_teams(technical_user_id,team_id,is_primary)
select u.id,u.team_id,
       not exists(
         select 1 from public.technical_user_teams x
         where x.technical_user_id=u.id and x.is_primary=true
       )
from public.technical_users u
where u.active=true and u.team_id is not null
on conflict (technical_user_id,team_id) do nothing;

insert into public.technical_user_teams(technical_user_id,team_id,is_primary)
select distinct u.id,t.id,false
from public.technical_users u
join public.staff s
  on public.cdsb_norm_text_v27230(s.name)=public.cdsb_norm_text_v27230(u.display_name)
join public.teams t
  on public.cdsb_norm_text_v27230(t.name)=public.cdsb_norm_text_v27230(s.team_name)
where u.active=true
  and nullif(btrim(coalesce(s.team_name,'')),'') is not null
  and t.deleted_at is null
on conflict (technical_user_id,team_id) do nothing;

insert into public.technical_user_teams(technical_user_id,team_id,is_primary)
select distinct u.id,t.id,false
from public.technical_users u
join public.staff s
  on public.cdsb_norm_text_v27230(s.name)=public.cdsb_norm_text_v27230(u.display_name)
join public.teams t on t.coach_id=s.id
where u.active=true and t.deleted_at is null
on conflict (technical_user_id,team_id) do nothing;

-- --------------------------------------------------------------------------
-- 4. BUNDLE DE ACCESO V27.2.30.
--    CAMBIO CLAVE: NO llama a technical_session(). Valida exactamente el token
--    que crea technical_login contra technical_sessions.token_hash, igual que
--    los RPC estables de plantilla/partidos/tarjetero.
-- --------------------------------------------------------------------------
create or replace function public.technical_access_bundle_v27230(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_username text;
  v_display_name text;
  v_role_label text;
  v_team_id uuid;
  v_team_name text;
  v_teams jsonb;
begin
  if nullif(btrim(coalesce(p_token,'')),'') is null then
    raise exception 'La sesión técnica no es válida o ha caducado.';
  end if;

  delete from public.technical_sessions
  where expires_at <= now();

  select u.id,u.username,u.display_name,u.role_label,u.team_id,t.name
    into v_user_id,v_username,v_display_name,v_role_label,v_team_id,v_team_name
  from public.technical_sessions s
  join public.technical_users u on u.id=s.technical_user_id
  left join public.teams t on t.id=u.team_id
  where s.token_hash=md5(coalesce(p_token,''))
    and s.expires_at>now()
    and u.active=true
  order by s.expires_at desc
  limit 1;

  if v_user_id is null then
    raise exception 'La sesión técnica no es válida o ha caducado.';
  end if;

  update public.technical_sessions
  set last_used_at=now()
  where token_hash=md5(coalesce(p_token,''))
    and expires_at>now();

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'team_id',e.team_id,
        'team_name',e.team_name,
        'age_category',e.age_category,
        'category',e.category,
        'is_primary',e.is_primary
      )
      order by e.is_primary desc,e.team_name
    ),
    '[]'::jsonb
  )
  into v_teams
  from public.cdsb_effective_technical_teams_v27230(v_user_id) e;

  return jsonb_build_object(
    'ok',true,
    'profile',jsonb_build_object(
      'technical_user_id',v_user_id,
      'id',v_user_id,
      'username',v_username,
      'display_name',v_display_name,
      'role_label',v_role_label,
      'team_id',v_team_id,
      'team_name',v_team_name,
      'role','technical',
      'active',true
    ),
    'team_count',jsonb_array_length(v_teams),
    'teams',v_teams
  );
end;
$$;

-- --------------------------------------------------------------------------
-- 5. Cambio de equipo V27.2.30.
--    También valida directamente technical_sessions; no depende de
--    technical_session(). Sirve para cualquier usuario con varios equipos.
-- --------------------------------------------------------------------------
create or replace function public.technical_select_team_v27230(
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
  if nullif(btrim(coalesce(p_token,'')),'') is null then
    raise exception 'La sesión técnica no es válida o ha caducado.';
  end if;

  delete from public.technical_sessions
  where expires_at <= now();

  select u.id
    into v_user_id
  from public.technical_sessions s
  join public.technical_users u on u.id=s.technical_user_id
  where s.token_hash=md5(coalesce(p_token,''))
    and s.expires_at>now()
    and u.active=true
  order by s.expires_at desc
  limit 1;

  if v_user_id is null then
    raise exception 'La sesión técnica no es válida o ha caducado.';
  end if;

  select e.team_name into v_team_name
  from public.cdsb_effective_technical_teams_v27230(v_user_id) e
  where e.team_id=p_team_id
  limit 1;

  if v_team_name is null then
    raise exception 'Este equipo no está asignado a tu acceso.';
  end if;

  update public.technical_users
  set team_id=p_team_id
  where id=v_user_id;

  update public.technical_user_teams
  set is_primary=false
  where technical_user_id=v_user_id
    and is_primary=true;

  insert into public.technical_user_teams(technical_user_id,team_id,is_primary)
  values(v_user_id,p_team_id,true)
  on conflict(technical_user_id,team_id)
  do update set is_primary=true;

  update public.technical_sessions
  set last_used_at=now()
  where token_hash=md5(coalesce(p_token,''))
    and expires_at>now();

  return jsonb_build_object(
    'ok',true,
    'technical_user_id',v_user_id,
    'team_id',p_team_id,
    'team_name',v_team_name
  );
end;
$$;

-- --------------------------------------------------------------------------
-- 6. Listado administrativo general.
-- --------------------------------------------------------------------------
create or replace function public.admin_list_technical_user_teams_v27230()
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
    from public.cdsb_effective_technical_teams_v27230(r.id) e;
  end loop;
end;
$$;

revoke all on function public.cdsb_norm_text_v27230(text) from public;
revoke all on function public.cdsb_effective_technical_teams_v27230(uuid) from public;
revoke all on function public.technical_access_bundle_v27230(text) from public;
revoke all on function public.technical_select_team_v27230(text,uuid) from public;
revoke all on function public.admin_list_technical_user_teams_v27230() from public;

grant execute on function public.technical_access_bundle_v27230(text) to anon,authenticated;
grant execute on function public.technical_select_team_v27230(text,uuid) to anon,authenticated;
grant execute on function public.admin_list_technical_user_teams_v27230() to authenticated;

notify pgrst, 'reload schema';
commit;

-- --------------------------------------------------------------------------
-- COMPROBACIÓN GENERAL: no contiene nombres ni casos especiales.
-- Debe mostrar todos los accesos activos y todos sus equipos efectivos.
-- --------------------------------------------------------------------------
select
  u.id as technical_user_id,
  u.username,
  u.display_name,
  count(e.team_id)::integer as equipos_disponibles,
  coalesce(string_agg(e.team_name,' · ' order by e.team_name),'') as equipos
from public.technical_users u
left join lateral public.cdsb_effective_technical_teams_v27230(u.id) e on true
where u.active=true
group by u.id,u.username,u.display_name
order by lower(u.display_name),lower(u.username);
