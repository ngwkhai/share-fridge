-- C021 latency remediation. Executed in its own repeatable transaction.
--
-- room_sync_versions + postgres_changes (see schema.sql) is KEPT UNCHANGED as the
-- reliability fallback -- this migration only ADDS a lower-latency Supabase Realtime
-- Broadcast path on the same trigger. Measured postgres_changes delivery latency in
-- production was 1.2-3.2s (see DEBT.md's C-021 entry and evidence/C-021/live-2026-09-04.md),
-- well over the PRD's 500ms target; Supabase's own current guidance is to broadcast
-- database changes via a trigger (`realtime.send`) rather than rely on postgres_changes'
-- WAL-based delivery for latency-sensitive cases.
--
-- The broadcast payload is intentionally EMPTY ('{}') -- it is a "something changed, go
-- refetch" ping, never row data. Clients still fetch fresh state through the existing
-- authenticated REST endpoints, so this adds no new data-exposure surface versus what
-- room_sync_versions/postgres_changes already had.
--
-- The realtime.send() call is wrapped in its own exception handler: if the Realtime
-- Broadcast extension/function is ever unavailable for any reason, the broadcast is
-- silently skipped and the mutation (and the existing room_sync_versions/postgres_changes
-- fallback) proceeds exactly as before this migration. A broadcast failure must never
-- fail a food/shopping mutation.
begin;
select pg_advisory_xact_lock(1936225906, 26);

drop policy if exists room_broadcast_read on realtime.messages;
create policy room_broadcast_read on realtime.messages for select to authenticated using (
  realtime.messages.extension = 'broadcast'
  and realtime.topic() = 'room-sync:' || (nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'room_code')
);

create or replace function sharefridge_private.bump_room_sync() returns trigger
language plpgsql security definer set search_path = pg_catalog as $sync$
declare codes text[]; target text;
begin
  if TG_OP = 'INSERT' then codes := array[NEW.room_code];
  elsif TG_OP = 'DELETE' then codes := array[OLD.room_code];
  else codes := array[OLD.room_code,NEW.room_code]; end if;
  for target in select distinct unnest(codes) order by 1 loop
    -- During cascading room deletion the parent may already be absent.
    insert into public.room_sync_versions(room_code,revision,changed_at)
      select target,1,clock_timestamp() where exists(select 1 from public.rooms where code=target)
      on conflict(room_code) do update set revision=public.room_sync_versions.revision+1,changed_at=excluded.changed_at;
    if exists(select 1 from public.rooms where code=target) then
      begin
        perform realtime.send('{}'::jsonb, 'changed', 'room-sync:' || target, true);
      exception when others then null;
      end;
    end if;
  end loop;
  return null;
end $sync$;

insert into sharefridge_private.schema_migrations(version) values('005_realtime_broadcast') on conflict(version) do nothing;
commit;
