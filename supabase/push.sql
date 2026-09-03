-- C024 private durable notification state. Executed in its own repeatable transaction.
begin;
select pg_advisory_xact_lock(1936225906, 24);
alter table public.push_subscriptions add column if not exists version integer not null default 1;
alter table public.push_subscriptions add column if not exists disabled_at timestamptz;
create table if not exists sharefridge_private.push_events (
  id uuid primary key default gen_random_uuid(),
  room_code varchar(10) not null references public.rooms(code) on delete cascade,
  kind text not null check(kind in ('change','expiry')),
  dedup_key text not null,
  payload jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(room_code,kind,dedup_key)
);
create table if not exists sharefridge_private.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references sharefridge_private.push_events(id) on delete cascade,
  subscriber_id uuid not null references public.push_subscriptions(id) on delete cascade,
  endpoint_hash text not null,
  subscription_version integer not null,
  state text not null default 'pending' check(state in ('pending','sending','accepted','failed','expired','disabled')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default clock_timestamp(),
  lease_until timestamptz,
  attempt_token uuid,
  last_code text,
  accepted_at timestamptz,
  unique(event_id,endpoint_hash)
);
create index if not exists idx_push_due on sharefridge_private.push_deliveries(state,next_attempt_at);

create or replace function sharefridge_private.queue_push_event(
  target_room text, event_kind text, event_key text, event_payload jsonb, expires timestamptz, actor_id text default null
) returns uuid language plpgsql security definer set search_path = pg_catalog, sharefridge_private as $body$
declare new_event_id uuid;
begin
  -- Cascading room deletion is not a room update to be broadcast.
  if not exists(select 1 from public.rooms where code=target_room) then return null; end if;
  if actor_id is not null and actor_id <> '' and not exists(
    select 1 from public.push_subscriptions where id::text=actor_id and room_code=target_room and disabled_at is null
  ) then actor_id := null; end if;
  if not exists(select 1 from public.push_subscriptions where room_code=target_room and disabled_at is null and (actor_id is null or id::text<>actor_id)) then return null; end if;
  insert into sharefridge_private.push_events(room_code,kind,dedup_key,payload,expires_at)
    values(target_room,event_kind,event_key,event_payload,expires)
    on conflict(room_code,kind,dedup_key) do nothing returning id into new_event_id;
  if new_event_id is null then return null; end if;
  insert into sharefridge_private.push_deliveries(event_id,subscriber_id,endpoint_hash,subscription_version)
    select new_event_id,id,encode(sha256(convert_to(subscription->>'endpoint','UTF8')),'hex'),version from (
      select distinct on(subscription->>'endpoint') id,subscription,version from public.push_subscriptions
      where room_code=target_room and disabled_at is null and (actor_id is null or id::text<>actor_id)
      order by subscription->>'endpoint',created_at,id
    ) recipients on conflict(event_id,endpoint_hash) do nothing;
  return new_event_id;
end $body$;

create or replace function sharefridge_private.queue_room_change()
returns trigger language plpgsql security definer set search_path = pg_catalog, sharefridge_private as $body$
declare target_room text; actor_id text;
begin
  if TG_OP='UPDATE' and OLD is not distinct from NEW then return NEW; end if;
  target_room := case when TG_OP='DELETE' then OLD.room_code else NEW.room_code end;
  actor_id := nullif(current_setting('sharefridge.push_actor',true),'');
  perform sharefridge_private.queue_push_event(target_room,'change',txid_current()::text,
    jsonb_build_object('title','Tủ đồ phòng mình','body','Tủ đồ phòng mình có thay đổi. Mở ứng dụng để xem.'),
    clock_timestamp()+interval '48 hours',actor_id);
  return case when TG_OP='DELETE' then OLD else NEW end;
end $body$;
drop trigger if exists queue_food_change on public.foods;
create trigger queue_food_change after insert or update or delete on public.foods for each row execute function sharefridge_private.queue_room_change();
drop trigger if exists queue_shopping_change on public.shopping_items;
create trigger queue_shopping_change after insert or update or delete on public.shopping_items for each row execute function sharefridge_private.queue_room_change();
revoke all on all tables in schema sharefridge_private from public;
revoke all on function sharefridge_private.queue_push_event(text,text,text,jsonb,timestamptz,text) from public;
revoke all on function sharefridge_private.queue_room_change() from public;
do $grants$
declare role_name text;
begin
  foreach role_name in array array['anon','authenticated'] loop
    if exists(select 1 from pg_roles where rolname=role_name) then
      execute format('revoke all on all tables in schema sharefridge_private from %I',role_name);
      execute format('revoke all on all functions in schema sharefridge_private from %I',role_name);
    end if;
  end loop;
end $grants$;
insert into sharefridge_private.schema_migrations(version) values('003_web_push') on conflict(version) do nothing;
commit;
