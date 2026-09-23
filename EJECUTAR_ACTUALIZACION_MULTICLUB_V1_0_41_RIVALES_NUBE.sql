-- ============================================================================
-- MANAGER MULTICLUB · V1.0.41
-- RIVALES Y ESCUDOS EN NUBE, AISLADOS POR CLUB
-- Idempotente. No elimina partidos, equipos, jugadores ni escudos locales.
-- ============================================================================

begin;

create extension if not exists pgcrypto;

create table if not exists public.multiclub_rival_teams (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  name text not null,
  crest text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists multiclub_rival_teams_club_name_uniq_v1041
  on public.multiclub_rival_teams(club_id,lower(btrim(name)));

create index if not exists multiclub_rival_teams_club_idx_v1041
  on public.multiclub_rival_teams(club_id,updated_at desc);

alter table public.multiclub_rival_teams enable row level security;

revoke all on table public.multiclub_rival_teams from public,anon,authenticated;

create or replace function public.rival_teams_snapshot_multiclub_v1041(
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
  v_allowed boolean:=false;
  v_teams jsonb;
begin
  if p_club_id is null then raise exception 'Falta el club.'; end if;

  if nullif(btrim(coalesce(p_token,'')),'') is null then
    v_allowed:=private.usuario_pertenece_club(p_club_id);
  else
    select exists(
      select 1
      from public.technical_sessions s
      join public.technical_users u on u.id=s.technical_user_id
      where s.token_hash=md5(coalesce(p_token,''))
        and s.expires_at>now()
        and u.active=true
        and u.club_id=p_club_id
    ) into v_allowed;
  end if;

  if not v_allowed then raise exception 'No autorizado para consultar este club.'; end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('id',r.id,'name',r.name,'crest',r.crest)
      order by lower(r.name)
    ),
    '[]'::jsonb
  )
  into v_teams
  from public.multiclub_rival_teams r
  where r.club_id=p_club_id;

  return jsonb_build_object('ok',true,'club_id',p_club_id,'teams',v_teams);
end;
$$;

create or replace function public.rival_team_save_multiclub_v1041(
  p_club_id uuid,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,private
as $$
declare
  v_id uuid;
  v_name text;
  v_crest text;
  v_row public.multiclub_rival_teams%rowtype;
begin
  if p_club_id is null then raise exception 'Falta el club.'; end if;
  if not private.usuario_puede_editar_club(p_club_id) then
    raise exception 'No autorizado para modificar este club.';
  end if;

  v_name:=nullif(btrim(p_payload->>'name'),'');
  if v_name is null then raise exception 'Falta el nombre del rival.'; end if;
  v_crest:=nullif(p_payload->>'crest','');

  begin v_id:=nullif(p_payload->>'id','')::uuid;
  exception when others then v_id:=null;
  end;

  if v_id is not null and exists(
    select 1 from public.multiclub_rival_teams
    where id=v_id and club_id=p_club_id
  ) then
    update public.multiclub_rival_teams
    set name=v_name,crest=v_crest,updated_at=now()
    where id=v_id and club_id=p_club_id
    returning * into v_row;
  else
    select id into v_id
    from public.multiclub_rival_teams
    where club_id=p_club_id and lower(btrim(name))=lower(btrim(v_name))
    limit 1;

    if v_id is not null then
      update public.multiclub_rival_teams
      set name=v_name,
          crest=case when v_crest is null then crest else v_crest end,
          updated_at=now()
      where id=v_id and club_id=p_club_id
      returning * into v_row;
    else
      insert into public.multiclub_rival_teams(club_id,name,crest)
      values(p_club_id,v_name,v_crest)
      returning * into v_row;
    end if;
  end if;

  return jsonb_build_object(
    'ok',true,
    'team',jsonb_build_object('id',v_row.id,'name',v_row.name,'crest',v_row.crest)
  );
end;
$$;

create or replace function public.rival_team_delete_multiclub_v1041(
  p_club_id uuid,
  p_id uuid default null,
  p_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,private
as $$
declare v_deleted integer:=0;
begin
  if p_club_id is null then raise exception 'Falta el club.'; end if;
  if not private.usuario_puede_editar_club(p_club_id) then
    raise exception 'No autorizado para modificar este club.';
  end if;

  if p_id is not null then
    delete from public.multiclub_rival_teams
    where club_id=p_club_id and id=p_id;
    get diagnostics v_deleted=row_count;
  elsif nullif(btrim(coalesce(p_name,'')),'') is not null then
    delete from public.multiclub_rival_teams
    where club_id=p_club_id
      and lower(btrim(name))=lower(btrim(p_name));
    get diagnostics v_deleted=row_count;
  end if;

  return jsonb_build_object('ok',true,'deleted',v_deleted);
end;
$$;

revoke all on function public.rival_teams_snapshot_multiclub_v1041(uuid,text) from public;
revoke all on function public.rival_team_save_multiclub_v1041(uuid,jsonb) from public;
revoke all on function public.rival_team_delete_multiclub_v1041(uuid,uuid,text) from public;

grant execute on function public.rival_teams_snapshot_multiclub_v1041(uuid,text) to anon,authenticated;
grant execute on function public.rival_team_save_multiclub_v1041(uuid,jsonb) to authenticated;
grant execute on function public.rival_team_delete_multiclub_v1041(uuid,uuid,text) to authenticated;

notify pgrst,'reload schema';
commit;

select
  to_regprocedure('public.rival_teams_snapshot_multiclub_v1041(uuid,text)') is not null as snapshot_ok,
  to_regprocedure('public.rival_team_save_multiclub_v1041(uuid,jsonb)') is not null as guardar_ok,
  to_regprocedure('public.rival_team_delete_multiclub_v1041(uuid,uuid,text)') is not null as eliminar_ok;
