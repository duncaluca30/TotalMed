// Rate limiters. NOTE: express-rate-limit instances are module-level singletons,
// so their in-memory counters are shared across every app built in this process.
// This group must run LAST, since it deliberately exhausts the login limiter.
import { startAppServer } from '../helpers/server.mjs';

export async function run({ app, t }) {
  const srv = await startAppServer();
  const base = srv.baseURL;

  try {
    t.section('Auth limiter (max 20 / 15 min on /login)');
    const login = async () => (await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@t.com', password: 'whatever' }),
    })).status;

    let loginLimited = false;
    for (let i = 0; i < 30; i++) {
      if (await login() === 429) { loginLimited = true; break; }
    }
    t.ok(loginLimited, '/login returns 429 once the threshold is exceeded');

    t.section('2FA limiter (max 10 / 15 min on /2fa/validate)');
    const validate2fa = async () => (await fetch(`${base}/api/auth/2fa/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'nobody', token: '000000', method: 'EMAIL' }),
    })).status;

    let twoFaLimited = false;
    for (let i = 0; i < 20; i++) {
      if (await validate2fa() === 429) { twoFaLimited = true; break; }
    }
    t.ok(twoFaLimited, '/2fa/validate returns 429 once the threshold is exceeded');
  } finally {
    await new Promise((res) => srv.server.close(res));
  }
}
