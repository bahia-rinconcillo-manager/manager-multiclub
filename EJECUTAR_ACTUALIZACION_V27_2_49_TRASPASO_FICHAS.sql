-- ============================================================================
-- CD SAN BERNABÉ MANAGER · V27.2.49
-- TARJETERO · TRASPASAR / ELIMINAR FICHAS DESDE EL ACCESO DE ENTRENADORES
-- Ejecutar UNA SOLA VEZ en Supabase después de las actualizaciones anteriores.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Equipos de destino disponibles para el entrenador.
--    El entrenador solo puede iniciar la acción desde el equipo que tiene
--    seleccionado, pero puede compartir la ficha con cualquier equipo ACTIVO
--    de la temporada actual.
-- ---------------------------------------------------------------------------
create or replace function public.technical_card_transfer_targets_v27249(
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_source_team_id uuid;
  v_teams jsonb;
begin
  if nullif(btrim(coalesce(p_token,'')),'') is null then
    raise exception 'La sesión técnica no es válida o ha caducado.';
  end if;

  delete from public.technical_sessions where expires_at <= now();

  select u.id,u.team_id
    into v_user_id,v_source_team_id
  from public.technical_sessions s
  join public.technical_users u on u.id=s.technical_user_id
  where s.token_hash=md5(coalesce(p_token,''))
    and s.expires_at>now()
    and u.active=true
  order by s.expires_at desc
  limit 1;

  if v_user_id is null or v_source_team_id is null then
    raise exception 'La sesión técnica no tiene un equipo activo válido.';
  end if;

  if not exists (
    select 1
    from public.teams t
    join public.club_seasons cs on cs.id=t.season_id and cs.status='active'
    where t.id=v_source_team_id and t.deleted_at is null
  ) then
    raise exception 'El equipo actual no pertenece a la temporada activa.';
  end if;

  update public.technical_sessions
  set last_used_at=now()
  where token_hash=md5(coalesce(p_token,'')) and expires_at>now();

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'team_id',t.id,
        'team_name',t.name,
        'age_category',t.age_category,
        'category',t.category
      ) order by lower(t.name)
    ),
    '[]'::jsonb
  )
  into v_teams
  from public.teams t
  join public.club_seasons cs on cs.id=t.season_id and cs.status='active'
  where t.deleted_at is null
    and t.id<>v_source_team_id;

  return jsonb_build_object(
    'ok',true,
    'source_team_id',v_source_team_id,
    'teams',v_teams
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. TRASPASAR = COPIAR la ficha a otro tarjetero.
--    NO modifica players.team / players.team_id.
--    NO elimina la ficha de origen.
--    Si ya existe la misma ficha/jugador en el destino, no la duplica.
-- ---------------------------------------------------------------------------
create or replace function public.technical_transfer_team_card_v27249(
  p_token text,
  p_card_id uuid,
  p_target_team_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_source_team_id uuid;
  v_source_team_name text;
  v_target_team_name text;
  v_card public.team_player_cards%rowtype;
  v_existing_id uuid;
  v_new_id uuid;
begin
  if nullif(btrim(coalesce(p_token,'')),'') is null then
    raise exception 'La sesión técnica no es válida o ha caducado.';
  end if;
  if p_card_id is null or p_target_team_id is null then
    raise exception 'Falta la ficha o el equipo de destino.';
  end if;

  delete from public.technical_sessions where expires_at <= now();

  select u.id,u.team_id
    into v_user_id,v_source_team_id
  from public.technical_sessions s
  join public.technical_users u on u.id=s.technical_user_id
  where s.token_hash=md5(coalesce(p_token,''))
    and s.expires_at>now()
    and u.active=true
  order by s.expires_at desc
  limit 1;

  if v_user_id is null or v_source_team_id is null then
    raise exception 'La sesión técnica no tiene un equipo activo válido.';
  end if;

  select * into v_card
  from public.team_player_cards
  where id=p_card_id and team_id=v_source_team_id
  limit 1;

  if v_card.id is null then
    raise exception 'La ficha no pertenece al equipo que tienes abierto.';
  end if;

  if p_target_team_id=v_source_team_id then
    raise exception 'La ficha ya pertenece a este tarjetero.';
  end if;

  select t.name into v_source_team_name
  from public.teams t
  where t.id=v_source_team_id and t.deleted_at is null;

  select t.name into v_target_team_name
  from public.teams t
  join public.club_seasons cs on cs.id=t.season_id and cs.status='active'
  where t.id=p_target_team_id and t.deleted_at is null
  limit 1;

  if v_target_team_name is null then
    raise exception 'El equipo de destino no es válido o no pertenece a la temporada activa.';
  end if;

  select id into v_existing_id
  from public.team_player_cards
  where team_id=p_target_team_id
    and player_id=v_card.player_id
  limit 1;

  if v_existing_id is not null then
    update public.technical_sessions
    set last_used_at=now()
    where token_hash=md5(coalesce(p_token,'')) and expires_at>now();

    return jsonb_build_object(
      'ok',true,
      'already_exists',true,
      'card_id',v_existing_id,
      'source_team_id',v_source_team_id,
      'source_team_name',v_source_team_name,
      'target_team_id',p_target_team_id,
      'target_team_name',v_target_team_name,
      'message','La ficha ya estaba en el equipo de destino. No se ha duplicado.'
    );
  end if;

  insert into public.team_player_cards(
    team_id,
    player_id,
    player_name,
    page_number,
    source_pdf_name,
    image_data,
    updated_at
  )
  values(
    p_target_team_id,
    v_card.player_id,
    v_card.player_name,
    v_card.page_number,
    v_card.source_pdf_name,
    v_card.image_data,
    now()
  )
  returning id into v_new_id;

  update public.technical_sessions
  set last_used_at=now()
  where token_hash=md5(coalesce(p_token,'')) and expires_at>now();

  return jsonb_build_object(
    'ok',true,
    'already_exists',false,
    'card_id',v_new_id,
    'source_team_id',v_source_team_id,
    'source_team_name',v_source_team_name,
    'target_team_id',p_target_team_id,
    'target_team_name',v_target_team_name,
    'message','Ficha traspasada correctamente.'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Eliminar solo del tarjetero que el entrenador tiene abierto.
--    No borra el jugador ni otras copias de la misma ficha.
-- ---------------------------------------------------------------------------
create or replace function public.technical_delete_team_card_v27249(
  p_token text,
  p_card_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_team_id uuid;
  v_player_name text;
  v_deleted_id uuid;
begin
  if nullif(btrim(coalesce(p_token,'')),'') is null then
    raise exception 'La sesión técnica no es válida o ha caducado.';
  end if;
  if p_card_id is null then
    raise exception 'No se ha indicado la ficha.';
  end if;

  delete from public.technical_sessions where expires_at <= now();

  select u.id,u.team_id
    into v_user_id,v_team_id
  from public.technical_sessions s
  join public.technical_users u on u.id=s.technical_user_id
  where s.token_hash=md5(coalesce(p_token,''))
    and s.expires_at>now()
    and u.active=true
  order by s.expires_at desc
  limit 1;

  if v_user_id is null or v_team_id is null then
    raise exception 'La sesión técnica no tiene un equipo activo válido.';
  end if;

  select player_name into v_player_name
  from public.team_player_cards
  where id=p_card_id and team_id=v_team_id
  limit 1;

  if not found then
    raise exception 'La ficha no pertenece al equipo que tienes abierto.';
  end if;

  delete from public.team_player_cards
  where id=p_card_id and team_id=v_team_id
  returning id into v_deleted_id;

  if v_deleted_id is null then
    raise exception 'No se pudo eliminar la ficha.';
  end if;

  update public.technical_sessions
  set last_used_at=now()
  where token_hash=md5(coalesce(p_token,'')) and expires_at>now();

  return jsonb_build_object(
    'ok',true,
    'card_id',v_deleted_id,
    'team_id',v_team_id,
    'player_name',v_player_name,
    'message','Ficha eliminada únicamente de este tarjetero.'
  );
end;
$$;

revoke all on function public.technical_card_transfer_targets_v27249(text) from public;
revoke all on function public.technical_transfer_team_card_v27249(text,uuid,uuid) from public;
revoke all on function public.technical_delete_team_card_v27249(text,uuid) from public;

grant execute on function public.technical_card_transfer_targets_v27249(text) to anon,authenticated;
grant execute on function public.technical_transfer_team_card_v27249(text,uuid,uuid) to anon,authenticated;
grant execute on function public.technical_delete_team_card_v27249(text,uuid) to anon,authenticated;

notify pgrst, 'reload schema';
commit;
