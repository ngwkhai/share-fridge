import { HttpError } from './http.js';

export const compartments = ['FREEZER','FRIDGE_TOP','FRIDGE_BOTTOM','CRISPER','DOOR'];
export function invalid(message) { throw new HttpError(400, 'INVALID_INPUT', message); }
export function text(value, label, maximum, { optional = false, nullable = false, empty = false } = {}) {
  if (optional && value === undefined) return undefined;
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || value.length > maximum || (!empty && !value.trim())) invalid(`${label} must be ${empty ? 'at most' : '1 to'} ${maximum} characters.`);
  return value.trim();
}
export function boolean(value, label, fallback) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'boolean') invalid(`${label} must be a boolean.`);
  return value;
}
export function compartment(value) {
  if (!compartments.includes(value)) invalid('compartment is not supported.');
  return value;
}
export function fields(data, allowed) {
  if (Object.keys(data).some(key => !allowed.includes(key))) invalid('Request contains unsupported fields.');
}
export function foodDto(data, update = false) {
  const editable = ['name','quantity','compartment','container_tag','expiry_date','notes','photo_url','storage_path'];
  fields(data, update ? editable : [...editable.filter(key => key !== 'expiry_date'),'room_code','shelf_life_days','created_by']);
  const result = {};
  if (!update && data.created_by !== undefined && typeof data.created_by !== 'string') invalid('created_by must be a string.');
  if (!update || data.name !== undefined) result.name = text(data.name, 'name', 200);
  if (!update || data.compartment !== undefined) result.compartment = compartment(data.compartment);
  for (const key of ['quantity','container_tag']) if (data[key] !== undefined) result[key] = text(data[key], key, 200, { empty: true });
  for (const key of ['notes','photo_url','storage_path']) if (data[key] !== undefined) result[key] = text(data[key], key, key === 'notes' ? 2000 : 8192, { nullable: true, empty: true });
  if (!update) {
    if (!Number.isInteger(data.shelf_life_days) || data.shelf_life_days < 0 || data.shelf_life_days > 365) invalid('shelf_life_days must be an integer from 0 to 365.');
    result.shelf_life_days = data.shelf_life_days;
  }
  if (data.expiry_date !== undefined) {
    const value = data.expiry_date;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().replace('.000Z','Z') !== value.replace('.000Z','Z')) invalid('expiry_date must be a valid ISO UTC timestamp.');
    result.expiry_date = new Date(value).toISOString();
  }
  if (update && Object.keys(result).length === 0) invalid('At least one editable field is required.');
  return result;
}

export function subscriptionDto(data) {
  fields(data, ['room_code','subscription','device_name']);
  const subscription = data.subscription;
  if (!subscription || typeof subscription !== 'object' || Array.isArray(subscription)) invalid('subscription must be an object.');
  // PushSubscription.toJSON may include expirationTime; it is not persisted.
  const endpoint = text(subscription.endpoint, 'subscription.endpoint', 8192);
  let parsed;
  try { parsed = new URL(endpoint); } catch { invalid('subscription.endpoint must be an HTTPS URL.'); }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) invalid('subscription.endpoint must be an HTTPS URL.');
  const keys = subscription.keys;
  if (!keys || typeof keys !== 'object' || Array.isArray(keys)) invalid('subscription.keys must be an object.');
  const auth = text(keys.auth, 'subscription.keys.auth', 4096);
  const p256dh = text(keys.p256dh, 'subscription.keys.p256dh', 4096);
  return { subscription: { endpoint, keys: { auth, p256dh } }, device_name: text(data.device_name, 'device_name', 100, { optional: true, empty: true }) };
}
