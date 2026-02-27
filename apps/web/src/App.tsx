import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import type {
  Appointment,
  Chat,
  Doctor,
  DoctorAvailability,
  Message,
  Patient,
} from "./types";
import { Sidebar } from "./components/Sidebar";
import { ChatPanel } from "./components/ChatPanel";
import { AppointmentsPanel } from "./components/AppointmentsPanel";
import "./styles.css";

type Role = "patient" | "doctor";

function App() {
  const [role, setRole] = useState<Role>("patient");

  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);

  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [selectedDoctorId, setSelectedDoctorId] = useState("");

  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [doctorAvailability, setDoctorAvailability] = useState<DoctorAvailability[]>([]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const [availabilityForm, setAvailabilityForm] = useState({
    weekday: 1,
    startTime: "09:00",
    endTime: "12:00",
    slotMinutes: 30,
  });

  const selectedChat = chats.find((c) => c.id === selectedChatId) || null;

  const latestAssistantMessage = useMemo(() => {
    const assistants = messages.filter((m) => m.role === "assistant");
    return assistants.length ? assistants[assistants.length - 1] : null;
  }, [messages]);

  const selectedPatient = patients.find((p) => p.id === selectedPatientId) || null;
  const selectedDoctor = doctors.find((d) => d.id === selectedDoctorId) || null;

  async function loadPatients() {
    const res = await api.get<Patient[]>("/patients");
    setPatients(res.data);

    if (!selectedPatientId && res.data.length > 0) {
      setSelectedPatientId(res.data[0].id);
    }
  }

  async function loadDoctors() {
    const res = await api.get<Doctor[]>("/doctors");
    setDoctors(res.data);

    if (!selectedDoctorId && res.data.length > 0) {
      setSelectedDoctorId(res.data[0].id);
    }
  }

  async function loadChats(patientId: string) {
    const res = await api.get<Chat[]>(`/patients/${patientId}/chats`);
    setChats(res.data);

    if (res.data.length > 0) {
      setSelectedChatId((prev) => {
        const stillExists = res.data.some((c) => c.id === prev);
        return stillExists ? prev : res.data[0].id;
      });
    } else {
      setSelectedChatId("");
      setMessages([]);
    }
  }

  async function loadMessages(chatId: string) {
    const res = await api.get<Message[]>(`/chats/${chatId}/messages`);
    setMessages(res.data);
  }

  async function loadAppointments(patientId: string) {
    const res = await api.get<Appointment[]>(`/patients/${patientId}/appointments`);
    setAppointments(res.data);
  }

  async function loadDoctorAvailability(doctorId: string) {
    const res = await api.get<Doctor & { availability: DoctorAvailability[] }>(`/doctors/${doctorId}`);
    setDoctorAvailability(res.data.availability || []);
  }

  async function createChat() {
    if (!selectedPatientId || role !== "patient") return;
    const res = await api.post<Chat>("/chats", { patientId: selectedPatientId });
    await loadChats(selectedPatientId);
    setSelectedChatId(res.data.id);
    await loadMessages(res.data.id);
  }

  async function sendMessage() {
    if (role !== "patient") return;
    if (!selectedChatId || !input.trim()) return;

    setLoading(true);
    try {
      await api.post(`/chats/${selectedChatId}/message`, { content: input });
      setInput("");
      await loadMessages(selectedChatId);
      if (selectedPatientId) {
        await loadChats(selectedPatientId);
      }
    } finally {
      setLoading(false);
    }
  }

  async function bookSlot(doctorId: string, startTs: string, endTs: string) {
    if (!selectedPatientId) return;

    await api.post("/bookings", {
      patientId: selectedPatientId,
      doctorId,
      startTs,
      endTs,
    });

    await loadAppointments(selectedPatientId);
    alert("Appointment booked successfully.");
  }

  async function addAvailability() {
    if (!selectedDoctorId) return;

    await api.post(`/doctors/${selectedDoctorId}/availability`, {
      weekday: Number(availabilityForm.weekday),
      startTime: availabilityForm.startTime,
      endTime: availabilityForm.endTime,
      slotMinutes: Number(availabilityForm.slotMinutes),
    });

    await loadDoctorAvailability(selectedDoctorId);
    alert("Availability added.");
  }

  useEffect(() => {
    loadPatients();
    loadDoctors();
  }, []);

  useEffect(() => {
    if (selectedPatientId) {
      loadChats(selectedPatientId);
      loadAppointments(selectedPatientId);
    }
  }, [selectedPatientId]);

  useEffect(() => {
    if (selectedChatId) {
      loadMessages(selectedChatId);
    }
  }, [selectedChatId]);

  useEffect(() => {
    if (selectedDoctorId) {
      loadDoctorAvailability(selectedDoctorId);
    }
  }, [selectedDoctorId]);

  return (
    <div className="app-page">
      <div className="topbar">
        <div>
          <div className="eyebrow">Medical AI Assistant</div>
          <h1 className="app-title">Healthcare Virtual Assistant Dashboard</h1>
        </div>

        <div className="role-switch">
          <button
            className={role === "patient" ? "primary" : ""}
            onClick={() => setRole("patient")}
          >
            Patient Portal
          </button>
          <button
            className={role === "doctor" ? "primary" : ""}
            onClick={() => setRole("doctor")}
          >
            Doctor Portal
          </button>
        </div>
      </div>

      <div className="app-shell">
        <Sidebar
          role={role}
          patients={patients}
          doctors={doctors}
          selectedPatientId={selectedPatientId}
          selectedDoctorId={selectedDoctorId}
          chats={chats}
          selectedChatId={selectedChatId}
          onSelectPatient={setSelectedPatientId}
          onSelectDoctor={setSelectedDoctorId}
          onSelectChat={setSelectedChatId}
          onCreateChat={createChat}
        />

        <ChatPanel
          role={role}
          selectedPatient={selectedPatient}
          selectedDoctor={selectedDoctor}
          selectedChat={selectedChat}
          latestAssistantMessage={latestAssistantMessage}
          messages={messages}
          input={input}
          loading={loading}
          selectedChatId={selectedChatId}
          onInputChange={setInput}
          onSend={sendMessage}
          onBook={bookSlot}
        />

        <AppointmentsPanel
          role={role}
          appointments={appointments}
          selectedPatient={selectedPatient}
          selectedDoctor={selectedDoctor}
          doctorAvailability={doctorAvailability}
          availabilityForm={availabilityForm}
          onAvailabilityFormChange={setAvailabilityForm}
          onAddAvailability={addAvailability}
        />
      </div>
    </div>
  );
}

export default App;