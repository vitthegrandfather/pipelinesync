import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AppShell } from "./layouts/AppShell";
import { LoginPage } from "./pages/Login";
import { DashboardPage } from "./pages/Dashboard";
import { LeadsPage } from "./pages/Leads";
import { LeadDetailPage } from "./pages/LeadDetail";
import { DeliveriesPage } from "./pages/Deliveries";
import { RoutingPage } from "./pages/Routing";
import { IntegrationsPage } from "./pages/Integrations";
import { IntakeSimulatorPage } from "./pages/IntakeSimulator";
import { SettingsPage } from "./pages/Settings";

function RequireAuth() {
  if (typeof window !== "undefined" && !localStorage.getItem("ps_token")) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/leads" element={<LeadsPage />} />
          <Route path="/leads/:leadId" element={<LeadDetailPage />} />
          <Route path="/deliveries" element={<DeliveriesPage />} />
          <Route path="/routing" element={<RoutingPage />} />
          <Route path="/integrations" element={<IntegrationsPage />} />
          <Route path="/intake-simulator" element={<IntakeSimulatorPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
