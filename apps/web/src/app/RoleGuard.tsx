import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function RoleGuard({
  children,
  role,
}: {
  children: React.ReactNode;
  role?: "PATIENT" | "DOCTOR";
}) {
  const { user, loading } = useAuth();

  if (loading) return <div style={{ padding: 24 }}>Loading...</div>;
  if (!user) return <Navigate to="/" replace />;

  if (role && user.role !== role) {
    return <Navigate to={user.role === "PATIENT" ? "/patient" : "/doctor"} replace />;
  }

  return <>{children}</>;
}