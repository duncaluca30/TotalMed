// 2FA & auth at rest — passwords, OTP hashing, and the TOTP verification bug.
export async function run({ app, t }) {
  const { prisma, auth, cipher, bcrypt, otplib } = app;
  const creds = { email: 'reg@t.com', password: 'Str0ng!Pass', firstName: 'F', lastName: 'L', dateOfBirth: '1990-01-01', phone: '12345' };

  t.section('Password hashing & registration');
  const user = await auth.registerUser(creds);
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  t.ok(dbUser.password !== creds.password, 'password is not stored in plaintext');
  t.ok(await bcrypt.compare(creds.password, dbUser.password), 'stored password is a valid bcrypt hash');
  await t.throws(() => auth.registerUser(creds), 'duplicate email is rejected');

  t.section('Login');
  const req = { headers: { 'x-forwarded-for': '1.2.3.4', 'user-agent': 'test' }, socket: { remoteAddress: '1.2.3.4' } };
  const login = await auth.authenticateUser(creds.email, creds.password, req);
  t.ok(!!login.user && login.availableMethods.includes('EMAIL'), 'correct credentials authenticate; EMAIL method offered');
  await t.throws(() => auth.authenticateUser(creds.email, 'WrongPass1!', req), 'wrong password is rejected');

  t.section('2FA secret encrypted at rest');
  const setup = await auth.generate2FASetup(user.id);
  const afterGen = await prisma.user.findUnique({ where: { id: user.id } });
  t.ok(afterGen.twoFactorSecret !== setup.secret, '2FA secret is NOT stored in plaintext');
  t.ok(cipher.decrypt(afterGen.twoFactorSecret) === setup.secret, '2FA secret is stored encrypted (decrypts to the real secret)');

  t.section('TOTP verification (regression: otplib v13 async bug)');
  await t.throws(() => auth.verify2FASetup(user.id, '000000'), 'verify2FASetup REJECTS a wrong TOTP code');
  await auth.verify2FASetup(user.id, otplib.generateSync({ secret: setup.secret }));
  const enabled = await prisma.user.findUnique({ where: { id: user.id } });
  t.ok(enabled.isTwoFactorEnabled === true, 'verify2FASetup ACCEPTS the correct TOTP code and enables 2FA');

  await t.throws(() => auth.validate2FA(user.id, '000000', 'APP'), 'validate2FA(APP) REJECTS a wrong TOTP code');
  const validated = await auth.validate2FA(user.id, otplib.generateSync({ secret: setup.secret }), 'APP');
  t.ok(!!validated, 'validate2FA(APP) ACCEPTS the correct TOTP code');

  t.section('Email OTP at rest');
  await auth.sendEmailOTP(user.id);
  const afterOtp = await prisma.user.findUnique({ where: { id: user.id } });
  t.ok(afterOtp.emailOtpCode && afterOtp.emailOtpCode.startsWith('$2'), 'email OTP is stored as a bcrypt hash, not plaintext');
  t.ok(afterOtp.emailOtpExpiresAt > new Date(), 'email OTP has a future expiry');

  const knownOtp = '654321';
  await prisma.user.update({ where: { id: user.id }, data: { emailOtpCode: await bcrypt.hash(knownOtp, 10), emailOtpExpiresAt: new Date(Date.now() + 60000) } });
  t.ok(!!(await auth.validate2FA(user.id, knownOtp, 'EMAIL')), 'validate2FA(EMAIL) accepts the correct code');
  t.ok((await prisma.user.findUnique({ where: { id: user.id } })).emailOtpCode === null, 'email OTP is cleared after one successful use');

  await prisma.user.update({ where: { id: user.id }, data: { emailOtpCode: await bcrypt.hash(knownOtp, 10), emailOtpExpiresAt: new Date(Date.now() - 1000) } });
  await t.throws(() => auth.validate2FA(user.id, knownOtp, 'EMAIL'), 'validate2FA(EMAIL) rejects an expired code');
}
