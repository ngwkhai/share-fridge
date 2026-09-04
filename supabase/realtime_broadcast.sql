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
-- Delta broadcasts are constructed by this owner-only trigger from the committed row.
-- They are sent only to the private, room-claim-fenced topic above. The payload excludes
-- credentials, passcodes, subscriptions, signed URLs and storage_path values; a later
-- authenticated snapshot remains authoritative for photos and all reconciliation.
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
-- Client-originated deltas use channel.send(). Private-channel membership and
-- receive permission are not enough: Supabase also checks INSERT for broadcast
-- sends. Keep this identical room-claim fence so a room JWT cannot publish to
-- another room's topic.
drop policy if exists room_broadcast_send on realtime.messages;
create policy room_broadcast_send on realtime.messages for insert to authenticated with check (
  realtime.messages.extension = 'broadcast'
  and realtime.topic() = 'room-sync:' || (nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'room_code')
);

create or replace function sharefridge_private.bump_room_sync() returns trigger
language plpgsql security definer set search_path = pg_catalog as $sync$
declare codes text[]; target text; delta jsonb;
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
        if TG_TABLE_NAME = 'foods' then
          if TG_OP = 'DELETE' then
            delta := jsonb_build_object('resource','food','operation','delete','id',OLD.id::text,'room_code',target);
          else
            delta := jsonb_build_object('resource','food','operation','upsert','item',jsonb_build_object(
              'id',NEW.id::text,'room_code',target,'name',NEW.name,'quantity',NEW.quantity,
              'compartment',NEW.compartment,'container_tag',NEW.container_tag,
              'added_date',NEW.added_date,'expiry_date',NEW.expiry_date,
              'days_remaining',ceil(extract(epoch from (NEW.expiry_date-clock_timestamp()))/86400)::integer,
              'status',case when NEW.status='CONSUMED' then 'CONSUMED' when NEW.expiry_date<=clock_timestamp() then 'EXPIRED' when NEW.expiry_date<=clock_timestamp()+interval '2 days' then 'COOK_SOON' else 'FRESH' end,
              'notes',NEW.notes,'created_by',NEW.created_by,'consumed_by',NEW.consumed_by,'consumed_at',NEW.consumed_at,
              'photo_url',null));
          end if;
        elsif TG_TABLE_NAME = 'shopping_items' then
          if TG_OP = 'DELETE' then
            delta := jsonb_build_object('resource','shopping','operation','delete','id',OLD.id::text,'room_code',target);
          else
            delta := jsonb_build_object('resource','shopping','operation','upsert','item',jsonb_build_object(
              'id',NEW.id::text,'room_code',target,'name',NEW.name,'quantity',NEW.quantity,'is_bought',NEW.is_bought,'created_at',NEW.created_at));
          end if;
        end if;
        if delta is not null then perform realtime.send(delta, 'delta', 'room-sync:' || target, true); end if;
      exception when others then null;
      end;
    end if;
  end loop;
  return null;
end $sync$;

insert into sharefridge_private.schema_migrations(version) values('006_realtime_delta_broadcast') on conflict(version) do nothing;
commit;
