-- tickets.is_past is written once at insert time and never updated afterward,
-- so it drifts out of sync the moment an "upcoming" ticket's date passes. The
-- app already recomputes "is this event past?" live from date_str on every
-- read via isEventPast() (lib/parseEventDate.ts) and does not trust this
-- column for anything time-sensitive — but app/(tabs)/search.tsx was
-- filtering friends' events with `.eq('is_past', false)` server-side, which
-- silently included past events since every row was permanently false.
--
-- This backfill corrects the rows that drifted (ids verified by running the
-- real isEventPast() against each row's actual date_str — not a re-implementation
-- of the date parsing in SQL, to avoid a second copy of that logic going stale).
update tickets
set is_past = true
where is_past = false
  and id in (
  '86ad2389-3b4c-4140-8629-75dbcac64a91',
  '23b7f3c1-1d69-4342-91ea-77e6ea74750e',
  '3efa87d6-b340-4bcd-b2af-2695511e60db',
  '78032800-e36f-46fa-bc48-2dea86a6bca7',
  '6337f638-8728-4c22-8f7d-8282e9dfbd02',
  'ae0173af-4191-40be-a9c7-144efed0c913',
  'a81116d7-561f-4504-9a37-08605690f881',
  '221348a7-4f18-45da-91ad-156ec50542b2',
  '322cbb44-0935-4abc-98b3-fd512654d3a9',
  '7084e47d-dc4f-4171-9691-d3338ee46647',
  'acbc38a6-53c2-4c27-99e2-a8dc563a3b15',
  'fcd2192d-cf33-4fb3-aaee-ae83129cbed0',
  'aecf8c5b-a5bf-4c0d-82c9-2325d6d610a0',
  '59035796-a917-479c-87c4-7e95058070e5'
);

comment on column tickets.is_past is
  'Best-effort snapshot of whether the event had already happened, computed once at row creation and never refreshed — it goes stale as real time passes. Do not filter or sort on it; recompute live with isEventPast(date_str) from lib/parseEventDate.ts instead.';
