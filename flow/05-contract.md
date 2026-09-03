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
| POST | `/api/rooms` | public/rate-limit | same validated create fields, passcode required | `Room`, 201; legacy alias never overwrites password |
| GET | `/api/rooms/:code` | matching room token | none | `RoomDetail` |
| GET | `/api/foods` | room token | `?room_code=string&status=active|consumed` | `{items:FoodItem[],total:number}` |
| POST | `/api/foods` | room token | `CreateFoodDto` | `FoodItem`, 201 |
| PATCH | `/api/foods/:id` | owning room token | `UpdateFoodDto` | `FoodItem` |
| PATCH | `/api/foods/:id/consume` | owning room token | `{add_to_shopping_list?:boolean,consumed_by?:string}` | `FoodItem`; actor server-derived, repeat must not duplicate shopping |
| POST | `/api/foods/consume-batch` | owning room token | `{food_ids:string[],idempotency_key:string,add_to_shopping_list?:boolean}` | `{items:FoodItem[],consumed_at:string}`; atomic/replay-safe |
| DELETE | `/api/foods/:id` | owning room token | none | `{success:true,deleted_id:string}` |
| POST | `/api/ai/parse-voice` | room token | `{transcript:string}` | `{parsed:ParsedFoodItem,confidence:number,source:"gemini-2.5-flash"|"heuristic"}` |
| POST | `/api/ai/suggest-recipes` | room token | `{room_code:string,preference?:string}` | `{suggestions:RecipeSuggestion[],generated_at:string,source:"gemini-2.5-flash"|"heuristic"}` |
| GET | `/api/shopping-items` | room token | `?room_code=string` | `{items:ShoppingItem[],total:number}` |
| POST | `/api/shopping-items` | room token | `{room_code:string,name:string,quantity?:string}` | `ShoppingItem`, 201 |
| PATCH | `/api/shopping-items/:id/toggle` | owning room token | `{is_bought:boolean,move_to_fridge?:boolean,compartment?:CompartmentType}` | `ShoppingItem`; move inserts exactly one food, default 3 days; false cannot move |
| DELETE | `/api/shopping-items/:id` | owning room token | none | `{success:true,deleted_id:string}` |
| GET | `/api/realtime-token` | room token | none | `{token:string,expires_at:string}`; short-lived room-scoped Supabase JWT, otherwise 503 |
| GET | `/api/notifications/config` | room token | none | `{enabled:boolean,public_key:string|null}` |
| POST | `/api/notifications/subscribe` | room token | `{room_code:string,subscription:{endpoint:string,keys:{auth:string,p256dh:string}},device_name?:string}` | `{success:true,subscriber_id:string}` |
| DELETE | `/api/notifications/subscribe` | room token | `{endpoint:string}` | `{success:true}` for that room only |
| GET | `/api/cron/expiry` | CRON_SECRET bearer | none | `{success:true,sent:number,skipped:number,failed:number}`; local-date dedup |
| POST | `/api/photos` | room token | `{image_base64:string,mime_type:"image/jpeg"|"image/png"|"image/webp"}` | `{photo_url:string,storage_path:string}`, 201; decoded bytes <=102400 |
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

Google identity supplements PIN membership and cannot grant a room itself. Use GOOGLE_CLIENT_ID server configuration and verified identity tokens; only the public client ID is exposed. Session stores must retain verified profile on create/join and reload.

## Architecture and acceptance

Production requires PostgreSQL DATABASE_URL with pooled repository/transactions; no RAM fallback. Test adapters explicit and impossible on production. Private room-scoped DB policies, no anonymous table writes. Shared rate limits and idempotency state across workers. Migration must preserve data and be repeatable.

Photo rows reference owned storage paths; signed photo URLs refresh on read. Client compresses measured bytes; server validates MIME/signature/size. AI never selects EXPIRED/CONSUMED inventory, validates all food_ids, applies cooking atomically. Provider timeout or missing configuration yields explicit source/failure, never fabricated success.

Realtime credentials are room-scoped, short-lived and checked by RLS; configuration absent means unavailable/degraded polling, no <500ms claim. On reconnect fetch full authoritative snapshots including empty and history. Offline reads may be stale; mutations require server success unless a tested outbox exists. No room recreation or cache snapshot POST replay.

F1/F2/F3/F4 map to foods CRUD/edit/consume and expiry. F5 maps to room/realtime/persistence. F6 maps to photos/storage. F7 maps to parse-voice. F8 maps to suggestions/consume-batch. F9 maps to notifications/cron/worker with 16:30 Asia/Ho_Chi_Minh. F10 maps to shopping CRUD/move. Every provider/live gate needs actual provider/deployed evidence; local fixtures never close those gates.
