import type { Chat, Doctor, Patient } from "../types";

type Props = {
  role: "patient" | "doctor";
  patients: Patient[];
  doctors: Doctor[];
  selectedPatientId: string;
  selectedDoctorId: string;
  chats: Chat[];
  selectedChatId: string;
  onSelectPatient: (id: string) => void;
  onSelectDoctor: (id: string) => void;
  onSelectChat: (id: string) => void;
  onCreateChat: () => void;
};

export function Sidebar({
  role,
  patients,
  doctors,
  selectedPatientId,
  selectedDoctorId,
  chats,
  selectedChatId,
  onSelectPatient,
  onSelectDoctor,
  onSelectChat,
  onCreateChat,
}: Props) {
  return (
    <aside className="panel">
      <div className="panel-inner sidebar-scroll">
        {role === "patient" ? (
          <>
            <div className="sidebar-section">
              <h2 className="panel-title">Patient</h2>
              <select value={selectedPatientId} onChange={(e) => onSelectPatient(e.target.value)}>
                {patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="sidebar-section">
              <div className="row-between" style={{ marginBottom: 12 }}>
                <h2 className="panel-title" style={{ margin: 0 }}>
                  Chat history
                </h2>
                <button onClick={onCreateChat}>New chat</button>
              </div>

              <div className="chat-list">
                {chats.length === 0 ? (
                  <div className="empty-state">No chats available for this patient yet.</div>
                ) : (
                  chats.map((chat) => (
                    <div
                      key={chat.id}
                      className={`chat-card ${chat.id === selectedChatId ? "active" : ""}`}
                      onClick={() => onSelectChat(chat.id)}
                    >
                      <div className="chat-summary">{chat.summary || "New chat"}</div>
                      <div className="chat-date">{new Date(chat.createdAt).toLocaleString()}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="sidebar-section">
              <h2 className="panel-title">Doctor</h2>
              <select value={selectedDoctorId} onChange={(e) => onSelectDoctor(e.target.value)}>
                {doctors.map((doctor) => (
                  <option key={doctor.id} value={doctor.id}>
                    {doctor.name} — {doctor.specialty}
                  </option>
                ))}
              </select>
            </div>

            <div className="sidebar-section">
              <h2 className="panel-title">Patients</h2>
              <div className="chat-list">
                {patients.map((patient) => (
                  <div
                    key={patient.id}
                    className={`chat-card ${patient.id === selectedPatientId ? "active" : ""}`}
                    onClick={() => onSelectPatient(patient.id)}
                  >
                    <div className="chat-summary">{patient.name}</div>
                    <div className="chat-date">{patient.email}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="sidebar-section">
              <h2 className="panel-title">Patient chats</h2>
              <div className="chat-list">
                {chats.length === 0 ? (
                  <div className="empty-state">No chats found for this patient.</div>
                ) : (
                  chats.map((chat) => (
                    <div
                      key={chat.id}
                      className={`chat-card ${chat.id === selectedChatId ? "active" : ""}`}
                      onClick={() => onSelectChat(chat.id)}
                    >
                      <div className="chat-summary">{chat.summary || "No summary yet"}</div>
                      <div className="chat-date">{new Date(chat.createdAt).toLocaleString()}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}