import Fastify from "fastify";
import cors from "@fastify/cors";
import { ZodError } from "zod";
import { patientsRoutes } from "./routes/patients";
import { doctorsRoutes } from "./routes/doctors";
import { appointmentsRoutes } from "./routes/appointments";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

// Trasforma errori di validazione in 400 invece di 500
app.setErrorHandler((err, _req, reply) => {
  if (err instanceof ZodError) {
    return reply.code(400).send({
      error: "Validation error",
      details: err.issues
    });
  }
  return reply.code(500).send({ error: "Internal Server Error" });
});

app.get("/health", async () => ({ ok: true }));

await app.register(patientsRoutes);
await app.register(doctorsRoutes);
await app.register(appointmentsRoutes);

const port = Number(process.env.PORT || 3001);
await app.listen({ port, host: "0.0.0.0" });
