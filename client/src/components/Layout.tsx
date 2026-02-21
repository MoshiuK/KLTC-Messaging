import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <nav
        style={{
          width: 220,
          background: "#1a1a2e",
          color: "#fff",
          padding: "20px 0",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: "0 20px 20px", borderBottom: "1px solid #333", marginBottom: 10 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>KLTC Messaging</h2>
          {user && (
            <div style={{ fontSize: 12, color: "#aaa", marginTop: 4 }}>
              {user.firstName} {user.lastName}
            </div>
          )}
        </div>

        <NavItem to="/" label="Dashboard" />
        <NavItem to="/contacts" label="Contacts" />
        <NavItem to="/groups" label="Groups" />
        <NavItem to="/group-message" label="Group Message" />
        <NavItem to="/notifications" label="Notifications" />

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

function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        display: "block",
        padding: "10px 20px",
        color: isActive ? "#fff" : "#ccc",
        background: isActive ? "#16213e" : "transparent",
        textDecoration: "none",
        fontSize: 14,
      })}
    >
      {label}
    </NavLink>
  );
}
