const { z } = require('zod');

const recordSchema = z.object({
  patientId: z.string().uuid("Invalid patient ID format"),
  vaultToken: z.string().min(1, "Vault session token is required"),
  diagnosis: z.string().min(1, "Diagnosis is required").max(500, "Diagnosis too long (max 500 chars)"),
  treatment: z.string().max(1000, "Treatment too long (max 1000 chars)").optional().nullable(),
  notes: z.string().max(2000, "Notes too long (max 2000 chars)").optional().nullable(),
  icdCode: z.string().max(10, "Invalid ICD-10 code").optional().nullable()
});

const patientSearchSchema = z.object({
  cnp: z.string().regex(/^\d{13}$/, "CNP must be exactly 13 digits")
});

const emergencyAccessSchema = z.object({
  patientId: z.string().uuid("Invalid patient ID format"),
  reason: z.string().min(10, "Reason must be at least 10 characters").max(500, "Reason too long (max 500 chars)")
});

module.exports = { recordSchema, patientSearchSchema, emergencyAccessSchema };
