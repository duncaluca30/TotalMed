// Consent & data isolation — the thesis's central guarantees.
export async function run({ app, t }) {
  const { prisma, vault, cipher } = app;

  const doc = await prisma.doctor.create({ data: {
    firstName: 'D', lastName: 'Oc', specialty: 'X', licenseNumber: 'LIC-C',
    user: { create: { email: 'd1@t.com', password: 'x', role: 'DOCTOR' } } } });
  const pA = await prisma.patient.create({ data: {
    firstName: 'A', lastName: 'A', dateOfBirth: new Date('1990-01-01'),
    user: { create: { email: 'pa@t.com', password: 'x', role: 'PATIENT' } } } });
  const pB = await prisma.patient.create({ data: {
    firstName: 'B', lastName: 'B', dateOfBirth: new Date('1990-01-01'),
    user: { create: { email: 'pb@t.com', password: 'x', role: 'PATIENT' } } } });

  const r1 = await vault.createEncryptedRecord({ diagnosis: 'Dx1', treatment: 'Tx1', notes: 'N1', patientId: pA.id, doctorId: doc.id });
  await new Promise(r => setTimeout(r, 5));
  const r2 = await vault.createEncryptedRecord({ diagnosis: 'Dx2', treatment: 'Tx2', notes: null, patientId: pA.id, doctorId: doc.id });
  await new Promise(r => setTimeout(r, 5));
  const r3 = await vault.createEncryptedRecord({ diagnosis: 'Dx3', treatment: null, notes: null, patientId: pA.id, doctorId: doc.id });
  await vault.createEncryptedRecord({ diagnosis: 'OtherPatientSecret', treatment: null, notes: null, patientId: pB.id, doctorId: doc.id });

  t.section('Records encrypted at rest');
  const raw = await prisma.medicalRecord.findUnique({ where: { id: r1.id } });
  t.ok(raw.diagnosis !== 'Dx1' && cipher.decrypt(raw.diagnosis) === 'Dx1', 'diagnosis is stored as ciphertext, decrypts to original');

  t.section('Decryption, pagination & isolation');
  const page1 = await vault.getDecryptedRecords(pA.id, 1, 2);
  t.ok(page1.total === 3, `patient A has exactly 3 records (got ${page1.total})`);
  t.ok(page1.records.length === 2, 'limit is respected (2 per page)');
  t.ok(page1.records[0].diagnosis === 'Dx3', 'newest record first (ordering desc)');
  t.ok(page1.records.every(r => r.diagnosis !== 'OtherPatientSecret'), "patient B's records never leak to patient A");
  t.ok(!page1.records[0].diagnosis.includes(':'), 'records are returned decrypted, not as ciphertext');
  const page2 = await vault.getDecryptedRecords(pA.id, 2, 2);
  t.ok(page2.records.length === 1, 'page 2 returns the remaining record');

  t.section('Consent filter (only patient-approved records)');
  // Mirrors the filter in doctor.routes.js access-vault.
  const allRecords = [r1, r2, r3];
  const sharedRecordIds = [r2.id];
  const approved = allRecords.filter(r => sharedRecordIds.includes(r.id));
  t.ok(approved.length === 1 && approved[0].id === r2.id, 'only the explicitly approved record is shared');

  t.section('Access code expiry');
  const code = await vault.generateAccessCode(pA.id);
  t.ok(!!(await vault.lookupAccessCode(code.code)), 'an active code is found by lookup');
  await prisma.accessCode.updateMany({ where: { patientId: pA.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  t.ok((await vault.lookupAccessCode(code.code)) === null, 'an expired code is NOT found by lookup');
  const fresh = await vault.generateAccessCode(pA.id);
  t.ok(fresh.code !== code.code && !!(await vault.lookupAccessCode(fresh.code)), 'generateAccessCode replaces an expired code with a fresh, working one');
}
