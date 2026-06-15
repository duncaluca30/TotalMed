require('dotenv').config(); // Tells the script to read your .env file
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

// Initialize the Prisma 7 Adapter just like we did in server.js
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log("🌱 Starting the database seed...");

    // Hash the seed password properly (same as registration flow)
    const hashedPassword = await bcrypt.hash('Password123!', 10);

    // 1. Create a Fake Doctor
    const doctor = await prisma.user.create({
        data: {
            email: "dr.popescu@totalmed.com",
            password: hashedPassword,
            role: "DOCTOR",
            doctorProfile: {
                create: {
                    firstName: "Andrei",
                    lastName: "Popescu",
                    specialty: "Cardiology",
                    licenseNumber: "MED-RO-98765"
                }
            }
        },
        include: { doctorProfile: true } 
    });
    console.log(`✅ Created Doctor: ${doctor.doctorProfile.firstName} ${doctor.doctorProfile.lastName}`);

    // 2. Create a Fake Patient
    const patient = await prisma.user.create({
        data: {
            email: "maria.ionescu@email.com",
            password: hashedPassword,
            role: "PATIENT",
            patientProfile: {
                create: {
                    firstName: "Maria",
                    lastName: "Ionescu",
                    dateOfBirth: new Date("1990-05-15"), 
                    phone: "0722123456"
                }
            }
        },
        include: { patientProfile: true }
    });
    console.log(`✅ Created Patient: ${patient.patientProfile.firstName} ${patient.patientProfile.lastName}`);

    // 3. Create a Scheduled Appointment between them
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const appointment = await prisma.appointment.create({
        data: {
            dateTime: tomorrow,
            status: "SCHEDULED",
            reason: "Routine heart checkup",
            patientId: patient.patientProfile.id,
            doctorId: doctor.doctorProfile.id
        }
    });
    console.log(`✅ Created Appointment for tomorrow at ${tomorrow.toLocaleTimeString()}`);

    console.log("🎉 Database seeding completed successfully!");
}

// Run the function and handle any errors
main()
    .catch((e) => {
        console.error("🚨 Error during seeding:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });