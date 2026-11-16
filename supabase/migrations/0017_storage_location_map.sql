-- =====================================================================
-- 0017: Storage locations on a map
--
-- Each storage location can have a town and a position on the map
-- (Storage > Locations > Map). Pins for the known sites are set here:
--
--   Islamabad Muqami Store            Tilford
--   SeM Garage                        Elstead
--   AeM Containers 1, 2 and 3         Farnham
--   Baitul Futuh (all three)          Morden
--   HM Storage                        East Worldham
--
-- Positions are approximate (the town or site, not the exact door).
-- The Storage department admin can move any pin, or place one for
-- locations without one yet (Baitul Ehsan Store, Kingsley Storage),
-- from the map itself.
--
-- Only sets positions that are still empty, so it never moves a pin
-- someone has placed. Safe to run again.
-- =====================================================================

alter table public.storage_locations
  add column if not exists place      text check (place is null or length(place) <= 80),
  add column if not exists latitude   double precision check (latitude is null or latitude between -90 and 90),
  add column if not exists longitude  double precision check (longitude is null or longitude between -180 and 180);

-- Quietly: setting the starting pins doesn't need lines in the activity log.
select set_config('mka.skip_audit', 'on', false);

update public.storage_locations l
set place = coalesce(l.place, v.place), latitude = v.lat, longitude = v.lng
from (values
  ('Islamabad Muqami Store',             'Tilford',        51.1886, -0.7468),
  ('SeM Garage',                         'Elstead',        51.1852, -0.7066),
  ('AeM Container 1',                    'Farnham',        51.2146, -0.7989),
  ('AeM Container 2',                    'Farnham',        51.2146, -0.7989),
  ('AeM Container 3',                    'Farnham',        51.2146, -0.7989),
  ('Baitul Futuh Container',             'Morden',         51.3966, -0.1950),
  ('Baitul Futuh Khuddam Office',        'Morden',         51.3966, -0.1950),
  ('Baitul Futuh Tahir Hall Store Room', 'Morden',         51.3966, -0.1950),
  ('HM Storage',                         'East Worldham',  51.1500, -0.9330)
) as v(name, place, lat, lng)
where l.name = v.name and l.latitude is null;

select set_config('mka.skip_audit', 'off', false);
