-- ============================================================================
-- MANAGER MULTICLUB · V1.0.37
-- TARJETERO DIGITAL · FICHAS DEL CUERPO TÉCNICO
--
-- Idempotente. No elimina jugadores, técnicos, equipos ni fichas.
-- Ejecutar en Supabase > SQL Editor > New query > Run.
-- ============================================================================

begin;

alter table public.team_player_cards
  add column if not exists staff_id uuid;

alter table public.team_player_cards
  alter column player_id drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid='public.team_player_cards'::regclass
      and conname='team_player_cards_staff_id_fkey'
  ) then
    alter table public.team_player_cards
      add constraint team_player_cards_staff_id_fkey
      foreign key (staff_id)
      references public.staff(id)
      on delete cascade;
  end if;
end $$;

create unique index if not exists team_player_cards_team_staff_uniq_v1037
  on public.team_player_cards(team_id,staff_id)
  where staff_id is not null;

create index if not exists team_player_cards_staff_idx_v1037
  on public.team_player_cards(staff_id)
  where staff_id is not null;

alter table public.team_player_cards
  drop constraint if exists team_player_cards_person_check_v1037;

alter table public.team_player_cards
  add constraint team_player_cards_person_check_v1037
  check (
    (player_id is not null and staff_id is null)
    or
    (player_id is null and staff_id is not null)
  ) not valid;

do $$
begin
  if not exists (
    select 1
    from public.team_player_cards
    where (player_id is null and staff_id is null)
       or (player_id is not null and staff_id is not null)
  ) then
    alter table public.team_player_cards
      validate constraint team_player_cards_person_check_v1037;
  end if;
end $$;

do $$
begin
  if to_regclass('public.season_team_player_cards') is not null then
    alter table public.season_team_player_cards
      add column if not exists staff_id uuid;

    alter table public.season_team_player_cards
      alter column player_id drop not null;

    create index if not exists season_team_player_cards_staff_idx_v1037
      on public.season_team_player_cards(staff_id)
      where staff_id is not null;
  end if;
end $$;

create or replace function public.multiclub_archive_card_staff_v1037()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.staff_id is null and new.original_card_id is not null then
    select c.staff_id
      into new.staff_id
    from public.team_player_cards c
    where c.id=new.original_card_id
    limit 1;
  end if;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.season_team_player_cards') is not null then
    drop trigger if exists season_team_player_cards_staff_v1037
      on public.season_team_player_cards;
    create trigger season_team_player_cards_staff_v1037
      before insert on public.season_team_player_cards
      for each row
      execute function public.multiclub_archive_card_staff_v1037();
  end if;
end $$;

notify pgrst,'reload schema';
commit;

select
  exists(
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='team_player_cards'
      and column_name='staff_id'
  ) as fichas_activas_con_tecnicos,
  case
    when to_regclass('public.season_team_player_cards') is null then true
    else exists(
      select 1 from information_schema.columns
      where table_schema='public'
        and table_name='season_team_player_cards'
        and column_name='staff_id'
    )
  end as historico_con_tecnicos;
