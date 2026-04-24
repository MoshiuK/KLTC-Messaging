import { useState, useEffect } from "react";
import { api } from "../api/client";
import { ContactGroup } from "../types";

interface Scripture {
  id: string;
  groupId: string;
  body: string;
  sendTime: string;
  startDate: string;
  endDate: string;
  status: string;
  lastSentDate: string | null;
  createdAt: string;
}

export default function DailyScripture() {
  const [scriptures, setScriptures] = useState<Scripture[]>([]);
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({
    groupId: "",
    body: "",
    sendTime: "08:00",
    startDate: today,
    endDate: "",
  });

  useEffect(() => {
    Promise.all([api.getDailyScriptures(), api.getGroups()])
      .then(([s, g]) => { setScriptures(s); setGroups(g); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const loadScriptures = async () => {
    try {
      const data = await api.getDailyScriptures();
      setScriptures(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!form.groupId) { setError("Please select a group."); return; }
    if (!form.body.trim()) { setError("Please enter a scripture message."); return; }
    if (!form.startDate) { setError("Please select a start date."); return; }
    if (!form.endDate) { setError("Please select an end date."); return; }
    if (form.endDate < form.startDate) { setError("End date must be on or after start date."); return; }

    setSubmitting(true);
    try {
      await api.createDailyScripture(form);
      setSuccess("Daily scripture scheduled successfully!");
      setForm({ groupId: "", body: "", sendTime: "08:00", startDate: today, endDate: "" });
      setShowForm(false);
      loadScriptures();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await api.updateDailyScripture(id, { status: "cancelled" });
      loadScriptures();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleReactivate = async (id: string) => {
    try {
      await api.updateDailyScripture(id, { status: "active" });
      loadScriptures();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteDailyScripture(id);
      setDeleteConfirm(null);
      loadScriptures();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const getGroupName = (groupId: string) => {
    const group = groups.find((g) => g.id === groupId);
    return group ? group.name : "Unknown";
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "#27ae60";
      case "cancelled": return "#e74c3c";
      case "completed": return "#3498db";
      default: return "#95a5a6";
    }
  };

  if (loading) return <p style={{ padding: 20 }}>Loading...</p>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ margin: 0 }}>Daily Scripture</h1>
        <button onClick={() => setShowForm(!showForm)} style={btnPrimary}>
          {showForm ? "Cancel" : "+ Schedule Daily Message"}
        </button>
      </div>

      <p style={{ color: "#666", marginTop: 0 }}>
        Schedule daily scripture messages to be sent automatically to a group between a start and end date.
      </p>

      {error && <div style={errorBox}>{error}</div>}
      {success && <div style={successBox}>{success}</div>}

      {showForm && (
        <form onSubmit={handleSubmit} style={formCard}>
          <h3 style={{ marginTop: 0 }}>Schedule Daily Messages</h3>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Select Group *</label>
            <select
              value={form.groupId}
              onChange={(e) => setForm({ ...form, groupId: e.target.value })}
              required
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              <option value="">-- Choose a group --</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g._count.members} members)
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Scripture Message *</label>
            <textarea
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              required
              rows={5}
              maxLength={1600}
              placeholder="Type your scripture message here..."
              style={{ ...inputStyle, resize: "vertical" }}
            />
            <div style={{ textAlign: "right", fontSize: 12, color: "#999" }}>{form.body.length}/1600</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Send Time *</label>
              <input
                type="time"
                value={form.sendTime}
                onChange={(e) => setForm({ ...form, sendTime: e.target.value })}
                required
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Start Date *</label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                required
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>End Date *</label>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                required
                min={form.startDate}
                style={inputStyle}
              />
            </div>
          </div>

          <button type="submit" disabled={submitting} style={{ ...btnPrimary, opacity: submitting ? 0.7 : 1 }}>
            {submitting ? "Scheduling..." : "Schedule Daily Messages"}
          </button>
        </form>
      )}

      {scriptures.length === 0 ? (
        <p style={{ color: "#666" }}>No scheduled daily messages yet.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Group</th>
                <th style={thStyle}>Message</th>
                <th style={thStyle}>Time</th>
                <th style={thStyle}>Date Range</th>
                <th style={thStyle}>Last Sent</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {scriptures.map((s) => (
                <tr key={s.id} style={{ opacity: s.status === "cancelled" ? 0.5 : 1 }}>
                  <td style={tdStyle}>{getGroupName(s.groupId)}</td>
                  <td style={{ ...tdStyle, maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.body}
                  </td>
                  <td style={tdStyle}>{s.sendTime}</td>
                  <td style={tdStyle}>
                    {formatDate(s.startDate)} — {formatDate(s.endDate)}
                  </td>
                  <td style={tdStyle}>
                    {s.lastSentDate ? formatDate(s.lastSentDate) : <span style={{ color: "#999" }}>Never</span>}
                  </td>
                  <td style={tdStyle}>
                    <span style={{
                      display: "inline-block", padding: "2px 8px", borderRadius: 12, fontSize: 12, color: "#fff",
                      background: getStatusColor(s.status),
                    }}>
                      {s.status}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    {s.status === "active" && (
                      <button onClick={() => handleCancel(s.id)} style={{ ...btnSmall, background: "#f39c12" }}>Cancel</button>
                    )}
                    {s.status === "cancelled" && s.endDate >= today && (
                      <button onClick={() => handleReactivate(s.id)} style={{ ...btnSmall, background: "#27ae60" }}>Reactivate</button>
                    )}
                    {deleteConfirm === s.id ? (
                      <span style={{ fontSize: 12 }}>
                        Sure?{" "}
                        <button onClick={() => handleDelete(s.id)} style={{ ...btnSmall, background: "#e74c3c" }}>Yes</button>
                        <button onClick={() => setDeleteConfirm(null)} style={{ ...btnSmall, background: "#95a5a6" }}>No</button>
                      </span>
                    ) : (
                      <button onClick={() => setDeleteConfirm(s.id)} style={{ ...btnSmall, background: "#e74c3c" }}>Delete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}, ${y}`;
}

const btnPrimary: React.CSSProperties = { padding: "8px 16px", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 14 };
const btnSmall: React.CSSProperties = { padding: "4px 10px", background: "#3498db", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12, marginRight: 4 };
const errorBox: React.CSSProperties = { color: "#e74c3c", marginBottom: 12, padding: 8, background: "#ffeaea", borderRadius: 4 };
const successBox: React.CSSProperties = { color: "#27ae60", marginBottom: 12, padding: 8, background: "#eafaea", borderRadius: 4 };
const formCard: React.CSSProperties = { background: "#fff", padding: 20, borderRadius: 8, marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" };
const labelStyle: React.CSSProperties = { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 500 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 4, fontSize: 14, boxSizing: "border-box" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "10px 12px", borderBottom: "2px solid #eee", fontSize: 13, fontWeight: 600 };
const tdStyle: React.CSSProperties = { padding: "10px 12px", borderBottom: "1px solid #f0f0f0", fontSize: 14 };
