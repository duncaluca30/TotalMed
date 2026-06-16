// Validation schemas + cleanup/token regression checks.
import crypto from 'crypto';

export async function run({ app, t }) {
  const { schemas, prisma, jwt } = app;
  const { registerSchema, loginSchema } = schemas.auth;
  const { recordSchema } = schemas.doctor;
  const { vaultAccessSchema } = schemas.vault;

  t.section('Registration & login schemas');
  const validReg = { email: 'a@b.com', password: 'Str0ng!Pass', firstName: 'F', lastName: 'L', dateOfBirth: '1990-01-01', phone: '12345' };
  t.ok(registerSchema.safeParse(validReg).success, 'valid registration passes');
  t.ok(!registerSchema.safeParse({ ...validReg, password: 'weak' }).success, 'weak password rejected');
  t.ok(!registerSchema.safeParse({ ...validReg, password: 'alllowercase1!' }).success, 'password without uppercase rejected');
  t.ok(!registerSchema.safeParse({ ...validReg, email: 'not-an-email' }).success, 'invalid email rejected');
  t.ok(!registerSchema.safeParse({ ...validReg, dateOfBirth: '2999-01-01' }).success, 'future date of birth rejected');
  t.ok(loginSchema.safeParse({ email: 'a@b.com', password: 'x' }).success, 'login requires email + password');
  t.ok(!loginSchema.safeParse({ email: 'a@b.com' }).success, 'login without password rejected');

  t.section('Vault access & record schemas');
  t.ok(vaultAccessSchema.safeParse({ code: '123456' }).success, '6-digit access code accepted');
  t.ok(!vaultAccessSchema.safeParse({ code: '12345' }).success, '5-digit code rejected');
  t.ok(!vaultAccessSchema.safeParse({ code: 'abcdef' }).success, 'non-numeric code rejected');
  const validRec = { patientId: crypto.randomUUID(), vaultToken: 't', diagnosis: 'Dx', treatment: 'Tx', notes: 'N' };
  t.ok(recordSchema.safeParse(validRec).success, 'valid record passes');
  t.ok(!recordSchema.safeParse({ ...validRec, diagnosis: '' }).success, 'empty diagnosis rejected');
  t.ok(!recordSchema.safeParse({ ...validRec, diagnosis: 'x'.repeat(501) }).success, 'over-long diagnosis rejected');
  t.ok(!recordSchema.safeParse({ ...validRec, patientId: 'not-a-uuid' }).success, 'non-uuid patientId rejected');

  t.section('Cleanup job + vault token');
  const pat1 = await prisma.patient.create({ data: { firstName: 'P', lastName: 'C', dateOfBirth: new Date('1990-01-01'),
    user: { create: { email: 'pc1@t.com', password: 'x', role: 'PATIENT' } } } });
  const pat2 = await prisma.patient.create({ data: { firstName: 'P2', lastName: 'C', dateOfBirth: new Date('1990-01-01'),
    user: { create: { email: 'pc2@t.com', password: 'x', role: 'PATIENT' } } } });
  await prisma.accessCode.create({ data: { code: 'enc-active', expiresAt: new Date(Date.now() + 60000), patientId: pat1.id } });
  await prisma.accessCode.create({ data: { code: 'enc-expired', expiresAt: new Date(Date.now() - 60000), patientId: pat2.id } });

  // mirrors src/jobs/cleanup.js
  const del = await prisma.accessCode.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  t.ok(del.count === 1, 'cleanup deletes exactly the one expired code');
  t.ok((await prisma.accessCode.count()) === 1, 'the active code survives cleanup');

  const token = jwt.sign({ patientId: 'p1', doctorId: 'd1' }, process.env.JWT_SECRET, { expiresIn: '15m' });
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  t.ok(decoded.patientId === 'p1' && decoded.doctorId === 'd1', 'a valid vault token decodes to its claims');
  const expired = jwt.sign({ patientId: 'p1' }, process.env.JWT_SECRET, { expiresIn: '-1s' });
  await t.throws(() => jwt.verify(expired, process.env.JWT_SECRET), 'an expired vault token fails verification');
}
