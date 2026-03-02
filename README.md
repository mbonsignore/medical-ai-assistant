# Medical AI Assistant

Medical AI Assistant is a demo monorepo with:

- a Fastify + Prisma API for auth, chat, appointments, doctor/patient records, AI helpers, and RAG
- a React + Vite frontend with separate patient and doctor portals
- PostgreSQL with `pgvector` for relational data and document retrieval
- local Ollama integration for medical-chat routing/triage, answer generation, and clinical-note generation

This is a demo application only. It does not provide medical advice, diagnosis, or emergency care.

## Overview

Patient portal:

- start chats and receive general-information responses
- see triage output, retrieved document citations, and suggested booking slots when appropriate
- book, cancel, or reschedule appointments
- get a standard non-clinical response for administrative requests such as booking/account/support actions

Doctor portal:

- review patients and chats in read-only mode
- manage bookings and weekly availability
- generate a structured clinical note from a selected chat

## Tech Stack

Backend:

- Fastify
- Prisma
- PostgreSQL
- `pgvector`
- Luxon for `Europe/Rome` scheduling logic
- Ollama

Frontend:

- React
- Vite
- React Router
- axios
- react-big-calendar

## Repository Structure

```text
medical-ai-assistant/
|-- apps/
|   |-- api/
|   `-- web/
|-- docker-compose.yml
|-- package.json
`-- pnpm-workspace.yaml
```

Key paths:

- `apps/api/src/server.ts`
- `apps/api/src/routes/`
- `apps/api/src/llm/ollama.ts`
- `apps/api/src/rag/retriever.ts`
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/seed.ts`
- `apps/web/src/app/AppRouter.tsx`
- `apps/web/src/pages/patient/`
- `apps/web/src/pages/doctor/`

## Prerequisites

- Node.js compatible with the workspace and `pnpm@10.30.1`
- pnpm
- Docker
- Ollama

The Ollama adapter defaults in code to:

- embedding model: `nomic-embed-text`
- chat model: `mistral`

Install those locally before using AI features:

```bash
ollama pull nomic-embed-text
ollama pull mistral
```

## Environment Setup

Create the API env file locally from the example:

```bash
cp apps/api/.env.example apps/api/.env
```

The current web app does not read frontend env variables. The frontend API base URL is hardcoded in `apps/web/src/api.ts`.

## First Run

From the repository root:

### 1. Install dependencies

```bash
pnpm install
```

### 2. Start PostgreSQL

Verified from `docker-compose.yml`:

- service name: `db`
- container name: `health_db`
- exposed port: `5432:5432`
- database name: `health`

Start it with:

```bash
docker compose up -d db
```

### 3. Apply Prisma migrations

```bash
pnpm --filter api exec prisma migrate deploy
```

### 4. Seed demo data

```bash
pnpm --filter api seed
```

Verified behavior from `apps/api/prisma/seed.ts`:

- clears users, chats, messages, appointments, doctors, patients, and availability
- preserves `Document`
- creates demo patient and doctor records
- creates weekly availability rules
- creates one starter chat with two messages for the first seeded patient

The seed script creates demo users, but this public README intentionally does not list credentials. Check `apps/api/prisma/seed.ts` locally if you need the exact seeded records for development.

### 5. Ingest documents and compute embeddings

The API package includes these scripts:

```bash
pnpm --filter api ingest:medquad
pnpm --filter api ingest:mimic:dx
pnpm --filter api reembed
```

Verified default dataset roots in code:

- `data/medquad`
- `data/mimic/mimic-iii-clinical-database-demo-1.4`

Notes:

- `reembed` only fills rows where `embedding IS NULL`
- chat still works without documents, but retrieved-doc sections will be empty

### 6. Start the apps

Start both packages:

```bash
pnpm dev
```

Or run them separately:

```bash
pnpm --filter api dev
pnpm --filter web dev
```

### 7. Open the app

- API health check: `http://localhost:3001/health`
- frontend: Vite prints the local URL on startup

There is no custom Vite dev-server port configured in `apps/web/vite.config.ts`.

## Useful Commands

Workspace:

```bash
pnpm install
pnpm dev
pnpm build
```

API:

```bash
pnpm --filter api dev
pnpm --filter api build
pnpm --filter api start
pnpm --filter api seed
pnpm --filter api ingest:medquad
pnpm --filter api ingest:mimic:dx
pnpm --filter api reembed
pnpm --filter api exec prisma migrate deploy
pnpm --filter api exec prisma migrate reset --force
pnpm --filter api exec prisma studio
```

Web:

```bash
pnpm --filter web dev
pnpm --filter web build
pnpm --filter web lint
pnpm --filter web preview
```

## Database Operations

Safe reseed without deleting documents:

```bash
pnpm --filter api seed
```

Full reset:

```bash
pnpm --filter api exec prisma migrate reset --force
pnpm --filter api seed
pnpm --filter api ingest:medquad
pnpm --filter api ingest:mimic:dx
pnpm --filter api reembed
```

Inspect the running database inside the verified container:

```bash
docker exec health_db psql -U postgres -d health -c 'SELECT COUNT(*) AS documents FROM "Document";'
docker exec health_db psql -U postgres -d health -c 'SELECT COUNT(*) AS embedded_documents FROM "Document" WHERE embedding IS NOT NULL;'
docker exec health_db psql -U postgres -d health -c 'SELECT id, source, title FROM "Document" ORDER BY "createdAt" DESC LIMIT 5;'
```

## API Overview

Routes are registered in `apps/api/src/server.ts`.

Current demo limitation:

- the frontend uses bearer tokens and route guards
- backend auth is only enforced on `GET /auth/me`
- most domain routes do not currently enforce auth or ownership checks

### Health

- `GET /health`

### Auth

- `POST /auth/register`
  - body: `email`, `password`, `role`, `name`, optional `specialty`, optional `bio`
- `POST /auth/login`
  - body: `email`, `password`
- `GET /auth/me`
  - header: `Authorization: Bearer <token>`

### Patients

- `POST /patients`
- `GET /patients`
- `GET /patients/:id`
- `PUT /patients/:id`
- `DELETE /patients/:id`
- `GET /patients/:id/appointments`
- `GET /patients/:id/chats`

### Doctors

- `POST /doctors`
- `GET /doctors`
- `GET /doctors/:id`
- `PUT /doctors/:id`
- `DELETE /doctors/:id`
- `POST /doctors/:id/availability`
- `PUT /doctors/:doctorId/availability/:availabilityId`
- `DELETE /doctors/:doctorId/availability/:availabilityId`
- `GET /doctors/:id/slots`
  - query: `from=YYYY-MM-DD`, `to=YYYY-MM-DD`
- `GET /doctors/:id/appointments`
  - query: optional `from=YYYY-MM-DD`, optional `to=YYYY-MM-DD`

### Appointments

- `POST /appointments`
- `POST /bookings`
- `GET /appointments/:id`
- `PATCH /appointments/:id`

### Chats

- `POST /chats`
  - body: `patientId`
- `GET /chats/:id/messages`
- `POST /chats/:id/message`
  - body: `content`
  - non-admin messages go through router/triage, retrieval, answer generation, and recommendation logic
  - admin-style requests are handled by a deterministic bypass that returns a standard manage-in-app response

### Documents / RAG / Recommendations

- `GET /documents/:id`
- `POST /rag/seed`
- `POST /rag/query`
- `POST /recommend/doctor`
- `POST /recommend/doctor-slots`

### AI Clinical Note

- `POST /ai/clinical-note`
  - body: `chatId`
  - returns a structured note with:
    - `chief_complaint`
    - `timeline`
    - `triage_and_red_flags`
    - `suggested_specialty`
    - `open_questions`
    - `when_to_escalate`

## Frontend Routes and Features

Routes from `apps/web/src/app/AppRouter.tsx`:

- `/`
- `/patient`
- `/patient/chat`
- `/patient/appointments`
- `/patient/profile`
- `/doctor`
- `/doctor/patients`
- `/doctor/calendar`

Verified behavior:

- patient chat shows typing state while waiting for the API
- assistant messages can show triage, follow-up questions, retrieved docs, emergency actions, and booking suggestions
- a new unrelated issue can trigger a visible issue note
- admin-style chat requests skip medical triage UI
- retrieved document text is fetched lazily from `GET /documents/:id`
- patient and doctor calendars support cancel and reschedule flows
- the doctor patient view includes a “Generate clinical note” action and a structured modal view of the note

## Troubleshooting

### Browser `PATCH` requests fail

Check the Fastify CORS config in `apps/api/src/server.ts`. The current allowed methods include:

```ts
["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
```

### Retrieved docs are empty

Check both document count and embedding count:

```bash
docker exec health_db psql -U postgres -d health -c 'SELECT COUNT(*) FROM "Document";'
docker exec health_db psql -U postgres -d health -c 'SELECT COUNT(*) FROM "Document" WHERE embedding IS NOT NULL;'
```

If needed:

```bash
pnpm --filter api ingest:medquad
pnpm --filter api ingest:mimic:dx
pnpm --filter api reembed
```

### Ollama calls fail

The adapter defaults in code to `http://localhost:11434`, `nomic-embed-text`, and `mistral`. Make sure Ollama is running and those models are installed locally.

### `psql` is not installed locally

Use the database client inside the running container:

```bash
docker exec -it health_db psql -U postgres -d health
```

### Booking returns `409`

That means the requested slot overlaps an existing `BOOKED` appointment. Refresh slots and choose another time.

### Quick `tsx` checks fail with top-level await

Use an async IIFE:

```bash
pnpm --filter api exec tsx -e '(async () => {
  const { prisma } = await import("./src/db/prisma.ts");
  console.log(await prisma.document.count());
  await prisma.$disconnect();
})()'
```
