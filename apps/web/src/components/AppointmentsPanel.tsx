import type {
  Appointment,
  Doctor,
  DoctorAvailability,
  Patient,
} from "../types";

type Props = {
  role: "patient" | "doctor";
  appointments: Appointment[];
  selectedPatient: Patient | null;
  selectedDoctor: Doctor | null;
  doctorAvailability: DoctorAvailability[];
  availabilityForm: {
    weekday: number;
    startTime: string;
    endTime: string;
    slotMinutes: number;
  };
  onAvailabilityFormChange: (value: {
    weekday: number;
    startTime: string;
    endTime: string;
    slotMinutes: number;
  }) => void;
  onAddAvailability: () => void;
};

const weekdayOptions = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 7, label: "Sunday" },
];

export function AppointmentsPanel({
  role,
  appointments,
  selectedPatient,
  selectedDoctor,
  doctorAvailability,
  availabilityForm,
  onAvailabilityFormChange,
  onAddAvailability,
}: Props) {
  if (role === "patient") {
    return (
      <aside className="panel">
        <div className="panel-inner">
          <h2 className="panel-title">My appointments</h2>

          {selectedPatient && (
            <div className="small muted" style={{ marginBottom: 14 }}>
              Viewing appointments for <strong>{selectedPatient.name}</strong>
            </div>
          )}

          {appointments.length === 0 ? (
            <div className="empty-state">No appointments yet.</div>
          ) : (
            <div className="appointments-list">
              {appointments.map((appointment) => (
                <div key={appointment.id} className="appointment-card">
                  <div className="appointment-title">{appointment.doctor?.name}</div>
                  <div>{appointment.doctor?.specialty}</div>
                  <div className="small muted" style={{ marginTop: 8 }}>
                    {new Date(appointment.startTs).toLocaleString()} →{" "}
                    {new Date(appointment.endTs).toLocaleString()}
                  </div>
                  <div className="badge">{appointment.status}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    );
  }

  return (
    <aside className="panel">
      <div className="panel-inner">
        <h2 className="panel-title">Doctor workspace</h2>

        {selectedDoctor ? (
          <>
            <div className="doctor-card">
              <div className="appointment-title">{selectedDoctor.name}</div>
              <div>{selectedDoctor.specialty}</div>
              <div className="small muted" style={{ marginTop: 8 }}>
                {selectedDoctor.bio}
              </div>
            </div>

            <div className="sidebar-section">
              <h3 className="section-subtitle">Add availability</h3>

              <div className="form-stack">
                <label className="label">Weekday</label>
                <select
                  value={availabilityForm.weekday}
                  onChange={(e) =>
                    onAvailabilityFormChange({
                      ...availabilityForm,
                      weekday: Number(e.target.value),
                    })
                  }
                >
                  {weekdayOptions.map((w) => (
                    <option key={w.value} value={w.value}>
                      {w.label}
                    </option>
                  ))}
                </select>

                <div className="grid-2">
                  <div>
                    <label className="label">Start</label>
                    <input
                      type="time"
                      value={availabilityForm.startTime}
                      onChange={(e) =>
                        onAvailabilityFormChange({
                          ...availabilityForm,
                          startTime: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div>
                    <label className="label">End</label>
                    <input
                      type="time"
                      value={availabilityForm.endTime}
                      onChange={(e) =>
                        onAvailabilityFormChange({
                          ...availabilityForm,
                          endTime: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                <label className="label">Slot minutes</label>
                <input
                  type="number"
                  min={5}
                  max={240}
                  value={availabilityForm.slotMinutes}
                  onChange={(e) =>
                    onAvailabilityFormChange({
                      ...availabilityForm,
                      slotMinutes: Number(e.target.value),
                    })
                  }
                />

                <button className="primary" onClick={onAddAvailability}>
                  Add availability
                </button>
              </div>
            </div>

            <div className="sidebar-section">
              <h3 className="section-subtitle">Current availability</h3>

              {doctorAvailability.length === 0 ? (
                <div className="empty-state">
                  No availability configured yet.
                </div>
              ) : (
                <div className="appointments-list">
                  {doctorAvailability.map((slot) => {
                    const weekday = weekdayOptions.find((w) => w.value === slot.weekday)?.label;

                    return (
                      <div key={slot.id} className="appointment-card">
                        <div className="appointment-title">{weekday}</div>
                        <div className="small muted">
                          {slot.startTime} → {slot.endTime}
                        </div>
                        <div className="badge">{slot.slotMinutes} min slots</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="sidebar-section">
              <h3 className="section-subtitle">Appointments calendar</h3>
              <div className="empty-state">
                To make the doctor calendar fully functional, add a backend endpoint like{" "}
                <code>GET /doctors/:id/appointments</code> including patient details.
              </div>
            </div>
          </>
        ) : (
          <div className="empty-state">Select a doctor to manage availability and review activity.</div>
        )}
      </div>
    </aside>
  );
}