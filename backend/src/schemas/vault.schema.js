const { z } = require('zod');

const vaultAccessSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Access code must be exactly 6 digits")
});

module.exports = { vaultAccessSchema };
