import crypto from 'node:crypto';

export async function pushTransaction(pool, operation) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query("set local lock_timeout='2s'; set local statement_timeout='5s'");
    const result = await operation(client);
    await client.query('commit');
    return result;
  } catch (error) { await client.query('rollback').catch(() => {}); throw error; }
  finally { client.release(); }
}

export function createPushRepository(pool) {
  const query = (sql, values) => pool.query(sql, values);
  return {
    async pushReady() {
      try {
        const ready = (await query("select exists(select 1 from sharefridge_private.schema_migrations where version='003_web_push') as ready")).rows[0].ready;
        await query('select d.attempt_token,d.lease_until,d.subscription_version,p.version,p.disabled_at,e.expires_at from sharefridge_private.push_deliveries d,sharefridge_private.push_events e,public.push_subscriptions p limit 0');
        return ready;
      } catch { return false; }
    },
    async getSubscription(id, code) {
      if (!/^[\da-f-]{36}$/i.test(id || '')) return null;
      return (await query('select * from public.push_subscriptions where id::text=$1 and room_code=$2 and disabled_at is null',[id,code])).rows[0] || null;
    },
    async saveSubscription(code, subscription, deviceName) {
      return pushTransaction(pool, async client => {
        await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`${code}:${subscription.endpoint}`]);
        const existing = (await client.query("select * from public.push_subscriptions where room_code=$1 and subscription->>'endpoint'=$2 order by created_at,id for update",[code,subscription.endpoint])).rows;
        let row;
        if (existing.length) {
          row = (await client.query('update public.push_subscriptions set subscription=$3,device_name=$4,version=case when subscription=$3::jsonb and disabled_at is null then version else version+1 end,disabled_at=null where id=$1 and room_code=$2 returning *',[existing[0].id,code,subscription,deviceName || null])).rows[0];
          // Preserve duplicate legacy rows, but never send through them twice.
          await client.query("update public.push_subscriptions set disabled_at=clock_timestamp(),version=version+1 where room_code=$1 and subscription->>'endpoint'=$2 and id<>$3 and disabled_at is null",[code,subscription.endpoint,row.id]);
        } else row = (await client.query('insert into public.push_subscriptions(room_code,subscription,device_name) values($1,$2,$3) returning *',[code,subscription,deviceName || null])).rows[0];
        // Old pending attempts cannot target a new registration version.
        await client.query("update sharefridge_private.push_deliveries set state='disabled',attempt_token=null,lease_until=null where subscriber_id=$1 and subscription_version<>$2 and state in ('pending','sending')",[row.id,row.version]);
        return row;
      });
    },
    async removeSubscription(code, endpoint) {
      return pushTransaction(pool, async client => {
        await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`${code}:${endpoint}`]);
        const rows = (await client.query("update public.push_subscriptions set disabled_at=clock_timestamp(),version=version+1 where room_code=$1 and subscription->>'endpoint'=$2 and disabled_at is null returning id",[code,endpoint])).rows;
        if (rows.length) await client.query("update sharefridge_private.push_deliveries set state='disabled',attempt_token=null,lease_until=null where subscriber_id=any($1::uuid[]) and state in ('pending','sending')",[rows.map(row=>row.id)]);
      });
    },
    async listSubscriptions(code) { return (await query('select * from public.push_subscriptions where room_code=$1 and disabled_at is null order by created_at,id',[code])).rows; },
    async queueExpiry(day, now, expires) {
      return pushTransaction(pool, async client => {
        const rows = (await client.query(`select room_code,count(*)::int as total,count(*) filter(where expiry_date<=$1)::int as expired
          from public.foods where status<>'CONSUMED' and expiry_date<=$1::timestamptz+interval '2 days' group by room_code order by room_code`,[now])).rows;
        let queued = 0;
        for (const row of rows) {
          const payload = {title:'Kiểm tra hạn dùng trong tủ',body:'Trong tủ có món cần kiểm tra hạn dùng. Mở ứng dụng để xem.',reminder_day:day,generated_at:now};
          const event = (await client.query("select sharefridge_private.queue_push_event($1,'expiry',$2,$3,$4,null) as id",[row.room_code,day,payload,expires])).rows[0];
          if (event.id) queued++;
        }
        return queued;
      });
    },
    async claimPush(limit, leaseSeconds, roomCode = null) {
      return pushTransaction(pool, async client => {
        await client.query(`update sharefridge_private.push_deliveries d set state='expired',attempt_token=null,lease_until=null
          from sharefridge_private.push_events e where d.event_id=e.id and d.state in ('pending','sending') and (e.expires_at<=clock_timestamp() or (e.kind='expiry' and not exists(select 1 from public.foods f where f.room_code=e.room_code and f.status<>'CONSUMED' and f.expiry_date<=clock_timestamp()+interval '2 days')))
          and ($1::text is null or e.room_code=$1)`,[roomCode]);
        await client.query(`update sharefridge_private.push_deliveries d set state='failed',last_code='ATTEMPTS_EXHAUSTED',attempt_token=null,lease_until=null
          from sharefridge_private.push_events e where d.event_id=e.id and d.state in ('pending','sending') and d.attempts>=5
          and (d.lease_until is null or d.lease_until<=clock_timestamp()) and ($1::text is null or e.room_code=$1)`,[roomCode]);
        const result = await client.query(`with due as (
          select d.id from sharefridge_private.push_deliveries d join sharefridge_private.push_events e on e.id=d.event_id
          join public.push_subscriptions p on p.id=d.subscriber_id
          where d.attempts<5 and e.expires_at>clock_timestamp() and p.disabled_at is null and p.version=d.subscription_version
            and ((d.state='pending' and d.next_attempt_at<=clock_timestamp()) or (d.state='sending' and d.lease_until<=clock_timestamp()))
            and ($3::text is null or e.room_code=$3)
          order by d.next_attempt_at,d.id limit $1 for update of d skip locked
        ), claimed as (
          update sharefridge_private.push_deliveries d set state='sending',attempts=attempts+1,
            attempt_token=gen_random_uuid(),lease_until=clock_timestamp()+make_interval(secs=>$2)
          from due where d.id=due.id returning d.*
        ) select claimed.*,p.subscription,e.payload,e.id as notification_id,e.room_code,e.expires_at
          from claimed join public.push_subscriptions p on p.id=claimed.subscriber_id join sharefridge_private.push_events e on e.id=claimed.event_id`,[limit,leaseSeconds,roomCode]);
        return result.rows;
      });
    },
    async finishPush(delivery, outcome) {
      return pushTransaction(pool, async client => {
        // Same order as registration/disable: subscription first, then deliveries.
        const same = (await client.query('select 1 from public.push_subscriptions where id=$1 and version=$2 and disabled_at is null for update',[delivery.subscriber_id,delivery.subscription_version])).rowCount;
        const row = (await client.query("select * from sharefridge_private.push_deliveries where id=$1 and attempt_token=$2 and state='sending' and lease_until>clock_timestamp() for update",[delivery.id,delivery.attempt_token])).rows[0];
        if (!row) return false;
        const state = !same ? 'disabled' : outcome.accepted ? 'accepted' : outcome.expired ? 'disabled' : outcome.retry && row.attempts<5 ? 'pending' : 'failed';
        await client.query(`update sharefridge_private.push_deliveries set state=$3,last_code=$4,attempt_token=null,lease_until=null,
          next_attempt_at=clock_timestamp()+make_interval(secs=>$5),accepted_at=case when $3='accepted' then clock_timestamp() else accepted_at end
          where id=$1 and attempt_token=$2`,[delivery.id,delivery.attempt_token,state,outcome.code,Math.min(3600,Math.max(5,outcome.retryAfter || 5*2**row.attempts))]);
        if (same && outcome.expired) {
          await client.query('update public.push_subscriptions set disabled_at=clock_timestamp(),version=version+1 where id=$1 and version=$2',[delivery.subscriber_id,delivery.subscription_version]);
          await client.query("update sharefridge_private.push_deliveries set state='disabled',attempt_token=null,lease_until=null where subscriber_id=$1 and subscription_version=$2 and state in ('pending','sending')",[delivery.subscriber_id,delivery.subscription_version]);
        }
        return same > 0;
      });
    },
    async pendingPush(roomCode = null) {
      return (await query(`select count(*)::int as n from sharefridge_private.push_deliveries d join sharefridge_private.push_events e on e.id=d.event_id
        where d.state in ('pending','sending') and e.expires_at>clock_timestamp() and ($1::text is null or e.room_code=$1)`,[roomCode])).rows[0].n;
    }
  };
}

// Explicit test adapter only; runtime never substitutes this for PostgreSQL.
export function createMemoryPushRepository(subscribers) {
  return {
    async pushReady() { return true; },
    async getSubscription(id,code) { const row=subscribers.get(id);return row?.room_code===code&&!row.disabled_at?structuredClone(row):null; },
    async saveSubscription(code,subscription,deviceName) {
      const prior=[...subscribers.values()].find(row=>row.room_code===code&&row.subscription.endpoint===subscription.endpoint);
      const row={id:prior?.id || crypto.randomUUID(),room_code:code,subscription:structuredClone(subscription),device_name:deviceName || null,created_at:prior?.created_at || new Date().toISOString(),version:prior && !prior.disabled_at && JSON.stringify(prior.subscription)===JSON.stringify(subscription) ? prior.version : (prior?.version || 0)+1,disabled_at:null};
      subscribers.set(row.id,row);return structuredClone(row);
    },
    async removeSubscription(code,endpoint) { for(const row of subscribers.values())if(row.room_code===code&&row.subscription.endpoint===endpoint){row.disabled_at=new Date().toISOString();row.version++;} },
    async listSubscriptions(code) { return [...subscribers.values()].filter(row=>row.room_code===code&&!row.disabled_at).map(row=>structuredClone(row)); },
    async queueExpiry() { return 0; },async claimPush() { return []; },async pendingPush() { return 0; }
  };
}
