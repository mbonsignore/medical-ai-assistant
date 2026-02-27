import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import type { Appointment, Slot } from "../../types";
import { CalendarView } from "../../components/calendar/CalendarView";
import { Card } from "../../components/common/Card";
import { EmptyState } from "../../components/common/EmptyState";
import type { View } from "react-big-calendar";

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

type Availability = {
  id: string;
  doctorId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  slotMinutes: number;
};

function weekdayLabel(n: number) {
  const map: Record<number, string> = { 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat", 7: "Sun" };
  return map[n] || String(n);
}

function timeToMinutes(t: string) {
  const [hh, mm] = t.split(":").map(Number);
  return hh * 60 + mm;
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

// ✅ Cross-tab sync helper
const BC_NAME = "maa_appointments";
function broadcastAppointmentsUpdated() {
  try {
    const bc = new BroadcastChannel(BC_NAME);
    bc.postMessage({ type: "appointments-updated", ts: Date.now() });
    bc.close();
  } catch {
    // fallback: storage event
    localStorage.setItem("maa_appointments_updated", String(Date.now()));
  }
}

export function DoctorCalendarPage() {
  const { user } = useAuth();
  const doctorId = user?.doctorId || "";

  const [view, setView] = useState<View>("week");
  const [date, setDate] = useState<Date>(new Date());

  const [from, setFrom] = useState(() => isoDate(startOfWeekMon(new Date())));
  const [to, setTo] = useState(() => isoDate(endOfWeekSun(new Date())));

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [availability, setAvailability] = useState<Availability[]>([]);

  const [showAvailability, setShowAvailability] = useState(true);

  const [selected, setSelected] = useState<any | null>(null);
  const [savingCancel, setSavingCancel] = useState(false);

  const [reschedOpen, setReschedOpen] = useState(false);
  const [reschedDate, setReschedDate] = useState<string>(() => isoDate(new Date()));
  const [reschedSlots, setReschedSlots] = useState<Slot[]>([]);
  const [reschedLoading, setReschedLoading] = useState(false);
  const [reschedSaving, setReschedSaving] = useState(false);

  const [weekday, setWeekday] = useState<number>(1);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("12:00");
  const [slotMinutes, setSlotMinutes] = useState<number>(30);
  const [savingAvail, setSavingAvail] = useState(false);

  async function loadAppointments() {
    const res = await api.get<{ appointments: Appointment[] }>(
      `/doctors/${doctorId}/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    );
    setAppointments(res.data.appointments || []);
  }

  async function loadDoctor() {
    const res = await api.get<any>(`/doctors/${doctorId}`);
    const av = Array.isArray(res.data?.availability) ? res.data.availability : [];
    setAvailability(av);
  }

  async function loadAll() {
    await Promise.all([loadDoctor(), loadAppointments()]);
  }

  useEffect(() => {
    if (!doctorId) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctorId]);

  useEffect(() => {
    if (!doctorId) return;
    loadAppointments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  // ✅ listen cross-tab updates
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
    } catch {
      // ignore
    }

    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      try {
        bc?.close();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctorId, from, to]);

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

  const events = useMemo(() => {
    return (appointments || [])
      .filter((a) => a.status === "BOOKED")
      .map((a) => ({
        id: a.id,
        title: `${a.patient?.name || "Patient"} • ${a.status}`,
        start: new Date(a.startTs),
        end: new Date(a.endTs),
        meta: a,
      }));
  }, [appointments]);

  async function addAvailability() {
    if (!doctorId) return;

    const s = timeToMinutes(startTime);
    const e = timeToMinutes(endTime);
    if (!Number.isFinite(s) || !Number.isFinite(e) || endTime.length !== 5 || startTime.length !== 5) {
      alert("Please enter valid times (HH:MM).");
      return;
    }
    if (e <= s) {
      alert("End time must be after start time.");
      return;
    }

    try {
      setSavingAvail(true);
      await api.post(`/doctors/${doctorId}/availability`, { weekday, startTime, endTime, slotMinutes });
      await loadDoctor();
      setShowAvailability(true);
    } catch (err: any) {
      const msg = err?.response?.data?.error || "Could not add availability. Please check overlaps/duplicates.";
      alert(msg);
    } finally {
      setSavingAvail(false);
    }
  }

  async function deleteAvailability(avId: string) {
    if (!doctorId) return;
    await api.delete(`/doctors/${doctorId}/availability/${avId}`);
    await loadDoctor();
  }

  async function loadSlotsForDay(day: string) {
    if (!doctorId) return;
    setReschedLoading(true);
    try {
      const res = await api.get<{ slots: Slot[] }>(
        `/doctors/${doctorId}/slots?from=${encodeURIComponent(day)}&to=${encodeURIComponent(day)}`
      );
      setReschedSlots(res.data?.slots || []);
    } finally {
      setReschedLoading(false);
    }
  }

  useEffect(() => {
    if (!reschedOpen) return;
    loadSlotsForDay(reschedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reschedOpen]);

  const sortedAvailability = useMemo(() => {
    return [...availability].sort((a, b) => {
      if (a.weekday !== b.weekday) return a.weekday - b.weekday;
      return a.startTime.localeCompare(b.startTime);
    });
  }, [availability]);

  const availabilityByDay = useMemo(() => {
    const map = new Map<number, Availability[]>();
    for (const a of sortedAvailability) {
      if (!map.has(a.weekday)) map.set(a.weekday, []);
      map.get(a.weekday)!.push(a);
    }
    return map;
  }, [sortedAvailability]);

  const fieldStyle: React.CSSProperties = {
    width: "100%",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: "11px 12px",
    background: "#fff",
    height: 44,
  };

  const addBtnStyle: React.CSSProperties = {
    padding: "8px 12px",
    borderRadius: 12,
    height: 44,
    alignSelf: "end",
    justifySelf: "end",
    minWidth: 96,
  };

  return (
    <div className="stack">
      <Card>
        <div className="row-between">
          <div>
            <div className="card-title">Bookings</div>
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

          {events.length === 0 && (
            <div style={{ marginTop: 10 }}>
              <EmptyState title="No bookings in this range" subtitle="Use Prev/Next or change view (week/month/day)." />
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div className="row-between" style={{ marginBottom: 10 }}>
          <div>
            <div className="card-title">Manage availability</div>
            <div className="small muted">These rules generate patient booking slots.</div>
          </div>

          <button className="ghost" onClick={() => setShowAvailability((p) => !p)} type="button">
            {showAvailability ? "Hide availability" : "Show availability"}
          </button>
        </div>

        <div className="avail-form">
          <div>
            <div className="label">Weekday</div>
            <select style={fieldStyle} value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6, 7].map((w) => (
                <option key={w} value={w}>
                  {weekdayLabel(w)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="label">Start</div>
            <input style={fieldStyle} type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>

          <div>
            <div className="label">End</div>
            <input style={fieldStyle} type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>

          <div>
            <div className="label">Slot duration</div>
            <select style={fieldStyle} value={slotMinutes} onChange={(e) => setSlotMinutes(Number(e.target.value))}>
              {[10, 15, 20, 30, 45, 60].map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </select>
          </div>

          <button className="primary" style={addBtnStyle} onClick={addAvailability} disabled={savingAvail} type="button">
            {savingAvail ? "Saving..." : "Add"}
          </button>
        </div>

        {showAvailability && (
          <div style={{ marginTop: 14 }}>
            {sortedAvailability.length === 0 ? (
              <EmptyState title="No availability configured" subtitle="Add at least one weekly availability rule." />
            ) : (
              <div className="stack" style={{ gap: 12 }}>
                {[1, 2, 3, 4, 5, 6, 7].map((day) => {
                  const list = availabilityByDay.get(day) || [];
                  if (list.length === 0) return null;

                  return (
                    <div
                      key={day}
                      style={{
                        border: "1px solid var(--border)",
                        background: "var(--panel2)",
                        borderRadius: 18,
                        padding: 12,
                      }}
                    >
                      <div className="row-between" style={{ marginBottom: 10 }}>
                        <div style={{ fontWeight: 1000 }}>{weekdayLabel(day)}</div>
                        <div className="small muted">
                          {list.length} rule{list.length > 1 ? "s" : ""}
                        </div>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {list.map((a) => (
                          <div
                            key={a.id}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 12,
                              background: "#fff",
                              border: "1px solid var(--border)",
                              borderRadius: 16,
                              padding: "10px 12px",
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 900 }}>
                                {a.startTime}–{a.endTime}
                                <span className="small muted" style={{ fontWeight: 700 }}>
                                  {" "}
                                  • {a.slotMinutes} min
                                </span>
                              </div>
                            </div>

                            <button onClick={() => deleteAvailability(a.id)} type="button">
                              Delete
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Modal */}
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
            <div className="row-between" style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 1000, fontSize: 16 }}>Booking details</div>
              <button className="ghost" onClick={() => setSelected(null)} type="button">
                Close
              </button>
            </div>

            <div className="stack" style={{ gap: 10 }}>
              <div className="row2" style={{ gap: 12 }}>
                <div>
                  <div className="label">Patient</div>
                  <div style={{ fontWeight: 900 }}>{selected?.meta?.patient?.name || "Unknown"}</div>
                  <div className="small muted">{selected?.meta?.patient?.email || ""}</div>
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
                    onClick={() => {
                      setReschedOpen((p) => !p);
                      if (!reschedOpen) {
                        const d = new Date(selected?.meta?.startTs);
                        const day = isoDate(d);
                        setReschedDate(day);
                        setTimeout(() => loadSlotsForDay(day), 0);
                      }
                    }}
                    disabled={selected?.meta?.status !== "BOOKED"}
                    type="button"
                  >
                    {reschedOpen ? "Hide reschedule" : "Reschedule"}
                  </button>

                  <button
                    className="primary"
                    disabled={savingCancel || selected?.meta?.status !== "BOOKED"}
                    type="button"
                    onClick={async () => {
                      const apptId = selected?.meta?.id;
                      if (!apptId) return;
                      try {
                        setSavingCancel(true);
                        await api.patch(`/appointments/${apptId}`, { status: "CANCELLED" });
                        await loadAppointments();
                        broadcastAppointmentsUpdated(); // ✅ refresh patient tab
                        setSelected(null);
                      } finally {
                        setSavingCancel(false);
                      }
                    }}
                  >
                    {savingCancel ? "Cancelling..." : "Cancel booking"}
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
                          await loadSlotsForDay(day);
                        }}
                      />
                    </div>
                    <div>
                      <button onClick={() => loadSlotsForDay(reschedDate)} disabled={reschedLoading} type="button">
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
                        {reschedSlots.slice(0, 20).map((s, idx) => (
                          <button
                            key={idx}
                            className="slot-pill"
                            disabled={reschedSaving}
                            type="button"
                            onClick={async () => {
                              const apptId = selected?.meta?.id;
                              if (!apptId) return;
                              try {
                                setReschedSaving(true);
                                await api.patch(`/appointments/${apptId}`, {
                                  startTs: s.startTs,
                                  endTs: s.endTs,
                                  status: "BOOKED",
                                });
                                await loadAppointments();
                                broadcastAppointmentsUpdated(); // ✅ refresh patient tab
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
  );
}