-- CD SAN BERNABÉ MANAGER · V27.2.47
-- Corrección de escudos en Manager + calendario/ticker web.
-- Seguro para ejecutar aunque V27.2.45 ya estuviera instalado.

begin;

alter table public.club_calendar_matches add column if not exists opponent_crest text;

create or replace function public.calendar_matches_snapshot_v27245(p_token text default null,p_season_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_user_id uuid;v_season_id uuid;v_matches jsonb;
begin
  v_season_id:=p_season_id;
  if v_season_id is null then select id into v_season_id from public.club_seasons where status='active' limit 1; end if;
  if v_season_id is null then return jsonb_build_object('ok',true,'matches','[]'::jsonb); end if;
  if nullif(btrim(coalesce(p_token,'')),'') is not null then
    select u.id into v_user_id from public.technical_sessions s join public.technical_users u on u.id=s.technical_user_id
    where s.token_hash=md5(coalesce(p_token,'')) and s.expires_at>now() and u.active=true order by s.expires_at desc limit 1;
    if v_user_id is null then raise exception 'La sesión técnica no es válida o ha caducado.'; end if;
  elsif not public.cdsb_is_admin() then raise exception 'No autorizado para consultar el calendario del club.'; end if;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.match_date,q.match_time,q.team_name,q.opponent),'[]'::jsonb) into v_matches from (
    select m.id,m.season_id,m.team_id,t.name::text as team_name,m.competition,m.round,m.match_date,m.match_time,
           m.venue,m.opponent,m.opponent_crest,m.location,m.goals_for,m.goals_against,m.finished,m.notes,m.created_at,m.updated_at
    from public.club_calendar_matches m join public.teams t on t.id=m.team_id
    where m.season_id=v_season_id and (v_user_id is null or m.team_id in (
      select e.team_id from public.cdsb_effective_technical_teams_v27230(v_user_id) e
    ))
  ) q;
  return jsonb_build_object('ok',true,'matches',coalesce(v_matches,'[]'::jsonb));
end;$$;

create or replace function public.calendar_match_save_v27245(p_token text default null,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_id uuid;v_team_id uuid;v_season_id uuid;v_row jsonb;
begin
  if nullif(btrim(coalesce(p_token,'')),'') is not null then raise exception 'El calendario solo puede modificarse desde la administración.'; end if;
  if not public.cdsb_is_admin() then raise exception 'No autorizado para modificar el calendario del club.'; end if;
  begin v_id:=nullif(p_payload->>'id','')::uuid; exception when invalid_text_representation then v_id:=null; end;
  v_team_id:=nullif(p_payload->>'team_id','')::uuid;
  if v_team_id is null then raise exception 'Falta el equipo del partido.'; end if;
  v_season_id:=nullif(p_payload->>'season_id','')::uuid;
  if v_season_id is null then select season_id into v_season_id from public.teams where id=v_team_id; end if;
  if v_season_id is null then raise exception 'No se pudo determinar la temporada.'; end if;
  if v_id is not null and exists(select 1 from public.club_calendar_matches where id=v_id) then
    update public.club_calendar_matches set season_id=v_season_id,team_id=v_team_id,competition=nullif(p_payload->>'competition',''),
      round=nullif(p_payload->>'round',''),match_date=nullif(p_payload->>'match_date','')::date,
      match_time=nullif(p_payload->>'match_time','')::time,venue=case when lower(coalesce(p_payload->>'venue','home'))='away' then 'away' else 'home' end,
      opponent=coalesce(nullif(btrim(p_payload->>'opponent'),''),'Rival pendiente'),opponent_crest=nullif(p_payload->>'opponent_crest',''),
      location=nullif(p_payload->>'location',''),goals_for=case when coalesce(p_payload->>'goals_for','')='' then null else (p_payload->>'goals_for')::integer end,
      goals_against=case when coalesce(p_payload->>'goals_against','')='' then null else (p_payload->>'goals_against')::integer end,
      finished=coalesce((p_payload->>'finished')::boolean,false),notes=nullif(p_payload->>'notes',''),updated_at=now() where id=v_id;
  else
    insert into public.club_calendar_matches(season_id,team_id,competition,round,match_date,match_time,venue,opponent,opponent_crest,location,goals_for,goals_against,finished,notes)
    values(v_season_id,v_team_id,nullif(p_payload->>'competition',''),nullif(p_payload->>'round',''),nullif(p_payload->>'match_date','')::date,
      nullif(p_payload->>'match_time','')::time,case when lower(coalesce(p_payload->>'venue','home'))='away' then 'away' else 'home' end,
      coalesce(nullif(btrim(p_payload->>'opponent'),''),'Rival pendiente'),nullif(p_payload->>'opponent_crest',''),nullif(p_payload->>'location',''),
      case when coalesce(p_payload->>'goals_for','')='' then null else (p_payload->>'goals_for')::integer end,
      case when coalesce(p_payload->>'goals_against','')='' then null else (p_payload->>'goals_against')::integer end,
      coalesce((p_payload->>'finished')::boolean,false),nullif(p_payload->>'notes','')) returning id into v_id;
  end if;
  select to_jsonb(q) into v_row from (
    select m.id,m.season_id,m.team_id,t.name::text as team_name,m.competition,m.round,m.match_date,m.match_time,
      m.venue,m.opponent,m.opponent_crest,m.location,m.goals_for,m.goals_against,m.finished,m.notes,m.created_at,m.updated_at
    from public.club_calendar_matches m join public.teams t on t.id=m.team_id where m.id=v_id
  ) q;
  return jsonb_build_object('ok',true,'match',v_row);
end;$$;

create or replace function public.calendar_public_feed_v27245()
returns jsonb language sql stable security definer set search_path=public as $$
  with active_season as (select id,name from public.club_seasons where status='active' limit 1),
  feed as (
    select m.id,t.name::text as team_name,m.competition,m.round,m.match_date,m.match_time,m.venue,m.opponent,
      m.opponent_crest,m.location,m.goals_for,m.goals_against,m.finished,m.notes
    from public.club_calendar_matches m join public.teams t on t.id=m.team_id join active_season s on s.id=m.season_id
  )
  select jsonb_build_object('ok',true,'season',coalesce((select name from active_season),''),
    'matches',coalesce((select jsonb_agg(to_jsonb(feed) order by match_date,match_time,team_name,opponent) from feed),'[]'::jsonb));
$$;

grant execute on function public.calendar_matches_snapshot_v27245(text,uuid) to anon,authenticated;
grant execute on function public.calendar_match_save_v27245(text,jsonb) to anon,authenticated;
grant execute on function public.calendar_public_feed_v27245() to anon,authenticated;

commit;

select 'V27.2.47 instalada: escudos del Manager y web sincronizados' as resultado;
