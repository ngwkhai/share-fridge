// One source for the committed runtime contract. Run: npm run api:spec
import fs from 'node:fs';
const str = (maxLength, minLength = 0) => ({ type: 'string', ...(maxLength ? { maxLength, minLength } : {}) });
const ref = name => ({ $ref: `#/components/schemas/${name}` });
const object = (properties, required = Object.keys(properties), extra = {}) => ({ type: 'object', required, properties, ...extra });
const array = items => ({ type: 'array', items });
const date = { type: 'string', format: 'date-time' };
const bool = { type: 'boolean' };
const code = { type: 'string', pattern: '^[0-9]{6}$' };
const id = str();
const count = { type: 'integer', minimum: 0 };
const comp = { type: 'string', enum: ['FREEZER','FRIDGE_TOP','FRIDGE_BOTTOM','CRISPER','DOOR'] };
const nullable = schema => ({ ...schema, nullable: true });
const schemas = {
  Error: object({ error: str(), code: str() }),
  Health: object({ status: { enum: ['ok'], type: 'string' }, version: str(), timestamp: date }),
  Readiness: object({ status: { type: 'string', enum: ['ok','unavailable'] }, database: { type: 'string', enum: ['postgres','test','unavailable'] } }),
  PublicConfig: object({ google_client_id: nullable(str()), capabilities: object({ google: bool, push: bool, photos: bool, realtime: bool }) }),
  GoogleProfile: object({ sub: str(), name: str(), email: str(), picture: str() }, ['sub','name','email']),
  Room: object({ id, code, name: str(100,1), created_at: date }),
  RoomCreate: object({ code, name: str(100,1), passcode: { type: 'string', pattern: '^[0-9]{4,6}$', writeOnly: true }, nickname: str(100,1), google_identity_token: str() }, ['passcode']),
  RoomJoin: object({ code, passcode: { type: 'string', pattern: '^[0-9]{4,6}$', writeOnly: true }, nickname: str(100,1), google_identity_token: str() }, ['code','passcode']),
  SessionPayload: object({ room_code: code, nickname: str(100,1), exp: { type: 'integer', description: 'Expiry as Unix epoch milliseconds.' }, google_profile: ref('GoogleProfile') }, ['room_code','nickname','exp']),
  AuthSession: object({ room: ref('Room'), token: str(), nickname: str(100,1), google_profile: ref('GoogleProfile') }, ['room','token','nickname']),
  GoogleSession: object({ profile: ref('GoogleProfile'), identity_token: str(), expires_at: date }),
  FoodItem: object({ id, room_code: code, name: str(200,1), quantity: str(200), compartment: comp, container_tag: str(200), added_date: date, expiry_date: date, days_remaining: { type: 'integer' }, status: { type: 'string', enum: ['FRESH','COOK_SOON','EXPIRED','CONSUMED'] }, photo_url: nullable(str(8192)), storage_path: nullable(str(8192)), notes: nullable(str(2000)), created_by: str(), consumed_by: nullable(str()), consumed_at: nullable(date) }, ['id','room_code','name','compartment','added_date','expiry_date','days_remaining','status']),
  CreateFoodDto: object({ room_code: code, name: str(200,1), quantity: str(200), compartment: comp, container_tag: str(200), shelf_life_days: { type: 'integer', minimum: 0, maximum: 365 }, photo_url: nullable(str(8192)), storage_path: nullable(str(8192)), notes: nullable(str(2000)), created_by: { ...str(), description: 'Ignored; actor comes from the verified session.' } }, ['room_code','name','compartment','shelf_life_days'], { additionalProperties: false }),
  UpdateFoodDto: object({ name: str(200,1), quantity: str(200), compartment: comp, container_tag: str(200), expiry_date: date, notes: nullable(str(2000)), photo_url: nullable(str(8192)), storage_path: nullable(str(8192)) }, [], { minProperties: 1, additionalProperties: false }),
  ConsumeFoodDto: object({ add_to_shopping_list: bool, consumed_by: { ...str(), description: 'Ignored; actor comes from the verified session.' } }, [], { additionalProperties: false }),
  ConsumeBatchDto: object({ food_ids: { ...array(id), minItems: 1, uniqueItems: true }, idempotency_key: str(200,1), add_to_shopping_list: bool }, ['food_ids','idempotency_key']),
  ParsedFoodItem: object({ name: str(200,1), quantity: str(200), compartment: comp, container_tag: str(200), shelf_life_days: { type: 'integer', minimum: 0, maximum: 365 } }, ['name','compartment','shelf_life_days']),
  RecipeSuggestion: object({ id, title: str(), cook_time_minutes: { type: 'integer', minimum: 1 }, food_ids: array(id), ingredients_used: array(str()), ingredients_missing: array(str()), instructions: array(str()) }),
  ShoppingItem: object({ id, room_code: code, name: str(200,1), quantity: str(200), is_bought: bool, created_at: date }, ['id','room_code','name','is_bought','created_at']),
  CreateShoppingItemDto: object({ room_code: code, name: str(200,1), quantity: str(200) }, ['room_code','name'], { additionalProperties: false }),
  ToggleShoppingDto: object({ is_bought: bool, move_to_fridge: bool, compartment: comp }, ['is_bought'], { additionalProperties: false, description: 'move_to_fridge requires is_bought=true. Creates at most one food per shopping item across retries/uncheck/recheck, with three-day expiry and FRIDGE_TOP default.' }),
  Deleted: object({ success: { type: 'boolean', enum: [true] }, deleted_id: id }),
  Success: object({ success: { type: 'boolean', enum: [true] } }),
  RealtimeToken: object({ token: str(), expires_at: date }),
  NotificationConfig: object({ enabled: bool, public_key: nullable(str()) }),
  PushSubscription: object({ endpoint: { ...str(8192,1), format: 'uri', pattern: '^https://' }, keys: object({ auth: str(4096,1), p256dh: str(4096,1) }) }),
  SubscriptionRequest: object({ room_code: code, subscription: ref('PushSubscription'), device_name: str(100) }, ['room_code','subscription']),
  SubscriptionResult: object({ success: { type: 'boolean', enum: [true] }, subscriber_id: id }),
  CronResult: object({ success: { type: 'boolean', enum: [true] }, sent: count, skipped: count, failed: count }),
  PhotoRequest: object({ image_base64: str(), mime_type: { type: 'string', enum: ['image/jpeg','image/png','image/webp'] } }),
  PhotoResult: object({ photo_url: str(), storage_path: str() }),
};
schemas.RoomDetail = object({ ...schemas.Room.properties, active_food_count: count, urgent_food_count: count });
schemas.VerifiedSession = object({ valid: { type: 'boolean', enum: [true] }, payload: ref('SessionPayload'), room: ref('Room') });
schemas.InvalidSession = object({ valid: { type: 'boolean', enum: [false] }, ...schemas.Error.properties });
schemas.FoodList = object({ items: array(ref('FoodItem')), total: count });
schemas.ShoppingList = object({ items: array(ref('ShoppingItem')), total: count });
schemas.ConsumeBatchResult = object({ items: array(ref('FoodItem')), consumed_at: date });
const source = { type: 'string', enum: ['gemini-2.5-flash','heuristic'] };
schemas.ParseVoiceResult = object({ parsed: ref('ParsedFoodItem'), confidence: { type: 'number', minimum: 0, maximum: 1 }, source });
schemas.RecipeResult = object({ suggestions: array(ref('RecipeSuggestion')), generated_at: date, source });
const paths = {};
const json = schema => ({ 'application/json': { schema: typeof schema === 'string' ? ref(schema) : schema } });
function endpoint(method, path, output, { input, status = 200, auth = 'room', parameters = [], unavailable, summary } = {}) {
  const op = { summary: summary || `${method.toUpperCase()} ${path}`, security: auth === 'public' ? [] : [{ [auth === 'cron' ? 'CronBearer' : 'RoomBearer']: [] }], responses: { [status]: { description: 'Success', content: json(output) } } };
  for (const code of [400,401,403,404,409,413,429,500,503]) op.responses[code] = { description: {400:'Invalid input',401:'Invalid session/credentials',403:'Foreign room',404:'Missing item',409:'Conflict',413:'Oversized request',429:'Rate limited',500:'Internal error',503:'Service unavailable'}[code], content: json('Error') };
  if (input) op.requestBody = { required: true, content: json(input) };
  for (const name of [...path.matchAll(/\{(\w+)\}/g)].map(match => match[1])) parameters.push({ name, in: 'path', required: true, schema: name === 'code' ? code : id });
  if (parameters.length) op.parameters = parameters;
  if (unavailable) op['x-availability'] = unavailable;
  (paths[path] ||= {})[method] = op;
}
const query = (name, schema, required = true) => ({ name, in: 'query', required, schema });
endpoint('get','/healthz','Health',{auth:'public'});
endpoint('get','/readyz','Readiness',{auth:'public'});
paths['/readyz'].get.responses[503].content = json('Readiness');
endpoint('get','/api/openapi.json',{ type: 'object', required: ['openapi','info','paths','components'], properties: { openapi: str(), info: { type: 'object' }, paths: { type: 'object' }, components: { type: 'object' } } },{auth:'public'});
endpoint('get','/api/config','PublicConfig',{auth:'public'});
endpoint('post','/api/auth/create-room','AuthSession',{auth:'public',input:'RoomCreate',status:201});
endpoint('post','/api/auth/join-room','AuthSession',{auth:'public',input:'RoomJoin'});
endpoint('post','/api/auth/verify-token','VerifiedSession',{auth:'public',input:object({token:str()})});
paths['/api/auth/verify-token'].post.responses[401].content = json('InvalidSession');
endpoint('post','/api/auth/google','GoogleSession',{auth:'public',input:object({credential:str()}),unavailable:'C022: returns 503 until verified Google integration is implemented.'});
endpoint('post','/api/rooms','Room',{auth:'public',input:'RoomCreate',status:201});
endpoint('get','/api/rooms/{code}','RoomDetail');
endpoint('get','/api/foods','FoodList',{parameters:[query('room_code',code),query('status',{type:'string',enum:['active','consumed']},false)]});
endpoint('post','/api/foods','FoodItem',{input:'CreateFoodDto',status:201});
endpoint('patch','/api/foods/{id}','FoodItem',{input:'UpdateFoodDto'});
endpoint('patch','/api/foods/{id}/consume','FoodItem',{input:'ConsumeFoodDto'});
endpoint('post','/api/foods/consume-batch','ConsumeBatchResult',{input:'ConsumeBatchDto',unavailable:'C023: atomic batch integration returns 503 until implemented.'});
endpoint('delete','/api/foods/{id}','Deleted');
endpoint('post','/api/ai/parse-voice','ParseVoiceResult',{input:object({transcript:str(2000,1)})});
endpoint('post','/api/ai/suggest-recipes','RecipeResult',{input:object({room_code:code,preference:str(2000)},['room_code']),unavailable:'C023 owns recipe food_ids/source normalization; consumers reject incomplete responses.'});
endpoint('get','/api/shopping-items','ShoppingList',{parameters:[query('room_code',code)]});
endpoint('post','/api/shopping-items','ShoppingItem',{input:'CreateShoppingItemDto',status:201});
endpoint('patch','/api/shopping-items/{id}/toggle','ShoppingItem',{input:'ToggleShoppingDto'});
endpoint('delete','/api/shopping-items/{id}','Deleted');
endpoint('get','/api/realtime-token','RealtimeToken',{unavailable:'Requires migrated Supabase PostgreSQL and matching legacy HS256 project secret/anon JWT. Returns 503 otherwise; tokens expire within five minutes.',summary:'Issue a short-lived room-scoped authenticated Realtime JWT'});
endpoint('get','/api/notifications/config','NotificationConfig',{unavailable:'C024: returns 503 until Web Push is implemented.'});
endpoint('post','/api/notifications/subscribe','SubscriptionResult',{input:'SubscriptionRequest'});
endpoint('delete','/api/notifications/subscribe','Success',{input:object({endpoint:str()}),unavailable:'C024: returns 503 until unsubscribe is implemented.'});
endpoint('get','/api/cron/expiry','CronResult',{auth:'cron',unavailable:'C024: returns 503 until authenticated delivery is implemented.'});
endpoint('post','/api/photos','PhotoResult',{input:'PhotoRequest',status:201,unavailable:'C025: returns 503 until durable photo storage is implemented.'});
endpoint('delete','/api/photos','Success',{input:object({storage_path:str()}),unavailable:'C025: returns 503 until durable photo storage is implemented.'});
const spec = { openapi: '3.0.0', info: { title: 'ShareFridge API', version: '2.0.0', description: 'Room-authenticated remediation contract. x-availability marks future integrations; these must not be claimed ready.' }, paths, components: { schemas, securitySchemes: { RoomBearer: { type: 'http', scheme: 'bearer', description: 'Verified room session. Signature, expiry and room membership are checked.' }, CronBearer: { type: 'http', scheme: 'bearer', description: 'CRON_SECRET, never a room session.' } } } };
const serialized = `${JSON.stringify(spec,null,2)}\n`;
if (process.argv.includes('--stdout')) process.stdout.write(serialized);
else fs.writeFileSync(new URL('./openapi.json', import.meta.url), serialized);
