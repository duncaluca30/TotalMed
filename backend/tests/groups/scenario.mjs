// Concurrent vault access + patient revocation.
export async function run({ app, t }) {
  const { prisma, vault, revocations, jwt } = app;
  const issueToken = (patientId, doctorId) => jwt.sign({ patientId, doctorId }, process.env.JWT_SECRET, { expiresIn: '15m' });

  const patient = await prisma.patient.create({ data: {
    firstName: 'Pat', lastName: 'Test', dateOfBirth: new Date('1990-01-01'),
    user: { create: { email: 'pat@test.com', password: 'x', role: 'PATIENT' } } } });
  const docA = await prisma.doctor.create({ data: {
    firstName: 'Alice', lastName: 'A', specialty: 'Cardio', licenseNumber: 'LIC-A',
    user: { create: { email: 'a@test.com', password: 'x', role: 'DOCTOR' } } } });
  const docB = await prisma.doctor.create({ data: {
    firstName: 'Bob', lastName: 'B', specialty: 'Neuro', licenseNumber: 'LIC-B',
    user: { create: { email: 'b@test.com', password: 'x', role: 'DOCTOR' } } } });

  t.section('Two doctors, overlapping windows');
  const c1 = await vault.generateAccessCode(patient.id);
  t.ok((await vault.generateAccessCode(patient.id)).code === c1.code, 'generating again while C1 is active returns the SAME code');

  const foundA = await vault.lookupAccessCode(c1.code);
  t.ok((await prisma.accessCode.deleteMany({ where: { id: foundA.id } })).count === 1, 'Doctor A redeems and consumes C1');
  const tokenA = issueToken(patient.id, docA.id);

  const c2 = await vault.generateAccessCode(patient.id);
  t.ok(c2.code !== c1.code, 'patient generates a NEW code C2 while A is viewing');
  t.ok((await vault.lookupAccessCode(c1.code)) === null, 'the old C1 no longer works for anyone');

  const foundB = await vault.lookupAccessCode(c2.code);
  await prisma.accessCode.deleteMany({ where: { id: foundB.id } });
  t.ok((await prisma.accessCode.deleteMany({ where: { id: foundB.id } })).count === 0, 'double-consume returns count 0 (no P2025 crash)');

  t.section('Patient revokes an active session');
  const iatA = jwt.verify(tokenA, process.env.JWT_SECRET).iat;
  t.ok(!revocations.isVaultTokenRevoked(patient.id, iatA), 'before revoke: Doctor A token accepted');
  revocations.revokeVaultAccess(patient.id);
  t.ok(revocations.isVaultTokenRevoked(patient.id, iatA), 'after revoke: Doctor A token rejected');
  await new Promise(r => setTimeout(r, 1100));
  const iatFresh = jwt.verify(issueToken(patient.id, docA.id), process.env.JWT_SECRET).iat;
  t.ok(!revocations.isVaultTokenRevoked(patient.id, iatFresh), 'a token issued AFTER revoke is still accepted');
}
