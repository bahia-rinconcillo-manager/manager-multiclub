-- ============================================================================
-- CD SAN BERNABÉ MANAGER · V27.2.2
-- ASISTENTE SEGURO DE CAMBIO DE TEMPORADA
-- Ejecutar DESPUÉS de EJECUTAR_ACTUALIZACION_V27_2_0.sql
-- ============================================================================

begin;

create or replace function public.cdsb_rollover_season_v2722(
  p_current_season_id uuid,
  p_new_name text,
  p_snapshot jsonb,
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
  v_staff_keep integer := 0;
  v_staff_drop integer := 0;
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
  if p_player_plan is null or jsonb_typeof(p_player_plan) <> 'array' then
    raise exception 'El plan de jugadores no es válido.';
  end if;
  if p_staff_plan is null or jsonb_typeof(p_staff_plan) <> 'array' then
    raise exception 'El plan del cuerpo técnico no es válido.';
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

  -- El asistente debe contener exactamente todos los jugadores activos.
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

  if exists (
    select 1
    from jsonb_array_elements(p_player_plan) as plan(item)
    where coalesce((plan.item->>'keep')::boolean, false)
      and nullif(trim(plan.item->>'team'), '') is null
  ) then
    raise exception 'Hay jugadores que continúan sin equipo de destino.';
  end if;

  -- Lo mismo para el cuerpo técnico.
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
      and nullif(trim(plan.item->>'team_name'), '') is null
  ) then
    raise exception 'Hay miembros del cuerpo técnico que continúan sin equipo de destino.';
  end if;

  select count(*) filter (where coalesce((plan.item->>'keep')::boolean,false)),
         count(*) filter (where not coalesce((plan.item->>'keep')::boolean,false))
  into v_players_keep, v_players_drop
  from jsonb_array_elements(p_player_plan) as plan(item);

  select count(*) filter (where coalesce((plan.item->>'keep')::boolean,false)),
         count(*) filter (where not coalesce((plan.item->>'keep')::boolean,false))
  into v_staff_keep, v_staff_drop
  from jsonb_array_elements(p_staff_plan) as plan(item);

  -- Instantánea completa antes de modificar ningún dato vivo.
  v_snapshot := jsonb_build_object(
    'application', 'CD San Bernabé Manager',
    'version', 'V27.2.2',
    'season', v_current.name,
    'archived_at', now(),
    'rollover_plan', jsonb_build_object(
      'new_season', trim(p_new_name),
      'players', p_player_plan,
      'staff', p_staff_plan,
      'keep_documents', coalesce(p_keep_documents,true),
      'keep_sizes', coalesce(p_keep_sizes,true)
    ),
    'tables', jsonb_build_object(
      'players', coalesce((select jsonb_agg(to_jsonb(x)) from public.players x), '[]'::jsonb),
      'teams', coalesce((select jsonb_agg(to_jsonb(x)) from public.teams x), '[]'::jsonb),
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

  -- Archivar las fichas RFAF antes de vaciar el tarjetero activo.
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

  -- Cerrar la actual. Todo continúa dentro de la misma transacción.
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

  -- Jugadores: los que continúan conservan identidad y reciben su equipo de
  -- destino. Las bajas quedan en Papelera, nunca se borran del histórico.
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

  -- Cuerpo técnico: mantener/cambiar de equipo o retirar de la plantilla viva.
  update public.staff s
  set team_name = nullif(trim(plan.item->>'team_name'), '')
  from jsonb_array_elements(p_staff_plan) as plan(item)
  where s.id = (plan.item->>'id')::uuid
    and coalesce((plan.item->>'keep')::boolean,false);

  delete from public.staff s
  using jsonb_array_elements(p_staff_plan) as plan(item)
  where s.id = (plan.item->>'id')::uuid
    and not coalesce((plan.item->>'keep')::boolean,false);

  -- Los triggers pueden crear nuevas trazas durante los cambios anteriores.
  if to_regclass('public.activity_logs') is not null then delete from public.activity_logs; end if;

  -- Los equipos se conservan como estructura base. Los accesos técnicos no se
  -- modifican automáticamente porque son credenciales independientes.
  insert into public.club_seasons(name,start_year,end_year,status)
  values (trim(p_new_name),v_start_year,v_end_year,'active')
  returning id into v_new_id;

  return jsonb_build_object(
    'ok', true,
    'closed_season_id', v_current.id,
    'closed_season', v_current.name,
    'new_season_id', v_new_id,
    'new_season', trim(p_new_name),
    'players_keep', v_players_keep,
    'players_drop', v_players_drop,
    'staff_keep', v_staff_keep,
    'staff_drop', v_staff_drop
  );
end;
$$;

revoke all on function public.cdsb_rollover_season_v2722(uuid,text,jsonb,jsonb,jsonb,boolean,boolean,text) from public;
grant execute on function public.cdsb_rollover_season_v2722(uuid,text,jsonb,jsonb,jsonb,boolean,boolean,text) to authenticated;

notify pgrst, 'reload schema';
commit;

select
  'V27.2.2 instalada correctamente: asistente seguro de cambio anual disponible' as resultado,
  name as temporada_activa,
  status
from public.club_seasons
where status = 'active';
