// End-to-end real-time consent flow over Socket.IO + HTTP, against the real
// server wiring. This is where the consent-bypass fix lives (handler.js).
import { io as ioClient } from 'socket.io-client';
import crypto from 'crypto';
import { startAppServer } from '../helpers/server.mjs';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export async function run({ app, t }) {
  const { prisma, vault, jwt } = app;
  const srv = await startAppServer();
  const sockets = [];

  const connect = (userId, role) => {
    const token = jwt.sign({ id: userId, role }, process.env.JWT_SECRET, { expiresIn: '1d' });
    const s = ioClient(srv.baseURL, {
      extraHeaders: { Cookie: `token=${token}` },
      transports: ['websocket'],
      reconnection: false,
    });
    sockets.push(s);
    return s;
  };
  const connected = (s) => new Promise((res, rej) => {
    s.once('connect', res);
    s.once('connect_error', rej);
  });
  const waitFor = (s, event, ms = 4000) => new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error(`timeout waiting for ${event}`)), ms);
    s.once(event, (d) => { clearTimeout(timer); res(d); });
  });

  // Doctor's HTTP call to /access-vault (held open until the patient responds).
  const accessVault = (doctorUserId, code) => {
    const token = jwt.sign({ id: doctorUserId, role: 'DOCTOR' }, process.env.JWT_SECRET, { expiresIn: '1d' });
    const csrf = crypto.randomBytes(16).toString('hex');
    return fetch(`${srv.baseURL}/api/doctor/access-vault`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrf,
        Cookie: `token=${token}; csrf-token=${csrf}`,
      },
      body: JSON.stringify({ code }),
    });
  };

  try {
    // Seed: patient (owner), doctor, and a second patient (the attacker)
    const pUser = await prisma.user.create({ data: { email: 'owner@s.com', password: 'x', role: 'PATIENT', patientProfile: { create: { firstName: 'Own', lastName: 'Er', dateOfBirth: new Date('1990-01-01') } } }, include: { patientProfile: true } });
    const dUser = await prisma.user.create({ data: { email: 'doc@s.com', password: 'x', role: 'DOCTOR', doctorProfile: { create: { firstName: 'Doc', lastName: 'Tor', specialty: 'Card', licenseNumber: 'LIC-S' } } }, include: { doctorProfile: true } });
    const aUser = await prisma.user.create({ data: { email: 'attacker@s.com', password: 'x', role: 'PATIENT', patientProfile: { create: { firstName: 'At', lastName: 'Tacker', dateOfBirth: new Date('1990-01-01') } } }, include: { patientProfile: true } });
    await vault.createEncryptedRecord({ diagnosis: 'Secret Dx', treatment: 'Tx', notes: null, patientId: pUser.patientProfile.id, doctorId: dUser.doctorProfile.id });

    // Sockets
    const patientSock = connect(pUser.id, 'PATIENT');
    const attackerSock = connect(aUser.id, 'PATIENT');
    const doctorSock = connect(dUser.id, 'DOCTOR');
    await Promise.all([connected(patientSock), connected(attackerSock), connected(doctorSock)]);
    t.ok(true, 'patient, attacker and doctor sockets all authenticate via JWT cookie');

    patientSock.emit('join-secure-room');
    await delay(150); // let the room join settle

    // ---- Happy path ----
    t.section('Happy path: real patient approves');
    const code1 = (await vault.generateAccessCode(pUser.patientProfile.id)).code;
    const req1 = accessVault(dUser.id, code1);
    const authReq = await waitFor(patientSock, 'auth-request');
    t.ok(authReq && authReq.code === code1, 'patient receives the auth-request for the right code');

    const recId = (await prisma.medicalRecord.findFirst({ where: { patientId: pUser.patientProfile.id } })).id;
    patientSock.emit('auth-response', { code: code1, approved: true, sharedRecordIds: [recId] });
    const res1 = await req1;
    const body1 = await res1.json();
    t.ok(res1.status === 200 && !!body1.vaultToken, 'doctor receives a vault token after genuine approval');
    t.ok(body1.patient?.medicalRecords?.length === 1, 'doctor sees exactly the 1 shared record');
    t.ok((await vault.lookupAccessCode(code1)) === null, 'the code is consumed after approval');

    // ---- Consent bypass attempts ----
    t.section('Security: forged approvals are rejected');
    const code2 = (await vault.generateAccessCode(pUser.patientProfile.id)).code;
    const req2 = accessVault(dUser.id, code2);
    await waitFor(patientSock, 'auth-request'); // ensure the request is registered

    // Attacker #1: a DIFFERENT patient tries to approve on the owner's behalf
    attackerSock.emit('auth-response', { code: code2, approved: true, sharedRecordIds: [] });
    // Attacker #2: the doctor tries to approve their own request
    doctorSock.emit('auth-response', { code: code2, approved: true, sharedRecordIds: [] });

    const raced = await Promise.race([req2.then(() => 'RESOLVED'), delay(800).then(() => 'PENDING')]);
    t.ok(raced === 'PENDING', 'forged approvals (other patient + doctor self) do NOT grant access');
    t.ok((await vault.lookupAccessCode(code2)) !== null, 'the code is NOT consumed by forged approvals');

    // The real owner approves → now it resolves
    patientSock.emit('auth-response', { code: code2, approved: true, sharedRecordIds: [] });
    const res2 = await req2;
    t.ok(res2.status === 200, 'only the real owner\'s approval grants access');
  } finally {
    sockets.forEach((s) => s.disconnect());
    await new Promise((r) => srv.server.close(r));
  }
}
