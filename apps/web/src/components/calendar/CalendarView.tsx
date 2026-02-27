import "react-big-calendar/lib/css/react-big-calendar.css";

import { Calendar, dateFnsLocalizer, type View, type Event as RBCEvent } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { enUS } from "date-fns/locale";
import { useMemo } from "react";

const locales = { "en-US": enUS };

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }), // Monday
  getDay,
  locales,
});

type Props = {
  events: RBCEvent[];
  view?: View;
  date?: Date;
  onView?: (v: View) => void;
  onNavigate?: (d: Date) => void;
  onSelectEvent?: (ev: any) => void;
};

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function addMonths(d: Date, months: number) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + months);
  return x;
}

function startOfWeekMon(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Mon=0..Sun=6
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfWeekSun(d: Date) {
  const s = startOfWeekMon(d);
  const e = addDays(s, 6);
  e.setHours(23, 59, 59, 999);
  return e;
}

function clampDate(d?: Date) {
  const x = d ? new Date(d) : new Date();
  if (Number.isNaN(x.getTime())) return new Date();
  return x;
}

function viewLabel(v: View) {
  switch (v) {
    case "month":
      return "Month";
    case "week":
      return "Week";
    case "day":
      return "Day";
    case "agenda":
      return "Agenda";
    default:
      return v;
  }
}

export function CalendarView({ events, view, date, onView, onNavigate, onSelectEvent }: Props) {
  const safeView: View = view ?? "week";
  const safeDate = useMemo(() => clampDate(date), [date]);

  const title = useMemo(() => {
    if (safeView === "month") return format(safeDate, "MMMM yyyy");
    if (safeView === "week") {
      const s = startOfWeekMon(safeDate);
      const e = endOfWeekSun(safeDate);
      return `${format(s, "dd MMM")} – ${format(e, "dd MMM yyyy")}`;
    }
    if (safeView === "day") return format(safeDate, "dd MMM yyyy");
    return `Agenda • ${format(safeDate, "dd MMM yyyy")}`;
  }, [safeDate, safeView]);

  function goToday() {
    onNavigate?.(new Date());
  }

  function goPrev() {
    if (!onNavigate) return;
    if (safeView === "month") return onNavigate(addMonths(safeDate, -1));
    if (safeView === "week") return onNavigate(addDays(safeDate, -7));
    return onNavigate(addDays(safeDate, -1));
  }

  function goNext() {
    if (!onNavigate) return;
    if (safeView === "month") return onNavigate(addMonths(safeDate, 1));
    if (safeView === "week") return onNavigate(addDays(safeDate, 7));
    return onNavigate(addDays(safeDate, 1));
  }

  return (
    <div className="calendar-wrap">
      {/* Custom toolbar */}
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          justifyContent: "space-between",
          padding: 12,
          borderBottom: "1px solid var(--border)",
          background: "var(--panel)",
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={goToday} disabled={!onNavigate} type="button">
            Today
          </button>
          <button onClick={goPrev} disabled={!onNavigate} type="button">
            Prev
          </button>
          <button onClick={goNext} disabled={!onNavigate} type="button">
            Next
          </button>
          <div style={{ fontWeight: 900, marginLeft: 10 }}>{title}</div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {(["month", "week", "day", "agenda"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => onView?.(v)}
              disabled={!onView}
              className={safeView === v ? "primary" : ""}
              style={{ padding: "8px 12px", borderRadius: 999 }}
              title={viewLabel(v)}
              type="button"
            >
              {viewLabel(v)}
            </button>
          ))}
        </div>
      </div>

      <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        style={{ height: 520 }}
        view={safeView}
        date={safeDate}
        onView={(v) => onView?.(v)}
        onNavigate={(d) => onNavigate?.(d)}
        onSelectEvent={(ev) => onSelectEvent?.(ev)}
        popup
        toolbar={false}
      />
    </div>
  );
}