const { z } = require('zod');

const allergyFields = {
  substance: z.string().min(1, 'Substance is required').max(200, 'Substance too long (max 200 chars)'),
  reaction: z.string().max(500, 'Reaction too long (max 500 chars)').optional().nullable(),
  severity: z.enum(['MILD', 'MODERATE', 'SEVERE']).optional().default('MODERATE')
};

const medicationFields = {
  name: z.string().min(1, 'Medication name is required').max(200, 'Name too long (max 200 chars)'),
  dosage: z.string().max(200, 'Dosage too long (max 200 chars)').optional().nullable(),
  frequency: z.string().max(200, 'Frequency too long (max 200 chars)').optional().nullable()
};

const currentYear = new Date().getFullYear();

const birthFields = {
  modality: z.enum(['NATURAL', 'CESAREAN']),
  year: z.coerce.number().int().min(1900, 'Year too early').max(currentYear, 'Year cannot be in the future').optional().nullable()
};

// All fields optional — this is a partial patch of the patient's gynecological
// profile. menarcheDate accepts an ISO date string (or null to clear).
const patientProfileFields = {
  sex: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  atMenopause: z.boolean().optional(),
  menarcheDate: z.string().min(1).optional().nullable()
};

// Doctor-side requests carry the active vault session + the target patient.
const vaultFields = {
  patientId: z.string().uuid('Invalid patient ID format'),
  vaultToken: z.string().min(1, 'Vault session token is required')
};

const allergySchema = z.object(allergyFields);
const medicationSchema = z.object(medicationFields);
const birthSchema = z.object(birthFields);
const patientProfileSchema = z.object(patientProfileFields);

const doctorAllergySchema = z.object({ ...allergyFields, ...vaultFields });
const doctorMedicationSchema = z.object({ ...medicationFields, ...vaultFields });
const doctorBirthSchema = z.object({ ...birthFields, ...vaultFields });
const doctorPatientProfileSchema = z.object({ ...patientProfileFields, ...vaultFields });

module.exports = {
  allergySchema,
  medicationSchema,
  birthSchema,
  patientProfileSchema,
  doctorAllergySchema,
  doctorMedicationSchema,
  doctorBirthSchema,
  doctorPatientProfileSchema
};
