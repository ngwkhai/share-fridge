import fs from 'node:fs/promises';

export async function runMigrations(pool) {
  const sql = await fs.readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
  const client = await pool.connect();
  try {
    await client.query(sql);
    await client.query(await fs.readFile(new URL('../supabase/push.sql', import.meta.url), 'utf8'));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
