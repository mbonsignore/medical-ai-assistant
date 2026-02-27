import Fastify from "fastify";
import cors from "@fastify/cors";
import { ZodError } from "zod";
import { patientsRoutes } from "./routes/patients";
import { doctorsRoutes } from "./routes/doctors";
import { appointmentsRoutes } from "./routes/appointments";
import { chatsRoutes } from "./routes/chats";
import { ragRoutes } from "./routes/rag";
import { recommendRoutes } from "./routes/recommend";
import { documentsRoutes } from "./routes/documents";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

app.setErrorHandler((err, _req, reply) => {
  if (err instanceof ZodError) {
    return reply.code(400).send({ error: "Validation error", details: err.issues });
  }
  return reply.code(500).send({ error: "Internal Server Error" });
});

app.get("/health", async () => ({ ok: true }));

await app.register(patientsRoutes);
await app.register(doctorsRoutes);
await app.register(appointmentsRoutes);
await app.register(chatsRoutes);
await app.register(ragRoutes);
await app.register(recommendRoutes);
await app.register(documentsRoutes);

const port = Number(process.env.PORT || 3001);
await app.listen({ port, host: "0.0.0.0" });