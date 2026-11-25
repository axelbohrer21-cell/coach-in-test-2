create or replace function public.assign_unique_player_color()
returns trigger
language plpgsql
set search_path = 'public'
as $function$
declare
  palette text[] := array[
    '#00A6FB','#F72585','#2EC4B6','#FF9F1C','#7B2CBF',
    '#E63946','#43AA8B','#4361EE','#F15BB5','#90BE6D',
    '#FF6B6B','#277DA1','#F9C74F','#9B5DE5','#00B4D8',
    '#F3722C','#80B918','#577590','#D81159','#4D908E',
    '#A06CD5','#E76F51','#4895EF','#B5179E','#06D6A0',
    '#FF7F11','#5E60CE','#C9184A','#52B788','#3A86FF',
    '#FF4D6D','#2A9D8F','#F4A261','#6A4C93','#1982C4',
    '#8AC926','#FF595E','#00A896','#9D4EDD','#F9844A',
    '#0077B6','#D65DB1','#6C757D','#BC6C25','#4CC9F0',
    '#E9C46A','#8338EC','#588157','#EF476F','#3D5A80'
  ]::text[];
  selected_color text;
begin
  if new.role <> 'player' or new.player_color is not null then
    return new;
  end if;
  perform pg_advisory_xact_lock(824731905);
  select color into selected_color
  from unnest(palette) as color
  where not exists (
    select 1 from public.profiles existing
    where existing.role = 'player'
      and existing.player_color = color
      and existing.id is distinct from new.id
  )
  order by array_position(palette, color)
  limit 1;
  if selected_color is null then
    raise exception 'Les 50 couleurs de joueurs sont déjà attribuées.';
  end if;
  new.player_color := selected_color;
  return new;
end;
$function$;
