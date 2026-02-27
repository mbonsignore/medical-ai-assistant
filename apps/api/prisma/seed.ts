import bcrypt from "bcrypt";
import { prisma } from "../src/db/prisma.js";

async function main() {
  // Clean (optional, useful after reset if you re-run seed)
  await prisma.doctorAvailability.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.message.deleteMany();
  await prisma.chat.deleteMany();
  await prisma.user.deleteMany();
  await prisma.doctor.deleteMany();
  await prisma.patient.deleteMany();

  // Demo patients (names can be Italian)
  const p1 = await prisma.patient.create({
    data: { name: "Mario Rossi", email: "mario.rossi@example.com" },
  });
  const p2 = await prisma.patient.create({
    data: { name: "Giulia Verdi", email: "giulia.verdi@example.com" },
  });

  // Demo doctors (specialty + bio in English)
  const doctors = await prisma.doctor.createManyAndReturn({
    data: [
      {
        name: "Dott. Luca Bianchi",
        specialty: "General Practice",
        bio: "General practitioner. Primary care, basic triage, and referrals.",
      },
      {
        name: "Dott.ssa Elena Conti",
        specialty: "Dermatology",
        bio: "Skin conditions, moles, acne, rashes, and dermoscopic evaluation.",
      },
      {
        name: "Dott. Marco Rinaldi",
        specialty: "Cardiology",
        bio: "Heart health, blood pressure, palpitations, prevention, and follow-ups.",
      },
      {
        name: "Dott.ssa Sara Greco",
        specialty: "Gastroenterology",
        bio: "Digestive disorders, reflux, abdominal pain, bowel symptoms.",
      },
      {
        name: "Dott. Paolo Ferri",
        specialty: "Neurology",
        bio: "Headaches, dizziness, neurological symptoms, and clinical evaluation.",
      },
      {
        name: "Dott.ssa Chiara Sala",
        specialty: "Orthopedics",
        bio: "Joint pain, injuries, posture issues, and musculoskeletal care.",
      },
    ],
  });

  // Availability: Mon–Fri (1..5), 09:00–12:00 and 14:00–17:00, 30-min slots
  const weekdays = [1, 2, 3, 4, 5];
  for (const d of doctors) {
    for (const w of weekdays) {
      await prisma.doctorAvailability.create({
        data: { doctorId: d.id, weekday: w, startTime: "09:00", endTime: "12:00", slotMinutes: 30 },
      });
      await prisma.doctorAvailability.create({
        data: { doctorId: d.id, weekday: w, startTime: "14:00", endTime: "17:00", slotMinutes: 30 },
      });
    }
  }

  // ---- USERS (login/register demo) ----
  // Password for all demo accounts: Password123!
  const passwordHash = await bcrypt.hash("Password123!", 10);

  const doctorGp = doctors.find((d) => d.specialty === "General Practice")!;
  const doctorDerm = doctors.find((d) => d.specialty === "Dermatology")!;

  const u1 = await prisma.user.create({
    data: {
      email: "mario.rossi@example.com",
      passwordHash,
      role: "PATIENT",
      patientId: p1.id,
    },
    select: { id: true, email: true, role: true, patientId: true, doctorId: true },
  });

  const u2 = await prisma.user.create({
    data: {
      email: "giulia.verdi@example.com",
      passwordHash,
      role: "PATIENT",
      patientId: p2.id,
    },
    select: { id: true, email: true, role: true, patientId: true, doctorId: true },
  });

  const u3 = await prisma.user.create({
    data: {
      email: "luca.bianchi@clinic.example.com",
      passwordHash,
      role: "DOCTOR",
      doctorId: doctorGp.id,
    },
    select: { id: true, email: true, role: true, patientId: true, doctorId: true },
  });

  const u4 = await prisma.user.create({
    data: {
      email: "elena.conti@clinic.example.com",
      passwordHash,
      role: "DOCTOR",
      doctorId: doctorDerm.id,
    },
    select: { id: true, email: true, role: true, patientId: true, doctorId: true },
  });

  console.log("Seed completed.");
  console.log("Demo logins (password: Password123!):");
  console.log("- PATIENT:", u1.email, "patientId=", u1.patientId);
  console.log("- PATIENT:", u2.email, "patientId=", u2.patientId);
  console.log("- DOCTOR:", u3.email, "doctorId=", u3.doctorId);
  console.log("- DOCTOR:", u4.email, "doctorId=", u4.doctorId);
  console.log("Doctors:", doctors.map((d) => `${d.specialty}=${d.id}`).join(" | "));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });