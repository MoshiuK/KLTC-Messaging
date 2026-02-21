import { useAuth } from "../components/AuthContext";

export default function Dashboard() {
  const { user } = useAuth();

  return (
    <div>
      <h1>Dashboard</h1>
      <p>Welcome, {user?.firstName} {user?.lastName}!</p>
      <p>Organization: {user?.organizationName}</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginTop: 24 }}>
        <Card title="Contacts" description="Manage your contact list" link="/contacts" />
        <Card title="Groups" description="Organize contacts into groups" link="/groups" />
        <Card title="Group Message" description="Send messages to groups" link="/group-message" />
        <Card title="Notifications" description="View delivery events & alerts" link="/notifications" />
      </div>
    </div>
  );
}

function Card({ title, description, link }: { title: string; description: string; link: string }) {
  return (
    <a
      href={link}
      style={{
        display: "block",
        padding: 20,
        background: "#fff",
        borderRadius: 8,
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <h3 style={{ margin: "0 0 8px" }}>{title}</h3>
      <p style={{ margin: 0, color: "#666", fontSize: 14 }}>{description}</p>
    </a>
  );
}
