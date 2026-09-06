-- ============================================================================
-- MANAGER MULTICLUB · V1.0.18
-- PISTAS / INSTALACIONES · ALQUILERES A TERCEROS -> CONTABILIDAD
--
-- Puede ejecutarse varias veces.
-- No elimina registros existentes.
-- ============================================================================

begin;

-- 1) El módulo manual admite cuatro tipos de registro.
alter table public.pitch_usage
    add column if not exists cancelled boolean not null default false,
    add column if not exists default_amount numeric(10,2),
    add column if not exists is_fixed boolean not null default false;

-- Retirar cualquier CHECK antiguo que limite usage_type a Entrenamiento/Partido.
do $$
declare
    r record;
begin
    for r in
        select conname
        from pg_constraint
        where conrelid = 'public.pitch_usage'::regclass
          and contype = 'c'
          and pg_get_constraintdef(oid) ilike '%usage_type%'
    loop
        execute format('alter table public.pitch_usage drop constraint if exists %I', r.conname);
    end loop;
end $$;

alter table public.pitch_usage
    drop constraint if exists pitch_usage_usage_type_multiclub_check;

alter table public.pitch_usage
    add constraint pitch_usage_usage_type_multiclub_check
    check (usage_type in ('Entrenamiento','Partido','Alquiler a terceros','Otro'));

-- 2) Enlace inequívoco entre un alquiler y su ingreso automático.
alter table public.finance_movements
    add column if not exists source_pitch_usage_id uuid;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.finance_movements'::regclass
          and conname = 'finance_movements_source_pitch_usage_fk'
    ) then
        alter table public.finance_movements
            add constraint finance_movements_source_pitch_usage_fk
            foreign key (source_pitch_usage_id)
            references public.pitch_usage(id)
            on delete cascade;
    end if;
end $$;

create unique index if not exists finance_movements_source_pitch_usage_uidx
    on public.finance_movements(source_pitch_usage_id)
    where source_pitch_usage_id is not null;

-- 3) Sincronización automática.
create or replace function private.sync_pitch_rental_to_finance_multiclub()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_concept text;
    v_notes text;
begin
    if tg_op = 'DELETE' then
        delete from public.finance_movements
        where source_pitch_usage_id = old.id;
        return old;
    end if;

    -- Solo un alquiler a terceros ACTIVO y con importe positivo genera ingreso.
    if new.usage_type = 'Alquiler a terceros'
       and coalesce(new.cancelled,false) = false
       and coalesce(new.amount,0) > 0 then

        v_concept := 'Alquiler de instalación';
        if nullif(btrim(coalesce(new.field_name,'')), '') is not null then
            v_concept := v_concept || ' · ' || btrim(new.field_name);
        end if;

        v_notes := 'Ingreso automático generado desde Pistas / Instalaciones.';
        if nullif(btrim(coalesce(new.notes,'')), '') is not null then
            v_notes := v_notes || ' ' || btrim(new.notes);
        end if;

        insert into public.finance_movements (
            club_id,
            movement_date,
            movement_type,
            category,
            concept,
            amount,
            payment_method,
            party_name,
            notes,
            source_pitch_usage_id
        ) values (
            new.club_id,
            new.usage_date,
            'Ingreso',
            'Alquiler de instalaciones',
            v_concept,
            new.amount,
            'Otro',
            nullif(btrim(coalesce(new.team_name,'')), ''),
            v_notes,
            new.id
        )
        on conflict (source_pitch_usage_id)
        where source_pitch_usage_id is not null
        do update set
            club_id = excluded.club_id,
            movement_date = excluded.movement_date,
            movement_type = 'Ingreso',
            category = 'Alquiler de instalaciones',
            concept = excluded.concept,
            amount = excluded.amount,
            payment_method = excluded.payment_method,
            party_name = excluded.party_name,
            notes = excluded.notes;
    else
        -- Si se anula, pasa a 0 o deja de ser alquiler, solo se retira SU ingreso automático.
        delete from public.finance_movements
        where source_pitch_usage_id = new.id;
    end if;

    return new;
end;
$$;

revoke all on function private.sync_pitch_rental_to_finance_multiclub()
from public, anon, authenticated;

drop trigger if exists pitch_usage_sync_rental_finance_multiclub
on public.pitch_usage;

create trigger pitch_usage_sync_rental_finance_multiclub
after insert or update or delete
on public.pitch_usage
for each row
execute function private.sync_pitch_rental_to_finance_multiclub();

-- 4) Recuperar automáticamente posibles alquileres ya registrados.
insert into public.finance_movements (
    club_id,
    movement_date,
    movement_type,
    category,
    concept,
    amount,
    payment_method,
    party_name,
    notes,
    source_pitch_usage_id
)
select
    p.club_id,
    p.usage_date,
    'Ingreso',
    'Alquiler de instalaciones',
    case
        when nullif(btrim(coalesce(p.field_name,'')), '') is null
            then 'Alquiler de instalación'
        else 'Alquiler de instalación · ' || btrim(p.field_name)
    end,
    p.amount,
    'Otro',
    nullif(btrim(coalesce(p.team_name,'')), ''),
    'Ingreso automático generado desde Pistas / Instalaciones.' ||
        case
            when nullif(btrim(coalesce(p.notes,'')), '') is null then ''
            else ' ' || btrim(p.notes)
        end,
    p.id
from public.pitch_usage p
where p.usage_type = 'Alquiler a terceros'
  and coalesce(p.cancelled,false) = false
  and coalesce(p.amount,0) > 0
on conflict (source_pitch_usage_id)
where source_pitch_usage_id is not null
do update set
    club_id = excluded.club_id,
    movement_date = excluded.movement_date,
    movement_type = 'Ingreso',
    category = 'Alquiler de instalaciones',
    concept = excluded.concept,
    amount = excluded.amount,
    payment_method = excluded.payment_method,
    party_name = excluded.party_name,
    notes = excluded.notes;

-- Mantener acceso normal del Manager.
grant select, insert, update, delete on public.pitch_usage to authenticated;
grant select, insert, update, delete on public.finance_movements to authenticated;

notify pgrst, 'reload schema';

commit;

-- ============================================================================
-- COMPROBACIÓN
-- Debe devolver los cuatro tipos permitidos y trigger_instalado = true.
-- ============================================================================
select
    array['Entrenamiento','Partido','Alquiler a terceros','Otro']::text[] as tipos_permitidos,
    exists (
        select 1
        from pg_trigger
        where tgrelid = 'public.pitch_usage'::regclass
          and tgname = 'pitch_usage_sync_rental_finance_multiclub'
          and not tgisinternal
    ) as trigger_instalado,
    exists (
        select 1
        from information_schema.columns
        where table_schema='public'
          and table_name='finance_movements'
          and column_name='source_pitch_usage_id'
    ) as enlace_contabilidad;
