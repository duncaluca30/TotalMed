const cron = require('node-cron');
const prisma = require('../config/prisma');
const { decrypt } = require('../../utils/cipher');
const { sendAppointmentReminderEmail, sendMedicationReminderEmail } = require('../../utils/mailer');

async function runReminderSweep() {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const due = await prisma.appointment.findMany({
        where: {
            status: 'SCHEDULED',
            reminderSentAt: null,
            dateTime: { gt: now, lte: in24h }
        },
        include: { patient: { include: { user: { select: { email: true } } } } }
    });

    for (const appt of due) {
        const email = appt.patient?.user?.email;
        if (!email) continue;

        const whenStr = new Date(appt.dateTime).toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest' });
        const specialty = appt.specialty ? decrypt(appt.specialty) : null;
        const location = appt.location ? decrypt(appt.location) : null;

        await sendAppointmentReminderEmail(email, whenStr, specialty, location);
        await prisma.appointment.update({
            where: { id: appt.id },
            data: { reminderSentAt: new Date() }
        });
    }

    if (due.length > 0) {
        console.log(`📅 Sent ${due.length} appointment reminder(s).`);
    }
}

async function runMedicationReminderSweep() {
    const meds = await prisma.medication.findMany({
        where: { reminderEnabled: true },
        include: { patient: { include: { user: { select: { email: true } } } } }
    });

    const byEmail = new Map();
    for (const m of meds) {
        const email = m.patient?.user?.email;
        if (!email) continue;
        const list = byEmail.get(email) || [];
        list.push({
            name: decrypt(m.name),
            dosage: m.dosage ? decrypt(m.dosage) : null,
            frequency: m.frequency ? decrypt(m.frequency) : null
        });
        byEmail.set(email, list);
    }

    for (const [email, list] of byEmail) {
        await sendMedicationReminderEmail(email, list);
    }
    if (byEmail.size > 0) {
        console.log(`💊 Sent ${byEmail.size} medication reminder digest(s).`);
    }
}

function startReminderJob() {

    cron.schedule('0 * * * *', () => {
        runReminderSweep().catch((e) => console.error("🚨 Reminder sweep failed:", e));
    });

    cron.schedule('0 8 * * *', () => {
        runMedicationReminderSweep().catch((e) => console.error("🚨 Medication reminder sweep failed:", e));
    });
}

module.exports = startReminderJob;
module.exports.runReminderSweep = runReminderSweep;
module.exports.runMedicationReminderSweep = runMedicationReminderSweep;
