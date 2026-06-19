// New-feature coverage: health profile (allergies / medications / births /
// gynecology), appointment reminders, password reset & change, email
// verification, and the patient access log. Service-level (like the other
// groups) so it isn't blocked by PGlite's multi-relation join limitation.
import crypto from 'crypto';

export async function run({ app, t }) {
  const { prisma, auth, health, vault, cipher, bcrypt } = app;
  const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

  const pUser = await prisma.user.create({
    data: {
      email: 'feat-p@t.com', password: await bcrypt.hash('Str0ng!Pass', 10), role: 'PATIENT',
      patientProfile: { create: { firstName: 'Pat', lastName: 'Ient', dateOfBirth: new Date('1990-01-01') } }
    },
    include: { patientProfile: true }
  });
  const patientId = pUser.patientProfile.id;
  const dUser = await prisma.user.create({
    data: {
      email: 'feat-d@t.com', password: 'x', role: 'DOCTOR',
      doctorProfile: { create: { firstName: 'Doc', lastName: 'Tor', specialty: 'Cardiology', licenseNumber: 'LIC-FEAT' } }
    }
  });

  t.section('Allergies (encryption + scoping)');
  const allergy = await health.createAllergy({ patientId, substance: 'Penicillin', reaction: 'Rash', severity: 'SEVERE' });
  t.ok(allergy.substance === 'Penicillin', 'createAllergy returns decrypted substance');
  const rawAllergy = await prisma.allergy.findUnique({ where: { id: allergy.id } });
  t.ok(rawAllergy.substance !== 'Penicillin' && cipher.decrypt(rawAllergy.substance) === 'Penicillin', 'allergy substance stored encrypted at rest');
  const allergies = await health.getDecryptedAllergies(patientId);
  t.ok(allergies.length === 1 && allergies[0].substance === 'Penicillin', 'getDecryptedAllergies returns plaintext');
  t.ok((await health.updateAllergy({ id: allergy.id, patientId: 'someone-else', substance: 'X', severity: 'MILD' })) === null, 'updateAllergy is scoped to the owning patient');
  t.ok((await health.deleteAllergy({ id: allergy.id, patientId })) === true, 'deleteAllergy removes the row');

  t.section('Medications & births');
  const med = await health.createMedication({ patientId, name: 'Levothyroxine', dosage: '50mcg', frequency: 'daily' });
  const rawMed = await prisma.medication.findUnique({ where: { id: med.id } });
  t.ok(cipher.decrypt(rawMed.name) === 'Levothyroxine', 'medication name stored encrypted at rest');
  const birth = await health.createBirth({ patientId, modality: 'CESAREAN', year: 2019 });
  t.ok(birth.modality === 'CESAREAN' && birth.year === 2019, 'createBirth stores modality + year');
  t.ok((await health.getBirths(patientId)).length === 1, 'getBirths returns the birth');

  t.section('Gynecological profile');
  const prof = await health.updatePatientProfile(patientId, { sex: 'FEMALE', atMenopause: true, menarcheDate: '2003-09-01' });
  t.ok(prof.sex === 'FEMALE' && prof.atMenopause === true && !!prof.menarcheDate, 'updatePatientProfile sets sex / menopause / menarche');

  t.section('Appointment reminders (encryption + scoping)');
  const appt = await health.createAppointment({ patientId, dateTime: '2027-06-12', specialty: 'Cardiology', location: 'Clinica Sfanta Maria' });
  t.ok(appt.specialty === 'Cardiology' && appt.location === 'Clinica Sfanta Maria', 'createAppointment returns decrypted fields');
  const rawAppt = await prisma.appointment.findUnique({ where: { id: appt.id } });
  t.ok(rawAppt.specialty !== 'Cardiology' && cipher.decrypt(rawAppt.specialty) === 'Cardiology', 'appointment specialty stored encrypted at rest');
  t.ok((await health.deleteAppointment({ id: appt.id, patientId: 'nope' })) === false, 'deleteAppointment is scoped to the owner');
  t.ok((await health.deleteAppointment({ id: appt.id, patientId })) === true, 'deleteAppointment removes own row');

  t.section('Password reset (token hashed + session invalidation)');
  const rawReset = 'reset-token-123';
  await prisma.user.update({ where: { id: pUser.id }, data: { passwordResetToken: sha256(rawReset), passwordResetExpiresAt: new Date(Date.now() + 60000) } });
  await auth.resetPassword(rawReset, 'NewStr0ng!Pass');
  const afterReset = await prisma.user.findUnique({ where: { id: pUser.id } });
  t.ok(await bcrypt.compare('NewStr0ng!Pass', afterReset.password), 'resetPassword updates the password hash');
  t.ok(afterReset.passwordResetToken === null, 'reset token is cleared (single-use)');
  t.ok(!!afterReset.sessionValidAfter, 'resetPassword bumps sessionValidAfter (logout everywhere)');
  await t.throws(() => auth.resetPassword('wrong-token', 'Whatever1!'), 'resetPassword rejects an invalid token');

  t.section('Change password');
  await t.throws(() => auth.changePassword(pUser.id, 'wrong-current', 'Another1!Pass'), 'changePassword rejects a wrong current password');
  await auth.changePassword(pUser.id, 'NewStr0ng!Pass', 'Another1!Pass');
  t.ok(await bcrypt.compare('Another1!Pass', (await prisma.user.findUnique({ where: { id: pUser.id } })).password), 'changePassword updates the password');

  t.section('Email verification');
  const rawVerify = 'verify-token-123';
  await prisma.user.update({ where: { id: pUser.id }, data: { isEmailVerified: false, emailVerificationToken: sha256(rawVerify), emailVerificationExpiresAt: new Date(Date.now() + 60000) } });
  await auth.verifyEmail(rawVerify);
  t.ok((await prisma.user.findUnique({ where: { id: pUser.id } })).isEmailVerified === true, 'verifyEmail confirms the account');
  await t.throws(() => auth.verifyEmail('bad-token'), 'verifyEmail rejects an invalid token');

  t.section('Patient access log');
  await vault.createAuditLog({ userId: dUser.id, action: 'VAULT_ACCESSED', details: { patientId }, ipAddress: '1.2.3.4' });
  await vault.createAuditLog({ userId: dUser.id, action: 'RECORD_ADDED', details: { patientId, recordId: 'r1' }, ipAddress: '1.2.3.4' });
  const log = await vault.getPatientAccessLog(patientId);
  t.ok(log.length >= 2, 'access log returns entries referencing the patient');
  t.ok(log.every((e) => e.actor.includes('Tor')), 'access log resolves the acting doctor name');
}
