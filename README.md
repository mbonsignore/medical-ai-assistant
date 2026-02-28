# Medical AI Assistant

Demo monorepo for a local medical chat and appointment workflow:

- Patient experience: login/register, symptom chat, triage summary, retrieved document citations, appointment booking, profile.
- Doctor experience: patient list, read-only chat review, booking calendar, weekly availability management.
- Backend behavior: Fastify + Prisma + PostgreSQL with `pgvector`, local Ollama models for triage and answer generation, RAG retrieval from the `Document` table.

This is a demo application only. It does not provide real medical advice, diagnosis, or emergency care guidance.

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Repository Structure](#repository-structure)
- [Prerequisites](#prerequisites)
- [Environment Configuration](#environment-configuration)
- [First Run](#first-run)
- [Demo Users](#demo-users)
- [Database Operations](#database-operations)
- [Useful Commands](#useful-commands)
- [API Overview](#api-overview)
- [Frontend Routes and Behavior](#frontend-routes-and-behavior)
- [Troubleshooting](#troubleshooting)

## Overview

Medical AI Assistant combines three flows in one demo:

1. Patient chat with triage and retrieval-augmented answers.
2. Appointment booking against doctor availability and existing bookings.
3. Doctor-side schedule and patient conversation review.

### Patient features

- Register or log in as a patient.
- Start multiple chats and keep separate concerns in separate threads.
- Send a symptom message and receive:
  - a general-information answer,
  - triage metadata,
  - retrieved RAG documents,
  - suggested doctors and open slots when the case is not flagged as an emergency.
- Book appointments from suggested slots in chat or from the calendar page.
- Cancel or reschedule existing appointments.

### Doctor features

- Register or log in as a doctor.
- Review patient records and chats in read-only mode.
- View booked appointments in calendar layouts.
- Add and delete weekly availability rules.
- Cancel or reschedule booked appointments.

### Safety note

- The backend explicitly instructs the LLM not to diagnose.
- Emergency-style answers are treated as urgent escalation guidance, not a substitute for real care.
- The patient profile and landing page both label the product as a demo and not medical advice.

## Tech Stack

### Backend

- [Fastify](apps/api/src/server.ts) for HTTP routes and CORS.
- [Prisma](apps/api/prisma/schema.prisma) for relational models and most CRUD operations.
- [PostgreSQL + pgvector](docker-compose.yml) for relational data and embeddings.
- [Luxon](apps/api/src/routes/doctors.ts) for `Europe/Rome` slot generation and date-range logic.
- [Ollama integration](apps/api/src/llm/ollama.ts) for:
  - embeddings with `nomic-embed-text`,
  - chat generation with `mistral`.

### Frontend

- [React](apps/web/src/main.tsx) + [Vite](apps/web/package.json).
- [React Router](apps/web/src/app/AppRouter.tsx) for patient/doctor route separation.
- [axios](apps/web/src/api.ts) for API requests.
- [react-big-calendar](apps/web/src/components/calendar/CalendarView.tsx) for patient and doctor calendars.

### Database

- PostgreSQL 16 container from `pgvector/pgvector:pg16`.
- Database name: `health`
- Container name: `health_db`
- Exposed port: `5432`
- `Document.embedding` is added by raw SQL migration as `vector(768)`.

## Repository Structure

```text
medical-ai-assistant/
|-- apps/
|   |-- api/        Fastify API, Prisma schema/migrations, seed and ingest scripts
|   `-- web/        Vite + React frontend
|-- docker-compose.yml
|-- package.json
`-- pnpm-workspace.yaml
```

Important paths:

- [apps/api/package.json](apps/api/package.json): backend scripts
- [apps/api/.env](apps/api/.env): backend runtime configuration
- [apps/api/prisma/schema.prisma](apps/api/prisma/schema.prisma): Prisma models
- [apps/api/prisma/migrations](apps/api/prisma/migrations): schema + pgvector migrations
- [apps/api/prisma/seed.ts](apps/api/prisma/seed.ts): demo users, patients, doctors, availability
- [apps/api/scripts/ingest_medquad.ts](apps/api/scripts/ingest_medquad.ts): MedQuAD ingestion
- [apps/api/scripts/ingest_mimic_demo_icd.ts](apps/api/scripts/ingest_mimic_demo_icd.ts): MIMIC demo ingestion
- [apps/api/scripts/reembed_documents.ts](apps/api/scripts/reembed_documents.ts): embedding backfill
- [apps/api/src/routes](apps/api/src/routes): HTTP endpoints
- [apps/api/src/rag/retriever.ts](apps/api/src/rag/retriever.ts): pgvector similarity retrieval
- [apps/web/src/app/AppRouter.tsx](apps/web/src/app/AppRouter.tsx): route tree
- [apps/web/src/types/index.ts](apps/web/src/types/index.ts): shared frontend data shapes
- [apps/web/src/components/chat/MessageBubble.tsx](apps/web/src/components/chat/MessageBubble.tsx): triage/docs/booking UI
- [apps/web/src/pages/patient](apps/web/src/pages/patient): patient portal pages
- [apps/web/src/pages/doctor](apps/web/src/pages/doctor): doctor portal pages
- `data/`: dataset folder expected by ingest scripts and ignored by git

## Prerequisites

### Required tools

- Node.js: this repo does not declare an `engines` field. Use a current Node.js LTS release that works with `pnpm@10.30.1`.
- `pnpm`: the API package declares `packageManager: "pnpm@10.30.1"`.
- Docker and Docker Compose.
- Ollama, reachable at `http://localhost:11434`.

### Required Ollama models

The backend defaults come from [apps/api/src/llm/ollama.ts](apps/api/src/llm/ollama.ts):

- `OLLAMA_EMBED_MODEL=nomic-embed-text`
- `OLLAMA_CHAT_MODEL=mistral`

Pull them before using chat or re-embedding:

```bash
ollama pull nomic-embed-text
ollama pull mistral
```

## Environment Configuration

### Backend env file

The repo already includes [apps/api/.env](apps/api/.env):

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/health?schema=public"
PORT=3001

OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_EMBED_MODEL=nomic-embed-text
OLLAMA_CHAT_MODEL=mistral
JWT_SECRET=change_me_dev_secret
```

If you change `PORT`, remember that the chat and recommendation routes build internal URLs from that same value, and the frontend currently points to `http://localhost:3001`.

### Frontend env

There is no frontend env file in this repo. [apps/web/src/api.ts](apps/web/src/api.ts) hardcodes:

```ts
baseURL: "http://localhost:3001"
```

## First Run

Run these commands from the repository root unless noted otherwise.

### 1. Install workspace dependencies

```bash
pnpm install
```

### 2. Start PostgreSQL with pgvector

```bash
docker compose up -d db
```

This starts:

- container `health_db`
- database `health`
- port `5432`

### 3. Apply Prisma migrations

```bash
pnpm --filter api exec prisma migrate deploy
```

If you want Prisma Studio later, the same schema is used from `apps/api/prisma/schema.prisma`.

### 4. Make sure Ollama is running and models are available

```bash
ollama pull nomic-embed-text
ollama pull mistral
```

### 5. Seed demo relational data

```bash
pnpm --filter api seed
```

What this does:

- deletes patients, doctors, users, chats, messages, appointments, and availability
- preserves existing `Document` rows
- creates demo patient and doctor accounts
- creates weekly doctor availability rules
- creates one starter chat for the first patient

### 6. Ingest RAG documents and compute embeddings

The two ingest scripts read from local dataset folders under `data/` by default:

- MedQuAD: `data/medquad`
- MIMIC demo: `data/mimic/mimic-iii-clinical-database-demo-1.4`

Run any combination that you have locally:

```bash
pnpm --filter api ingest:medquad
pnpm --filter api ingest:mimic:dx
pnpm --filter api reembed
```

Notes:

- `pnpm --filter api reembed` only fills rows where `embedding IS NULL`.
- If you do not ingest documents, chat still runs, but retrieval sections will be empty.
- You can override dataset paths with env vars such as `MEDQUAD_DIR`, `MIMIC_DIR`, `MIMIC_DICT`, and `MIMIC_DX`.

### 7. Start the apps

Run both from one terminal:

```bash
pnpm dev
```

Or start them separately:

```bash
pnpm --filter api dev
pnpm --filter web dev
```

### 8. Open the app

- API base URL: `http://localhost:3001`
- Health check: `http://localhost:3001/health`
- Frontend dev server: Vite prints the URL on startup. Because [apps/web/vite.config.ts](apps/web/vite.config.ts) does not set `server.port`, this is typically `http://localhost:5173`.

## Demo Users

All seeded demo accounts share the same password:

```text
Password123!
```

### Patient logins

- `mario.rossi@example.com`
- `giulia.verdi@example.com`
- `luca.romano@example.com`
- `francesca.bianchi@example.com`
- `alessandro.greco@example.com`
- `chiara.conti@example.com`

### Doctor logins

- `luca.bianchi@clinic.example.com` - General Practice
- `martina.gallo@clinic.example.com` - General Practice
- `elena.conti@clinic.example.com` - Dermatology
- `marco.rinaldi@clinic.example.com` - Cardiology
- `sara.greco@clinic.example.com` - Gastroenterology
- `paolo.ferri@clinic.example.com` - Neurology
- `chiara.sala@clinic.example.com` - Orthopedics

## Database Operations

### Safe reseed without deleting documents

Use the seed script. It intentionally does not delete `Document`.

```bash
pnpm --filter api seed
```

### Full reset

This drops all tables, reapplies migrations, and reruns the seed flow.

```bash
pnpm --filter api exec prisma migrate reset --force
pnpm --filter api seed
pnpm --filter api ingest:medquad
pnpm --filter api ingest:mimic:dx
pnpm --filter api reembed
```

If you do not need both datasets, skip the ingest command you are not using.

### Open Prisma Studio

```bash
pnpm --filter api exec prisma studio
```

### Verify that RAG documents exist

Using the running Docker container:

```bash
docker exec health_db psql -U postgres -d health -c 'SELECT COUNT(*) AS documents FROM "Document";'
docker exec health_db psql -U postgres -d health -c 'SELECT COUNT(*) AS embedded_documents FROM "Document" WHERE embedding IS NOT NULL;'
```

Expected result:

- `documents > 0` means ingestion worked.
- `embedded_documents > 0` means `pnpm --filter api reembed` has populated vectors.

### Check a few document rows

```bash
docker exec health_db psql -U postgres -d health -c 'SELECT id, source, title FROM "Document" ORDER BY "createdAt" DESC LIMIT 5;'
```

## Useful Commands

### Workspace

```bash
pnpm install
pnpm dev
pnpm build
```

### API

```bash
pnpm --filter api dev
pnpm --filter api build
pnpm --filter api seed
pnpm --filter api ingest:medquad
pnpm --filter api ingest:mimic:dx
pnpm --filter api reembed
pnpm --filter api exec prisma studio
pnpm --filter api exec prisma migrate deploy
pnpm --filter api exec prisma migrate reset --force
```

### Web

```bash
pnpm --filter web dev
pnpm --filter web build
pnpm --filter web lint
```

## API Overview

The frontend types used throughout the app are defined in [apps/web/src/types/index.ts](apps/web/src/types/index.ts):

```ts
type User = {
  id: string;
  email: string;
  role: "PATIENT" | "DOCTOR";
  patientId: string | null;
  doctorId: string | null;
  createdAt: string;
};

type Slot = {
  startTs: string;
  endTs: string;
  dateLocal?: string;
  startLocal?: string;
  endLocal?: string;
  timeZone?: string;
};

type Appointment = {
  id: string;
  patientId: string;
  doctorId: string;
  startTs: string;
  endTs: string;
  status: string;
  createdAt: string;
};
```

### Health

- `GET /health`
  - Response: `{ "ok": true }`

### Auth

Routes live in [apps/api/src/routes/auth.ts](apps/api/src/routes/auth.ts).

- `POST /auth/register`
  - Body: `{ email, password, role, name, specialty?, bio? }`
  - `role` is `PATIENT` or `DOCTOR`
  - For doctors, `specialty` defaults to `General Practice` if omitted
  - Response: `{ token, user }`

- `POST /auth/login`
  - Body: `{ email, password }`
  - Response: `{ token, user }`

- `GET /auth/me`
  - Header: `Authorization: Bearer <token>`
  - Response: current `User`

Example:

```bash
curl -X POST http://localhost:3001/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"mario.rossi@example.com","password":"Password123!"}'
```

### Patients

Routes live in [apps/api/src/routes/patients.ts](apps/api/src/routes/patients.ts) and [apps/api/src/routes/appointments.ts](apps/api/src/routes/appointments.ts).

- `GET /patients`
  - Response: `Patient[]`

- `POST /patients`
  - Body: `{ name, email? }`
  - Response: created `Patient`

- `GET /patients/:id`
  - Response: single `Patient`

- `PUT /patients/:id`
  - Body: partial `{ name?, email? }`
  - Response: updated `Patient`

- `DELETE /patients/:id`
  - Response: `204 No Content`

- `GET /patients/:id/appointments`
  - Response: `Appointment[]` with included `doctor`

- `GET /patients/:id/chats`
  - Response: `Chat[]` ordered by `createdAt DESC`

### Doctors and availability

Routes live in [apps/api/src/routes/doctors.ts](apps/api/src/routes/doctors.ts).

- `GET /doctors`
  - Optional query: `specialty`
  - Response: `Doctor[]`

- `POST /doctors`
  - Body: `{ name, specialty, bio? }`
  - Response: created `Doctor`

- `GET /doctors/:id`
  - Response: doctor with `availability[]`, ordered by weekday then start time

- `PUT /doctors/:id`
  - Body: partial `{ name?, specialty?, bio? }`
  - Response: updated `Doctor`

- `DELETE /doctors/:id`
  - Response: `204 No Content`

- `POST /doctors/:id/availability`
  - Body: `{ weekday, startTime, endTime, slotMinutes }`
  - `weekday` is `1..7` for `Mon..Sun`
  - Rejects duplicates and overlapping rules with `409`

- `PUT /doctors/:doctorId/availability/:availabilityId`
  - Body: partial availability fields
  - Response: updated availability row

- `DELETE /doctors/:doctorId/availability/:availabilityId`
  - Response: `204 No Content`

- `GET /doctors/:id/slots?from=YYYY-MM-DD&to=YYYY-MM-DD`
  - Uses `Europe/Rome` internally
  - Response:

```json
{
  "doctorId": "doctor_id",
  "from": "2026-02-28",
  "to": "2026-03-06",
  "slots": [
    {
      "startTs": "2026-03-02T08:00:00.000Z",
      "endTs": "2026-03-02T08:30:00.000Z",
      "dateLocal": "2026-03-02",
      "startLocal": "09:00",
      "endLocal": "09:30",
      "timeZone": "Europe/Rome"
    }
  ]
}
```

- `GET /doctors/:id/appointments?from=YYYY-MM-DD&to=YYYY-MM-DD`
  - Response: `{ doctorId, from, to, appointments }`
  - Each appointment includes `patient` and `doctor`

Example:

```bash
curl "http://localhost:3001/doctors/<doctorId>/slots?from=2026-03-02&to=2026-03-02"
```

### Appointments and bookings

Routes live in [apps/api/src/routes/appointments.ts](apps/api/src/routes/appointments.ts).

- `POST /appointments`
- `POST /bookings`
  - Same booking behavior
  - Body: `{ patientId, doctorId, startTs, endTs }`
  - Response: created `Appointment`
  - Returns `409` when the slot overlaps an existing `BOOKED` appointment

- `GET /appointments/:id`
  - Response: single appointment with `patient` and `doctor`

- `PATCH /appointments/:id`
  - Body:
    - cancel: `{ "status": "CANCELLED" }`
    - reschedule: `{ "startTs": "...", "endTs": "...", "status": "BOOKED" }`
  - Returns `409` if the new time overlaps another booking

Example:

```bash
curl -X POST http://localhost:3001/bookings \
  -H 'Content-Type: application/json' \
  -d '{
    "patientId":"<patientId>",
    "doctorId":"<doctorId>",
    "startTs":"2026-03-02T08:00:00.000Z",
    "endTs":"2026-03-02T08:30:00.000Z"
  }'
```

### Chats

Routes live in [apps/api/src/routes/chats.ts](apps/api/src/routes/chats.ts).

- `POST /chats`
  - Body: `{ patientId }`
  - Response: created `Chat`

- `GET /patients/:id/chats`
  - Response: `Chat[]`

- `GET /chats/:id/messages`
  - Response: `Message[]`
  - `sources` is normalized into an object before returning

- `POST /chats/:id/message`
  - Body: `{ content }`
  - Saves the user message, runs triage, retrieves docs, generates an answer, stores assistant `sources`, and updates chat summary
  - Response:

```json
{
  "userMsg": {
    "id": "msg_user",
    "chatId": "chat_id",
    "role": "user",
    "content": "I have a mild headache",
    "createdAt": "2026-02-28T12:00:00.000Z"
  },
  "assistantMsg": {
    "id": "msg_assistant",
    "chatId": "chat_id",
    "role": "assistant",
    "content": "General educational answer...",
    "sources": {
      "docs": [],
      "triage": {
        "triage_level": "LOW",
        "recommended_specialty": "General Practice",
        "red_flags": [],
        "follow_up_questions": ["...", "...", "..."],
        "short_summary": ""
      },
      "recommendation": {
        "doctors": []
      },
      "meta": {
        "newIssueDetected": false
      },
      "ui": {
        "emergency": false,
        "issueNote": null,
        "emergencyActions": null
      }
    },
    "createdAt": "2026-02-28T12:00:01.000Z"
  }
}
```

Example:

```bash
curl -X POST http://localhost:3001/chats/<chatId>/message \
  -H 'Content-Type: application/json' \
  -d '{"content":"I have stomach pain after lunch"}'
```

### Documents

Routes live in [apps/api/src/routes/documents.ts](apps/api/src/routes/documents.ts).

- `GET /documents/:id`
  - Returns the full document record used by the frontend "View text" action

Example:

```bash
curl http://localhost:3001/documents/<documentId>
```

### Additional dev/admin endpoints

- `POST /rag/seed`
  - Inserts one minimal demo RAG document
- `POST /rag/query`
  - Body: `{ query }`
  - Returns the top retrieved docs
- `POST /recommend/doctor`
  - Body: `{ query }`
  - Returns specialty triage + doctors
- `POST /recommend/doctor-slots`
  - Body: `{ query, from, to, perDoctor }`
  - Returns specialty triage + doctors with slots

## Frontend Routes and Behavior

Routes are defined in [apps/web/src/app/AppRouter.tsx](apps/web/src/app/AppRouter.tsx).

### Public

- `/`
  - Landing page with login/register forms
  - Quick-fill buttons for seeded patient and doctor demo accounts

### Patient portal

- `/patient`
  - Home cards for Chat, Calendar, and Profile
- `/patient/chat`
  - Multi-chat sidebar
  - typing indicator while waiting for the backend
  - "new issue detected" notice with a shortcut to start a new chat
  - retrieved document list with on-demand full-text fetch
  - booking buttons directly from suggested doctor slots
  - booking confirmation modal
- `/patient/appointments`
  - calendar with month/week/day/agenda views
  - doctor picker and date picker for open slots
  - morning/afternoon slot grouping
  - appointment details modal with cancel/reschedule actions
- `/patient/profile`
  - account summary and demo/safety notes

### Doctor portal

- `/doctor`
  - Home cards for Patients and Calendar
- `/doctor/patients`
  - patient list
  - chat list per patient
  - read-only message viewer using the same triage/docs UI cards
- `/doctor/calendar`
  - calendar for bookings
  - modal for booking details
  - cancel/reschedule workflow
  - weekly availability management

### Calendar and appointment behavior

- Both patient and doctor pages use [apps/web/src/components/calendar/CalendarView.tsx](apps/web/src/components/calendar/CalendarView.tsx), a controlled wrapper around `react-big-calendar`.
- Appointments are synchronized across tabs with `BroadcastChannel("maa_appointments")` and fall back to a `localStorage` event key when `BroadcastChannel` is unavailable.
- Slot generation on the API side uses `Europe/Rome`; returned slots include both UTC timestamps and local display fields (`startLocal`, `endLocal`, `timeZone`).

## Troubleshooting

### `PATCH /appointments/:id` fails because CORS blocks PATCH

The fix is in [apps/api/src/server.ts](apps/api/src/server.ts). The Fastify CORS config must allow:

- `PATCH`
- `Authorization`
- `Content-Type`

Current allowed methods are:

```ts
methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
```

### Chat shows no retrieved documents

Most common causes:

1. `Document` is empty.
2. `Document` rows exist but `embedding` is still `NULL`.

Check both:

```bash
docker exec health_db psql -U postgres -d health -c 'SELECT COUNT(*) FROM "Document";'
docker exec health_db psql -U postgres -d health -c 'SELECT COUNT(*) FROM "Document" WHERE embedding IS NOT NULL;'
```

Then run:

```bash
pnpm --filter api ingest:medquad
pnpm --filter api ingest:mimic:dx
pnpm --filter api reembed
```

### Embedding or chat calls fail against Ollama

The API expects:

- `OLLAMA_BASE_URL=http://localhost:11434`
- embed model `nomic-embed-text`
- chat model `mistral`

Confirm the models are available:

```bash
ollama pull nomic-embed-text
ollama pull mistral
```

### `psql: command not found` on macOS

Use the running Docker container instead of a local `psql` install:

```bash
docker exec -it health_db psql -U postgres -d health
```

Or use Prisma tooling:

```bash
pnpm --filter api exec prisma studio
```

### Booking returns `409 Conflict`

The backend checks for overlap before creating or rescheduling appointments. A `409` means the slot was already booked or was taken during a race.

Fix:

1. Refresh available slots.
2. Pick another time.
3. Retry the booking or reschedule.

The patient and doctor calendar pages already refresh slot lists after a conflict where possible.

### One-off `tsx` scripts throw top-level await errors

Wrap quick experiments in an async IIFE instead of relying on top-level await:

```bash
pnpm --filter api exec tsx -e '(async () => {
  const { prisma } = await import("./src/db/prisma.ts");
  console.log(await prisma.document.count());
  await prisma.$disconnect();
})()'
```

### Calendar view gets out of sync

[apps/web/src/components/calendar/CalendarView.tsx](apps/web/src/components/calendar/CalendarView.tsx) is written as a controlled component. Pass `view`, `date`, `onView`, and `onNavigate` together as the patient and doctor pages do. Do not mix controlled and uncontrolled `react-big-calendar` patterns when extending it.

## Demo Reminder

This repository is intentionally demo-focused:

- authentication and route protection are minimal,
- the LLM is local and non-streaming,
- medical answers are educational only,
- `Europe/Rome` is the slot-generation timezone on the backend.

For a deeper architectural walkthrough, keep a local companion note in `PERSONAL.md`.
