-- CD SAN BERNABÉ MANAGER
-- V27.2.17 · Pantalón de entrenamiento jugador/portero y mochilas automáticas
-- Puede ejecutarse aunque no se haya ejecutado todavía la V27.2.16.
-- Supabase > SQL Editor > New query > Run

begin;

alter table public.player_sizes
  add column if not exists game_shirt_goalkeeper text,
  add column if not exists game_shorts_goalkeeper text,
  add column if not exists second_shirt_player text,
  add column if not exists socks_goalkeeper text,
  add column if not exists training_shirt_goalkeeper text,
  add column if not exists training_shorts_goalkeeper text;

comment on column public.player_sizes.game_shirt_goalkeeper is 'Talla camiseta primera equipación portero';
comment on column public.player_sizes.game_shorts_goalkeeper is 'Talla pantalón equipación portero';
comment on column public.player_sizes.second_shirt_player is 'Talla camiseta segunda equipación jugador';
comment on column public.player_sizes.socks_goalkeeper is 'Talla medias portero';
comment on column public.player_sizes.training_shirt_goalkeeper is 'Talla camiseta entrenamiento portero';
comment on column public.player_sizes.training_shorts_goalkeeper is 'Talla pantalón entrenamiento portero';

commit;

select
  'V27.2.17 instalada correctamente: prendas jugador/portero y mochilas automáticas preparadas' as resultado,
  count(*) filter (where column_name in (
    'game_shirt_goalkeeper',
    'game_shorts_goalkeeper',
    'second_shirt_player',
    'socks_goalkeeper',
    'training_shirt_goalkeeper',
    'training_shorts_goalkeeper'
  )) as campos_disponibles
from information_schema.columns
where table_schema='public'
  and table_name='player_sizes';
