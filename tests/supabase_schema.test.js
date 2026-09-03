import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('Supabase Schema SQL: File exists and contains complete PostgreSQL schema', () => {
  const schemaPath = path.join(__dirname, '../supabase/schema.sql');
  assert.ok(fs.existsSync(schemaPath), 'schema.sql must exist in supabase/ directory');
  const sql = fs.readFileSync(schemaPath, 'utf-8');

  // Verify essential tables
  assert.ok(sql.includes('create table if not exists public.rooms'));
  assert.ok(sql.includes('create table if not exists public.foods'));
  assert.ok(sql.includes('create table if not exists public.shopping_items'));
  assert.ok(sql.includes('create table if not exists public.push_subscriptions'));

  // Verify RLS security policies
  assert.ok(sql.includes('alter table public.rooms enable row level security'));
  assert.ok(sql.includes('alter table public.foods enable row level security'));
  assert.ok(sql.includes('alter table public.shopping_items enable row level security'));

  // Verify Realtime publication
  assert.ok(sql.includes('alter publication supabase_realtime add table public.foods'));
  assert.ok(sql.includes('alter publication supabase_realtime add table public.shopping_items'));
});
