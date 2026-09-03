-- C-019: additive, repeatable PostgreSQL/Supabase migration. Run as DB owner.
-- No seed data and no DELETE/DROP TABLE; existing UUIDs, credentials and rows survive.
begin;
select pg_advisory_xact_lock(1936225906, 19);
create schema if not exists sharefridge_private;
revoke all on schema sharefridge_private from public;
create table if not exists sharefridge_private.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code varchar(10) unique not null,
  name text not null,
  passcode_hash text not null,
  salt text not null,
  created_at timestamptz default now()
);
create table if not exists public.foods (
  id uuid primary key default gen_random_uuid(),
  room_code varchar(10) not null references public.rooms(code) on delete cascade,
  name text not null,
  quantity text,
  compartment varchar(20) not null check (compartment in ('FREEZER','FRIDGE_TOP','FRIDGE_BOTTOM','CRISPER','DOOR')),
  container_tag text,
  added_date timestamptz default now(),
  expiry_date timestamptz not null,
  status varchar(20) not null default 'FRESH' check (status in ('FRESH','COOK_SOON','EXPIRED','CONSUMED')),
  photo_url text,
  notes text,
  created_by text default 'Bạn cùng phòng',
  consumed_at timestamptz
);
alter table public.foods add column if not exists consumed_by text;
alter table public.foods add column if not exists storage_path text;
create table if not exists public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  room_code varchar(10) not null references public.rooms(code) on delete cascade,
  name text not null,
  quantity text,
  is_bought boolean not null default false,
  created_at timestamptz default now()
);
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  room_code varchar(10) not null references public.rooms(code) on delete cascade,
  subscription jsonb not null,
  device_name text,
  created_at timestamptz default now()
);
-- An expression index preserves even duplicate legacy endpoints; API upserts use
-- a transaction advisory lock and reuse the oldest matching row.
create index if not exists idx_push_room_endpoint on public.push_subscriptions(room_code, (subscription->>'endpoint'));
create index if not exists idx_foods_room_status on public.foods(room_code,status);
create index if not exists idx_foods_expiry on public.foods(expiry_date);
create index if not exists idx_shopping_room on public.shopping_items(room_code,is_bought);

create table if not exists sharefridge_private.rate_limits (
  bucket text primary key,
  count integer not null check(count >= 0),
  expires_at timestamptz not null
);
create index if not exists idx_rate_limit_expiry on sharefridge_private.rate_limits(expires_at);
-- Durable replay storage used by transactional operations added in later cards.
create table if not exists sharefridge_private.idempotency_keys (
  room_code varchar(10) not null references public.rooms(code) on delete cascade,
  operation text not null,
  key text not null,
  request_hash text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key(room_code,operation,key)
);

revoke all on all tables in schema sharefridge_private from public;

alter table public.rooms enable row level security;
alter table public.foods enable row level security;
alter table public.shopping_items enable row level security;
alter table public.push_subscriptions enable row level security;

-- Remove the former USING(true) policies and any obsolete policies on these
-- application-owned tables. Permissions AND policies must both be restricted.
do $migration$
declare entry record; role_name text;
begin
  for entry in select tablename,policyname from pg_policies where schemaname='public' and tablename in ('rooms','foods','shopping_items','push_subscriptions') loop
    execute format('drop policy %I on public.%I',entry.policyname,entry.tablename);
  end loop;
  for entry in select unnest(array['rooms','foods','shopping_items','push_subscriptions']) as table_name loop
    execute format('revoke all on table public.%I from public',entry.table_name);
    foreach role_name in array array['anon','authenticated'] loop
      if exists(select 1 from pg_roles where rolname=role_name) then
        execute format('revoke all on table public.%I from %I',entry.table_name,role_name);
      end if;
    end loop;
  end loop;
  foreach role_name in array array['anon','authenticated'] loop
    if exists(select 1 from pg_roles where rolname=role_name) then
      execute format('revoke all on schema sharefridge_private from %I',role_name);
      execute format('revoke all on all tables in schema sharefridge_private from %I',role_name);
    end if;
  end loop;
  if exists(select 1 from pg_roles where rolname='authenticated') then
    grant select on public.foods,public.shopping_items to authenticated;
  end if;
end $migration$;

-- A room-scoped signed Realtime JWT supplies room_code in request.jwt.claims.
-- No client role can read room hashes/subscriptions or write any table.
create policy room_food_read on public.foods for select using (
  room_code = (nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'room_code')
);
create policy room_shopping_read on public.shopping_items for select using (
  room_code = (nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'room_code')
);

-- Supabase manages this publication; plain PostgreSQL has none. Re-running the
-- migration must not fail when a table is already published.
do $realtime$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='foods') then
      alter publication supabase_realtime add table public.foods;
    end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='shopping_items') then
      alter publication supabase_realtime add table public.shopping_items;
    end if;
  end if;
end $realtime$;
-- C-021: invalidate whole room snapshots, including hard deletes, without
-- broadcasting raw DELETE records. Keep changes in the source transaction.
create table if not exists public.room_sync_versions (
  room_code varchar(10) primary key references public.rooms(code) on delete cascade,
  revision bigint not null default 0 check(revision >= 0),
  changed_at timestamptz not null default now()
);
alter table public.room_sync_versions enable row level security;
revoke all on public.room_sync_versions from public;
drop policy if exists room_sync_read on public.room_sync_versions;
create policy room_sync_read on public.room_sync_versions for select using (
  room_code = (nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'room_code')
);
insert into public.room_sync_versions(room_code) select code from public.rooms on conflict do nothing;
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
  end loop;
  return null;
end $sync$;
revoke all on function sharefridge_private.bump_room_sync() from public;
drop trigger if exists foods_room_sync on public.foods;
create trigger foods_room_sync after insert or update or delete on public.foods for each row execute function sharefridge_private.bump_room_sync();
drop trigger if exists shopping_room_sync on public.shopping_items;
create trigger shopping_room_sync after insert or update or delete on public.shopping_items for each row execute function sharefridge_private.bump_room_sync();
do $sync_grants$
declare role_name text;
begin
  foreach role_name in array array['anon','authenticated'] loop
    if exists(select 1 from pg_roles where rolname=role_name) then
      execute format('revoke all on public.room_sync_versions from %I',role_name);
      execute format('revoke all on function sharefridge_private.bump_room_sync() from %I',role_name);
    end if;
  end loop;
  if exists(select 1 from pg_roles where rolname='authenticated') then
    grant select on public.room_sync_versions to authenticated;
  end if;
  if exists(select 1 from pg_publication where pubname='supabase_realtime' and not puballtables) then
    if exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='foods') then
      alter publication supabase_realtime drop table public.foods;
    end if;
    if exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='shopping_items') then
      alter publication supabase_realtime drop table public.shopping_items;
    end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='room_sync_versions') then
      alter publication supabase_realtime add table public.room_sync_versions;
    end if;
  end if;
end $sync_grants$;
insert into sharefridge_private.schema_migrations(version) values('002_room_sync') on conflict(version) do nothing;
insert into sharefridge_private.schema_migrations(version) values('001_durable_repository') on conflict(version) do nothing;
commit;
