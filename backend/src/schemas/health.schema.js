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

// A date-only (or ISO) string that must not be in the future. Used for
// menarche / menopause, which can only have happened in the past.
const notFutureDate = z
  .string()
  .min(1)
  .refine((v) => new Date(v) <= new Date(new Date().toDateString() + ' 23:59:59'),
    'Date cannot be in the future');

// All fields optional — this is a partial patch of the patient's gynecological
// profile. menarcheDate / menopauseDate accept an ISO date string (or null to clear).
const patientProfileFields = {
  sex: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  atMenopause: z.boolean().optional(),
  menarcheDate: notFutureDate.optional().nullable(),
  menopauseDate: notFutureDate.optional().nullable()
};

const appointmentFields = {
  dateTime: z
    .string()
    .min(1, 'Date is required')
    .refine((v) => new Date(v) >= new Date(new Date().toDateString()),
      'Appointment date cannot be in the past'),
  specialty: z.string().min(1, 'Specialty / title is required').max(200, 'Too long (max 200 chars)'),
  location: z.string().max(200, 'Location too long (max 200 chars)').optional().nullable(),
  reason: z.string().max(500, 'Note too long (max 500 chars)').optional().nullable()
};

const vaccinationFields = {
  vaccineName: z.string().min(1, 'Vaccine name is required').max(200, 'Name too long (max 200 chars)'),
  date: z.string().min(1, 'Date is required'),
  doseNumber: z.coerce.number().int().min(1).max(50).optional().nullable(),
  nextDoseDate: z.string().optional().nullable(),
  notes: z.string().max(500, 'Note too long (max 500 chars)').optional().nullable()
};

const emergencyProfileFields = {
  bloodType: z.string().max(10, 'Blood type too long').optional().nullable(),
  emergencyContactName: z.string().max(120, 'Name too long').optional().nullable(),
  emergencyContactPhone: z.string().max(40, 'Phone too long').optional().nullable(),
  enabled: z.boolean().optional(),
  regenerate: z.boolean().optional()
};

const vitalFields = {
  type: z.enum(['BLOOD_PRESSURE', 'WEIGHT', 'GLUCOSE', 'HEART_RATE', 'TEMPERATURE']),
  value: z.coerce.number().finite('Value must be a number'),
  value2: z.coerce.number().finite().optional().nullable(),
  unit: z.string().min(1, 'Unit is required').max(20, 'Unit too long'),
  measuredAt: z.string().min(1, 'Measurement date is required')
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
const appointmentSchema = z.object(appointmentFields);
const vitalSchema = z.object(vitalFields);
const vaccinationSchema = z.object(vaccinationFields);
const emergencyProfileSchema = z.object(emergencyProfileFields);

const doctorAllergySchema = z.object({ ...allergyFields, ...vaultFields });
const doctorMedicationSchema = z.object({ ...medicationFields, ...vaultFields });
const doctorBirthSchema = z.object({ ...birthFields, ...vaultFields });
const doctorPatientProfileSchema = z.object({ ...patientProfileFields, ...vaultFields });
const doctorAppointmentSchema = z.object({ ...appointmentFields, ...vaultFields });
const doctorVitalSchema = z.object({ ...vitalFields, ...vaultFields });
const doctorVaccinationSchema = z.object({ ...vaccinationFields, ...vaultFields });

module.exports = {
  allergySchema,
  medicationSchema,
  birthSchema,
  patientProfileSchema,
  appointmentSchema,
  vitalSchema,
  vaccinationSchema,
  emergencyProfileSchema,
  doctorAllergySchema,
  doctorMedicationSchema,
  doctorBirthSchema,
  doctorPatientProfileSchema,
  doctorAppointmentSchema,
  doctorVitalSchema,
  doctorVaccinationSchema
};
