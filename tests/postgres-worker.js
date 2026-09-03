import http from 'node:http';
import { createPostgresRepository } from '../server/repository.js';
import { createApiHandler } from '../server/apiHandler.js';

const repository = createPostgresRepository();
// This harness verifies durable persistence, not real push delivery: report push as
// enabled (so /api/notifications/subscribe accepts real subscriptions and persists
// them) but never dispatch, so mutation-triggered notifications never hit a live
// provider with the test's fixture endpoints.
const push = {
  async config() { return { enabled: true, public_key: 'test-fixture-public-key' }; },
  async dispatch() { return { success: true, sent: 0, skipped: 0, failed: 0, pending: 0 }; },
  async cron(db) { return this.dispatch(db); },
};
const api = createApiHandler(repository, { push });
const server = http.createServer(async (req,res) => {
  if (!(await api(req,res))) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint not found', code: 'NOT_FOUND' }));
  }
});
server.listen(0,'127.0.0.1', () => console.log(JSON.stringify({ port: server.address().port })));
process.on('SIGTERM', () => server.close(async () => { await repository.close(); process.exit(0); }));
