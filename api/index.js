import { handleApiRequest } from '../server/apiHandler.js';

export default async function handler(req, res) {
  try {
    const handled = await handleApiRequest(req, res);
    if (!handled) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Endpoint not found' }));
    }
  } catch (err) {
    console.error('Serverless execution error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error', details: err.message }));
  }
}
