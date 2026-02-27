import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { useBranding } from "./BrandingContext";

function lightenColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, (num >> 16) + amount);
  const g = Math.min(255, ((num >> 8) & 0x00ff) + amount);
  const b = Math.min(255, (num & 0x0000ff) + amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { branding } = useBranding();

  const activeNavBg = lightenColor(branding.primaryColor, 20);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <nav
        style={{
          width: 220,
          background: branding.primaryColor,
          color: "#fff",
          padding: "20px 0",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: "0 20px 20px", borderBottom: "1px solid #333", marginBottom: 10 }}>
          {branding.logoUrl && (
            <img
              src={branding.logoUrl}
              alt={branding.appName}
              style={{ maxHeight: 40, maxWidth: "100%", marginBottom: 8, display: "block" }}
            />
          )}
          <h2 style={{ margin: 0, fontSize: 18 }}>{branding.appName}</h2>
          {user && (
            <div style={{ fontSize: 12, color: "#aaa", marginTop: 4 }}>
              {user.firstName} {user.lastName}
            </div>
          )}
        </div>

        <NavItem to="/" label="Dashboard" activeBg={activeNavBg} />
        <NavItem to="/contacts" label="Contacts" activeBg={activeNavBg} />
        <NavItem to="/groups" label="Groups" activeBg={activeNavBg} />
        <NavItem to="/group-message" label="Group Message" activeBg={activeNavBg} />
        <NavItem to="/voice-call" label="Voice Calls" activeBg={activeNavBg} />
        <NavItem to="/notifications" label="Notifications" activeBg={activeNavBg} />
        {user?.role === "admin" && (
          <NavItem to="/settings" label="Settings" activeBg={activeNavBg} />
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

      <main style={{ flex: 1, padding: 24, background: "#f5f5f5", overflowY: "auto" }}>
        <Outlet />
      </main>
    </div>
  );
}

function NavItem({ to, label, activeBg }: { to: string; label: string; activeBg: string }) {
  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        display: "block",
        padding: "10px 20px",
        color: isActive ? "#fff" : "#ccc",
        background: isActive ? activeBg : "transparent",
        textDecoration: "none",
        fontSize: 14,
      })}
    >
      {label}
    </NavLink>
  );
}
