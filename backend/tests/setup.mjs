// Shared test harness: in-memory PGlite Postgres + the real app modules.
// Never touches the production Neon DB.
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { execSync } from 'child_process';
import { createRequire } from 'module';
import crypto from 'crypto';

const require = createRequire(import.meta.url);

export async function startTestDb({ port = 5544 } = {}) {
  // Generate the schema from prisma/schema.prisma so the test can't drift from it.
  const ddl = execSync('npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script', { encoding: 'utf8' });
  const db = await PGlite.create();
  await db.exec(ddl);
  const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1' });
  await server.start();

  process.env.DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`;
  process.env.MASTER_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
  process.env.JWT_SECRET = 'test-secret';

  // Stub ONLY the external calls (Brevo mailer, geo-IP). Everything else —
  // including real HTTP to our own test server in the socket tests — passes through.
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('geojs.io')) return { ok: true, json: async () => ({ city: 'Testville', country: 'TestLand' }) };
    if (u.includes('api.brevo.com')) return { ok: true, json: async () => ({ messageId: 'test' }) };
    return realFetch(url, opts);
  };

  // A stray rejection should never abort the whole test run.
  process.on('unhandledRejection', (reason) => console.error('⚠️  unhandledRejection in test:', reason));

  return { db, server };
}

// Loaded lazily (after env is set) so cipher/prisma pick up the test config.
export function loadApp() {
  return {
    prisma: require('../src/config/prisma'),
    cipher: require('../utils/cipher'),
    vault: require('../src/services/vault.service'),
    auth: require('../src/services/auth.service'),
    revocations: require('../src/services/vaultRevocations'),
    schemas: {
      auth: require('../src/schemas/auth.schema'),
      doctor: require('../src/schemas/doctor.schema'),
      vault: require('../src/schemas/vault.schema'),
    },
    jwt: require('jsonwebtoken'),
    bcrypt: require('bcrypt'),
    otplib: require('otplib'),
  };
}

export async function reset(prisma) {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "AuditLog","AccessCode","MedicalRecord","Appointment","Passkey","Patient","Doctor","User" RESTART IDENTITY CASCADE'
  );
}

export function makeTester() {
  return {
    pass: 0,
    fail: 0,
    ok(cond, msg) {
      cond ? (this.pass++, console.log(`  ✅ ${msg}`)) : (this.fail++, console.log(`  ❌ ${msg}`));
    },
    async throws(fn, msg) {
      try { await fn(); this.fail++; console.log(`  ❌ ${msg} (expected an error, got none)`); }
      catch { this.pass++; console.log(`  ✅ ${msg}`); }
    },
    section(s) { console.log(`\n  — ${s} —`); },
  };
}
