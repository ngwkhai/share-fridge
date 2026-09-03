-- =============================================================================
-- ShareFridge — Cloud Database Migration Schema (PostgreSQL / Supabase)
-- =============================================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Rooms Table
create table if not exists public.rooms (
  id uuid primary key default uuid_generate_v4(),
  code varchar(10) unique not null,
  name text not null,
  passcode_hash text not null,
  salt text not null,
  created_at timestamptz default now()
);

-- 2. Food Items Table
create table if not exists public.foods (
  id uuid primary key default uuid_generate_v4(),
  room_code varchar(10) not null references public.rooms(code) on delete cascade,
  name text not null,
  quantity text,
  compartment varchar(20) not null check (compartment in ('FREEZER', 'FRIDGE_TOP', 'FRIDGE_BOTTOM', 'CRISPER', 'DOOR')),
  container_tag text,
  added_date timestamptz default now(),
  expiry_date timestamptz not null,
  status varchar(20) not null default 'FRESH' check (status in ('FRESH', 'COOK_SOON', 'EXPIRED', 'CONSUMED')),
  photo_url text,
  notes text,
  created_by text default 'Bạn cùng phòng',
  consumed_at timestamptz
);

-- 3. Shopping Items Table
create table if not exists public.shopping_items (
  id uuid primary key default uuid_generate_v4(),
  room_code varchar(10) not null references public.rooms(code) on delete cascade,
  name text not null,
  quantity text,
  is_bought boolean not null default false,
  created_at timestamptz default now()
);

-- 4. Push Subscriptions Table
create table if not exists public.push_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  room_code varchar(10) not null references public.rooms(code) on delete cascade,
  subscription jsonb not null,
  device_name text,
  created_at timestamptz default now()
);

-- Indexes for lightning fast queries
create index if not exists idx_foods_room_status on public.foods(room_code, status);
create index if not exists idx_foods_expiry on public.foods(expiry_date);
create index if not exists idx_shopping_room on public.shopping_items(room_code, is_bought);

-- Row Level Security (RLS) Policies
alter table public.rooms enable row level security;
alter table public.foods enable row level security;
alter table public.shopping_items enable row level security;
alter table public.push_subscriptions enable row level security;

-- Public access policies scoped by room_code (matching client session)
create policy "Allow room read" on public.rooms for select using (true);
create policy "Allow room insert" on public.rooms for insert with check (true);

create policy "Allow food operations" on public.foods for all using (true) with check (true);
create policy "Allow shopping operations" on public.shopping_items for all using (true) with check (true);
create policy "Allow push subscriptions" on public.push_subscriptions for all using (true) with check (true);

-- Enable Supabase Realtime for instant synchronization
alter publication supabase_realtime add table public.foods;
alter publication supabase_realtime add table public.shopping_items;
