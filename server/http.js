export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function sendError(res, error) {
  const safe = error instanceof HttpError;
  res.writeHead(safe ? error.status : 500, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    error: safe ? error.message : 'Internal server error',
    code: safe ? error.code : 'INTERNAL_ERROR',
  }));
}

// Vercel may consume the stream before invoking the handler. Both entry points
// must apply identical validation, rather than waiting forever for a second end.
export async function readJsonBody(req) {
  const limit = 1024 * 1024;
  let body = req.body;
  if (body === undefined) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > limit) throw new HttpError(413, 'BODY_TOO_LARGE', 'Request body is too large.');
      chunks.push(bytes);
    }
    body = Buffer.concat(chunks).toString('utf8');
  }
  try {
    const serialized = typeof body === 'string' || Buffer.isBuffer(body) ? body.toString() : JSON.stringify(body);
    if (Buffer.byteLength(serialized ?? '') > limit) throw new HttpError(413, 'BODY_TOO_LARGE', 'Request body is too large.');
    const value = serialized ? JSON.parse(serialized) : {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected object');
    return value;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'INVALID_JSON', 'Request body must be a JSON object.');
  }
}
