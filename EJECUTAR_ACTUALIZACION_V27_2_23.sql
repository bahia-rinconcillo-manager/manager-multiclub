-- ==========================================================================
-- CD SAN BERNABÉ MANAGER · V27.2.23
-- CORRECCIÓN ACCESO TÉCNICO MULTIEQUIPO REAL
-- Ejecutar una sola vez en Supabase > SQL Editor > New query > Run
-- Puede ejecutarse de nuevo: no borra usuarios ni datos.
-- ==========================================================================

begin;

-- --------------------------------------------------------------------------
-- 1. Asegurar que la tabla de asignaciones multiequipo existe.
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

-- Mantener como explícita la asignación principal existente.
insert into public.technical_user_teams(technical_user_id, team_id, is_primary)
select
  u.id,
  u.team_id,
  not exists (
    select 1
    from public.technical_user_teams x
    where x.technical_user_id=u.id and x.is_primary=true
  )
from public.technical_users u
where u.team_id is not null
on conflict (technical_user_id, team_id) do nothing;

-- Evitar más de un principal por usuario, por seguridad.
with ranked as (
  select technical_user_id, team_id,
         row_number() over (
           partition by technical_user_id
           order by is_primary desc, created_at, team_id
         ) as rn
  from public.technical_user_teams
)
update public.technical_user_teams m
set is_primary = (r.rn = 1)
from ranked r
where m.technical_user_id = r.technical_user_id
  and m.team_id = r.team_id;

alter table public.technical_user_teams enable row level security;
revoke all on table public.technical_user_teams from anon, authenticated;

-- --------------------------------------------------------------------------
-- 2. Resolver robustamente el usuario técnico a partir del token.
--    Admite los distintos formatos que technical_session ha usado en versiones
--    anteriores: fila, json envuelto, profile, id, username o nombre/equipo.
-- --------------------------------------------------------------------------
create or replace function public.cdsb_technical_user_id_from_token_v27223(p_token text)
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
  if nullif(btrim(coalesce(p_token,'')),'') is null then
    return null;
  end if;

  begin
    select to_jsonb(s)
    into v_profile
    from public.technical_session(p_token) s
    limit 1;
  exception when others then
    return null;
  end;

  if v_profile is null then return null; end if;

  if jsonb_typeof(v_profile)='object' and v_profile ? 'technical_session' then
    v_profile := v_profile->'technical_session';
  end if;
  if jsonb_typeof(v_profile)='object' and v_profile ? 'profile'
     and jsonb_typeof(v_profile->'profile')='object' then
    v_profile := v_profile->'profile';
  end if;
  if jsonb_typeof(v_profile)='object' and v_profile ? 'user'
     and jsonb_typeof(v_profile->'user')='object' then
    v_profile := v_profile->'user';
  end if;

  if v_profile is null or jsonb_typeof(v_profile)<>'object' then
    return null;
  end if;

  v_id_text := coalesce(
    nullif(v_profile->>'technical_user_id',''),
    nullif(v_profile->>'user_id',''),
    nullif(v_profile->>'id','')
  );
  if v_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    select id into v_id
    from public.technical_users
    where id=v_id_text::uuid and active=true
    limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  v_username := coalesce(
    nullif(v_profile->>'username',''),
    nullif(v_profile->>'user_name','')
  );
  if v_username is not null then
    select id into v_id
    from public.technical_users
    where lower(btrim(username))=lower(btrim(v_username)) and active=true
    limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  v_display_name := nullif(v_profile->>'display_name','');
  v_team_id_text := nullif(v_profile->>'team_id','');
  if v_display_name is not null
     and v_team_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    select id into v_id
    from public.technical_users
    where lower(regexp_replace(btrim(coalesce(display_name,'')), '[[:space:]]+', ' ', 'g'))
        = lower(regexp_replace(btrim(v_display_name), '[[:space:]]+', ' ', 'g'))
      and team_id=v_team_id_text::uuid
      and active=true
    limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  -- Último recurso: si el nombre identifica a un único acceso activo, usarlo.
  if v_display_name is not null then
    select count(*)
    into v_count
    from public.technical_users
    where lower(regexp_replace(btrim(coalesce(display_name,'')), '[[:space:]]+', ' ', 'g'))
        = lower(regexp_replace(btrim(v_display_name), '[[:space:]]+', ' ', 'g'))
      and active=true;
    if v_count=1 then
      select id into v_id
      from public.technical_users
      where lower(regexp_replace(btrim(coalesce(display_name,'')), '[[:space:]]+', ' ', 'g'))
          = lower(regexp_replace(btrim(v_display_name), '[[:space:]]+', ' ', 'g'))
        and active=true
      limit 1;
      return v_id;
    end if;
  end if;

  return null;
end;
$$;

-- --------------------------------------------------------------------------
-- 3. Listado administrativo EFECTIVO.
--    Une:
--      A) equipos guardados expresamente en technical_user_teams
--      B) equipos en los que la misma persona figura en Cuerpo técnico
--         (coincidencia exacta de nombre, ignorando mayúsculas y espacios).
--
--    Esto corrige casos como un entrenador registrado en dos equipos en
--    Cuerpo técnico aunque su acceso antiguo solo tuviera un team_id.
-- --------------------------------------------------------------------------
create or replace function public.admin_list_technical_user_teams_v27223()
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
begin
  if not public.cdsb_is_admin() then
    raise exception 'Solo un administrador puede consultar los accesos técnicos.';
  end if;

  return query
  with active_season as (
    select id
    from public.club_seasons
    where status = 'active'
    limit 1
  ),
  explicit_links as (
    select
      u.id as technical_user_id,
      t.id as team_id,
      t.name::text as team_name,
      t.age_category::text as age_category,
      t.category::text as category,
      (t.id = u.team_id or (u.team_id is null and m.is_primary)) as is_primary
    from public.technical_users u
    join public.technical_user_teams m on m.technical_user_id = u.id
    join public.teams t on t.id = m.team_id
    where u.active = true
  ),
  staff_links as (
    select
      u.id as technical_user_id,
      t.id as team_id,
      t.name::text as team_name,
      t.age_category::text as age_category,
      t.category::text as category,
      (t.id = u.team_id) as is_primary
    from public.technical_users u
    join public.staff s
      on lower(regexp_replace(btrim(coalesce(s.name,'')), '[[:space:]]+', ' ', 'g'))
       = lower(regexp_replace(btrim(coalesce(u.display_name,'')), '[[:space:]]+', ' ', 'g'))
    join public.teams t
      on lower(regexp_replace(btrim(coalesce(t.name,'')), '[[:space:]]+', ' ', 'g'))
       = lower(regexp_replace(btrim(coalesce(s.team_name,'')), '[[:space:]]+', ' ', 'g'))
    where u.active = true
      and nullif(btrim(coalesce(s.team_name,'')), '') is not null
      and t.deleted_at is null
      and (
        t.season_id = (select id from active_season)
        or not exists (select 1 from active_season)
      )
  ),
  combined as (
    select * from explicit_links
    union all
    select * from staff_links
  )
  select
    c.technical_user_id,
    c.team_id,
    max(c.team_name)::text,
    max(c.age_category)::text,
    max(c.category)::text,
    bool_or(c.is_primary)
  from combined c
  group by c.technical_user_id, c.team_id
  order by c.technical_user_id, bool_or(c.is_primary) desc, max(c.team_name);
end;
$$;

-- --------------------------------------------------------------------------
-- 4. Área privada: todos los equipos EFECTIVOS del entrenador.
--    No depende solo del team_id principal. También mira Cuerpo técnico.
-- --------------------------------------------------------------------------
create or replace function public.technical_available_teams_v27223(p_token text)
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
  v_user_id := public.cdsb_technical_user_id_from_token_v27223(p_token);
  if v_user_id is null then
    raise exception 'La sesión técnica no es válida o ha caducado.';
  end if;

  return query
  with active_season as (
    select id
    from public.club_seasons
    where status = 'active'
    limit 1
  ),
  explicit_links as (
    select
      t.id as team_id,
      t.name::text as team_name,
      t.age_category::text as age_category,
      t.category::text as category,
      (t.id = u.team_id or (u.team_id is null and m.is_primary)) as is_primary
    from public.technical_users u
    join public.technical_user_teams m on m.technical_user_id = u.id
    join public.teams t on t.id = m.team_id
    where u.id = v_user_id and u.active = true
  ),
  staff_links as (
    select
      t.id as team_id,
      t.name::text as team_name,
      t.age_category::text as age_category,
      t.category::text as category,
      (t.id = u.team_id) as is_primary
    from public.technical_users u
    join public.staff s
      on lower(regexp_replace(btrim(coalesce(s.name,'')), '[[:space:]]+', ' ', 'g'))
       = lower(regexp_replace(btrim(coalesce(u.display_name,'')), '[[:space:]]+', ' ', 'g'))
    join public.teams t
      on lower(regexp_replace(btrim(coalesce(t.name,'')), '[[:space:]]+', ' ', 'g'))
       = lower(regexp_replace(btrim(coalesce(s.team_name,'')), '[[:space:]]+', ' ', 'g'))
    where u.id = v_user_id
      and u.active = true
      and nullif(btrim(coalesce(s.team_name,'')), '') is not null
      and t.deleted_at is null
      and (
        t.season_id = (select id from active_season)
        or not exists (select 1 from active_season)
      )
  ),
  fallback_link as (
    select
      t.id as team_id,
      t.name::text as team_name,
      t.age_category::text as age_category,
      t.category::text as category,
      true as is_primary
    from public.technical_users u
    join public.teams t on t.id = u.team_id
    where u.id = v_user_id
      and u.active = true
      and u.team_id is not null
  ),
  combined as (
    select * from explicit_links
    union all
    select * from staff_links
    union all
    select * from fallback_link
  )
  select
    c.team_id,
    max(c.team_name)::text,
    max(c.age_category)::text,
    max(c.category)::text,
    bool_or(c.is_primary)
  from combined c
  group by c.team_id
  order by bool_or(c.is_primary) desc, max(c.team_name);
end;
$$;

-- --------------------------------------------------------------------------
-- 5. Cambiar de equipo.
--    Se permite si el equipo forma parte del listado efectivo anterior,
--    incluso si todavía no estaba guardado en technical_user_teams.
-- --------------------------------------------------------------------------
create or replace function public.technical_select_team_v27223(
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
  v_user_id := public.cdsb_technical_user_id_from_token_v27223(p_token);
  if v_user_id is null then
    raise exception 'La sesión técnica no es válida o ha caducado.';
  end if;

  if not exists (
    select 1
    from public.technical_available_teams_v27223(p_token) a
    where a.team_id = p_team_id
  ) then
    raise exception 'Este equipo no está asignado a tu acceso ni figura entre tus equipos de cuerpo técnico.';
  end if;

  select name into v_team_name
  from public.teams
  where id = p_team_id and deleted_at is null;

  if v_team_name is null then
    raise exception 'El equipo seleccionado ya no existe.';
  end if;

  update public.technical_users
  set team_id = p_team_id
  where id = v_user_id and active = true;

  -- Guardar también la relación para que desde ese momento quede explícita.
  insert into public.technical_user_teams(technical_user_id, team_id, is_primary)
  values (v_user_id, p_team_id, false)
  on conflict (technical_user_id, team_id) do nothing;

  return jsonb_build_object(
    'ok', true,
    'team_id', p_team_id,
    'team_name', v_team_name
  );
end;
$$;

-- --------------------------------------------------------------------------
-- 6. Permisos.
-- --------------------------------------------------------------------------
revoke all on function public.cdsb_technical_user_id_from_token_v27223(text) from public;
revoke all on function public.admin_list_technical_user_teams_v27223() from public;
revoke all on function public.technical_available_teams_v27223(text) from public;
revoke all on function public.technical_select_team_v27223(text,uuid) from public;

grant execute on function public.admin_list_technical_user_teams_v27223() to authenticated;
grant execute on function public.technical_available_teams_v27223(text) to anon, authenticated;
grant execute on function public.technical_select_team_v27223(text,uuid) to anon, authenticated;

commit;

-- --------------------------------------------------------------------------
-- COMPROBACIÓN GENERAL
-- Muestra los equipos efectivos combinando asignaciones explícitas y Cuerpo técnico.
-- --------------------------------------------------------------------------
with active_season as (
  select id from public.club_seasons where status='active' limit 1
), effective as (
  select u.id as technical_user_id, t.id as team_id, t.name::text as team_name
  from public.technical_users u
  join public.technical_user_teams m on m.technical_user_id=u.id
  join public.teams t on t.id=m.team_id
  where u.active=true

  union

  select u.id, t.id, t.name::text
  from public.technical_users u
  join public.staff s
    on lower(regexp_replace(btrim(coalesce(s.name,'')), '[[:space:]]+', ' ', 'g'))
     = lower(regexp_replace(btrim(coalesce(u.display_name,'')), '[[:space:]]+', ' ', 'g'))
  join public.teams t
    on lower(regexp_replace(btrim(coalesce(t.name,'')), '[[:space:]]+', ' ', 'g'))
     = lower(regexp_replace(btrim(coalesce(s.team_name,'')), '[[:space:]]+', ' ', 'g'))
  where u.active=true
    and t.deleted_at is null
    and (t.season_id=(select id from active_season) or not exists(select 1 from active_season))
)
select
  u.display_name,
  count(distinct e.team_id) as equipos_disponibles,
  string_agg(distinct e.team_name, ' · ' order by e.team_name) as equipos
from public.technical_users u
left join effective e on e.technical_user_id=u.id
where u.active=true
group by u.id,u.display_name
order by u.display_name;

-- COMPROBACIÓN DEL CASO INDICADO
-- Para Francisca Teresa Ortega Suarez debe mostrar 2 equipos y los nombres
-- CDSB Alevin B y CDSB Cadete B, siempre que ambos consten en Cuerpo técnico.
with active_season as (
  select id from public.club_seasons where status='active' limit 1
), effective as (
  select u.id as technical_user_id, t.id as team_id, t.name::text as team_name
  from public.technical_users u
  join public.technical_user_teams m on m.technical_user_id=u.id
  join public.teams t on t.id=m.team_id

  union

  select u.id, t.id, t.name::text
  from public.technical_users u
  join public.staff s
    on lower(regexp_replace(btrim(coalesce(s.name,'')), '[[:space:]]+', ' ', 'g'))
     = lower(regexp_replace(btrim(coalesce(u.display_name,'')), '[[:space:]]+', ' ', 'g'))
  join public.teams t
    on lower(regexp_replace(btrim(coalesce(t.name,'')), '[[:space:]]+', ' ', 'g'))
     = lower(regexp_replace(btrim(coalesce(s.team_name,'')), '[[:space:]]+', ' ', 'g'))
  where t.deleted_at is null
    and (t.season_id=(select id from active_season) or not exists(select 1 from active_season))
)
select
  u.display_name,
  count(distinct e.team_id) as equipos_disponibles,
  string_agg(distinct e.team_name, ' · ' order by e.team_name) as equipos
from public.technical_users u
left join effective e on e.technical_user_id=u.id
where lower(regexp_replace(btrim(coalesce(u.display_name,'')), '[[:space:]]+', ' ', 'g'))
    = lower('Francisca Teresa Ortega Suarez')
group by u.id,u.display_name;
