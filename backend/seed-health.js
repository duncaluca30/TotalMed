// One-off helper to give an EXISTING patient account a full female health
// profile (sex, menarche, births, allergies, medications) so the new
// "Health Profile" feature can be demoed on an account you can actually log
// into. Safe to re-run: it replaces the demo allergies/medications/births
// instead of piling up duplicates.
//
// Usage:
//   node seed-health.js                      // defaults to duncaluca@gmail.com
//   node seed-health.js someone@example.com  // any existing patient email
require('dotenv').config();
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');
const { encrypt } = require('./utils/cipher');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const email = (process.argv[2] || 'duncaluca@gmail.com').toLowerCase();

async function main() {
    console.log(`🌱 Enriching health profile for: ${email}`);

    const user = await prisma.user.findUnique({
        where: { email },
        include: { patientProfile: true }
    });

    if (!user) {
        throw new Error(`No user found with email "${email}". Register this account first.`);
    }
    if (!user.patientProfile) {
        throw new Error(`User "${email}" has no patient profile (role is ${user.role}). This script only works for PATIENT accounts.`);
    }

    const patientId = user.patientProfile.id;

    // 1. Patient-level gynecological fields
    await prisma.patient.update({
        where: { id: patientId },
        data: {
            sex: 'FEMALE',
            menarcheDate: new Date('2003-09-01'),
            atMenopause: false
        }
    });

    // 2. Replace demo lists so re-running stays clean (no duplicates)
    await prisma.birth.deleteMany({ where: { patientId } });
    await prisma.allergy.deleteMany({ where: { patientId } });
    await prisma.medication.deleteMany({ where: { patientId } });

    await prisma.birth.createMany({
        data: [
            { patientId, modality: 'NATURAL', year: 2015 },
            { patientId, modality: 'CESAREAN', year: 2019 }
        ]
    });

    // Text fields are stored encrypted at rest, exactly like the app does.
    await prisma.allergy.createMany({
        data: [
            { patientId, substance: encrypt('Penicillin'), reaction: encrypt('Rash and facial swelling'), severity: 'SEVERE' },
            { patientId, substance: encrypt('Pollen'), reaction: encrypt('Sneezing, itchy eyes'), severity: 'MILD' }
        ]
    });
    await prisma.medication.createMany({
        data: [
            { patientId, name: encrypt('Levothyroxine'), dosage: encrypt('50 mcg'), frequency: encrypt('Once daily, in the morning') },
            { patientId, name: encrypt('Vitamin D'), dosage: encrypt('2000 IU'), frequency: encrypt('Once daily') }
        ]
    });

    console.log(`✅ ${user.patientProfile.firstName} ${user.patientProfile.lastName}: FEMALE, menarche 2003-09-01, 2 births, 2 allergies, 2 medications`);
    console.log('🎉 Done. Log in with this account to see the Health Profile tab populated.');
}

main()
    .catch((e) => {
        console.error('🚨 Error:', e.message);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
