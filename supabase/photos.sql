-- C025 private bounded photo lifecycle. Executed in its own repeatable transaction.
begin;
select pg_advisory_xact_lock(1936225906, 25);
create table if not exists sharefridge_private.photo_uploads (
  storage_path text primary key,
  room_code varchar(10) not null references public.rooms(code) on delete cascade,
  content_hash text not null,
  mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp')),
  byte_length integer not null,
  idempotency_key text,
  state text not null default 'staged' check(state in ('staged','attached','pending_delete','deleted','delete_failed')),
  food_id uuid,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(room_code, idempotency_key)
);
create index if not exists idx_photo_uploads_cleanup on sharefridge_private.photo_uploads(state, next_attempt_at);
create index if not exists idx_photo_uploads_food on sharefridge_private.photo_uploads(food_id) where food_id is not null;
revoke all on sharefridge_private.photo_uploads from public;
do $grants$
declare role_name text;
begin
  foreach role_name in array array['anon','authenticated'] loop
    if exists(select 1 from pg_roles where rolname=role_name) then
      execute format('revoke all on sharefridge_private.photo_uploads from %I', role_name);
    end if;
  end loop;
end $grants$;
insert into sharefridge_private.schema_migrations(version) values('004_photo_storage') on conflict(version) do nothing;
commit;
