require('dotenv').config();
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');
const { encrypt } = require('./utils/cipher');
const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })) });
(async () => {
  const u = await prisma.user.findUnique({ where: { email: 'maria.ionescu@email.com' }, include: { patientProfile: true } });
  const pid = u.patientProfile.id;
  await prisma.patient.update({ where: { id: pid }, data: {
    emergencyEnabled: true, emergencyId: 'demoEMERGENCY1234token',
    bloodType: encrypt('A+'), emergencyContactName: encrypt('Ion Ionescu (soț)'), emergencyContactPhone: encrypt('0722 000 111') }});
  await prisma.vitalSign.deleteMany({ where: { patientId: pid } });
  const bp=[[128,82],[132,85],[129,80],[135,88],[126,79],[130,83]];
  let d=new Date('2026-01-10');
  for(const [sys,dia] of bp){ await prisma.vitalSign.create({data:{patientId:pid,type:'BLOOD_PRESSURE',value:sys,value2:dia,unit:'mmHg',measuredAt:new Date(d)}}); d.setDate(d.getDate()+18); }
  for(const w of [[72,'2026-01-10'],[71,'2026-02-15'],[70,'2026-03-20'],[69,'2026-05-01']]) await prisma.vitalSign.create({data:{patientId:pid,type:'WEIGHT',value:w[0],unit:'kg',measuredAt:new Date(w[1])}});
  await prisma.vaccination.deleteMany({ where: { patientId: pid } });
  await prisma.vaccination.create({data:{patientId:pid,vaccineName:encrypt('Gripă sezonieră'),date:new Date('2025-10-12'),doseNumber:1,notes:encrypt('Administrat la medicul de familie')}});
  await prisma.vaccination.create({data:{patientId:pid,vaccineName:encrypt('Tetanos (dT)'),date:new Date('2024-06-03'),doseNumber:1,nextDoseDate:new Date('2034-06-03'),notes:null}});
  const meds = await prisma.medication.findMany({ where: { patientId: pid } });
  if(meds[0]) await prisma.medication.update({ where:{id:meds[0].id}, data:{ reminderEnabled:true }});
  console.log('demo data seeded for', u.email, 'patient', pid);
  await prisma.$disconnect();
})().catch(e=>{console.error(e);process.exit(1);});
