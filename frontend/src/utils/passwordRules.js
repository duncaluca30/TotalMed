// Single source of truth for the password policy, mirroring the backend
// (registerSchema / resetPasswordSchema): 8+ chars with a lowercase, uppercase,
// number and special character. Kept in its own module so both the checklist UI
// and form validation can share it.
export const PASSWORD_RULES = [
  { label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { label: 'One lowercase letter', test: (p) => /[a-z]/.test(p) },
  { label: 'One uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { label: 'One number', test: (p) => /\d/.test(p) },
  { label: 'One special character', test: (p) => /[\W_]/.test(p) },
];

// True when the password satisfies every rule.
export const isPasswordValid = (password = '') => PASSWORD_RULES.every((r) => r.test(password));
