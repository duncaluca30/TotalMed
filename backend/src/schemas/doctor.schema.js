const { z } = require('zod');

const recordSchema = z.object({
  patientId: z.string().uuid("Invalid patient ID format"),
  code: z.string().length(6, "Access code must be exactly 6 characters"),
  diagnosis: z.string().min(1, "Diagnosis is required").max(500, "Diagnosis too long (max 500 chars)"),
  treatment: z.string().max(1000, "Treatment too long (max 1000 chars)").optional().nullable(),
  notes: z.string().max(2000, "Notes too long (max 2000 chars)").optional().nullable()
});

module.exports = { recordSchema };
