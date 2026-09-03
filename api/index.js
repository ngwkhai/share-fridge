import { sendError } from '../server/http.js';
import { handleApiRequest } from '../server/apiHandler.js';

export default async function handler(req, res) {
  try {
    const handled = await handleApiRequest(req, res);
    if (!handled) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Endpoint not found', code: 'NOT_FOUND' }));
    }
  } catch (err) {
    sendError(res, err);
  }
}
