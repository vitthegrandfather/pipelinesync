import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { logout } from "../api/client";

const links = [
  ["/dashboard", "Overview"],
  ["/leads", "Leads"],
  ["/deliveries", "Deliveries"],
  ["/routing", "Routing rules"],
  ["/integrations", "Integrations"],
  ["/intake-simulator", "Intake simulator"],
  ["/settings", "Settings"],
];

export function AppShell() {
  const navigate = useNavigate();
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          PipelineSync
          <span>Lead routing · sandbox</span>
        </div>
        <nav className="nav">
          {links.map(([to, label]) => (
            <NavLink key={to} to={to} className={({ isActive }) => (isActive ? "active" : "")}>
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <input aria-label="Global search" placeholder="Search leads, companies, IDs" />
          <span className="pill">Sandbox environment</span>
          <span className="muted">API ok</span>
          <button
            className="btn"
            onClick={() => {
              logout();
              navigate("/login");
            }}
          >
            Demo Admin
          </button>
        </header>
        <div className="content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
