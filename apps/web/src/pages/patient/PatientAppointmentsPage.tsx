import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import type { Appointment, Doctor, Slot } from "../../types";
import { CalendarView } from "../../components/calendar/CalendarView";
import { EmptyState } from "../../components/common/EmptyState";
import { Card } from "../../components/common/Card";
import type { View } from "react-big-calendar";
import { BookingModal } from "../../components/common/BookingModal";

function isoDate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function startOfWeekMon(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfWeekSun(d: Date) {
  const s = startOfWeekMon(d);
  const e = new Date(s);
  e.setDate(e.getDate() + 6);
  e.setHours(23, 59, 59, 999);
  return e;
}
function startOfMonth(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), 1);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfMonth(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  x.setHours(23, 59, 59, 999);
  return x;
}

// ✅ Mon 27 Feb 2026 09:30–10:00
function formatSlotLabel(slot: any) {
  const start = new Date(slot.startTs);
  const end = new Date(slot.endTs);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";

  const datePart = start.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const startTime =
    slot.startLocal ??
    start.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  const endTime =
    slot.endLocal ??
    end.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });

  return `${datePart} ${startTime}–${endTime}`;
}

function slotStartMinutes(slot: any) {
  const d = new Date(slot.startTs);
  if (Number.isNaN(d.getTime())) return Number.POSITIVE_INFINITY;
  return d.getHours() * 60 + d.getMinutes();
}

function slotTimeOnly(slot: any) {
  const start = new Date(slot.startTs);
  const end = new Date(slot.endTs);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";

  const startTime =
    slot.startLocal ??
    start.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  const endTime =
    slot.endLocal ??
    end.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });

  return `${startTime}–${endTime}`;
}

type SlotGroup = { key: "morning" | "afternoon"; title: string; slots: Slot[] };

function groupSlotsMorningAfternoon(slots: Slot[]): SlotGroup[] {
  const sorted = [...slots].sort((a: any, b: any) => slotStartMinutes(a) - slotStartMinutes(b));

  const morning: Slot[] = [];
  const afternoon: Slot[] = [];

  for (const s of sorted) {
    const m = slotStartMinutes(s);
    if (m < 14 * 60) morning.push(s);
    else afternoon.push(s);
  }

  const out: SlotGroup[] = [];
  if (morning.length) out.push({ key: "morning", title: "Morning", slots: morning });
  if (afternoon.length) out.push({ key: "afternoon", title: "Afternoon", slots: afternoon });
  return out;
}

// ✅ Cross-tab sync helper
const BC_NAME = "maa_appointments";
function broadcastAppointmentsUpdated() {
  try {
    const bc = new BroadcastChannel(BC_NAME);
    bc.postMessage({ type: "appointments-updated", ts: Date.now() });
    bc.close();
  } catch {
    localStorage.setItem("maa_appointments_updated", String(Date.now()));
  }
}

export function PatientAppointmentsPage() {
  const { user } = useAuth();
  const patientId = user?.patientId || "";

  // Calendar controls
  const [view, setView] = useState<View>("week");
  const [date, setDate] = useState<Date>(new Date());

  const [from, setFrom] = useState(() => isoDate(startOfWeekMon(new Date())));
  const [to, setTo] = useState(() => isoDate(endOfWeekSun(new Date())));

  // Data
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>("");
  const [selectedDay, setSelectedDay] = useState<string>(() => isoDate(new Date()));
  const [slots, setSlots] = useState<Slot[]>([]);

  const [busy, setBusy] = useState(false);
  const [loadingAppointments, setLoadingAppointments] = useState(false);
  const [loadingDoctors, setLoadingDoctors] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Modal state (existing)
  const [selected, setSelected] = useState<any | null>(null);
  const [savingCancel, setSavingCancel] = useState(false);

  const [reschedOpen, setReschedOpen] = useState(false);
  const [reschedDate, setReschedDate] = useState<string>(() => isoDate(new Date()));
  const [reschedSlots, setReschedSlots] = useState<Slot[]>([]);
  const [reschedLoading, setReschedLoading] = useState(false);
  const [reschedSaving, setReschedSaving] = useState(false);

  // ✅ Collapsible sections (default open)
  const [slotsOpen, setSlotsOpen] = useState<{ morning: boolean; afternoon: boolean }>({
    morning: true,
    afternoon: true,
  });

  // ✅ booking confirm modal state
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingSlot, setBookingSlot] = useState<Slot | null>(null);

  // ✅ NEW: booking modal error + busy
  const [bookingBusy, setBookingBusy] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  function syncRange(nextView: View, nextDate: Date) {
    if (nextView === "month") {
      setFrom(isoDate(startOfMonth(nextDate)));
      setTo(isoDate(endOfMonth(nextDate)));
      return;
    }
    if (nextView === "week") {
      setFrom(isoDate(startOfWeekMon(nextDate)));
      setTo(isoDate(endOfWeekSun(nextDate)));
      return;
    }
    const s = new Date(nextDate);
    s.setHours(0, 0, 0, 0);
    const e = new Date(s);
    e.setDate(e.getDate() + 6);
    e.setHours(23, 59, 59, 999);
    setFrom(isoDate(s));
    setTo(isoDate(e));
  }

  function handleView(v: View) {
    setView(v);
    syncRange(v, date);
  }

  function handleNavigate(d: Date) {
    setDate(d);
    syncRange(view, d);
  }

  async function loadAppointments() {
    if (!patientId) return;
    setLoadingAppointments(true);
    try {
      const res = await api.get<Appointment[]>(`/patients/${patientId}/appointments`);
      setAppointments(res.data || []);
    } finally {
      setLoadingAppointments(false);
    }
  }

  async function loadDoctors() {
    setLoadingDoctors(true);
    try {
      const res = await api.get<Doctor[]>(`/doctors`);
      setDoctors(res.data || []);
      if ((res.data || []).length > 0) {
        setSelectedDoctorId((prev) => prev || res.data[0].id);
      }
    } finally {
      setLoadingDoctors(false);
    }
  }

  async function loadSlots(day: string, docId: string) {
    if (!docId) return;
    setLoadingSlots(true);
    try {
      const res = await api.get<{ slots: Slot[] }>(
        `/doctors/${docId}/slots?from=${encodeURIComponent(day)}&to=${encodeURIComponent(day)}`
      );
      setSlots(res.data?.slots || []);
    } finally {
      setLoadingSlots(false);
    }
  }

  async function loadSlotsForReschedule(day: string, doctorIdForAppt: string) {
    if (!doctorIdForAppt) return;
    setReschedLoading(true);
    try {
      const res = await api.get<{ slots: Slot[] }>(
        `/doctors/${doctorIdForAppt}/slots?from=${encodeURIComponent(day)}&to=${encodeURIComponent(day)}`
      );
      setReschedSlots(res.data?.slots || []);
    } finally {
      setReschedLoading(false);
    }
  }

  function requestBook(slot: Slot) {
    setBookingSlot(slot);
    setBookingError(null);
    setBookingOpen(true);
  }

  async function confirmBook() {
    if (!patientId || !selectedDoctorId || !bookingSlot) return;

    setBookingBusy(true);
    setBookingError(null);

    try {
      await api.post("/bookings", {
        patientId,
        doctorId: selectedDoctorId,
        startTs: bookingSlot.startTs,
        endTs: bookingSlot.endTs,
      });

      await loadAppointments();
      await loadSlots(selectedDay, selectedDoctorId);
      broadcastAppointmentsUpdated();

      setBookingOpen(false);
      setBookingSlot(null);
    } catch (err: any) {
      const status = err?.response?.status;

      // ✅ MAIN FIX: 409 conflict (slot already taken)
      if (status === 409) {
        setBookingError("This slot is no longer available. Please pick another one.");
        // refresh slots so the user sees updated availability
        await loadSlots(selectedDay, selectedDoctorId);
        return;
      }

      const msg = err?.response?.data?.error || "Could not book this slot.";
      setBookingError(msg);
    } finally {
      setBookingBusy(false);
    }
  }

  useEffect(() => {
    if (!patientId) return;
    loadAppointments();
    loadDoctors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  useEffect(() => {
    if (!selectedDoctorId) return;
    loadSlots(selectedDay, selectedDoctorId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDoctorId, selectedDay]);

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === "maa_appointments_updated") loadAppointments();
    }

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(BC_NAME);
      bc.onmessage = (ev) => {
        if (ev?.data?.type === "appointments-updated") loadAppointments();
      };
    } catch {}

    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      try {
        bc?.close();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  const events = useMemo(() => {
    return (appointments || [])
      .filter((a) => a.status === "BOOKED")
      .map((a) => ({
        id: a.id,
        title: `${a.doctor?.name || "Doctor"} • ${a.doctor?.specialty || ""}`,
        start: new Date(a.startTs),
        end: new Date(a.endTs),
        meta: a,
      }));
  }, [appointments]);

  const slotGroups = useMemo(() => groupSlotsMorningAfternoon(slots), [slots]);

  useEffect(() => {
    const hasMorning = slotGroups.some((g) => g.key === "morning");
    const hasAfternoon = slotGroups.some((g) => g.key === "afternoon");
    setSlotsOpen((prev) => ({
      morning: hasMorning ? prev.morning ?? true : false,
      afternoon: hasAfternoon ? prev.afternoon ?? true : false,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots.length, selectedDay, selectedDoctorId]);

  const fieldStyle: React.CSSProperties = {
    width: "100%",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: "11px 12px",
    background: "#fff",
    height: 44,
  };

  const selectedDoctorLabel = useMemo(() => {
    const d = doctors.find((x) => x.id === selectedDoctorId);
    if (!d) return "Doctor";
    return `${d.name} — ${d.specialty}`;
  }, [doctors, selectedDoctorId]);

  return (
    <>
      <div className="stack">
        <Card>
          <div className="row-between">
            <div>
              <div className="card-title">Your calendar</div>
              <div className="small muted">Click an appointment to view details. Navigation updates the range.</div>
            </div>

            <div style={{ textAlign: "right" }}>
              <div className="label">Current range</div>
              <div style={{ fontWeight: 900 }}>
                {from} → {to}
              </div>
              <div className="small muted">Range follows calendar navigation</div>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <CalendarView
              events={events}
              view={view}
              date={date}
              onView={handleView}
              onNavigate={handleNavigate}
              onSelectEvent={(ev) => {
                setSelected(ev);
                setReschedOpen(false);
                setReschedSlots([]);
              }}
            />

            {loadingAppointments ? (
              <div style={{ marginTop: 10 }} className="small muted">
                Loading appointments...
              </div>
            ) : events.length === 0 ? (
              <div style={{ marginTop: 10 }}>
                <EmptyState title="No appointments yet" subtitle="Book one below." />
              </div>
            ) : null}
          </div>
        </Card>

        <Card>
          <div className="row-between" style={{ marginBottom: 10 }}>
            <div>
              <div className="card-title">Book a new appointment</div>
              <div className="small muted">Pick a doctor, a day, and select a free slot.</div>
            </div>
          </div>

          {loadingDoctors ? (
            <div className="small muted">Loading doctors...</div>
          ) : doctors.length === 0 ? (
            <EmptyState title="No doctors available" subtitle="Seed doctors or create them in the backend." />
          ) : (
            <>
              <div className="row2" style={{ gap: 10, alignItems: "end" }}>
                <div>
                  <div className="label">Doctor</div>
                  <select
                    style={fieldStyle}
                    value={selectedDoctorId}
                    onChange={(e) => setSelectedDoctorId(e.target.value)}
                  >
                    {doctors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} — {d.specialty}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="label">Day</div>
                  <input
                    style={fieldStyle}
                    type="date"
                    value={selectedDay}
                    onChange={(e) => setSelectedDay(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <div className="label">Available slots</div>

                {loadingSlots ? (
                  <div className="small muted">Loading slots...</div>
                ) : slots.length === 0 ? (
                  <EmptyState title="No available slots for this day" subtitle="Try another date or doctor." />
                ) : (
                  <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 12 }}>
                    {slotGroups.map((g) => {
                      const isOpen = slotsOpen[g.key];
                      return (
                        <div
                          key={g.key}
                          style={{
                            border: "1px solid var(--border)",
                            background: "var(--panel2)",
                            borderRadius: 18,
                            padding: 12,
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => setSlotsOpen((p) => ({ ...p, [g.key]: !p[g.key] }))}
                            style={{
                              width: "100%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 10,
                              background: "transparent",
                              border: "1px solid transparent",
                              padding: 0,
                              textAlign: "left",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <div style={{ fontWeight: 1000 }}>{g.title}</div>
                              <div className="small muted">
                                {g.slots.length} slot{g.slots.length > 1 ? "s" : ""}
                              </div>
                            </div>

                            <div
                              aria-hidden
                              style={{
                                width: 34,
                                height: 34,
                                borderRadius: 12,
                                border: "1px solid var(--border)",
                                background: "#fff",
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontWeight: 900,
                              }}
                            >
                              {isOpen ? "–" : "+"}
                            </div>
                          </button>

                          {isOpen && (
                            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                              {g.slots.map((s, idx) => (
                                <button
                                  key={`${s.startTs}_${idx}`}
                                  type="button"
                                  disabled={busy || bookingBusy}
                                  onClick={() => requestBook(s)}
                                  style={{
                                    textAlign: "left",
                                    border: "1px solid var(--border)",
                                    background: "#fff",
                                    borderRadius: 16,
                                    padding: "10px 12px",
                                  }}
                                >
                                  <div style={{ fontWeight: 900 }}>{slotTimeOnly(s)}</div>
                                  <div className="small muted">{formatSlotLabel(s)}</div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </Card>

        {/* (tutto il modal appointment details / reschedule / cancel rimane uguale nel tuo file) */}
        {selected && (
          <div
            onClick={() => setSelected(null)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15,23,42,0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 18,
              zIndex: 50,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                maxWidth: 720,
                background: "var(--panel)",
                border: "1px solid var(--border)",
                borderRadius: 18,
                boxShadow: "var(--shadow)",
                padding: 16,
              }}
            >
              {/* ... tuo modal invariato ... */}
              <div className="row-between" style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 1000, fontSize: 16 }}>Appointment details</div>
                <button className="ghost" onClick={() => setSelected(null)} type="button">
                  Close
                </button>
              </div>

              <div className="stack" style={{ gap: 10 }}>
                <div className="row2" style={{ gap: 12 }}>
                  <div>
                    <div className="label">Doctor</div>
                    <div style={{ fontWeight: 900 }}>{selected?.meta?.doctor?.name || "Unknown"}</div>
                    <div className="small muted">{selected?.meta?.doctor?.specialty || ""}</div>
                  </div>
                  <div>
                    <div className="label">Status</div>
                    <div style={{ fontWeight: 900 }}>{selected?.meta?.status}</div>
                  </div>
                </div>

                <div className="row2" style={{ gap: 12 }}>
                  <div>
                    <div className="label">Start</div>
                    <div>{new Date(selected?.meta?.startTs).toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="label">End</div>
                    <div>{new Date(selected?.meta?.endTs).toLocaleString()}</div>
                  </div>
                </div>

                <div style={{ marginTop: 10 }}>
                  <div className="label" style={{ marginBottom: 8 }}>
                    Manage appointment
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => {
                        setReschedOpen((p) => !p);
                        if (!reschedOpen) {
                          const d = new Date(selected?.meta?.startTs);
                          const day = isoDate(d);
                          setReschedDate(day);
                          const docId = selected?.meta?.doctorId;
                          if (docId) setTimeout(() => loadSlotsForReschedule(day, docId), 0);
                        }
                      }}
                      disabled={selected?.meta?.status !== "BOOKED"}
                    >
                      {reschedOpen ? "Hide reschedule" : "Reschedule"}
                    </button>

                    <button
                      className="primary"
                      type="button"
                      disabled={savingCancel || selected?.meta?.status !== "BOOKED"}
                      onClick={async () => {
                        const apptId = selected?.meta?.id;
                        if (!apptId) return;
                        try {
                          setSavingCancel(true);
                          await api.patch(`/appointments/${apptId}`, { status: "CANCELLED" });
                          await loadAppointments();
                          broadcastAppointmentsUpdated();
                          setSelected(null);
                        } finally {
                          setSavingCancel(false);
                        }
                      }}
                    >
                      {savingCancel ? "Cancelling..." : "Cancel appointment"}
                    </button>
                  </div>
                </div>

                {reschedOpen && (
                  <div className="card" style={{ padding: 12, borderRadius: 16, background: "var(--panel2)" }}>
                    <div style={{ fontWeight: 900, marginBottom: 8 }}>Pick a new slot</div>

                    <div className="row2" style={{ gap: 12, alignItems: "end" }}>
                      <div>
                        <div className="label">Date</div>
                        <input
                          type="date"
                          value={reschedDate}
                          onChange={async (e) => {
                            const day = e.target.value;
                            setReschedDate(day);
                            const docId = selected?.meta?.doctorId;
                            if (docId) await loadSlotsForReschedule(day, docId);
                          }}
                        />
                      </div>
                      <div>
                        <button
                          type="button"
                          onClick={() => {
                            const docId = selected?.meta?.doctorId;
                            if (docId) loadSlotsForReschedule(reschedDate, docId);
                          }}
                          disabled={reschedLoading}
                        >
                          {reschedLoading ? "Loading..." : "Refresh slots"}
                        </button>
                      </div>
                    </div>

                    <div style={{ marginTop: 10 }}>
                      {reschedLoading ? (
                        <div className="small muted">Loading available slots...</div>
                      ) : reschedSlots.length === 0 ? (
                        <EmptyState title="No free slots for this day" subtitle="Try another date." />
                      ) : (
                        <div className="slot-wrap">
                          {reschedSlots
                            .slice(0, 20)
                            .sort((a: any, b: any) => slotStartMinutes(a) - slotStartMinutes(b))
                            .map((s, idx) => (
                              <button
                                key={idx}
                                className="slot-pill"
                                type="button"
                                disabled={reschedSaving}
                                onClick={async () => {
                                  const apptId = selected?.meta?.id;
                                  const docId = selected?.meta?.doctorId;
                                  if (!apptId || !docId) return;

                                  try {
                                    setReschedSaving(true);
                                    await api.patch(`/appointments/${apptId}`, {
                                      startTs: s.startTs,
                                      endTs: s.endTs,
                                      status: "BOOKED",
                                    });
                                    await loadAppointments();
                                    broadcastAppointmentsUpdated();
                                    setSelected(null);
                                  } finally {
                                    setReschedSaving(false);
                                  }
                                }}
                              >
                                {formatSlotLabel(s)}
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="small muted">
                  Note: rescheduling uses current availability rules and excludes already booked slots.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ✅ Booking confirmation modal (with 409 handling) */}
      <BookingModal
        open={bookingOpen}
        onClose={() => {
          if (bookingBusy) return;
          setBookingOpen(false);
          setBookingError(null);
        }}
        doctorLabel={selectedDoctorLabel}
        startTs={bookingSlot?.startTs || ""}
        endTs={bookingSlot?.endTs || ""}
        title="Confirm appointment"
        subtitle="This will create a booking for the selected slot."
        confirmLabel={bookingBusy ? "Booking…" : "Confirm booking"}
        busy={bookingBusy}
        error={bookingError}
        onConfirm={confirmBook}
      />
    </>
  );
}