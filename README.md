# Medical AI Assistant

Medical AI Assistant is a demo monorepo with:

- a Fastify + Prisma API for auth, chat, appointments, doctors, patients, and RAG
- a React + Vite frontend with separate patient and doctor portals
- PostgreSQL with `pgvector` for relational data and document embeddings
- local Ollama models for triage and answer generation

This is a demo application only. It does not provide medical advice, diagnosis, or emergency care.

## Overview

Patient flow:

- register or log in
- start chats
- receive a general-information answer, triage metadata, and retrieved document citations
- book appointments from suggested slots or from the calendar page
- cancel or reschedule appointments

Doctor flow:

- register or log in
- review patients and chats in read-only mode
- view bookings in a calendar
- add or delete weekly availability
- cancel or reschedule appointments

## Tech Stack

Backend:

- Fastify
- Prisma
- PostgreSQL
- `pgvector`
- Luxon for `Europe/Rome` slot generation
- Ollama with default model names from code:
  - `nomic-embed-text`
  - `mistral`

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

Important paths:

- `apps/api/package.json` - API scripts
- `apps/api/prisma/schema.prisma` - Prisma schema
- `apps/api/prisma/seed.ts` - demo data
- `apps/api/prisma/migrations/` - schema and pgvector SQL
- `apps/api/scripts/` - ingest and re-embed scripts
- `apps/api/src/routes/` - API endpoints
- `apps/api/src/rag/retriever.ts` - pgvector retrieval
- `apps/api/src/llm/ollama.ts` - Ollama adapter
- `apps/web/src/app/AppRouter.tsx` - frontend routes
- `apps/web/src/types/index.ts` - frontend types
- `apps/web/src/components/chat/MessageBubble.tsx` - triage/docs/booking UI

## Prerequisites

- Node.js compatible with this workspace and `pnpm@10.30.1`
- pnpm
- Docker
- Ollama

Ollama models used by default in code:

```bash
ollama pull nomic-embed-text
ollama pull mistral
```

## Environment Setup

Create the API env file locally from the safe example:

```bash
cp apps/api/.env.example apps/api/.env
```

The current web app does not read frontend env variables. `apps/web/src/api.ts` uses a fixed API base URL of `http://localhost:3001`.

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

### 4. Seed demo relational data

```bash
pnpm --filter api seed
```

Verified behavior from `apps/api/prisma/seed.ts`:

- deletes `DoctorAvailability`, `Appointment`, `Message`, `Chat`, `User`, `Doctor`, and `Patient`
- does not delete `Document`
- creates demo patients and doctors
- creates weekly availability rules
- creates one demo chat with two starter messages for the first patient

### 5. Ingest documents and compute embeddings

The ingest scripts read datasets from relative `data/` directories by default:

- MedQuAD: `data/medquad`
- MIMIC demo: `data/mimic/mimic-iii-clinical-database-demo-1.4`

Run the scripts you need:

```bash
pnpm --filter api ingest:medquad
pnpm --filter api ingest:mimic:dx
pnpm --filter api reembed
```

Notes:

- `reembed` only updates rows where `embedding IS NULL`
- chat still works without documents, but retrieved-doc sections will be empty

### 6. Start the apps

The root workspace does have a `dev` script:

```bash
pnpm dev
```

That runs `pnpm -r dev`, which starts both packages.

You can also run them separately:

```bash
pnpm --filter api dev
pnpm --filter web dev
```

### 7. Open the app

- API health check: `http://localhost:3001/health`
- Frontend: Vite prints the local URL at startup

There is no custom Vite dev-server port configured in `apps/web/vite.config.ts`.

## Demo Users

The seed script creates these accounts and assigns them all the same fake demo password:

```text
Password123!
```

Patients:

- `mario.rossi@example.com`
- `giulia.verdi@example.com`
- `luca.romano@example.com`
- `francesca.bianchi@example.com`
- `alessandro.greco@example.com`
- `chiara.conti@example.com`

Doctors:

- `luca.bianchi@clinic.example.com`
- `martina.gallo@clinic.example.com`
- `elena.conti@clinic.example.com`
- `marco.rinaldi@clinic.example.com`
- `sara.greco@clinic.example.com`
- `paolo.ferri@clinic.example.com`
- `chiara.sala@clinic.example.com`

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

Open Prisma Studio:

```bash
pnpm --filter api exec prisma studio
```

Inspect the running database inside the verified container:

```bash
docker exec health_db psql -U postgres -d health -c 'SELECT COUNT(*) AS documents FROM "Document";'
docker exec health_db psql -U postgres -d health -c 'SELECT COUNT(*) AS embedded_documents FROM "Document" WHERE embedding IS NOT NULL;'
docker exec health_db psql -U postgres -d health -c 'SELECT id, source, title FROM "Document" ORDER BY "createdAt" DESC LIMIT 5;'
```

## API Overview

Routes are registered in `apps/api/src/server.ts`.

Demo limitation:

- the frontend uses bearer tokens and route guards
- the backend only enforces bearer-token auth on `GET /auth/me`
- most other API routes do not currently enforce auth or ownership checks

### Health

- `GET /health`
  - Auth header: none
  - Body/query: none

### Auth

- `POST /auth/register`
  - Auth header: none
  - Body: `email`, `password`, `role`, `name`, optional `specialty`, optional `bio`

- `POST /auth/login`
  - Auth header: none
  - Body: `email`, `password`

- `GET /auth/me`
  - Auth header: `Authorization: Bearer <token>`
  - Body/query: none

### Patients

- `POST /patients`
  - Auth header: none enforced
  - Body: `name`, optional `email`

- `GET /patients`
  - Auth header: none enforced
  - Body/query: none

- `GET /patients/:id`
  - Auth header: none enforced
  - Body/query: none

- `PUT /patients/:id`
  - Auth header: none enforced
  - Body: partial `name`, `email`

- `DELETE /patients/:id`
  - Auth header: none enforced
  - Body/query: none

- `GET /patients/:id/appointments`
  - Auth header: none enforced
  - Body/query: none

- `GET /patients/:id/chats`
  - Auth header: none enforced
  - Body/query: none

### Doctors

- `POST /doctors`
  - Auth header: none enforced
  - Body: `name`, `specialty`, optional `bio`

- `GET /doctors`
  - Auth header: none enforced
  - Query: optional `specialty`

- `GET /doctors/:id`
  - Auth header: none enforced
  - Body/query: none

- `PUT /doctors/:id`
  - Auth header: none enforced
  - Body: partial `name`, `specialty`, `bio`

- `DELETE /doctors/:id`
  - Auth header: none enforced
  - Body/query: none

- `POST /doctors/:id/availability`
  - Auth header: none enforced
  - Body: `weekday`, `startTime`, `endTime`, `slotMinutes`

- `PUT /doctors/:doctorId/availability/:availabilityId`
  - Auth header: none enforced
  - Body: partial `weekday`, `startTime`, `endTime`, `slotMinutes`

- `DELETE /doctors/:doctorId/availability/:availabilityId`
  - Auth header: none enforced
  - Body/query: none

- `GET /doctors/:id/slots`
  - Auth header: none enforced
  - Query: `from=YYYY-MM-DD`, `to=YYYY-MM-DD`
  - Returns free slots generated in `Europe/Rome` and serialized with UTC timestamps plus local display fields

- `GET /doctors/:id/appointments`
  - Auth header: none enforced
  - Query: optional `from=YYYY-MM-DD`, optional `to=YYYY-MM-DD`

### Appointments

- `POST /appointments`
  - Auth header: none enforced
  - Body: `patientId`, `doctorId`, `startTs`, `endTs`

- `POST /bookings`
  - Auth header: none enforced
  - Body: `patientId`, `doctorId`, `startTs`, `endTs`
  - Alias of the same booking logic

- `GET /appointments/:id`
  - Auth header: none enforced
  - Body/query: none

- `PATCH /appointments/:id`
  - Auth header: none enforced
  - Body:
    - cancel: `status`
    - reschedule: `startTs`, `endTs`, optional `status`

### Chats

- `POST /chats`
  - Auth header: none enforced
  - Body: `patientId`

- `GET /patients/:id/chats`
  - Auth header: none enforced
  - Body/query: none

- `GET /chats/:id/messages`
  - Auth header: none enforced
  - Body/query: none
  - Response rows normalize `sources` before returning

- `POST /chats/:id/message`
  - Auth header: none enforced
  - Body: `content`
  - Stores both the user message and an assistant message with `sources`

### Documents

- `GET /documents/:id`
  - Auth header: none enforced
  - Body/query: none

### RAG / Recommendation helpers

- `POST /rag/seed`
  - Auth header: none enforced
  - Body/query: none

- `POST /rag/query`
  - Auth header: none enforced
  - Body: `query`

- `POST /recommend/doctor`
  - Auth header: none enforced
  - Body: `query`

- `POST /recommend/doctor-slots`
  - Auth header: none enforced
  - Body: `query`, `from`, `to`, optional `perDoctor`

## Frontend Routes and Behavior

Routes from `apps/web/src/app/AppRouter.tsx`:

- `/`
- `/patient`
- `/patient/chat`
- `/patient/appointments`
- `/patient/profile`
- `/doctor`
- `/doctor/patients`
- `/doctor/calendar`

Notable behavior verified in code:

- patient chat shows a typing indicator while waiting for the API
- patient chat can flag a new issue and suggest starting a new chat
- assistant messages can show triage, red flags, follow-up questions, and retrieved docs
- retrieved document text is fetched lazily from `GET /documents/:id`
- suggested booking slots can be booked from chat
- patient and doctor calendars support cancel and reschedule flows
- slot lists are grouped into morning and afternoon sections in calendar pages
- appointment updates are broadcast across tabs with `BroadcastChannel("maa_appointments")` and a `localStorage` fallback

## Troubleshooting

### `PATCH` requests fail in the browser

Check the Fastify CORS config in `apps/api/src/server.ts`. The current allowed methods include:

```ts
["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
```

### Retrieved docs are empty

Check whether documents exist and whether embeddings were generated:

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

The API code defaults to:

- `http://localhost:11434`
- `nomic-embed-text`
- `mistral`

Make sure Ollama is running and those models are available.

### `psql` is not installed locally

Use the containerized client instead:

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

### Calendar state behaves oddly after changes

`apps/web/src/components/calendar/CalendarView.tsx` is used as a controlled wrapper. Keep `view`, `date`, `onView`, and `onNavigate` wired together when extending it.
