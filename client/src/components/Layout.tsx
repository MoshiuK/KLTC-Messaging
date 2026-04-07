import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { useBranding } from "./BrandingContext";

function lightenColor(hex: string, amount: number): string {
  try {
    const num = parseInt(hex.replace("#", ""), 16);
    if (isNaN(num)) return hex;
    const r = Math.min(255, (num >> 16) + amount);
    const g = Math.min(255, ((num >> 8) & 0x00ff) + amount);
    const b = Math.min(255, (num & 0x0000ff) + amount);
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
  } catch {
    return hex;
  }
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { branding } = useBranding();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const activeNavBg = lightenColor(branding.primaryColor, 20);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        style={{
          display: "none",
          position: "fixed",
          top: 10,
          left: 10,
          zIndex: 1001,
          background: branding.primaryColor,
          color: "#fff",
          border: "none",
          borderRadius: 4,
          width: 40,
          height: 40,
          fontSize: 20,
          cursor: "pointer",
        }}
        className="mobile-menu-btn"
        aria-label="Toggle menu"
      >
        {sidebarOpen ? "\u2715" : "\u2630"}
      </button>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            display: "none",
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            zIndex: 999,
          }}
          className="mobile-overlay"
        />
      )}

      <nav
        style={{
          width: 220,
          minWidth: 220,
          background: branding.primaryColor,
          color: "#fff",
          padding: "20px 0",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          zIndex: 1000,
        }}
        className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}
      >
        <div style={{ padding: "0 20px 20px", borderBottom: "1px solid rgba(255,255,255,0.15)", marginBottom: 10 }}>
          {branding.logoUrl && (
            <img
              src={branding.logoUrl}
              alt={branding.appName}
              style={{ maxHeight: 40, maxWidth: "100%", marginBottom: 8, display: "block" }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          )}
          <h2 style={{ margin: 0, fontSize: 18 }}>{branding.appName}</h2>
          {user && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>
              {user.firstName} {user.lastName}
            </div>
          )}
        </div>

        <NavItem to="/" label="Dashboard" activeBg={activeNavBg} onClick={() => setSidebarOpen(false)} />
        <NavItem to="/contacts" label="Contacts" activeBg={activeNavBg} onClick={() => setSidebarOpen(false)} />
        <NavItem to="/groups" label="Groups" activeBg={activeNavBg} onClick={() => setSidebarOpen(false)} />
        <NavItem to="/group-message" label="Group Message" activeBg={activeNavBg} onClick={() => setSidebarOpen(false)} />
        <NavItem to="/scheduled-messages" label="Scheduled Messages" activeBg={activeNavBg} onClick={() => setSidebarOpen(false)} />
        <NavItem to="/voice-call" label="Voice Calls" activeBg={activeNavBg} onClick={() => setSidebarOpen(false)} />
        <NavItem to="/notifications" label="Notifications" activeBg={activeNavBg} onClick={() => setSidebarOpen(false)} />
        {user?.role === "admin" && (
          <NavItem to="/users" label="Users" activeBg={activeNavBg} onClick={() => setSidebarOpen(false)} />
        )}
        {user?.role === "admin" && (
          <NavItem to="/settings" label="Settings" activeBg={activeNavBg} onClick={() => setSidebarOpen(false)} />
        )}

        <div style={{ marginTop: "auto", padding: "20px" }}>
          <button
            onClick={logout}
            style={{
              width: "100%",
              padding: "8px",
              background: "#e74c3c",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            Logout
          </button>
        </div>
      </nav>

      <main style={{ flex: 1, padding: 24, background: "#f5f5f5", overflowY: "auto", minWidth: 0 }}>
        <Outlet />
      </main>

      <style>{`
        @media (max-width: 768px) {
          .mobile-menu-btn { display: block !important; }
          .mobile-overlay { display: block !important; }
          .sidebar {
            position: fixed !important;
            top: 0;
            left: -260px;
            bottom: 0;
            height: 100vh;
            transition: left 0.25s ease;
          }
          .sidebar-open {
            left: 0 !important;
          }
          main {
            padding: 16px !important;
            padding-top: 56px !important;
          }
        }
      `}</style>
    </div>
  );
}

function NavItem({ to, label, activeBg, onClick }: { to: string; label: string; activeBg: string; onClick?: () => void }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      style={({ isActive }) => ({
        display: "block",
        padding: "10px 20px",
        color: isActive ? "#fff" : "rgba(255,255,255,0.7)",
        background: isActive ? activeBg : "transparent",
        textDecoration: "none",
        fontSize: 14,
      })}
    >
      {label}
    </NavLink>
  );
}
