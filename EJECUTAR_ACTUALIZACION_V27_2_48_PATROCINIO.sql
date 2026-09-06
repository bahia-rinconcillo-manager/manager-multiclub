-- CD SAN BERNABÉ MANAGER · V27.2.48
-- Módulo PATROCINIO + sincronización automática con Contabilidad.
-- Ejecutar UNA SOLA VEZ en Supabase > SQL Editor antes de usar el nuevo apartado.

begin;

create table if not exists public.sponsorships (
  id uuid primary key default gen_random_uuid(),
  sponsor_name text not null,
  logo_path text,
  sponsorship_type text not null,
  duration text not null,
  amount numeric(12,2) not null default 0,
  status text not null default 'Pendiente',
  paid_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sponsorships
  add column if not exists sponsor_name text,
  add column if not exists logo_path text,
  add column if not exists sponsorship_type text,
  add column if not exists duration text,
  add column if not exists amount numeric(12,2) default 0,
  add column if not exists status text default 'Pendiente',
  add column if not exists paid_at date,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

-- Validaciones de las opciones del editor.
do $$
begin
  if not exists (select 1 from pg_constraint where conname='sponsorships_type_check') then
    alter table public.sponsorships add constraint sponsorships_type_check check (
      sponsorship_type in (
        'Patrocinador principal',
        'Mangas primera equipación',
        'Camiseta entrenamiento parte frontal',
        'Camiseta entrenamiento parte trasera',
        'Sudadera',
        'Chándal',
        'Lona',
        'Otros'
      )
    );
  end if;
  if not exists (select 1 from pg_constraint where conname='sponsorships_duration_check') then
    alter table public.sponsorships add constraint sponsorships_duration_check check (
      duration in ('6 meses','1 temporada','2 temporadas')
    );
  end if;
  if not exists (select 1 from pg_constraint where conname='sponsorships_status_check') then
    alter table public.sponsorships add constraint sponsorships_status_check check (
      status in ('Pagado','Pendiente')
    );
  end if;
  if not exists (select 1 from pg_constraint where conname='sponsorships_amount_check') then
    alter table public.sponsorships add constraint sponsorships_amount_check check (amount >= 0);
  end if;
end $$;

create index if not exists sponsorships_status_idx on public.sponsorships(status);
create index if not exists sponsorships_type_idx on public.sponsorships(sponsorship_type);

-- Relación entre el patrocinio y su ingreso automático.
alter table public.finance_movements
  add column if not exists source_sponsorship_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='finance_movements_source_sponsorship_fk') then
    alter table public.finance_movements
      add constraint finance_movements_source_sponsorship_fk
      foreign key (source_sponsorship_id) references public.sponsorships(id) on delete cascade;
  end if;
end $$;

create unique index if not exists finance_movements_source_sponsorship_uidx
  on public.finance_movements(source_sponsorship_id)
  where source_sponsorship_id is not null;

-- Fecha de pago y fecha de modificación automáticas.
create or replace function public.cdsb_sponsorship_before_save_v27248()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if new.status='Pagado' then
    if tg_op='INSERT' or old.status is distinct from 'Pagado' or new.paid_at is null then
      new.paid_at := current_date;
    end if;
  else
    new.paid_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cdsb_sponsorship_before_save_v27248 on public.sponsorships;
create trigger trg_cdsb_sponsorship_before_save_v27248
before insert or update on public.sponsorships
for each row execute function public.cdsb_sponsorship_before_save_v27248();

-- Sincroniza el ingreso automáticamente.
create or replace function public.cdsb_sync_sponsorship_finance_v27248()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if tg_op='DELETE' then
    delete from public.finance_movements where source_sponsorship_id=old.id;
    return old;
  end if;

  if new.status='Pagado' then
    insert into public.finance_movements (
      movement_date,
      movement_type,
      category,
      concept,
      amount,
      payment_method,
      party_name,
      notes,
      source_sponsorship_id
    ) values (
      coalesce(new.paid_at,current_date),
      'Ingreso',
      'Patrocinio',
      'Patrocinio - ' || new.sponsor_name || ' - ' || new.sponsorship_type,
      new.amount,
      'Otro',
      new.sponsor_name,
      'Ingreso automático generado desde el apartado PATROCINIO.',
      new.id
    )
    on conflict (source_sponsorship_id) where source_sponsorship_id is not null
    do update set
      movement_date=excluded.movement_date,
      movement_type='Ingreso',
      category='Patrocinio',
      concept=excluded.concept,
      amount=excluded.amount,
      payment_method='Otro',
      party_name=excluded.party_name,
      notes=excluded.notes;
  else
    delete from public.finance_movements where source_sponsorship_id=new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cdsb_sync_sponsorship_finance_v27248 on public.sponsorships;
create trigger trg_cdsb_sync_sponsorship_finance_v27248
after insert or update or delete on public.sponsorships
for each row execute function public.cdsb_sync_sponsorship_finance_v27248();

-- Acceso del administrador autenticado.
alter table public.sponsorships enable row level security;
grant select, insert, update, delete on public.sponsorships to authenticated;

drop policy if exists sponsorships_admin_all_v27248 on public.sponsorships;
create policy sponsorships_admin_all_v27248
on public.sponsorships
for all
to authenticated
using (public.cdsb_is_admin())
with check (public.cdsb_is_admin());

commit;
