-- ============================================================================
-- MANAGER MULTICLUB · V1.0.33
-- DEPORTES MULTICLUB: aislamiento por club + goles + minutos reales
-- Idempotente. No elimina jugadores, equipos, partidos ni entrenamientos.
-- ============================================================================

begin;

create extension if not exists pgcrypto;

-- 1. Garantizar aislamiento por club en las tablas deportivas.
alter table public.sports_training_sessions add column if not exists club_id uuid;
alter table public.sports_training_attendance add column if not exists club_id uuid;
alter table public.sports_matches add column if not exists club_id uuid;
alter table public.sports_match_player_stats add column if not exists club_id uuid;
alter table public.sports_match_player_stats add column if not exists goals integer not null default 0;
alter table public.sports_matches add column if not exists match_minutes integer;

update public.sports_training_sessions s
set club_id=t.club_id
from public.teams t
where s.club_id is null and t.id=s.team_id and t.club_id is not null;

update public.sports_matches m
set club_id=t.club_id
from public.teams t
where m.club_id is null and t.id=m.team_id and t.club_id is not null;

update public.sports_training_attendance a
set club_id=s.club_id
from public.sports_training_sessions s
where a.club_id is null and s.id=a.session_id and s.club_id is not null;

update public.sports_match_player_stats ps
set club_id=m.club_id
from public.sports_matches m
where ps.club_id is null and m.id=ps.match_id and m.club_id is not null;

-- Para partidos antiguos, la duración del encuentro usa el mayor minuto
-- individual registrado; evita sumar los minutos de toda la plantilla.
update public.sports_matches m
set match_minutes=q.minutes
from (
  select match_id,max(coalesce(minutes,0))::integer as minutes
  from public.sports_match_player_stats
  group by match_id
) q
where m.id=q.match_id
  and m.match_minutes is null
  and q.minutes>0;

create index if not exists sports_training_sessions_club_team_idx
  on public.sports_training_sessions(club_id,team_id,session_date);
create index if not exists sports_training_attendance_club_session_idx
  on public.sports_training_attendance(club_id,session_id,player_id);
create index if not exists sports_matches_club_team_idx
  on public.sports_matches(club_id,team_id,match_date);
create index if not exists sports_match_stats_club_match_idx
  on public.sports_match_player_stats(club_id,match_id,player_id);

-- 2. Autorización común: administrador del club o acceso técnico del equipo activo.
create or replace function public.multiclub_sports_team_allowed_v1033(
  p_club_id uuid,
  p_token text,
  p_team_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path=public,private
as $$
declare
  v_user_id uuid;
  v_active_team uuid;
begin
  if p_club_id is null or p_team_id is null then return false; end if;

  if nullif(btrim(coalesce(p_token,'')),'') is null then
    return private.usuario_puede_editar_club(p_club_id)
       and exists(
         select 1 from public.teams t
         where t.id=p_team_id and t.club_id=p_club_id and t.deleted_at is null
       );
  end if;

  select u.id,u.team_id
    into v_user_id,v_active_team
  from public.technical_sessions s
  join public.technical_users u on u.id=s.technical_user_id
  where s.token_hash=md5(coalesce(p_token,''))
    and s.expires_at>now()
    and u.active=true
    and u.club_id=p_club_id
  order by s.expires_at desc
  limit 1;

  if v_user_id is null or v_active_team is distinct from p_team_id then return false; end if;

  return exists(
    select 1 from public.teams t
    where t.id=p_team_id and t.club_id=p_club_id and t.deleted_at is null
  );
end;
$$;

-- 3. Snapshot deportivo seguro para el club activo.
create or replace function public.sports_snapshot_multiclub_v1033(
  p_club_id uuid,
  p_token text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,private
as $$
declare
  v_team_id uuid;
  v_trainings jsonb;
  v_attendance jsonb;
  v_matches jsonb;
  v_stats jsonb;
begin
  if p_club_id is null then raise exception 'Falta el club.'; end if;

  if nullif(btrim(coalesce(p_token,'')),'') is null then
    if not private.usuario_pertenece_club(p_club_id) then
      raise exception 'No autorizado para consultar este club.';
    end if;
  else
    select u.team_id into v_team_id
    from public.technical_sessions s
    join public.technical_users u on u.id=s.technical_user_id
    where s.token_hash=md5(coalesce(p_token,''))
      and s.expires_at>now()
      and u.active=true
      and u.club_id=p_club_id
    order by s.expires_at desc
    limit 1;
    if v_team_id is null then raise exception 'La sesión técnica no es válida o ha caducado.'; end if;
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.session_date desc,x.session_time desc),'[]'::jsonb)
  into v_trainings
  from public.sports_training_sessions x
  where x.club_id=p_club_id and (v_team_id is null or x.team_id=v_team_id);

  select coalesce(jsonb_agg(to_jsonb(a) order by a.session_id,a.player_id),'[]'::jsonb)
  into v_attendance
  from public.sports_training_attendance a
  join public.sports_training_sessions s on s.id=a.session_id
  where a.club_id=p_club_id and s.club_id=p_club_id
    and (v_team_id is null or s.team_id=v_team_id);

  select coalesce(jsonb_agg(to_jsonb(x) order by x.match_date desc,x.match_time desc),'[]'::jsonb)
  into v_matches
  from public.sports_matches x
  where x.club_id=p_club_id and (v_team_id is null or x.team_id=v_team_id);

  select coalesce(jsonb_agg(to_jsonb(ps) order by ps.match_id,ps.player_id),'[]'::jsonb)
  into v_stats
  from public.sports_match_player_stats ps
  join public.sports_matches m on m.id=ps.match_id
  where ps.club_id=p_club_id and m.club_id=p_club_id
    and (v_team_id is null or m.team_id=v_team_id);

  return jsonb_build_object(
    'ok',true,
    'club_id',p_club_id,
    'trainings',coalesce(v_trainings,'[]'::jsonb),
    'training_attendance',coalesce(v_attendance,'[]'::jsonb),
    'matches',coalesce(v_matches,'[]'::jsonb),
    'match_stats',coalesce(v_stats,'[]'::jsonb)
  );
end;
$$;

create or replace function public.sports_save_training_multiclub_v1033(
  p_club_id uuid,
  p_token text default null,
  p_payload jsonb default '{}'::jsonb,
  p_attendance jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,private
as $$
declare
  v_id uuid;
  v_team_id uuid;
  v_item jsonb;
  v_player_id uuid;
begin
  v_team_id:=nullif(p_payload->>'team_id','')::uuid;
  if not public.multiclub_sports_team_allowed_v1033(p_club_id,p_token,v_team_id) then
    raise exception 'No autorizado para modificar este equipo.';
  end if;
  begin v_id:=nullif(p_payload->>'id','')::uuid; exception when others then v_id:=null; end;

  if v_id is not null and exists(
    select 1 from public.sports_training_sessions where id=v_id and club_id=p_club_id and team_id=v_team_id
  ) then
    update public.sports_training_sessions
    set session_date=nullif(p_payload->>'session_date','')::date,
        session_time=nullif(p_payload->>'session_time','')::time,
        title=coalesce(nullif(btrim(p_payload->>'title'),''),'Entrenamiento'),
        session_type=coalesce(nullif(btrim(p_payload->>'session_type'),''),'Entrenamiento'),
        notes=nullif(p_payload->>'notes','')
    where id=v_id and club_id=p_club_id;
  else
    insert into public.sports_training_sessions(
      club_id,team_id,session_date,session_time,title,session_type,notes
    ) values(
      p_club_id,v_team_id,nullif(p_payload->>'session_date','')::date,
      nullif(p_payload->>'session_time','')::time,
      coalesce(nullif(btrim(p_payload->>'title'),''),'Entrenamiento'),
      coalesce(nullif(btrim(p_payload->>'session_type'),''),'Entrenamiento'),
      nullif(p_payload->>'notes','')
    ) returning id into v_id;
  end if;

  delete from public.sports_training_attendance
  where club_id=p_club_id and session_id=v_id;

  if jsonb_typeof(coalesce(p_attendance,'[]'::jsonb))='array' then
    for v_item in select value from jsonb_array_elements(coalesce(p_attendance,'[]'::jsonb))
    loop
      begin v_player_id:=nullif(v_item->>'player_id','')::uuid; exception when others then v_player_id:=null; end;
      if v_player_id is not null and exists(
        select 1 from public.players p where p.id=v_player_id and p.club_id=p_club_id and p.deleted_at is null
      ) then
        insert into public.sports_training_attendance(club_id,session_id,player_id,status,notes)
        values(
          p_club_id,v_id,v_player_id,
          coalesce(nullif(v_item->>'status',''),'Ausente'),
          nullif(v_item->>'notes','')
        );
      end if;
    end loop;
  end if;

  return jsonb_build_object('ok',true,'id',v_id,'session_id',v_id);
end;
$$;

create or replace function public.sports_delete_training_multiclub_v1033(
  p_club_id uuid,
  p_token text default null,
  p_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,private
as $$
declare v_team_id uuid;
begin
  select team_id into v_team_id from public.sports_training_sessions
  where id=p_id and club_id=p_club_id;
  if v_team_id is null then raise exception 'No se encontró el entrenamiento.'; end if;
  if not public.multiclub_sports_team_allowed_v1033(p_club_id,p_token,v_team_id) then
    raise exception 'No autorizado.';
  end if;
  delete from public.sports_training_attendance where club_id=p_club_id and session_id=p_id;
  delete from public.sports_training_sessions where club_id=p_club_id and id=p_id;
  return jsonb_build_object('ok',true);
end;
$$;

create or replace function public.sports_save_match_multiclub_v1033(
  p_club_id uuid,
  p_token text default null,
  p_payload jsonb default '{}'::jsonb,
  p_player_stats jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,private
as $$
declare
  v_id uuid;
  v_team_id uuid;
  v_item jsonb;
  v_player_id uuid;
  v_minutes integer;
  v_max_minutes integer:=0;
begin
  v_team_id:=nullif(p_payload->>'team_id','')::uuid;
  if not public.multiclub_sports_team_allowed_v1033(p_club_id,p_token,v_team_id) then
    raise exception 'No autorizado para modificar este equipo.';
  end if;
  begin v_id:=nullif(p_payload->>'id','')::uuid; exception when others then v_id:=null; end;

  if v_id is not null and exists(
    select 1 from public.sports_matches where id=v_id and club_id=p_club_id and team_id=v_team_id
  ) then
    update public.sports_matches
    set match_date=nullif(p_payload->>'match_date','')::date,
        match_time=nullif(p_payload->>'match_time','')::time,
        opponent=coalesce(nullif(btrim(p_payload->>'opponent'),''),'Rival pendiente'),
        competition=nullif(p_payload->>'competition',''),
        venue=nullif(p_payload->>'venue',''),
        home_away=coalesce(nullif(p_payload->>'home_away',''),'Local'),
        goals_for=case when coalesce(p_payload->>'goals_for','')='' then null else (p_payload->>'goals_for')::integer end,
        goals_against=case when coalesce(p_payload->>'goals_against','')='' then null else (p_payload->>'goals_against')::integer end,
        notes=nullif(p_payload->>'notes','')
    where id=v_id and club_id=p_club_id;
  else
    insert into public.sports_matches(
      club_id,team_id,match_date,match_time,opponent,competition,venue,home_away,goals_for,goals_against,notes
    ) values(
      p_club_id,v_team_id,nullif(p_payload->>'match_date','')::date,
      nullif(p_payload->>'match_time','')::time,
      coalesce(nullif(btrim(p_payload->>'opponent'),''),'Rival pendiente'),
      nullif(p_payload->>'competition',''),nullif(p_payload->>'venue',''),
      coalesce(nullif(p_payload->>'home_away',''),'Local'),
      case when coalesce(p_payload->>'goals_for','')='' then null else (p_payload->>'goals_for')::integer end,
      case when coalesce(p_payload->>'goals_against','')='' then null else (p_payload->>'goals_against')::integer end,
      nullif(p_payload->>'notes','')
    ) returning id into v_id;
  end if;

  delete from public.sports_match_player_stats where club_id=p_club_id and match_id=v_id;

  if jsonb_typeof(coalesce(p_player_stats,'[]'::jsonb))='array' then
    for v_item in select value from jsonb_array_elements(coalesce(p_player_stats,'[]'::jsonb))
    loop
      begin v_player_id:=nullif(v_item->>'player_id','')::uuid; exception when others then v_player_id:=null; end;
      begin v_minutes:=greatest(0,least(300,coalesce((v_item->>'minutes')::integer,0))); exception when others then v_minutes:=0; end;
      v_max_minutes:=greatest(v_max_minutes,v_minutes);
      if v_player_id is not null and exists(
        select 1 from public.players p where p.id=v_player_id and p.club_id=p_club_id and p.deleted_at is null
      ) then
        insert into public.sports_match_player_stats(
          club_id,match_id,player_id,participation_status,minutes,goals,yellow_cards,red_cards,notes
        ) values(
          p_club_id,v_id,v_player_id,
          coalesce(nullif(v_item->>'participation_status',''),'No convocado'),
          v_minutes,
          greatest(0,least(99,coalesce(nullif(v_item->>'goals','')::integer,0))),
          greatest(0,least(2,coalesce(nullif(v_item->>'yellow_cards','')::integer,0))),
          greatest(0,least(1,coalesce(nullif(v_item->>'red_cards','')::integer,0))),
          nullif(v_item->>'notes','')
        );
      end if;
    end loop;
  end if;

  update public.sports_matches
  set match_minutes=case when v_max_minutes>0 then v_max_minutes else match_minutes end
  where id=v_id and club_id=p_club_id;

  return jsonb_build_object('ok',true,'id',v_id,'match_id',v_id);
end;
$$;

create or replace function public.sports_delete_match_multiclub_v1033(
  p_club_id uuid,
  p_token text default null,
  p_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,private
as $$
declare v_team_id uuid;
begin
  select team_id into v_team_id from public.sports_matches
  where id=p_id and club_id=p_club_id;
  if v_team_id is null then raise exception 'No se encontró el partido.'; end if;
  if not public.multiclub_sports_team_allowed_v1033(p_club_id,p_token,v_team_id) then
    raise exception 'No autorizado.';
  end if;
  delete from public.sports_match_player_stats where club_id=p_club_id and match_id=p_id;
  delete from public.sports_matches where club_id=p_club_id and id=p_id;
  return jsonb_build_object('ok',true);
end;
$$;

revoke all on function public.multiclub_sports_team_allowed_v1033(uuid,text,uuid) from public;
revoke all on function public.sports_snapshot_multiclub_v1033(uuid,text) from public;
revoke all on function public.sports_save_training_multiclub_v1033(uuid,text,jsonb,jsonb) from public;
revoke all on function public.sports_delete_training_multiclub_v1033(uuid,text,uuid) from public;
revoke all on function public.sports_save_match_multiclub_v1033(uuid,text,jsonb,jsonb) from public;
revoke all on function public.sports_delete_match_multiclub_v1033(uuid,text,uuid) from public;

grant execute on function public.sports_snapshot_multiclub_v1033(uuid,text) to anon,authenticated;
grant execute on function public.sports_save_training_multiclub_v1033(uuid,text,jsonb,jsonb) to anon,authenticated;
grant execute on function public.sports_delete_training_multiclub_v1033(uuid,text,uuid) to anon,authenticated;
grant execute on function public.sports_save_match_multiclub_v1033(uuid,text,jsonb,jsonb) to anon,authenticated;
grant execute on function public.sports_delete_match_multiclub_v1033(uuid,text,uuid) to anon,authenticated;

notify pgrst,'reload schema';
commit;

select
  'V1.0.33 preparada: Deportes Multiclub aislado por club, goles y minutos reales' as resultado,
  (select count(*) from public.sports_training_sessions where club_id is null) as entrenamientos_sin_club,
  (select count(*) from public.sports_matches where club_id is null) as partidos_sin_club,
  (select count(*) from public.sports_match_player_stats where club_id is null) as estadisticas_sin_club;
