-- CD San Bernabé Manager · V27.2.40 DEFINITIVO
-- Pistas 2026/27: horarios fijos, tarifas, anulaciones y soporte de Escuela aunque no exista como equipo en public.teams.
-- Seguro para volver a ejecutar: no duplica registros ya creados.

begin;

alter table public.pitch_usage
  add column if not exists cancelled boolean not null default false;

alter table public.pitch_usage
  add column if not exists is_fixed boolean not null default false;

alter table public.pitch_usage
  add column if not exists default_amount numeric(10,2);

create or replace function public.cdsb_norm_text_v27240(p_text text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    translate(lower(coalesce(p_text,'')), 'áéíóúüñ', 'aeiouun'),
    '[^a-z0-9]+',
    '',
    'g'
  );
$$;

-- Configuración oficial de pistas 2026/27.
-- Si un equipo existe en public.teams se usa su nombre real.
-- Si no existe (caso actual de Escuela), Pistas lo trata como registro propio sin crear un equipo nuevo en el club.
with active_season as (
  select id
  from public.club_seasons
  where status='active'
    and public.cdsb_norm_text_v27240(name) like '%202627%'
  limit 1
),
cfg(label, weekdays, usage_time, field_name, training_amount, match_amount, training_schedule) as (
  values
    ('Cadete A',    array[2,4]::int[], time '19:30', 'La Menacha', 1.90::numeric,  3.80::numeric, 'Martes y jueves · 19:30 h'),
    ('Cadete B',    array[2,4]::int[], time '19:30', 'La Menacha', 1.90::numeric,  3.80::numeric, 'Martes y jueves · 19:30 h'),
    ('Infantil A',  array[2,4]::int[], time '18:30', 'La Menacha', 1.90::numeric,  3.80::numeric, 'Martes y jueves · 18:30 h'),
    ('Infantil B',  array[2,4]::int[], time '18:30', 'La Menacha', 1.90::numeric,  3.80::numeric, 'Martes y jueves · 18:30 h'),
    ('Alevín A',    array[1,3]::int[], time '18:00', 'Montepalma', 12.50::numeric, 37.50::numeric, 'Lunes y miércoles · 18:00 h'),
    ('Alevín B',    array[1,3]::int[], time '18:00', 'Montepalma', 12.50::numeric, 37.50::numeric, 'Lunes y miércoles · 18:00 h'),
    ('Prebenjamín', array[1,3]::int[], time '17:00', 'Montepalma', 12.50::numeric, 37.50::numeric, 'Lunes y miércoles · 17:00 h'),
    ('Escuela',     array[1,3]::int[], time '17:00', 'Montepalma', 12.50::numeric, 37.50::numeric, 'Lunes y miércoles · 17:00 h')
)
update public.teams t
set field=c.field_name,
    training_schedule=c.training_schedule
from cfg c, active_season s
where t.season_id=s.id
  and t.deleted_at is null
  and public.cdsb_norm_text_v27240(t.name) like '%' || public.cdsb_norm_text_v27240(c.label) || '%';

-- Crear todos los entrenamientos fijos entre 31/08/2026 y 15/06/2027.
-- Son 83 fechas por equipo x 8 equipos = 664 registros.
with active_season as (
  select id
  from public.club_seasons
  where status='active'
    and public.cdsb_norm_text_v27240(name) like '%202627%'
  limit 1
),
cfg(label, weekdays, usage_time, field_name, training_amount, training_schedule) as (
  values
    ('Cadete A',    array[2,4]::int[], time '19:30', 'La Menacha', 1.90::numeric,  'Martes y jueves · 19:30 h'),
    ('Cadete B',    array[2,4]::int[], time '19:30', 'La Menacha', 1.90::numeric,  'Martes y jueves · 19:30 h'),
    ('Infantil A',  array[2,4]::int[], time '18:30', 'La Menacha', 1.90::numeric,  'Martes y jueves · 18:30 h'),
    ('Infantil B',  array[2,4]::int[], time '18:30', 'La Menacha', 1.90::numeric,  'Martes y jueves · 18:30 h'),
    ('Alevín A',    array[1,3]::int[], time '18:00', 'Montepalma', 12.50::numeric, 'Lunes y miércoles · 18:00 h'),
    ('Alevín B',    array[1,3]::int[], time '18:00', 'Montepalma', 12.50::numeric, 'Lunes y miércoles · 18:00 h'),
    ('Prebenjamín', array[1,3]::int[], time '17:00', 'Montepalma', 12.50::numeric, 'Lunes y miércoles · 17:00 h'),
    ('Escuela',     array[1,3]::int[], time '17:00', 'Montepalma', 12.50::numeric, 'Lunes y miércoles · 17:00 h')
),
resolved as (
  select
    c.*,
    coalesce(
      (
        select t.name
        from public.teams t, active_season s
        where t.season_id=s.id
          and t.deleted_at is null
          and public.cdsb_norm_text_v27240(t.name) like '%' || public.cdsb_norm_text_v27240(c.label) || '%'
        order by case when public.cdsb_norm_text_v27240(t.name)=public.cdsb_norm_text_v27240(c.label) then 0 else 1 end,
                 t.name
        limit 1
      ),
      c.label
    ) as team_name
  from cfg c
),
dates as (
  select d::date as usage_date
  from generate_series(date '2026-08-31', date '2027-06-15', interval '1 day') d
)
insert into public.pitch_usage
  (usage_date, team_name, usage_type, amount, field_name, usage_time, notes, cancelled, is_fixed, default_amount)
select
  d.usage_date,
  r.team_name,
  'Entrenamiento',
  r.training_amount,
  r.field_name,
  r.usage_time,
  'Horario fijo 2026/27 · generado automáticamente',
  false,
  true,
  r.training_amount
from resolved r
join dates d on extract(isodow from d.usage_date)::int = any(r.weekdays)
where not exists (
  select 1
  from public.pitch_usage p
  where p.usage_date=d.usage_date
    and public.cdsb_norm_text_v27240(p.team_name)=public.cdsb_norm_text_v27240(r.team_name)
    and p.usage_type='Entrenamiento'
    and coalesce(left(p.usage_time::text,5),'')=left(r.usage_time::text,5)
);

commit;

-- COMPROBACIÓN FINAL
select
  count(*) filter (
    where is_fixed=true
      and usage_type='Entrenamiento'
      and usage_date between date '2026-08-31' and date '2027-06-15'
  ) as entrenamientos_fijos,
  count(*) filter (
    where cancelled=true
      and usage_date between date '2026-08-31' and date '2027-06-15'
  ) as anulados,
  coalesce(sum(amount) filter (
    where cancelled=false
      and usage_date between date '2026-08-31' and date '2027-06-15'
  ),0) as coste_activo_periodo
from public.pitch_usage;

-- Debe devolver 83 registros de Escuela.
select
  count(*) as registros_escuela,
  min(usage_date) as primera_fecha,
  max(usage_date) as ultima_fecha,
  min(field_name) as instalacion,
  min(amount) as importe_entrenamiento
from public.pitch_usage
where is_fixed=true
  and public.cdsb_norm_text_v27240(team_name) like '%escuela%'
  and usage_date between date '2026-08-31' and date '2027-06-15';
