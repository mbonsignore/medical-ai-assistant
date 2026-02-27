export type UserRole = "PATIENT" | "DOCTOR";

export type User = {
  id: string;
  email: string;
  role: UserRole;
  patientId: string | null;
  doctorId: string | null;
  createdAt: string;
};

export type Patient = {
  id: string;
  name: string;
  email?: string | null;
  createdAt: string;
};

export type Doctor = {
  id: string;
  name: string;
  specialty: string;
  bio?: string | null;
  createdAt: string;
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

export type Appointment = {
  id: string;
  patientId: string;
  doctorId: string;
  startTs: string;
  endTs: string;
  status: string;
  createdAt: string;
  patient?: Pick<Patient, "id" | "name" | "email">;
  doctor?: Pick<Doctor, "id" | "name" | "specialty">;
};

export type Message = {
  id: string;
  chatId: string;
  role: "user" | "assistant";
  content: string;
  sources?: any;
  createdAt: string;
};