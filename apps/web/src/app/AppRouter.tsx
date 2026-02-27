import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Landing } from "../pages/landing/Landing";
import { RoleGuard } from "./RoleGuard";

import { PatientShell } from "../pages/patient/PatientShell";
import { PatientHomePage } from "../pages/patient/PatientHomePage";
import { PatientChatPage } from "../pages/patient/PatientChatPage";
import { PatientAppointmentsPage } from "../pages/patient/PatientAppointmentsPage";
import { PatientProfilePage } from "../pages/patient/PatientProfilePage";

import { DoctorShell } from "../pages/doctor/DoctorShell";
import { DoctorHomePage } from "../pages/doctor/DoctorHomePage";
import { DoctorPatientsPage } from "../pages/doctor/DoctorPatientsPage";
import { DoctorCalendarPage } from "../pages/doctor/DoctorCalendarPage";

export function AppRouter() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route
        path="/"
        element={
          user ? (
            user.role === "PATIENT" ? <Navigate to="/patient" replace /> : <Navigate to="/doctor" replace />
          ) : (
            <Landing />
          )
        }
      />

      <Route
        path="/patient"
        element={
          <RoleGuard role="PATIENT">
            <PatientShell />
          </RoleGuard>
        }
      >
        <Route index element={<PatientHomePage />} />
        <Route path="chat" element={<PatientChatPage />} />
        <Route path="appointments" element={<PatientAppointmentsPage />} />
        <Route path="profile" element={<PatientProfilePage />} />
      </Route>

      <Route
        path="/doctor"
        element={
          <RoleGuard role="DOCTOR">
            <DoctorShell />
          </RoleGuard>
        }
      >
        <Route index element={<DoctorHomePage />} />
        <Route path="patients" element={<DoctorPatientsPage />} />
        <Route path="calendar" element={<DoctorCalendarPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}