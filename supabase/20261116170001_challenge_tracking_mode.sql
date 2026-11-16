alter table public.player_challenges
  add column if not exists tracking_mode text not null default 'measured_value'
  check (tracking_mode in ('measured_value', 'frequency_3'));
