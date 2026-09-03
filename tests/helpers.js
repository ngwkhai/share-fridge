import { createMemoryRepository } from '../server/repository.js';
import { createApiHandler } from '../server/apiHandler.js';
// Tests explicitly inject an empty in-memory adapter. Runtime never selects it
// from a missing DATABASE_URL or environment flag, and it refuses production.
export const db = createMemoryRepository();
export const handleApiRequest = createApiHandler(db);
