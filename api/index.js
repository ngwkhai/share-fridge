import { sendError } from '../server/http.js';
import { handleApiRequest } from '../server/apiHandler.js';

export function createServerlessHandler(api = handleApiRequest) {
  return async function handler(req, res) {
    try {
      const handled = await api(req, res);
      if (!handled) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Endpoint not found', code: 'NOT_FOUND' }));
      }
    } catch (err) {
      sendError(res, err);
    }
  };
}

export default createServerlessHandler();
