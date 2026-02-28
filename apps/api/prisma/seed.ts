import bcrypt from "bcrypt";
import { prisma } from "../src/db/prisma.js";

type DoctorSeed = {
  name: string;
  email: string;
  specialty: string;
  bio: string;
};

type PatientSeed = {
  name: string;
  email: string;
};

async function main() {
  // =========================================================
  // CLEAN (NO Document)
  // Order matters because of foreign keys
  // =========================================================
  await prisma.doctorAvailability.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.message.deleteMany();
  await prisma.chat.deleteMany();
  await prisma.user.deleteMany();
  await prisma.doctor.deleteMany();
  await prisma.patient.deleteMany();

  // =========================================================
  // SEED DATA
  // =========================================================

  // Patients (add a few more)
  const patientsSeed: PatientSeed[] = [
    { name: "Mario Rossi", email: "mario.rossi@example.com" },
    { name: "Giulia Verdi", email: "giulia.verdi@example.com" },
    { name: "Luca Romano", email: "luca.romano@example.com" },
    { name: "Francesca Bianchi", email: "francesca.bianchi@example.com" },
    { name: "Alessandro Greco", email: "alessandro.greco@example.com" },
    { name: "Chiara Conti", email: "chiara.conti@example.com" },
  ];

  const patients = [];
  for (const p of patientsSeed) {
    patients.push(
      await prisma.patient.create({
        data: { name: p.name, email: p.email },
      })
    );
  }

  // Doctors: include ALL specialties your app can recommend.
  // Keep these strings aligned with normalizeSpecialty() in chats.ts.
  const doctorsSeed: DoctorSeed[] = [
    // General Practice (add multiple so availability is richer)
    {
      name: "Dott. Luca Bianchi",
      email: "luca.bianchi@clinic.example.com",
      specialty: "General Practice",
      bio: "General practitioner. Primary care, basic triage, and referrals.",
    },
    {
      name: "Dott.ssa Martina Gallo",
      email: "martina.gallo@clinic.example.com",
      specialty: "General Practice",
      bio: "Primary care for common symptoms, follow-ups, and preventive care.",
    },

    // Dermatology
    {
      name: "Dott.ssa Elena Conti",
      email: "elena.conti@clinic.example.com",
      specialty: "Dermatology",
      bio: "Skin conditions, moles, acne, rashes, and dermoscopic evaluation.",
    },

    // Cardiology
    {
      name: "Dott. Marco Rinaldi",
      email: "marco.rinaldi@clinic.example.com",
      specialty: "Cardiology",
      bio: "Heart health, blood pressure, palpitations, prevention, and follow-ups.",
    },

    // Gastroenterology
    {
      name: "Dott.ssa Sara Greco",
      email: "sara.greco@clinic.example.com",
      specialty: "Gastroenterology",
      bio: "Digestive disorders, reflux, abdominal pain, bowel symptoms.",
    },

    // Neurology
    {
      name: "Dott. Paolo Ferri",
      email: "paolo.ferri@clinic.example.com",
      specialty: "Neurology",
      bio: "Headaches, dizziness, neurological symptoms, and clinical evaluation.",
    },

    // Orthopedics
    {
      name: "Dott.ssa Chiara Sala",
      email: "chiara.sala@clinic.example.com",
      specialty: "Orthopedics",
      bio: "Joint pain, injuries, posture issues, and musculoskeletal care.",
    },

    // IMPORTANT:
    // If in future normalizeSpecialty() returns new specialties, add them here.
    // e.g. "ENT", "Ophthalmology", "Urology", "Gynecology", etc.
  ];

  const createdDoctors = await prisma.doctor.createManyAndReturn({
    data: doctorsSeed.map((d) => ({
      name: d.name,
      specialty: d.specialty,
      bio: d.bio,
    })),
  });

  // Map: specialty -> doctor ids
  const doctorsBySpecialty = new Map<string, string[]>();
  createdDoctors.forEach((d) => {
    if (!doctorsBySpecialty.has(d.specialty)) doctorsBySpecialty.set(d.specialty, []);
    doctorsBySpecialty.get(d.specialty)!.push(d.id);
  });

  // =========================================================
  // AVAILABILITY
  // Mon–Fri (1..5) + optional Sat for GP
  // =========================================================
  const weekdays = [1, 2, 3, 4, 5];
  const saturday = [6];

  for (const d of createdDoctors) {
    const isGp = d.specialty === "General Practice";

    // Standard slots Mon-Fri
    for (const w of weekdays) {
      await prisma.doctorAvailability.create({
        data: { doctorId: d.id, weekday: w, startTime: "09:00", endTime: "12:00", slotMinutes: 30 },
      });
      await prisma.doctorAvailability.create({
        data: { doctorId: d.id, weekday: w, startTime: "14:00", endTime: "17:00", slotMinutes: 30 },
      });
    }

    // Add a light Saturday morning availability for GP (better demo UX)
    if (isGp) {
      for (const w of saturday) {
        await prisma.doctorAvailability.create({
          data: { doctorId: d.id, weekday: w, startTime: "09:00", endTime: "12:00", slotMinutes: 30 },
        });
      }
    }
  }

  // =========================================================
  // USERS
  // Password for all demo accounts: Password123!
  // =========================================================
  const passwordHash = await bcrypt.hash("Password123!", 10);

  // Patient users
  const patientUsers = [];
  for (const p of patients) {
    patientUsers.push(
      await prisma.user.create({
        data: {
          email: p.email ?? `${p.id}@example.com`,
          passwordHash,
          role: "PATIENT",
          patientId: p.id,
        },
        select: { id: true, email: true, role: true, patientId: true, doctorId: true },
      })
    );
  }

  // Doctor users
  // createdDoctors are in the same order as doctorsSeed
  const doctorUsers = [];
  for (let i = 0; i < createdDoctors.length; i++) {
    const d = createdDoctors[i];
    const seed = doctorsSeed[i];

    doctorUsers.push(
      await prisma.user.create({
        data: {
          email: seed.email,
          passwordHash,
          role: "DOCTOR",
          doctorId: d.id,
        },
        select: { id: true, email: true, role: true, patientId: true, doctorId: true },
      })
    );
  }

  // =========================================================
  // OPTIONAL: create a demo chat + a couple messages (no RAG docs)
  // Keeps UI from looking empty on first run.
  // =========================================================
  const demoPatient = patients[0];
  const chat = await prisma.chat.create({ data: { patientId: demoPatient.id, summary: null } });
  await prisma.message.createMany({
    data: [
      { chatId: chat.id, role: "user", content: "Hi, I have a mild headache since this morning." },
      { chatId: chat.id, role: "assistant", content: "Thanks — can you tell me if you have fever or vision changes?" },
    ],
  });

  // =========================================================
  // OUTPUT
  // =========================================================
  console.log("Seed completed.");
  console.log("Password for all demo accounts: Password123!");
  console.log("");
  console.log("Demo PATIENT logins:");
  patientUsers.slice(0, 4).forEach((u) => {
    console.log(`- ${u.email} (patientId=${u.patientId})`);
  });
  console.log("");
  console.log("Demo DOCTOR logins:");
  doctorUsers.forEach((u) => {
    console.log(`- ${u.email} (doctorId=${u.doctorId})`);
  });
  console.log("");
  console.log(
    "Doctors by specialty:",
    [...doctorsBySpecialty.entries()]
      .map(([spec, ids]) => `${spec}=${ids.length}`)
      .join(" | ")
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });