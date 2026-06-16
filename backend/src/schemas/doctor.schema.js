const { z } = require('zod');

const recordSchema = z.object({
  patientId: z.string().uuid("Invalid patient ID format"),
  vaultToken: z.string().min(1, "Vault session token is required"),
  diagnosis: z.string().min(1, "Diagnosis is required").max(500, "Diagnosis too long (max 500 chars)"),
  treatment: z.string().max(1000, "Treatment too long (max 1000 chars)").optional().nullable(),
  notes: z.string().max(2000, "Notes too long (max 2000 chars)").optional().nullable()
});

module.exports = { recordSchema };
