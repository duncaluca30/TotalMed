// Doctor record-write path over HTTP + the patient's real-time vault-updated event.
// This is the most sensitive write in the app, so its auth guards are covered end-to-end.
import crypto from 'crypto';
import { io as ioClient } from 'socket.io-client';
import { startAppServer } from '../helpers/server.mjs';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export async function run({ app, t }) {
  const { prisma, jwt, cipher, revocations } = app;
  const srv = await startAppServer();
  const sockets = [];

  const csrf = crypto.randomBytes(16).toString('hex');
  const postRecord = (userId, body) => fetch(`${srv.baseURL}/api/doctor/records`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrf,
      Cookie: `token=${jwt.sign({ id: userId, role: 'DOCTOR' }, process.env.JWT_SECRET, { expiresIn: '1d' })}; csrf-token=${csrf}`,
    },
    body: JSON.stringify(body),
  });
  const connectPatient = (userId) => {
    const s = ioClient(srv.baseURL, {
      extraHeaders: { Cookie: `token=${jwt.sign({ id: userId, role: 'PATIENT' }, process.env.JWT_SECRET, { expiresIn: '1d' })}` },
      transports: ['websocket'], reconnection: false,
    });
    sockets.push(s);
    return s;
  };
  const connected = (s) => new Promise((res, rej) => { s.once('connect', res); s.once('connect_error', rej); });

  try {
    const pUser = await prisma.user.create({ data: { email: 'rp@t.com', password: 'x', role: 'PATIENT', patientProfile: { create: { firstName: 'R', lastName: 'P', dateOfBirth: new Date('1990-01-01') } } }, include: { patientProfile: true } });
    const dUser = await prisma.user.create({ data: { email: 'rd@t.com', password: 'x', role: 'DOCTOR', doctorProfile: { create: { firstName: 'R', lastName: 'Doc', specialty: 'X', licenseNumber: 'LIC-R' } } }, include: { doctorProfile: true } });
    const patientId = pUser.patientProfile.id;
    const doctorId = dUser.doctorProfile.id;

    const pSock = connectPatient(pUser.id);
    await connected(pSock);
    pSock.emit('join-secure-room');
    await delay(150);

    const validToken = jwt.sign({ patientId, doctorId }, process.env.JWT_SECRET, { expiresIn: '15m' });

    t.section('Happy path: doctor adds a record');
    const gotEvent = new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error('no vault-updated')), 4000); pSock.once('vault-updated', (d) => { clearTimeout(tm); res(d); }); });
    let r = await postRecord(dUser.id, { patientId, vaultToken: validToken, diagnosis: 'Hypertension', treatment: 'Meds', notes: 'Confidential' });
    t.ok(r.status === 200, 'valid vault token → record added (200)');
    const evt = await gotEvent;
    t.ok(evt.newRecord?.diagnosis === 'Hypertension', 'patient receives vault-updated with the DECRYPTED diagnosis');
    t.ok(evt.newRecord?.doctor?.lastName === 'Doc', 'vault-updated names the attending doctor');
    const raw = await prisma.medicalRecord.findFirst({ where: { patientId } });
    t.ok(raw.diagnosis !== 'Hypertension' && cipher.decrypt(raw.diagnosis) === 'Hypertension', 'the record is encrypted at rest in the DB');

    t.section('Vault token guards');
    r = await postRecord(dUser.id, { patientId: crypto.randomUUID(), vaultToken: validToken, diagnosis: 'X' });
    t.ok(r.status === 403, 'patientId not matching the vault token → 403');
    const expired = jwt.sign({ patientId, doctorId }, process.env.JWT_SECRET, { expiresIn: '-1s' });
    r = await postRecord(dUser.id, { patientId, vaultToken: expired, diagnosis: 'X' });
    t.ok(r.status === 403, 'expired vault token → 403');

    t.section('Revoked session (end-to-end over HTTP)');
    const freshToken = jwt.sign({ patientId, doctorId }, process.env.JWT_SECRET, { expiresIn: '15m' });
    revocations.revokeVaultAccess(patientId);
    r = await postRecord(dUser.id, { patientId, vaultToken: freshToken, diagnosis: 'AfterRevoke' });
    t.ok(r.status === 403 && /revoked/i.test((await r.json()).error || ''), 'a revoked session is rejected at /records');

    t.section('Role + validation');
    const pCsrf = crypto.randomBytes(16).toString('hex');
    r = await fetch(`${srv.baseURL}/api/doctor/records`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': pCsrf, Cookie: `token=${jwt.sign({ id: pUser.id, role: 'PATIENT' }, process.env.JWT_SECRET, { expiresIn: '1d' })}; csrf-token=${pCsrf}` }, body: JSON.stringify({ patientId, vaultToken: validToken, diagnosis: 'X' }) });
    t.ok(r.status === 403, 'patient token on /records → 403');
    r = await postRecord(dUser.id, { patientId, vaultToken: validToken });
    t.ok(r.status === 400, 'missing diagnosis → 400 (validation)');

    t.section('Single active session (second login kicks the first)');
    const replaced = new Promise((res) => pSock.once('session-replaced', () => res(true)));
    const pSock2 = connectPatient(pUser.id);
    await connected(pSock2);
    pSock2.emit('join-secure-room');
    t.ok(await Promise.race([replaced, delay(2500).then(() => false)]), 'a second session for the same patient kicks the first (session-replaced)');
  } finally {
    sockets.forEach((s) => s.disconnect());
    await new Promise((res) => srv.server.close(res));
  }
}
