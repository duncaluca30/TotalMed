// HTTP middleware security: auth (JWT), CSRF double-submit, role enforcement,
// and validation → 400. Runs against the real server wiring.
import crypto from 'crypto';
import { startAppServer } from '../helpers/server.mjs';

export async function run({ app, t }) {
  const { prisma, jwt } = app;
  const srv = await startAppServer();
  const base = srv.baseURL;
  const sign = (id, role) => jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '1d' });

  try {
    const pUser = await prisma.user.create({ data: { email: 'mp@t.com', password: 'x', role: 'PATIENT', patientProfile: { create: { firstName: 'M', lastName: 'P', dateOfBirth: new Date('1990-01-01') } } } });
    const dUser = await prisma.user.create({ data: { email: 'md@t.com', password: 'x', role: 'DOCTOR', doctorProfile: { create: { firstName: 'M', lastName: 'D', specialty: 'X', licenseNumber: 'LIC-M' } } } });

    t.section('Auth middleware (JWT)');
    let r = await fetch(`${base}/api/auth/me`);
    t.ok(r.status === 401, 'no token → 401');
    r = await fetch(`${base}/api/auth/me`, { headers: { Cookie: 'token=garbage.invalid.jwt' } });
    t.ok(r.status === 403, 'invalid token → 403');
    r = await fetch(`${base}/api/auth/me`, { headers: { Cookie: `token=${sign(pUser.id, 'PATIENT')}` } });
    t.ok(r.status === 200 && (await r.json()).role === 'PATIENT', 'valid cookie token → 200 with role');
    r = await fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${sign(pUser.id, 'PATIENT')}` } });
    t.ok(r.status === 200, 'valid Bearer token (Authorization header) also authenticates');

    t.section('CSRF middleware (double-submit cookie)');
    const authCookie = `token=${sign(pUser.id, 'PATIENT')}`;
    r = await fetch(`${base}/api/patient/generate-code`, { method: 'POST', headers: { Cookie: authCookie } });
    t.ok(r.status === 403, 'non-exempt POST without CSRF token → 403');
    t.ok(/csrf/i.test((await r.json()).error || ''), 'rejection message mentions CSRF');
    r = await fetch(`${base}/api/patient/generate-code`, { method: 'POST', headers: { Cookie: `${authCookie}; csrf-token=aaaa`, 'X-CSRF-Token': 'bbbb' } });
    t.ok(r.status === 403, 'mismatched CSRF cookie/header → 403');
    const csrf = crypto.randomBytes(16).toString('hex');
    r = await fetch(`${base}/api/patient/generate-code`, { method: 'POST', headers: { Cookie: `${authCookie}; csrf-token=${csrf}`, 'X-CSRF-Token': csrf } });
    t.ok(r.status === 200, 'matching CSRF cookie + header → request proceeds');
    r = await fetch(`${base}/api/auth/logout`, { method: 'POST' });
    t.ok(r.status !== 403, 'exempt route (/logout) is not blocked by CSRF');

    t.section('Role enforcement');
    r = await fetch(`${base}/api/doctor/dashboard`, { headers: { Cookie: `token=${sign(pUser.id, 'PATIENT')}` } });
    t.ok(r.status === 403, 'patient token on /doctor/dashboard → 403');
    r = await fetch(`${base}/api/patient/dashboard`, { headers: { Cookie: `token=${sign(dUser.id, 'DOCTOR')}` } });
    t.ok(r.status === 403, 'doctor token on /patient/dashboard → 403');
    // The dashboard payload query joins multiple sibling relations, which PGlite-over-
    // socket can't execute (real Postgres can). The role check runs BEFORE that query,
    // so here we assert the security property: the correct role is admitted past the gate.
    r = await fetch(`${base}/api/doctor/dashboard`, { headers: { Cookie: `token=${sign(dUser.id, 'DOCTOR')}` } });
    t.ok(r.status !== 401 && r.status !== 403, 'doctor token is admitted past the role gate on /doctor/dashboard');
    r = await fetch(`${base}/api/patient/dashboard`, { headers: { Cookie: `token=${sign(pUser.id, 'PATIENT')}` } });
    t.ok(r.status !== 401 && r.status !== 403, 'patient token is admitted past the role gate on /patient/dashboard');

    t.section('Validation → 400 (Zod .issues fix, end-to-end over HTTP)');
    r = await fetch(`${base}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'bad', password: 'weak', firstName: '', lastName: '', dateOfBirth: '1990-01-01', phone: '1' }) });
    const vBody = await r.json();
    t.ok(r.status === 400, 'invalid registration → 400 (not 500)');
    t.ok(Array.isArray(vBody.details) && vBody.details.length > 0, 'response includes field-level validation details');
  } finally {
    await new Promise((res) => srv.server.close(res));
  }
}
