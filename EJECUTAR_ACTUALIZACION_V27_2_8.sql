-- ============================================================================
-- CD SAN BERNABÉ MANAGER · V27.2.8
-- SIMULACIÓN SEGURA DEL CAMBIO ANUAL
-- Ejecutar DESPUÉS de V27.2.6
-- ============================================================================
-- Esta función NO modifica datos. Repite en Supabase las comprobaciones
-- críticas del cierre para detectar problemas antes de ejecutar el cambio real.
-- ============================================================================

begin;

create or replace function public.cdsb_simulate_rollover_v2728(
  p_current_season_id uuid,
  p_new_name text,
  p_team_plan jsonb,
  p_player_plan jsonb,
  p_staff_plan jsonb,
  p_keep_documents boolean,
  p_keep_sizes boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.club_seasons%rowtype;
  v_start_year integer;
  v_end_suffix integer;
  v_end_year integer;
  v_expected_name text;
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
    raise exception 'Solo un administrador puede simular un cambio de temporada.';
  end if;

  select * into v_current
  from public.club_seasons
  where id = p_current_season_id
    and status = 'active';

  if v_current.id is null then
    raise exception 'La temporada indicada ya no es la temporada activa.';
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
    select 1 from jsonb_array_elements(p_team_plan) as plan(item)
    where nullif(trim(plan.item->>'name'), '') is null
  ) then
    raise exception 'Todos los equipos nuevos deben tener nombre.';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_team_plan) as plan(item)
    group by lower(trim(plan.item->>'name'))
    having count(*) > 1
  ) then
    raise exception 'Hay nombres de equipos repetidos en la nueva temporada.';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_team_plan) as plan(item)
    where nullif(trim(plan.item->>'age_category'), '') is null
       or trim(plan.item->>'age_category') not in ('Bebé','Prebenjamín','Benjamín','Alevín','Infantil','Cadete','Juvenil')
  ) then
    raise exception 'Todos los equipos nuevos deben tener una categoría de edad válida.';
  end if;

  if trim(coalesce(p_new_name,'')) !~ '^[0-9]{4}/[0-9]{2}$' then
    raise exception 'La nueva temporada debe tener formato 2027/28.';
  end if;

  v_start_year := split_part(trim(p_new_name), '/', 1)::integer;
  v_end_suffix := split_part(trim(p_new_name), '/', 2)::integer;
  v_end_year := (v_start_year / 100) * 100 + v_end_suffix;
  if v_end_year <= v_start_year then v_end_year := v_end_year + 100; end if;
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

  -- Comprobar que las tablas indispensables siguen presentes.
  if to_regclass('public.players') is null
     or to_regclass('public.teams') is null
     or to_regclass('public.staff') is null
     or to_regclass('public.club_seasons') is null then
    raise exception 'Falta alguna tabla indispensable para el cambio anual.';
  end if;

  select count(*) into v_active_players
  from public.players
  where deleted_at is null;

  if jsonb_array_length(p_player_plan) <> v_active_players then
    raise exception 'El listado de jugadores ha cambiado mientras preparabas el cierre. Vuelve a abrir el asistente.';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_player_plan) as plan(item)
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
        select 1 from jsonb_array_elements(p_player_plan) as plan(item)
        where (plan.item->>'id')::uuid = p.id
      )
  ) then
    raise exception 'Falta al menos un jugador activo en el plan de cambio de temporada.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_player_plan) as plan(item)
    where coalesce((plan.item->>'keep')::boolean, false)
      and nullif(trim(plan.item->>'team'), '') is not null
      and not exists (
        select 1 from jsonb_array_elements(p_team_plan) as team_plan(team_item)
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
    select 1 from jsonb_array_elements(p_staff_plan) as plan(item)
    group by plan.item->>'id'
    having count(*) > 1
  ) then
    raise exception 'El plan del cuerpo técnico contiene registros duplicados.';
  end if;

  if exists (
    select 1
    from public.staff s
    where not exists (
      select 1 from jsonb_array_elements(p_staff_plan) as plan(item)
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
        select 1 from jsonb_array_elements(p_team_plan) as team_plan(team_item)
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

  return jsonb_build_object(
    'ok', true,
    'simulated_at', now(),
    'current_season', v_current.name,
    'new_season', trim(p_new_name),
    'teams_new', v_teams_new,
    'players_total', v_active_players,
    'players_keep', v_players_keep,
    'players_drop', v_players_drop,
    'players_unassigned', v_players_unassigned,
    'staff_total', v_active_staff,
    'staff_keep', v_staff_keep,
    'staff_drop', v_staff_drop,
    'staff_unassigned', v_staff_unassigned,
    'keep_documents', coalesce(p_keep_documents,true),
    'keep_sizes', coalesce(p_keep_sizes,true),
    'writes_performed', false,
    'message', 'Simulación correcta. No se ha modificado ningún dato.'
  );
end;
$$;

revoke all on function public.cdsb_simulate_rollover_v2728(uuid,text,jsonb,jsonb,jsonb,boolean,boolean) from public;
grant execute on function public.cdsb_simulate_rollover_v2728(uuid,text,jsonb,jsonb,jsonb,boolean,boolean) to authenticated;

notify pgrst, 'reload schema';
commit;

select
  'V27.2.8 instalada correctamente: simulación segura disponible' as resultado,
  name as temporada_activa,
  status
from public.club_seasons
where status = 'active';
