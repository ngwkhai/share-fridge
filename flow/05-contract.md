# Stage 05 — Interface Contract, remediation v2 (2026-09-03)

## Gate — authored in work mode

- [x] Audit remediation scope authorized by the user; each product capability mapped below.
- [x] Every endpoint specifies request, response and auth.
- [x] Security corrections intentionally reject insecure legacy behavior.
- [x] Required providers and live acceptance are explicit; unavailable never means fake success.

This revision supersedes the original contract. Cards implement additive routes incrementally; spec lands with implementation. The final release requires all routes. Existing room/food/shopping shape fields are retained unless explicitly corrected below.

## Protocol

JSON. Error shape: `{error:string,code:string}` with optional safe validation details. Statuses: 400 invalid JSON/input, 401 invalid/missing/expired token, 403 forbidden (404 allowed for foreign IDs), 404 absent, 409 duplicate/conflict, 413 oversize, 429 throttled, 503 required service unavailable. No hashes, salts, credentials, SQL or stack traces in responses.

Room auth is `Authorization: Bearer <room-token>`. Verify signature/expiry/room existence and restrict query/body room_code and object IDs to the session room. Actor comes from session. Parse raw Node streams and already-parsed serverless req.body. Stable opaque IDs, ISO UTC timestamps, successful empty lists authoritative; failed requests must throw, never return empty data.

## Endpoints

| Method | Path | Auth | Request shape | Response shape |
|---|---|---|---|---|
| GET | `/healthz` | public | none | `{status:"ok",version:string,timestamp:string}` |
| GET | `/readyz` | public | none | `{status:"ok"\|"unavailable",database:"postgres"\|"test"\|"unavailable"}`, 503 if unavailable |
| GET | `/api/openapi.json` | public | none | OpenAPI for implemented endpoints |
| GET | `/api/config` | public | none | `{google_client_id:string|null,capabilities:{google:boolean,push:boolean,photos:boolean,realtime:boolean}}` |
| POST | `/api/auth/create-room` | public/rate-limit | `{code?:string,name?:string,passcode:string,nickname?:string,google_identity_token?:string}` | `AuthSession`, 201; duplicate 409 |
| POST | `/api/auth/join-room` | public/rate-limit | `{code:string,passcode:string,nickname?:string,google_identity_token?:string}` | `AuthSession` |
| POST | `/api/auth/verify-token` | supplied room token | `{token:string}` | `{valid:true,payload:SessionPayload,room:Room}`; invalid 401 `{valid:false,error,code}` |
| POST | `/api/auth/google` | Google credential | `{credential:string}` | `{profile:GoogleProfile,identity_token:string,expires_at:string}` |
| PATCH | `/api/auth/session` | valid room token | `{nickname:string}` | `AuthSession`; replace nickname, retain room/Google profile and original session expiry |
| POST | `/api/rooms` | public/rate-limit | same validated create fields, passcode required | `Room`, 201; legacy alias never overwrites password |
| GET | `/api/rooms/:code` | matching room token | none | `RoomDetail` |
| GET | `/api/foods` | room token | `?room_code=string&status=active|consumed` | `{items:FoodItem[],total:number}` |
| POST | `/api/foods` | room token | `CreateFoodDto` | `FoodItem`, 201 |
| PATCH | `/api/foods/:id` | owning room token | `UpdateFoodDto` | `FoodItem` |
| PATCH | `/api/foods/:id/consume` | owning room token | `{add_to_shopping_list?:boolean,consumed_by?:string}` | `FoodItem`; actor server-derived, repeat must not duplicate shopping |
| POST | `/api/foods/consume-batch` | owning room token | `{food_ids:string[],idempotency_key:string,add_to_shopping_list?:boolean}` | `{items:FoodItem[],consumed_at:string}`; atomic/replay-safe |
| DELETE | `/api/foods/:id` | owning room token | none | `{success:true,deleted_id:string}` |
| POST | `/api/ai/parse-voice` | room token | `{transcript:string}` | `{parsed:ParsedFoodItem,confidence:number,source:"gemini-3.1-flash-lite"|"heuristic"}` |
| POST | `/api/ai/suggest-recipes` | room token | `{room_code:string,preference?:string}` | `{suggestions:RecipeSuggestion[],generated_at:string,source:"gemini-3.1-flash-lite"|"heuristic"}` |
| GET | `/api/shopping-items` | room token | `?room_code=string` | `{items:ShoppingItem[],total:number}` |
| POST | `/api/shopping-items` | room token | `{room_code:string,name:string,quantity?:string}` | `ShoppingItem`, 201 |
| PATCH | `/api/shopping-items/:id/toggle` | owning room token | `{is_bought:boolean,move_to_fridge?:boolean,compartment?:CompartmentType}` | `ShoppingItem`; move inserts exactly one food, default 3 days; false cannot move |
| DELETE | `/api/shopping-items/:id` | owning room token | none | `{success:true,deleted_id:string}` |
| GET | `/api/realtime-token` | room token | none | `{token:string,expires_at:string}`; short-lived room-scoped Supabase JWT, otherwise 503 |
| GET | `/api/notifications/config` | room token | none | `{enabled:boolean,public_key:string|null}` |
| POST | `/api/notifications/subscribe` | room token | `{room_code:string,subscription:{endpoint:string,keys:{auth:string,p256dh:string}},device_name?:string}` | `{success:true,subscriber_id:string}` |
| DELETE | `/api/notifications/subscribe` | room token | `{endpoint:string}` | `{success:true}` for that room only |
| GET | `/api/cron/expiry` | CRON_SECRET bearer | none | `{success:boolean,sent:number,skipped:number,failed:number,pending:number}`; local-date dedup; sent means provider accepted |
| POST | `/api/photos` | room token | `{image_base64:string,mime_type:"image/jpeg"|"image/png"|"image/webp"}`; optional `Idempotency-Key` header | `{photo_url:string,storage_path:string}`, 201; decoded bytes <=102400 |
| DELETE | `/api/photos` | room token | `{storage_path:string}` | `{success:true}`; owning room, unreferenced staged photo only |

## Shapes

```typescript
type CompartmentType = "FREEZER" | "FRIDGE_TOP" | "FRIDGE_BOTTOM" | "CRISPER" | "DOOR";
type FoodStatusType = "FRESH" | "COOK_SOON" | "EXPIRED" | "CONSUMED";
interface Room { id:string; code:string; name:string; created_at:string }
interface RoomDetail extends Room { active_food_count:number; urgent_food_count:number }
interface GoogleProfile { sub:string; name:string; email:string; picture?:string }
interface SessionPayload { room_code:string; nickname:string; exp:number; google_profile?:GoogleProfile }
interface AuthSession { room:Room; token:string; nickname:string; google_profile?:GoogleProfile }
interface FoodItem {
  id:string; room_code:string; name:string; quantity?:string; compartment:CompartmentType;
  container_tag?:string; added_date:string; expiry_date:string; days_remaining:number;
  status:FoodStatusType; photo_url?:string|null; storage_path?:string|null; notes?:string|null;
  created_by?:string; consumed_by?:string|null; consumed_at?:string|null;
}
interface CreateFoodDto {
  room_code:string; name:string; quantity?:string; compartment:CompartmentType;
  container_tag?:string; shelf_life_days:number; photo_url?:string|null;
  storage_path?:string|null; notes?:string|null; created_by?:string;
}
interface UpdateFoodDto {
  name?:string; quantity?:string; compartment?:CompartmentType; container_tag?:string;
  expiry_date?:string; notes?:string|null; photo_url?:string|null; storage_path?:string|null;
}
interface ParsedFoodItem {
  name:string; quantity?:string; compartment:CompartmentType;
  container_tag?:string; shelf_life_days:number;
}
interface RecipeSuggestion {
  id:string; title:string; cook_time_minutes:number; food_ids:string[];
  ingredients_used:string[]; ingredients_missing:string[]; instructions:string[];
}
interface ShoppingItem {
  id:string; room_code:string; name:string; quantity?:string; is_bought:boolean; created_at:string;
}
```

Bounds: room code exactly six digits; passcode four to six digits. Nonempty food/shopping name <=200 chars, room name/nickname <=100, quantity/tag <=200, notes/preference/transcript <=2000. shelf_life_days integer 0..365, where 0 expires now, never defaults to 3. Actor fields accepted for compatibility but ignored in favor of verified session.

Batch consume accepts 1..50 unique food IDs and an idempotency key of 1..200 characters. Reject duplicate IDs or requests above the bound before locking/writing; replay requires the same canonical IDs and options.

Google identity supplements PIN membership and cannot grant a room itself. Use GOOGLE_CLIENT_ID server configuration and verified identity tokens; only the public client ID is exposed. Session stores must retain verified profile on create/join and reload.

C-026 nickname correction: PATCH /api/auth/session requires the existing valid room token and room membership, accepts only a nonempty nickname <=100 characters, and returns the standard AuthSession with a newly signed token retaining the original expiry and Google profile. It cannot alter room membership or extend the session lifetime. The client atomically replaces the matching current session and rejects late responses after logout/room changes; Settings reports success only after the server accepts. Subsequent food actors use the new verified nickname. Previously issued tokens retain their existing validity/expiry; this endpoint does not claim global token revocation.

## Architecture and acceptance

Production requires PostgreSQL DATABASE_URL with pooled repository/transactions; no RAM fallback. Test adapters explicit and impossible on production. Private room-scoped DB policies, no anonymous table writes. Shared rate limits and idempotency state across workers. Migration must preserve data and be repeatable.

Photo rows reference owned storage paths; signed photo URLs refresh on read. Client compresses measured bytes; server validates MIME/signature/size. AI never selects EXPIRED/CONSUMED inventory, validates all food_ids, applies cooking atomically. Provider timeout or missing configuration yields explicit source/failure, never fabricated success.

C-025 photo amendment before implementation: optional upload Idempotency-Key contains 1..200 characters. A room-scoped key replays the same storage path only for matching decoded SHA-256 and MIME; changed content returns 409, and deleted uploads cannot be resurrected by replay. Accept strict base64, validated JPEG/PNG/WebP signatures and complete bounded single-frame decoding; both image dimensions must be <=1280 and decoded input bytes <=102400. Client measures the resulting Blob and scales/encodes until it meets those limits. Register a server-generated path under the room ID before remote upload; keep bounded, fenced upload attempts and verify existing object integrity after uncertain uploads. Use a private bucket and server credentials only. Serialize food attachment/replacement/deletion and cleanup claims on the room asset lock; cleanup cannot race a newly committed attachment. Provider I/O stays outside SQL transactions; failed or uncertain deletes remain tracked and retry through the Storage API. Owned storage_path is authoritative. Ignore compatibility photo_url input only alongside a valid owned path; reject new arbitrary external/data URL references. Preserve legacy DB fields and provide a resumable dry-run-first backfill; failed migrations never discard original image bytes. Generate signed URLs in batches on read with five-minute validity and never persist signed URLs in food rows. When signing fails, retain storage_path and return null photo_url so the UI can show an unavailable-photo placeholder while inventory remains readable. Invoke bounded cleanup from the existing authenticated cron and provide an operator cleanup script; photo cleanup does not alter push delivery counters.

Realtime credentials are room-scoped, short-lived and checked by RLS; configuration absent means unavailable/degraded polling, no <500ms claim. On reconnect fetch full authoritative snapshots including empty and history. Offline reads may be stale; mutations require server success unless a tested outbox exists. No room recreation or cache snapshot POST replay.

C-021 internal synchronization amendment: maintain `room_sync_versions` with room_code, monotonic revision and changed_at. Owner-controlled triggers update the revision inside every food/shopping mutation transaction, including deletes. Realtime subscribes to room-scoped INSERT/UPDATE invalidations on this table and reloads the authoritative snapshot; it does not depend on DELETE payload filtering. Revoke client writes and apply signed-room-claim SELECT RLS to the revision table. No public API response shape changes. Preserve the existing data tables and provide a repeatable migration.

C-024 notification amendment before implementation: room mutations may include optional `X-Push-Subscriber-Id`, the opaque ID returned by subscription registration. Validate that it belongs to the authenticated room before excluding only that device from roommate-change delivery; it never substitutes for the room token. Store device identity per room and clear it across logout/room changes. Mutation data and private notification outbox entries commit atomically; batch cooking and replay create at most one event for an operation. Version subscriptions so expired-endpoint cleanup cannot delete a newly renewed registration. Delivery records have unique event/recipient identity, bounded leases, attempt ownership and durable retries. No client grants on outbox/delivery tables. A provider 2xx confirms acceptance only; actual receipt needs device evidence. A process failure after provider acceptance but before recording it can cause redelivery; stable event IDs, notification tags and provider topics reduce visible duplicates without promising exactly-once delivery. Cron success reflects the dispatch result, pending counts retryable queued deliveries, and sent counts accepted deliveries. Expiry events use the Asia/Ho_Chi_Minh calendar day and are not created before 16:30; Vercel schedule is 09:30 UTC, with production-only execution and plan precision verified at live acceptance.

F1/F2/F3/F4 map to foods CRUD/edit/consume and expiry. F5 maps to room/realtime/persistence. F6 maps to photos/storage. F7 maps to parse-voice. F8 maps to suggestions/consume-batch. F9 maps to notifications/cron/worker with 16:30 Asia/Ho_Chi_Minh. F10 maps to shopping CRUD/move. Every provider/live gate needs actual provider/deployed evidence; local fixtures never close those gates.
