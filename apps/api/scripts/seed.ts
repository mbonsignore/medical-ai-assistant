import { prisma } from "../src/db/prisma";

async function main() {
  // Demo patients (names can be Italian)
  const p1 = await prisma.patient.create({
    data: { name: "Mario Rossi", email: "mario.rossi@example.com" }
  });
  const p2 = await prisma.patient.create({
    data: { name: "Giulia Verdi", email: "giulia.verdi@example.com" }
  });

  // Demo doctors (specialty + bio in English)
  const doctors = await prisma.doctor.createManyAndReturn({
    data: [
      {
        name: "Dott. Luca Bianchi",
        specialty: "General Practice",
        bio: "General practitioner. Primary care, basic triage, and referrals."
      },
      {
        name: "Dott.ssa Elena Conti",
        specialty: "Dermatology",
        bio: "Skin conditions, moles, acne, rashes, and dermoscopic evaluation."
      },
      {
        name: "Dott. Marco Rinaldi",
        specialty: "Cardiology",
        bio: "Heart health, blood pressure, palpitations, prevention, and follow-ups."
      },
      {
        name: "Dott.ssa Sara Greco",
        specialty: "Gastroenterology",
        bio: "Digestive disorders, reflux, abdominal pain, bowel symptoms."
      },
      {
        name: "Dott. Paolo Ferri",
        specialty: "Neurology",
        bio: "Headaches, dizziness, neurological symptoms, and clinical evaluation."
      },
      {
        name: "Dott.ssa Chiara Sala",
        specialty: "Orthopedics",
        bio: "Joint pain, injuries, posture issues, and musculoskeletal care."
      }
    ]
  });

  // Availability: Mon–Fri (1..5), 09:00–12:00 and 14:00–17:00, 30-min slots
  const weekdays = [1, 2, 3, 4, 5];
  for (const d of doctors) {
    for (const w of weekdays) {
      await prisma.doctorAvailability.create({
        data: { doctorId: d.id, weekday: w, startTime: "09:00", endTime: "12:00", slotMinutes: 30 }
      });
      await prisma.doctorAvailability.create({
        data: { doctorId: d.id, weekday: w, startTime: "14:00", endTime: "17:00", slotMinutes: 30 }
      });
    }
  }

  console.log("Seed completed.");
  console.log("Patients:", p1.id, p2.id);
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
