import http from 'node:http';
import { createPostgresRepository } from '../server/repository.js';
import { createApiHandler } from '../server/apiHandler.js';

const repository = createPostgresRepository();
const api = createApiHandler(repository);
const server = http.createServer(async (req,res) => {
  if (!(await api(req,res))) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint not found', code: 'NOT_FOUND' }));
  }
});
server.listen(0,'127.0.0.1', () => console.log(JSON.stringify({ port: server.address().port })));
process.on('SIGTERM', () => server.close(async () => { await repository.close(); process.exit(0); }));
