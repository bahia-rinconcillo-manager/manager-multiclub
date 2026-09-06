-- ============================================================================
-- CD SAN BERNABÉ MANAGER · V27.2.5
-- EQUIPOS INDEPENDIENTES POR TEMPORADA + ASISTENTE ANUAL SEGURO
-- Ejecutar DESPUÉS de V27.2.0 / V27.2.1
-- ============================================================================
--
-- Cambios principales:
--   · Cada equipo pertenece a una temporada concreta.
--   · Los equipos de la nueva temporada se crean como registros NUEVOS.
--   · Los jugadores/técnicos solo pueden asignarse a esos equipos nuevos.
--   · Un jugador o técnico puede continuar temporalmente SIN EQUIPO.
--   · Los accesos técnicos de la temporada anterior se desactivan al cerrar,
--     para reasignarlos de forma segura a los equipos nuevos.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. EQUIPOS VINCULADOS A SU TEMPORADA
-- ---------------------------------------------------------------------------
alter table public.teams
  add column if not exists season_id uuid references public.club_seasons(id) on delete restrict;

-- Los equipos existentes pertenecen a la temporada actualmente activa.
update public.teams
set season_id = (select id from public.club_seasons where status = 'active' limit 1)
where season_id is null;

-- A estas alturas debe existir una temporada activa (creada por V27.2.0).
do $$
begin
  if exists (select 1 from public.teams where season_id is null) then
    raise exception 'No se pudo vincular todos los equipos a una temporada activa.';
  end if;
end $$;

alter table public.teams alter column season_id set not null;

-- La tabla original tenía name UNIQUE global. Ahora el mismo nombre puede
-- existir en años distintos, pero no repetirse dentro de una misma temporada.
alter table public.teams drop constraint if exists teams_name_key;
drop index if exists public.teams_name_key;

create index if not exists teams_season_idx
  on public.teams(season_id);

create unique index if not exists teams_season_name_active_uidx
  on public.teams(season_id, lower(name))
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 2. CAMBIO ANUAL ATÓMICO
-- ---------------------------------------------------------------------------
create or replace function public.cdsb_rollover_season_v2725(
  p_current_season_id uuid,
  p_new_name text,
  p_snapshot jsonb,
  p_team_plan jsonb,
  p_player_plan jsonb,
  p_staff_plan jsonb,
  p_keep_documents boolean,
  p_keep_sizes boolean,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.club_seasons%rowtype;
  v_new_id uuid;
  v_start_year integer;
  v_end_suffix integer;
  v_end_year integer;
  v_expected_name text;
  v_expected_confirmation text;
  v_snapshot jsonb;
  v_active_players integer := 0;
  v_active_staff integer := 0;
  v_players_keep integer := 0;
  v_players_drop integer := 0;
  v_players_unassigned integer := 0;
  v_staff_keep integer := 0;
  v_staff_drop integer := 0;
  v_staff_unassigned integer := 0;
  v_teams_new integer := 0;
begin
  if not public.cdsb_is_admin() then
    raise exception 'Solo un administrador puede cerrar y crear temporadas.';
  end if;

  select * into v_current
  from public.club_seasons
  where id = p_current_season_id
    and status = 'active'
  for update;

  if v_current.id is null then
    raise exception 'La temporada indicada ya no es la temporada activa.';
  end if;

  v_expected_confirmation := 'CERRAR ' || v_current.name;
  if trim(coalesce(p_confirmation, '')) <> v_expected_confirmation then
    raise exception 'Confirmación incorrecta. Debes escribir exactamente %.', v_expected_confirmation;
  end if;

  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'No se ha recibido una copia histórica válida.';
  end if;
  if p_team_plan is null or jsonb_typeof(p_team_plan) <> 'array' then
    raise exception 'El plan de equipos no es válido.';
  end if;
  if p_player_plan is null or jsonb_typeof(p_player_plan) <> 'array' then
    raise exception 'El plan de jugadores no es válido.';
  end if;
  if p_staff_plan is null or jsonb_typeof(p_staff_plan) <> 'array' then
    raise exception 'El plan del cuerpo técnico no es válido.';
  end if;

  if jsonb_array_length(p_team_plan) = 0 then
    raise exception 'Debes crear al menos un equipo para la nueva temporada.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_team_plan) as plan(item)
    where nullif(trim(plan.item->>'name'), '') is null
  ) then
    raise exception 'Todos los equipos nuevos deben tener nombre.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_team_plan) as plan(item)
    group by lower(trim(plan.item->>'name'))
    having count(*) > 1
  ) then
    raise exception 'Hay nombres de equipos repetidos en la nueva temporada.';
  end if;

  if trim(coalesce(p_new_name,'')) !~ '^[0-9]{4}/[0-9]{2}$' then
    raise exception 'La nueva temporada debe tener formato 2027/28.';
  end if;

  v_start_year := split_part(trim(p_new_name), '/', 1)::integer;
  v_end_suffix := split_part(trim(p_new_name), '/', 2)::integer;
  v_end_year := (v_start_year / 100) * 100 + v_end_suffix;
  if v_end_year <= v_start_year then
    v_end_year := v_end_year + 100;
  end if;
  if v_end_year <> v_start_year + 1 then
    raise exception 'La temporada debe abarcar dos años consecutivos.';
  end if;

  v_expected_name := v_current.end_year::text || '/' || lpad(((v_current.end_year + 1) % 100)::text, 2, '0');
  if trim(p_new_name) <> v_expected_name then
    raise exception 'La siguiente temporada debe ser %.', v_expected_name;
  end if;
  if exists (select 1 from public.club_seasons where name = trim(p_new_name)) then
    raise exception 'La temporada % ya existe.', trim(p_new_name);
  end if;

  -- El asistente debe seguir representando exactamente la plantilla viva.
  select count(*) into v_active_players
  from public.players
  where deleted_at is null;

  if jsonb_array_length(p_player_plan) <> v_active_players then
    raise exception 'El listado de jugadores ha cambiado mientras preparabas el cierre. Vuelve a abrir el asistente.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_player_plan) as plan(item)
    group by plan.item->>'id'
    having count(*) > 1
  ) then
    raise exception 'El plan de jugadores contiene registros duplicados.';
  end if;

  if exists (
    select 1
    from public.players p
    where p.deleted_at is null
      and not exists (
        select 1
        from jsonb_array_elements(p_player_plan) as plan(item)
        where (plan.item->>'id')::uuid = p.id
      )
  ) then
    raise exception 'Falta al menos un jugador activo en el plan de cambio de temporada.';
  end if;

  -- Si se elige equipo, tiene que ser uno de los equipos NUEVOS del plan.
  if exists (
    select 1
    from jsonb_array_elements(p_player_plan) as plan(item)
    where coalesce((plan.item->>'keep')::boolean, false)
      and nullif(trim(plan.item->>'team'), '') is not null
      and not exists (
        select 1
        from jsonb_array_elements(p_team_plan) as team_plan(team_item)
        where lower(trim(team_plan.team_item->>'name')) = lower(trim(plan.item->>'team'))
      )
  ) then
    raise exception 'Hay jugadores asignados a un equipo que no pertenece a la nueva temporada.';
  end if;

  select count(*) into v_active_staff from public.staff;
  if jsonb_array_length(p_staff_plan) <> v_active_staff then
    raise exception 'El listado del cuerpo técnico ha cambiado mientras preparabas el cierre. Vuelve a abrir el asistente.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_staff_plan) as plan(item)
    group by plan.item->>'id'
    having count(*) > 1
  ) then
    raise exception 'El plan del cuerpo técnico contiene registros duplicados.';
  end if;

  if exists (
    select 1
    from public.staff s
    where not exists (
      select 1
      from jsonb_array_elements(p_staff_plan) as plan(item)
      where (plan.item->>'id')::uuid = s.id
    )
  ) then
    raise exception 'Falta al menos un miembro del cuerpo técnico en el plan.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_staff_plan) as plan(item)
    where coalesce((plan.item->>'keep')::boolean, false)
      and nullif(trim(plan.item->>'team_name'), '') is not null
      and not exists (
        select 1
        from jsonb_array_elements(p_team_plan) as team_plan(team_item)
        where lower(trim(team_plan.team_item->>'name')) = lower(trim(plan.item->>'team_name'))
      )
  ) then
    raise exception 'Hay miembros del cuerpo técnico asignados a un equipo que no pertenece a la nueva temporada.';
  end if;

  select
    count(*) filter (where coalesce((plan.item->>'keep')::boolean,false)),
    count(*) filter (where not coalesce((plan.item->>'keep')::boolean,false)),
    count(*) filter (
      where coalesce((plan.item->>'keep')::boolean,false)
        and nullif(trim(plan.item->>'team'), '') is null
    )
  into v_players_keep, v_players_drop, v_players_unassigned
  from jsonb_array_elements(p_player_plan) as plan(item);

  select
    count(*) filter (where coalesce((plan.item->>'keep')::boolean,false)),
    count(*) filter (where not coalesce((plan.item->>'keep')::boolean,false)),
    count(*) filter (
      where coalesce((plan.item->>'keep')::boolean,false)
        and nullif(trim(plan.item->>'team_name'), '') is null
    )
  into v_staff_keep, v_staff_drop, v_staff_unassigned
  from jsonb_array_elements(p_staff_plan) as plan(item);

  v_teams_new := jsonb_array_length(p_team_plan);

  -- Instantánea completa ANTES de modificar ningún dato operativo.
  v_snapshot := jsonb_build_object(
    'application', 'CD San Bernabé Manager',
    'version', 'V27.2.5',
    'season', v_current.name,
    'archived_at', now(),
    'rollover_plan', jsonb_build_object(
      'new_season', trim(p_new_name),
      'new_teams', p_team_plan,
      'players', p_player_plan,
      'staff', p_staff_plan,
      'keep_documents', coalesce(p_keep_documents,true),
      'keep_sizes', coalesce(p_keep_sizes,true)
    ),
    'tables', jsonb_build_object(
      'players', coalesce((select jsonb_agg(to_jsonb(x)) from public.players x), '[]'::jsonb),
      'teams', coalesce((select jsonb_agg(to_jsonb(x)) from public.teams x where x.season_id = v_current.id), '[]'::jsonb),
      'payments', coalesce((select jsonb_agg(to_jsonb(x)) from public.payments x), '[]'::jsonb),
      'documents', coalesce((select jsonb_agg(to_jsonb(x)) from public.documents x), '[]'::jsonb),
      'kits', coalesce((select jsonb_agg(to_jsonb(x)) from public.kits x), '[]'::jsonb),
      'player_sizes', coalesce((select jsonb_agg(to_jsonb(x)) from public.player_sizes x), '[]'::jsonb),
      'staff', coalesce((select jsonb_agg(to_jsonb(x)) from public.staff x), '[]'::jsonb),
      'staff_sizes', coalesce((select jsonb_agg(to_jsonb(x)) from public.staff_sizes x), '[]'::jsonb),
      'events', coalesce((select jsonb_agg(to_jsonb(x)) from public.events x), '[]'::jsonb),
      'pitch_usage', coalesce((select jsonb_agg(to_jsonb(x)) from public.pitch_usage x), '[]'::jsonb),
      'finance_movements', coalesce((select jsonb_agg(to_jsonb(x)) from public.finance_movements x), '[]'::jsonb),
      'activity_logs', coalesce((select jsonb_agg(to_jsonb(x)) from public.activity_logs x), '[]'::jsonb)
    ),
    'sports', jsonb_build_object(
      'trainings', coalesce((select jsonb_agg(to_jsonb(x) order by x.session_date desc, x.session_time desc) from public.sports_training_sessions x), '[]'::jsonb),
      'training_attendance', coalesce((select jsonb_agg(to_jsonb(x) order by x.session_id, x.player_id) from public.sports_training_attendance x), '[]'::jsonb),
      'matches', coalesce((select jsonb_agg(to_jsonb(x) order by x.match_date desc, x.match_time desc) from public.sports_matches x), '[]'::jsonb),
      'match_stats', coalesce((select jsonb_agg(to_jsonb(x) order by x.match_id, x.player_id) from public.sports_match_player_stats x), '[]'::jsonb)
    ),
    'local', coalesce(p_snapshot->'local', '{}'::jsonb)
  );

  -- Archivar fichas RFAF de la temporada actual.
  if to_regclass('public.team_player_cards') is not null then
    insert into public.season_team_player_cards(
      season_id, original_card_id, team_id, player_id, player_name,
      page_number, source_pdf_name, image_data, created_at, updated_at
    )
    select
      v_current.id, c.id, c.team_id, c.player_id, c.player_name,
      c.page_number, c.source_pdf_name, coalesce(c.image_data, ''), c.created_at, c.updated_at
    from public.team_player_cards c
    on conflict do nothing;
  end if;

  -- Cerrar temporada actual. Todo sigue dentro de la misma transacción.
  update public.club_seasons
  set status = 'closed', snapshot = v_snapshot, closed_at = now()
  where id = v_current.id;

  -- Datos estrictamente anuales: empiezan vacíos en la nueva temporada.
  if to_regclass('public.team_player_cards') is not null then delete from public.team_player_cards; end if;
  if to_regclass('public.sports_training_attendance') is not null then delete from public.sports_training_attendance; end if;
  if to_regclass('public.sports_match_player_stats') is not null then delete from public.sports_match_player_stats; end if;
  if to_regclass('public.sports_training_sessions') is not null then delete from public.sports_training_sessions; end if;
  if to_regclass('public.sports_matches') is not null then delete from public.sports_matches; end if;
  if to_regclass('public.payments') is not null then delete from public.payments; end if;
  if to_regclass('public.kits') is not null then delete from public.kits; end if;
  if to_regclass('public.events') is not null then delete from public.events; end if;
  if to_regclass('public.pitch_usage') is not null then delete from public.pitch_usage; end if;
  if to_regclass('public.finance_movements') is not null then delete from public.finance_movements; end if;
  if to_regclass('public.activity_logs') is not null then delete from public.activity_logs; end if;

  if not coalesce(p_keep_documents,true) and to_regclass('public.documents') is not null then
    delete from public.documents;
  end if;
  if not coalesce(p_keep_sizes,true) then
    if to_regclass('public.player_sizes') is not null then delete from public.player_sizes; end if;
    if to_regclass('public.staff_sizes') is not null then delete from public.staff_sizes; end if;
  end if;

  -- Los accesos del cuerpo técnico de los equipos antiguos se desactivan.
  -- No se eliminan: el administrador podrá reasignarlos y volver a activarlos.
  if to_regclass('public.technical_users') is not null then
    execute '
      update public.technical_users
      set active = false
      where team_id in (
        select id from public.teams where season_id = $1
      )'
    using v_current.id;
  end if;

  -- Crear primero la nueva temporada para poder vincularle sus equipos.
  insert into public.club_seasons(name,start_year,end_year,status)
  values (trim(p_new_name),v_start_year,v_end_year,'active')
  returning id into v_new_id;

  -- Crear EQUIPOS NUEVOS: nunca se reutilizan los IDs de la temporada anterior.
  insert into public.teams(
    name, category, coach_id, delegate_name,
    training_schedule, field, notes, season_id
  )
  select
    trim(plan.item->>'name'),
    nullif(trim(plan.item->>'category'), ''),
    null,
    nullif(trim(plan.item->>'delegate_name'), ''),
    nullif(trim(plan.item->>'training_schedule'), ''),
    nullif(trim(plan.item->>'field'), ''),
    nullif(trim(plan.item->>'notes'), ''),
    v_new_id
  from jsonb_array_elements(p_team_plan) as plan(item);

  -- Jugadores: continuar con equipo nuevo o temporalmente Sin equipo.
  update public.players p
  set team = nullif(trim(plan.item->>'team'), '')
  from jsonb_array_elements(p_player_plan) as plan(item)
  where p.id = (plan.item->>'id')::uuid
    and coalesce((plan.item->>'keep')::boolean,false);

  update public.players p
  set deleted_at = coalesce(p.deleted_at, now())
  from jsonb_array_elements(p_player_plan) as plan(item)
  where p.id = (plan.item->>'id')::uuid
    and not coalesce((plan.item->>'keep')::boolean,false);

  -- Cuerpo técnico: continuar con equipo nuevo o temporalmente Sin equipo.
  update public.staff s
  set team_name = nullif(trim(plan.item->>'team_name'), '')
  from jsonb_array_elements(p_staff_plan) as plan(item)
  where s.id = (plan.item->>'id')::uuid
    and coalesce((plan.item->>'keep')::boolean,false);

  delete from public.staff s
  using jsonb_array_elements(p_staff_plan) as plan(item)
  where s.id = (plan.item->>'id')::uuid
    and not coalesce((plan.item->>'keep')::boolean,false);

  -- Si existe un Entrenador principal asignado por nombre al nuevo equipo,
  -- vincularlo también como coach_id de la ficha de equipo.
  update public.teams t
  set coach_id = (
    select s.id
    from public.staff s
    where lower(trim(coalesce(s.team_name,''))) = lower(trim(t.name))
      and lower(trim(coalesce(s.role,''))) = 'entrenador'
    order by s.created_at nulls last, s.id
    limit 1
  )
  where t.season_id = v_new_id;

  -- Los triggers pueden crear trazas durante los cambios anteriores.
  if to_regclass('public.activity_logs') is not null then delete from public.activity_logs; end if;

  return jsonb_build_object(
    'ok', true,
    'closed_season_id', v_current.id,
    'closed_season', v_current.name,
    'new_season_id', v_new_id,
    'new_season', trim(p_new_name),
    'teams_new', v_teams_new,
    'players_keep', v_players_keep,
    'players_drop', v_players_drop,
    'players_unassigned', v_players_unassigned,
    'staff_keep', v_staff_keep,
    'staff_drop', v_staff_drop,
    'staff_unassigned', v_staff_unassigned
  );
end;
$$;

revoke all on function public.cdsb_rollover_season_v2725(uuid,text,jsonb,jsonb,jsonb,jsonb,boolean,boolean,text) from public;
grant execute on function public.cdsb_rollover_season_v2725(uuid,text,jsonb,jsonb,jsonb,jsonb,boolean,boolean,text) to authenticated;

notify pgrst, 'reload schema';
commit;

select
  'V27.2.5 instalada correctamente: equipos independientes por temporada disponibles' as resultado,
  s.name as temporada_activa,
  s.status,
  (select count(*) from public.teams t where t.season_id = s.id and t.deleted_at is null) as equipos_temporada_activa
from public.club_seasons s
where s.status = 'active';
