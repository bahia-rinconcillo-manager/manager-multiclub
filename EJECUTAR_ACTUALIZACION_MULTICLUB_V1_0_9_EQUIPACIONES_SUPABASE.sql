-- ============================================================================
-- MANAGER MULTICLUB · V1.0.9
-- EQUIPACIONES E INVENTARIO SINCRONIZADOS POR CLUB EN SUPABASE
--
-- Puede ejecutarse varias veces.
-- No elimina prendas, jugadores, tallajes ni movimientos existentes.
-- ============================================================================

begin;

create table if not exists public.club_equipment_state (
  club_id uuid primary key references public.clubes(id) on delete cascade,
  catalog_items jsonb not null default '[]'::jsonb,
  catalog_config jsonb not null default '{}'::jsonb,
  inventory jsonb not null default '{}'::jsonb,
  custom_player_sizes jsonb not null default '{}'::jsonb,
  custom_staff_sizes jsonb not null default '{}'::jsonb,
  staff_kit_status jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.club_equipment_state
  add column if not exists catalog_items jsonb not null default '[]'::jsonb,
  add column if not exists catalog_config jsonb not null default '{}'::jsonb,
  add column if not exists inventory jsonb not null default '{}'::jsonb,
  add column if not exists custom_player_sizes jsonb not null default '{}'::jsonb,
  add column if not exists custom_staff_sizes jsonb not null default '{}'::jsonb,
  add column if not exists staff_kit_status jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- Crear el registro independiente de cada club sin tocar lo que exista.
insert into public.club_equipment_state (club_id)
select c.id
from public.clubes c
where c.slug in ('cr-bahia-algeciras','cd-rinconcillo')
on conflict (club_id) do nothing;

-- updated_at automático.
drop trigger if exists club_equipment_state_set_updated_at
on public.club_equipment_state;

create trigger club_equipment_state_set_updated_at
before update on public.club_equipment_state
for each row
execute function public.set_updated_at();

-- Seguridad real por club.
alter table public.club_equipment_state enable row level security;

revoke all on public.club_equipment_state from anon, authenticated;
grant select, insert, update, delete on public.club_equipment_state to authenticated;

drop policy if exists "club_equipment_state_select" on public.club_equipment_state;
create policy "club_equipment_state_select"
on public.club_equipment_state
for select
to authenticated
using (private.usuario_pertenece_club(club_id));

drop policy if exists "club_equipment_state_insert" on public.club_equipment_state;
create policy "club_equipment_state_insert"
on public.club_equipment_state
for insert
to authenticated
with check (private.usuario_puede_editar_club(club_id));

drop policy if exists "club_equipment_state_update" on public.club_equipment_state;
create policy "club_equipment_state_update"
on public.club_equipment_state
for update
to authenticated
using (private.usuario_puede_editar_club(club_id))
with check (private.usuario_puede_editar_club(club_id));

drop policy if exists "club_equipment_state_delete" on public.club_equipment_state;
create policy "club_equipment_state_delete"
on public.club_equipment_state
for delete
to authenticated
using (private.usuario_es_admin_club(club_id));

notify pgrst, 'reload schema';

commit;

-- COMPROBACIÓN: deben salir dos filas, una por club.
select
  c.nombre as club,
  ces.club_id,
  jsonb_array_length(ces.catalog_items) as prendas_personalizadas,
  jsonb_object_length(ces.inventory) as registros_inventario,
  ces.updated_at
from public.club_equipment_state ces
join public.clubes c on c.id=ces.club_id
where c.slug in ('cr-bahia-algeciras','cd-rinconcillo')
order by c.nombre;
