-- ============================================================================
-- MANAGER MULTICLUB · V1.0.7
-- CONCEPTOS DE COBRO CONFIGURABLES POR CLUB
-- Ejecutar UNA SOLA VEZ en Supabase > SQL Editor > New query > Run
-- ============================================================================

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Catálogo de conceptos de cobro por club
-- ---------------------------------------------------------------------------
create table if not exists public.payment_concepts (
    id uuid primary key default gen_random_uuid(),
    club_id uuid not null references public.clubes(id) on delete cascade,
    concept_key text not null,
    name text not null,
    default_amount numeric(12,2) not null default 0 check (default_amount >= 0),
    required boolean not null default true,
    active boolean not null default true,
    sort_order integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (club_id, concept_key),
    unique (id, club_id)
);

create index if not exists payment_concepts_club_order_idx
on public.payment_concepts(club_id, active, sort_order, name);

-- ---------------------------------------------------------------------------
-- 2. El campo payments.concept deja de estar limitado a tres valores fijos
-- ---------------------------------------------------------------------------
do $$
declare
    r record;
begin
    for r in
        select conname
        from pg_constraint
        where conrelid = 'public.payments'::regclass
          and contype = 'c'
          and pg_get_constraintdef(oid) ilike '%concept%'
    loop
        execute format('alter table public.payments drop constraint if exists %I', r.conname);
    end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Conceptos iniciales del clon. Después se editan desde cada Manager.
-- ---------------------------------------------------------------------------
insert into public.payment_concepts
    (club_id, concept_key, name, default_amount, required, active, sort_order)
select
    c.id,
    x.concept_key,
    x.name,
    x.default_amount,
    true,
    true,
    x.sort_order
from public.clubes c
cross join (
    values
      ('registration'::text, 'Inscripción'::text, 50.00::numeric, 10),
      ('sizing'::text,       'Tallaje'::text, 50.00::numeric, 20),
      ('clothing'::text,     'Recogida de ropa'::text, 100.00::numeric, 30)
) as x(concept_key, name, default_amount, sort_order)
where c.slug in ('cr-bahia-algeciras','cd-rinconcillo')
on conflict (club_id, concept_key)
do nothing;

-- ---------------------------------------------------------------------------
-- 4. Relación segura entre payments y el catálogo del MISMO club
-- ---------------------------------------------------------------------------
alter table public.payments
    drop constraint if exists payments_concept_club_fk;

alter table public.payments
    add constraint payments_concept_club_fk
    foreign key (club_id, concept)
    references public.payment_concepts(club_id, concept_key)
    on update cascade
    on delete restrict;

-- ---------------------------------------------------------------------------
-- 5. updated_at automático
-- ---------------------------------------------------------------------------
drop trigger if exists payment_concepts_set_updated_at
on public.payment_concepts;

create trigger payment_concepts_set_updated_at
before update on public.payment_concepts
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. Si se crea/activa un concepto obligatorio, se añade como pendiente a
--    todos los jugadores actuales del mismo club sin tocar cobros existentes.
-- ---------------------------------------------------------------------------
create or replace function private.sync_required_payment_concept_players()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.active = true and new.required = true then
        insert into public.payments (
            club_id,
            player_id,
            concept,
            status,
            amount
        )
        select
            new.club_id,
            p.id,
            new.concept_key,
            'Pendiente',
            0
        from public.players p
        where p.club_id = new.club_id
          and p.deleted_at is null
        on conflict (club_id, player_id, concept)
        do nothing;
    end if;

    return new;
end;
$$;

drop trigger if exists payment_concepts_sync_players
on public.payment_concepts;

create trigger payment_concepts_sync_players
after insert or update of active, required
on public.payment_concepts
for each row
execute function private.sync_required_payment_concept_players();

-- Completar ahora los conceptos obligatorios para jugadores ya existentes.
insert into public.payments (
    club_id,
    player_id,
    concept,
    status,
    amount
)
select
    pc.club_id,
    p.id,
    pc.concept_key,
    'Pendiente',
    0
from public.payment_concepts pc
join public.players p
  on p.club_id = pc.club_id
 and p.deleted_at is null
where pc.active = true
  and pc.required = true
on conflict (club_id, player_id, concept)
do nothing;

-- ---------------------------------------------------------------------------
-- 7. Seguridad multiclub
-- ---------------------------------------------------------------------------
alter table public.payment_concepts enable row level security;

revoke all on public.payment_concepts from anon, authenticated;
grant select, insert, update, delete on public.payment_concepts to authenticated;

drop policy if exists "payment_concepts_select" on public.payment_concepts;
create policy "payment_concepts_select"
on public.payment_concepts
for select
to authenticated
using (
    private.usuario_pertenece_club(club_id)
);

drop policy if exists "payment_concepts_insert" on public.payment_concepts;
create policy "payment_concepts_insert"
on public.payment_concepts
for insert
to authenticated
with check (
    private.usuario_es_admin_club(club_id)
);

drop policy if exists "payment_concepts_update" on public.payment_concepts;
create policy "payment_concepts_update"
on public.payment_concepts
for update
to authenticated
using (
    private.usuario_es_admin_club(club_id)
)
with check (
    private.usuario_es_admin_club(club_id)
);

drop policy if exists "payment_concepts_delete" on public.payment_concepts;
create policy "payment_concepts_delete"
on public.payment_concepts
for delete
to authenticated
using (
    private.usuario_es_admin_club(club_id)
);

notify pgrst, 'reload schema';

commit;

-- ---------------------------------------------------------------------------
-- 8. Comprobación
-- Deben salir 3 conceptos iniciales para cada club.
-- ---------------------------------------------------------------------------
select
    c.nombre as club,
    pc.name as concepto,
    pc.default_amount as importe,
    pc.required as obligatorio,
    pc.active as activo
from public.payment_concepts pc
join public.clubes c on c.id = pc.club_id
where c.slug in ('cr-bahia-algeciras','cd-rinconcillo')
order by c.nombre, pc.sort_order, pc.name;
