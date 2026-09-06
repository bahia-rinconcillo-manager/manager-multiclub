-- ==========================================================================
-- CD SAN BERNABÉ MANAGER · V27.2.19
-- TALLAJE EXCLUSIVO DE CUERPOS TÉCNICOS + ACCESO TÉCNICO MULTIEQUIPO
-- Ejecutar una sola vez en Supabase > SQL Editor > New query > Run
-- Puede ejecutarse de nuevo sin borrar usuarios ni asignaciones.
-- ==========================================================================

begin;

-- --------------------------------------------------------------------------
-- 1. Un mismo acceso técnico puede estar vinculado a varios equipos.
--    technical_users.team_id se conserva como "equipo activo" para mantener
--    compatibilidad con todos los RPC existentes de área privada/deportiva.
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

-- Migrar automáticamente todos los accesos de un solo equipo ya existentes.
insert into public.technical_user_teams(technical_user_id, team_id, is_primary)
select u.id, u.team_id, true
from public.technical_users u
where u.team_id is not null
on conflict (technical_user_id, team_id) do nothing;

-- Si por una instalación previa hubiera más de un primario, conservar solo uno.
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
-- 2. Administración: listar los equipos vinculados a cada usuario técnico.
-- --------------------------------------------------------------------------
create or replace function public.admin_list_technical_user_teams_v27219()
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
  select
    m.technical_user_id,
    m.team_id,
    t.name::text,
    t.age_category::text,
    t.category::text,
    m.is_primary
  from public.technical_user_teams m
  join public.teams t on t.id = m.team_id
  order by m.technical_user_id, m.is_primary desc, t.name;
end;
$$;

-- --------------------------------------------------------------------------
-- 3. Administración: guardar uno o varios equipos para un mismo acceso.
-- --------------------------------------------------------------------------
create or replace function public.admin_set_technical_user_teams_v27219(
  p_id uuid,
  p_team_ids uuid[],
  p_primary_team_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  v_expected integer;
  v_existing integer;
begin
  if not public.cdsb_is_admin() then
    raise exception 'Solo un administrador puede modificar los accesos técnicos.';
  end if;

  if not exists (select 1 from public.technical_users where id = p_id) then
    raise exception 'El usuario técnico indicado no existe.';
  end if;

  select array_agg(distinct x)
  into v_ids
  from unnest(coalesce(p_team_ids, array[]::uuid[])) x
  where x is not null;

  if coalesce(array_length(v_ids,1),0) = 0 then
    raise exception 'Selecciona al menos un equipo.';
  end if;

  if p_primary_team_id is null or not (p_primary_team_id = any(v_ids)) then
    raise exception 'El equipo principal debe formar parte de los equipos asignados.';
  end if;

  v_expected := array_length(v_ids,1);
  select count(*) into v_existing
  from public.teams
  where id = any(v_ids);

  if v_existing <> v_expected then
    raise exception 'Uno de los equipos seleccionados ya no existe.';
  end if;

  delete from public.technical_user_teams
  where technical_user_id = p_id;

  insert into public.technical_user_teams(technical_user_id, team_id, is_primary)
  select p_id, team_id, team_id = p_primary_team_id
  from unnest(v_ids) team_id;

  -- Compatibilidad con todos los RPC anteriores: el principal queda activo.
  update public.technical_users
  set team_id = p_primary_team_id
  where id = p_id;

  return jsonb_build_object(
    'ok', true,
    'technical_user_id', p_id,
    'primary_team_id', p_primary_team_id,
    'team_count', v_expected
  );
end;
$$;

-- Utilidad administrativa para recuperar el id tras crear un usuario.
create or replace function public.admin_technical_user_id_v27219(p_username text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.cdsb_is_admin() then
    raise exception 'Solo un administrador puede consultar los accesos técnicos.';
  end if;

  select id into v_id
  from public.technical_users
  where lower(username) = lower(trim(coalesce(p_username,'')))
  limit 1;

  return v_id;
end;
$$;

-- --------------------------------------------------------------------------
-- 4. Resolver de forma privada qué technical_user corresponde al token.
--    Se apoya en el RPC technical_session ya instalado. Se contemplan varias
--    formas de retorno para mantener compatibilidad con instalaciones previas.
-- --------------------------------------------------------------------------
create or replace function public.cdsb_technical_user_id_from_token_v27219(p_token text)
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
begin
  if nullif(trim(coalesce(p_token,'')),'') is null then
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

  -- Cuando la función devuelve un único json/jsonb Postgres lo envuelve con
  -- el nombre de la función; desempaquetarlo si ocurre.
  if jsonb_typeof(v_profile) = 'object' and v_profile ? 'technical_session' then
    v_profile := v_profile -> 'technical_session';
  end if;

  if v_profile is null or jsonb_typeof(v_profile) <> 'object' then
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
    where id = v_id_text::uuid and active = true
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
    where lower(username) = lower(v_username) and active = true
    limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  -- Último método compatible con versiones antiguas del perfil técnico.
  v_display_name := nullif(v_profile->>'display_name','');
  v_team_id_text := nullif(v_profile->>'team_id','');
  if v_display_name is not null
     and v_team_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    select id into v_id
    from public.technical_users
    where display_name = v_display_name
      and team_id = v_team_id_text::uuid
      and active = true
    order by id
    limit 1;
  end if;

  return v_id;
end;
$$;

-- --------------------------------------------------------------------------
-- 5. Área privada: obtener todos los equipos disponibles para el entrenador.
-- --------------------------------------------------------------------------
create or replace function public.technical_available_teams_v27219(p_token text)
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
  v_user_id := public.cdsb_technical_user_id_from_token_v27219(p_token);
  if v_user_id is null then
    raise exception 'La sesión técnica no es válida o ha caducado.';
  end if;

  return query
  select q.team_id,q.team_name,q.age_category,q.category,q.is_primary
  from (
    select
      m.team_id,
      t.name::text as team_name,
      t.age_category::text as age_category,
      t.category::text as category,
      m.is_primary
    from public.technical_user_teams m
    join public.teams t on t.id=m.team_id
    where m.technical_user_id=v_user_id

    union all

    -- Compatibilidad de emergencia: si un acceso antiguo no tuviera aún fila
    -- en la nueva tabla, ofrecer su team_id actual sin modificar ningún dato.
    select
      u.team_id,
      t.name::text,
      t.age_category::text,
      t.category::text,
      true
    from public.technical_users u
    join public.teams t on t.id=u.team_id
    where u.id=v_user_id
      and u.team_id is not null
      and not exists (
        select 1 from public.technical_user_teams x
        where x.technical_user_id=v_user_id
      )
  ) q
  order by q.is_primary desc,q.team_name;
end;
$$;

-- --------------------------------------------------------------------------
-- 6. Área privada: cambiar el equipo activo sin crear otra contraseña.
--    Los RPC deportivos existentes seguirán viendo technical_users.team_id.
-- --------------------------------------------------------------------------
create or replace function public.technical_select_team_v27219(
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
  v_user_id := public.cdsb_technical_user_id_from_token_v27219(p_token);
  if v_user_id is null then
    raise exception 'La sesión técnica no es válida o ha caducado.';
  end if;

  if not exists (
    select 1
    from public.technical_user_teams
    where technical_user_id=v_user_id and team_id=p_team_id
  ) then
    raise exception 'Este equipo no está asignado a tu acceso.';
  end if;

  select name into v_team_name from public.teams where id=p_team_id;
  if v_team_name is null then raise exception 'El equipo seleccionado ya no existe.'; end if;

  update public.technical_users
  set team_id=p_team_id
  where id=v_user_id and active=true;

  return jsonb_build_object(
    'ok',true,
    'team_id',p_team_id,
    'team_name',v_team_name
  );
end;
$$;

-- --------------------------------------------------------------------------
-- 7. Permisos RPC.
-- --------------------------------------------------------------------------
revoke all on function public.admin_list_technical_user_teams_v27219() from public;
revoke all on function public.admin_set_technical_user_teams_v27219(uuid,uuid[],uuid) from public;
revoke all on function public.admin_technical_user_id_v27219(text) from public;
revoke all on function public.cdsb_technical_user_id_from_token_v27219(text) from public;
revoke all on function public.technical_available_teams_v27219(text) from public;
revoke all on function public.technical_select_team_v27219(text,uuid) from public;

grant execute on function public.admin_list_technical_user_teams_v27219() to authenticated;
grant execute on function public.admin_set_technical_user_teams_v27219(uuid,uuid[],uuid) to authenticated;
grant execute on function public.admin_technical_user_id_v27219(text) to authenticated;

grant execute on function public.technical_available_teams_v27219(text) to anon, authenticated;
grant execute on function public.technical_select_team_v27219(text,uuid) to anon, authenticated;

commit;

-- COMPROBACIÓN FINAL
select
  'V27.2.19 instalada correctamente: accesos técnicos multiequipo disponibles' as resultado,
  (select count(*) from public.technical_user_teams) as asignaciones_migradas,
  to_regprocedure('public.technical_available_teams_v27219(text)') is not null as selector_equipos,
  to_regprocedure('public.technical_select_team_v27219(text,uuid)') is not null as cambio_equipo;
