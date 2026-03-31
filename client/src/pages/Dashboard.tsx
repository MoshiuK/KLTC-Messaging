import { useState, useEffect } from "react";
import { useAuth } from "../components/AuthContext";
import { api } from "../api/client";
import { Contact, ContactGroup, GroupSendResponse } from "../types";

export default function Dashboard() {
  const { user } = useAuth();
  const [todayBirthdays, setTodayBirthdays] = useState<Contact[]>([]);
  const [upcomingBirthdays, setUpcomingBirthdays] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [birthdayMessage, setBirthdayMessage] = useState("");
  const [selectedBirthdayPerson, setSelectedBirthdayPerson] = useState<Contact | null>(null);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<GroupSendResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getBirthdays().then((data) => {
      setTodayBirthdays(data.today || []);
      setUpcomingBirthdays(data.upcoming || []);
    }).catch(() => {});
    api.getGroups().then(setGroups).catch(() => {});
  }, []);

  const openBirthdaySend = (contact: Contact) => {
    setSelectedBirthdayPerson(contact);
    setBirthdayMessage(`Happy Birthday ${contact.firstName}! Wishing you a wonderful day filled with joy and blessings!`);
    setSendResult(null);
    setError("");
  };

  const handleSendBirthday = async () => {
    if (!selectedGroupId) { setError("Please select a group to send to."); return; }
    if (!birthdayMessage.trim()) { setError("Please enter a message."); return; }
    setError("");
    setSending(true);
    setSendResult(null);
    try {
      const res = await api.sendBirthday(
        selectedGroupId,
        birthdayMessage,
        selectedBirthdayPerson?.fullName || ""
      );
      setSendResult(res);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

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
        {user?.role === "admin" && <Card title="Users" description="Manage team members" link="/users" />}
      </div>

      {/* Birthday Section */}
      {todayBirthdays.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h2>Today's Birthdays</h2>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {todayBirthdays.map((c) => (
              <div key={c.id} style={birthdayCard}>
                <div style={{ fontWeight: 600, fontSize: 16 }}>{c.fullName}</div>
                <div style={{ color: "#666", fontSize: 13 }}>{c.phoneNumber}</div>
                <button onClick={() => openBirthdaySend(c)} style={{ ...btnPrimary, marginTop: 8, fontSize: 12 }}>
                  Send Birthday Wishes to Everyone
                </button>
              </div>
            ))}
          </div>

          {selectedBirthdayPerson && (
            <div style={{ ...formCard, marginTop: 16 }}>
              <h3 style={{ marginTop: 0 }}>
                Send Birthday Wishes for {selectedBirthdayPerson.fullName}
              </h3>
              <p style={{ color: "#666", fontSize: 13 }}>
                This will send the birthday message to <strong>everyone</strong> in the selected group.
              </p>

              {error && <div style={errorBox}>{error}</div>}

              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Send to Group *</label>
                <select value={selectedGroupId} onChange={(e) => setSelectedGroupId(e.target.value)} style={inputStyle}>
                  <option value="">-- Choose a group --</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name} ({g._count.members} members)</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Message *</label>
                <textarea
                  value={birthdayMessage}
                  onChange={(e) => setBirthdayMessage(e.target.value)}
                  rows={3}
                  maxLength={1600}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
                <div style={{ textAlign: "right", fontSize: 12, color: "#999" }}>{birthdayMessage.length}/1600</div>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={handleSendBirthday}
                  disabled={sending || !selectedGroupId}
                  style={{ ...btnPrimary, opacity: sending ? 0.7 : 1 }}
                >
                  {sending ? "Sending..." : "Send to Everyone"}
                </button>
                <button onClick={() => { setSelectedBirthdayPerson(null); setSendResult(null); }} style={{ ...btnPrimary, background: "#95a5a6" }}>
                  Cancel
                </button>
              </div>

              {sendResult && (
                <div style={{ marginTop: 12, padding: 12, background: "#eafff0", borderRadius: 4 }}>
                  Sent: {sendResult.summary.sent} | Skipped: {sendResult.summary.skipped} | Failed: {sendResult.summary.failed}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {upcomingBirthdays.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h2>Upcoming Birthdays (Next 30 Days)</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Birthday</th>
                  <th style={thStyle}>Phone</th>
                </tr>
              </thead>
              <tbody>
                {upcomingBirthdays.map((c) => (
                  <tr key={c.id}>
                    <td style={tdStyle}>{c.fullName}</td>
                    <td style={tdStyle}>{c.birthday}</td>
                    <td style={tdStyle}>{c.phoneNumber}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
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

const btnPrimary: React.CSSProperties = { padding: "8px 16px", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 14 };
const errorBox: React.CSSProperties = { color: "#e74c3c", marginBottom: 12, padding: 8, background: "#ffeaea", borderRadius: 4 };
const formCard: React.CSSProperties = { background: "#fff", padding: 20, borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" };
const birthdayCard: React.CSSProperties = { background: "#fff", padding: 16, borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.1)", border: "2px solid #f39c12" };
const labelStyle: React.CSSProperties = { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 500 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 4, fontSize: 14, boxSizing: "border-box" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "10px 12px", borderBottom: "2px solid #eee", fontSize: 13, fontWeight: 600 };
const tdStyle: React.CSSProperties = { padding: "10px 12px", borderBottom: "1px solid #f0f0f0", fontSize: 14 };
