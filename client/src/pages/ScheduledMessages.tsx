import { useState, useEffect } from "react";
import { api } from "../api/client";
import { ContactGroup } from "../types";

interface ScheduledMessage {
  id: string;
  groupId: string | null;
  contactId: string | null;
  body: string;
  mediaUrl: string | null;
  scheduledAt: string;
  recurrence: string;
  status: string;
  type: string;
  sentAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export default function ScheduledMessages() {
  const [messages, setMessages] = useState<ScheduledMessage[]>([]);
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [filter, setFilter] = useState("pending");

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [body, setBody] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [recurrence, setRecurrence] = useState("none");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadData();
  }, [filter]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [msgs, grps] = await Promise.all([
        api.getScheduledMessages(filter || undefined),
        api.getGroups(),
      ]);
      setMessages(msgs);
      setGroups(grps);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroupId) { setError("Please select a group."); return; }
    if (!body.trim()) { setError("Please enter a message."); return; }
    if (!scheduledAt) { setError("Please select a date and time."); return; }

    setError("");
    setSuccess("");
    setCreating(true);
    try {
      await api.createScheduledMessage({
        groupId: selectedGroupId,
        body,
        mediaUrl: mediaUrl || undefined,
        scheduledAt: new Date(scheduledAt).toISOString(),
        recurrence,
        type: "group",
      });
      setSuccess("Message scheduled successfully!");
      setBody("");
      setMediaUrl("");
      setScheduledAt("");
      setRecurrence("none");
      setSelectedGroupId("");
      setShowForm(false);
      loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm("Cancel this scheduled message?")) return;
    try {
      await api.cancelScheduledMessage(id);
      setSuccess("Message cancelled.");
      loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const getGroupName = (groupId: string | null) => {
    if (!groupId) return "—";
    const group = groups.find((g) => g.id === groupId);
    return group ? group.name : "Unknown group";
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const statusColor: Record<string, string> = {
    pending: "#3498db",
    sent: "#27ae60",
    failed: "#e74c3c",
    cancelled: "#95a5a6",
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0 }}>Scheduled Messages</h1>
          <p style={{ color: "#666", margin: "4px 0 0" }}>Schedule messages to send later or on a recurring basis.</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} style={btnPrimary}>
          {showForm ? "Cancel" : "+ Schedule Message"}
        </button>
      </div>

      {error && <div style={errorBox}>{error}</div>}
      {success && <div style={successBox}>{success}</div>}

      {showForm && (
        <form onSubmit={handleCreate} style={formCard}>
          <h3 style={{ marginTop: 0 }}>Schedule a New Message</h3>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Select Group *</label>
            <select
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
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
            <label style={labelStyle}>Message *</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              rows={4}
              maxLength={1600}
              placeholder="Type your message here..."
              style={{ ...inputStyle, resize: "vertical" }}
            />
            <div style={{ textAlign: "right", fontSize: 12, color: "#999" }}>{body.length}/1600</div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Media URL (optional)</label>
            <input
              value={mediaUrl}
              onChange={(e) => setMediaUrl(e.target.value)}
              placeholder="https://example.com/image.jpg"
              style={inputStyle}
            />
          </div>

          <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Send Date & Time *</label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                required
                style={inputStyle}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Recurrence</label>
              <select
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value)}
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                <option value="none">One-time (no repeat)</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
          </div>

          <button type="submit" disabled={creating} style={{ ...btnPrimary, opacity: creating ? 0.7 : 1 }}>
            {creating ? "Scheduling..." : "Schedule Message"}
          </button>
        </form>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 16, marginTop: 16 }}>
        {["pending", "sent", "failed", "cancelled", ""].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            style={{
              padding: "6px 14px",
              border: "1px solid #ddd",
              borderRadius: 20,
              background: filter === s ? "#1a1a2e" : "#fff",
              color: filter === s ? "#fff" : "#333",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            {s || "All"}
          </button>
        ))}
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : messages.length === 0 ? (
        <div style={emptyState}>
          No {filter || ""} scheduled messages.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Group</th>
                <th style={thStyle}>Message</th>
                <th style={thStyle}>Scheduled For</th>
                <th style={thStyle}>Recurrence</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((msg) => (
                <tr key={msg.id}>
                  <td style={tdStyle}>{getGroupName(msg.groupId)}</td>
                  <td style={{ ...tdStyle, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {msg.body}
                  </td>
                  <td style={tdStyle}>{formatDate(msg.scheduledAt)}</td>
                  <td style={tdStyle}>
                    <span style={{ textTransform: "capitalize" }}>{msg.recurrence === "none" ? "One-time" : msg.recurrence}</span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{
                      padding: "2px 8px",
                      borderRadius: 12,
                      fontSize: 12,
                      color: "#fff",
                      background: statusColor[msg.status] || "#999",
                    }}>
                      {msg.status}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    {msg.status === "pending" && (
                      <button onClick={() => handleCancel(msg.id)} style={btnDanger}>
                        Cancel
                      </button>
                    )}
                    {msg.errorMessage && (
                      <span style={{ color: "#e74c3c", fontSize: 12 }} title={msg.errorMessage}>
                        Error
                      </span>
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

const btnPrimary: React.CSSProperties = { padding: "10px 20px", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 14 };
const btnDanger: React.CSSProperties = { padding: "4px 12px", background: "#e74c3c", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 };
const errorBox: React.CSSProperties = { color: "#e74c3c", marginBottom: 12, padding: 8, background: "#ffeaea", borderRadius: 4 };
const successBox: React.CSSProperties = { color: "#27ae60", marginBottom: 12, padding: 8, background: "#eafff0", borderRadius: 4 };
const formCard: React.CSSProperties = { background: "#fff", padding: 20, borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.1)", marginBottom: 16 };
const labelStyle: React.CSSProperties = { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 500 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 4, fontSize: 14, boxSizing: "border-box" };
const emptyState: React.CSSProperties = { textAlign: "center", padding: 40, color: "#999", background: "#fff", borderRadius: 8 };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "8px 12px", borderBottom: "2px solid #eee", fontSize: 13, fontWeight: 600 };
const tdStyle: React.CSSProperties = { padding: "8px 12px", borderBottom: "1px solid #f0f0f0", fontSize: 14 };
