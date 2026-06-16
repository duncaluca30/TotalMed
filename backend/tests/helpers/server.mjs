// Starts the REAL app (createServer from src/app.js) on an ephemeral port so the
// socket/HTTP integration tests exercise production wiring (CSRF, io bridge, etc.).
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

export async function startAppServer() {
  const createServer = require('../../src/app');
  const { app, server, io } = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { app, server, io, port, baseURL: `http://127.0.0.1:${port}` };
}
