export type Patient = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

export type Doctor = {
  id: string;
  name: string;
  specialty: string;
  bio?: string;
  createdAt: string;
};

export type DoctorAvailability = {
  id: string;
  doctorId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  slotMinutes: number;
};

export type Chat = {
  id: string;
  patientId: string;
  createdAt: string;
  summary: string | null;
};

export type Slot = {
  startTs: string;
  endTs: string;
  dateLocal?: string;
  startLocal?: string;
  endLocal?: string;
  timeZone?: string;
};

export type RecommendationDoctor = Doctor & {
  slots?: Slot[];
};

export type MessageTriage = {
  triage_level?: "LOW" | "MEDIUM" | "HIGH";
  recommended_specialty?: string;
  red_flags?: string[];
  follow_up_questions?: string[];
  short_summary?: string;
};

export type MessageSources = {
  docs?: Array<{
    id: string;
    source: string;
    title?: string | null;
    score?: number;
  }>;
  triage?: MessageTriage;
  recommendation?: {
    doctors?: RecommendationDoctor[];
  } | null;
  meta?: {
    newIssueDetected?: boolean;
  };
};

export type Message = {
  id: string;
  chatId: string;
  role: "user" | "assistant" | "system";
  content: string;
  sources?: MessageSources;
  createdAt: string;
};

export type Appointment = {
  id: string;
  patientId: string;
  doctorId: string;
  startTs: string;
  endTs: string;
  status: string;
  createdAt: string;
  doctor?: Doctor;
  patient?: Patient;
};