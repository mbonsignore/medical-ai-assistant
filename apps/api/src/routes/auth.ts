import { FastifyInstance } from "fastify";
import { z } from "zod";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../db/prisma";

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["PATIENT", "DOCTOR"]),
  name: z.string().min(1),
  specialty: z.string().optional(), // only for doctor
  bio: z.string().optional()
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

function signToken(payload: { userId: string; role: "PATIENT" | "DOCTOR" }) {
  const secret = process.env.JWT_SECRET || "dev_secret_change_me";
  return jwt.sign(payload, secret, { expiresIn: "7d" });
}

function verifyToken(authHeader?: string) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length);
  const secret = process.env.JWT_SECRET || "dev_secret_change_me";
  try {
    return jwt.verify(token, secret) as { userId: string; role: "PATIENT" | "DOCTOR"; iat: number; exp: number };
  } catch {
    return null;
  }
}

export async function authRoutes(app: FastifyInstance) {
  // REGISTER
  app.post("/auth/register", async (req, reply) => {
    const body = RegisterSchema.parse(req.body);

    const exists = await prisma.user.findUnique({ where: { email: body.email } });
    if (exists) return reply.code(409).send({ error: "Email already registered" });

    const passwordHash = await bcrypt.hash(body.password, 10);

    let patientId: string | null = null;
    let doctorId: string | null = null;

    if (body.role === "PATIENT") {
      const patient = await prisma.patient.create({
        data: { name: body.name, email: body.email }
      });
      patientId = patient.id;
    } else {
      const doctor = await prisma.doctor.create({
        data: {
          name: body.name,
          specialty: body.specialty || "General Practice",
          bio: body.bio || ""
        }
      });
      doctorId = doctor.id;
    }

    const user = await prisma.user.create({
      data: { email: body.email, passwordHash, role: body.role, patientId, doctorId },
      select: { id: true, email: true, role: true, patientId: true, doctorId: true, createdAt: true }
    });

    const token = signToken({ userId: user.id, role: user.role });
    return reply.code(201).send({ token, user });
  });

  // LOGIN
  app.post("/auth/login", async (req, reply) => {
    const body = LoginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user) return reply.code(401).send({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(body.password, user.passwordHash);
    if (!ok) return reply.code(401).send({ error: "Invalid credentials" });

    const token = signToken({ userId: user.id, role: user.role });
    return reply.send({
      token,
      user: { id: user.id, email: user.email, role: user.role, patientId: user.patientId, doctorId: user.doctorId, createdAt: user.createdAt }
    });
  });

  // ME
  app.get("/auth/me", async (req, reply) => {
    const decoded = verifyToken(req.headers.authorization);
    if (!decoded) return reply.code(401).send({ error: "Unauthorized" });

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, role: true, patientId: true, doctorId: true, createdAt: true }
    });

    if (!user) return reply.code(401).send({ error: "Unauthorized" });
    return user;
  });
}