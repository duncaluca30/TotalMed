// Test runner: sets up one in-memory DB, then runs every test group against the
// real app code. Run with `npm test` from the backend/ directory.
import { startTestDb, loadApp, reset, makeTester } from './setup.mjs';
import * as encryption from './groups/encryption.mjs';
import * as consent from './groups/consent.mjs';
import * as auth from './groups/auth.mjs';
import * as validation from './groups/validation.mjs';
import * as scenario from './groups/scenario.mjs';
import * as socket from './groups/socket.mjs';
import * as records from './groups/records.mjs';
import * as middleware from './groups/middleware.mjs';
import * as ratelimit from './groups/ratelimit.mjs';

const groups = [
  ['Encryption & tamper detection', encryption],
  ['Consent & data isolation', consent],
  ['2FA & auth at rest', auth],
  ['Validation & regression', validation],
  ['Concurrent access & revoke', scenario],
  ['Real-time consent over Socket.IO', socket],
  ['Doctor record-write path', records],
  ['HTTP middleware security', middleware],
  ['Rate limiters', ratelimit], // must stay LAST (exhausts the shared login limiter)
];

const t = makeTester();
const { db, server } = await startTestDb();
const app = loadApp();

try {
  for (const [name, group] of groups) {
    console.log(`\n████ ${name} ████`);
    await reset(app.prisma);
    await group.run({ app, t });
  }
  console.log(`\n════════ TOTAL: ${t.pass} passed, ${t.fail} failed ════════`);
} catch (err) {
  console.error('\n🚨 RUNNER ERROR:', err);
  t.fail++;
} finally {
  await server.stop();
  await db.close();
  process.exit(t.fail === 0 ? 0 : 1);
}
