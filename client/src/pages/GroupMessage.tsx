import { useState, useEffect } from "react";
import { api } from "../api/client";
import { ContactGroup, GroupSendResponse } from "../types";

export default function GroupMessage() {
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<GroupSendResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getGroups()
      .then(setGroups)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroupId) { setError("Please select a group."); return; }
    if (!body.trim()) { setError("Please enter a message."); return; }
    setError("");
    setResult(null);
    setSending(true);
    try {
      const res = await api.sendGroup(selectedGroupId, body);
      setResult(res);
      setBody("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <h1>Group Message</h1>
      <p style={{ color: "#666" }}>Send a message to all active contacts in a group.</p>

      {error && <div style={errorBox}>{error}</div>}

      <form onSubmit={handleSend} style={formCard}>
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Select Group *</label>
          {loading ? (
            <p>Loading groups...</p>
          ) : (
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
          )}
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

        <button type="submit" disabled={sending || !selectedGroupId || !body.trim()} style={{ ...btnPrimary, opacity: sending ? 0.7 : 1 }}>
          {sending ? "Sending..." : "Send to Group"}
        </button>
      </form>

      {result && (
        <div style={{ background: "#fff", padding: 20, borderRadius: 8, marginTop: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <h3 style={{ marginTop: 0 }}>Send Results</h3>

          <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
            <SummaryChip label="Total" value={result.summary.total} color="#333" />
            <SummaryChip label="Sent" value={result.summary.sent} color="#27ae60" />
            <SummaryChip label="Skipped" value={result.summary.skipped} color="#f39c12" />
            <SummaryChip label="Failed" value={result.summary.failed} color="#e74c3c" />
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Contact</th>
                  <th style={thStyle}>Phone</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Details</th>
                </tr>
              </thead>
              <tbody>
                {result.results.map((r, i) => (
                  <tr key={i}>
                    <td style={tdStyle}>{r.contactName}</td>
                    <td style={tdStyle}>{r.phoneNumber}</td>
                    <td style={tdStyle}>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 12,
                          fontSize: 12,
                          color: "#fff",
                          background: r.status === "sent" ? "#27ae60" : r.status === "skipped" ? "#f39c12" : "#e74c3c",
                        }}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td style={tdStyle}>{r.reason || r.twilioSid || "-"}</td>
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

function SummaryChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 12, color: "#666" }}>{label}</div>
    </div>
  );
}

const btnPrimary: React.CSSProperties = { padding: "10px 20px", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 14 };
const errorBox: React.CSSProperties = { color: "#e74c3c", marginBottom: 12, padding: 8, background: "#ffeaea", borderRadius: 4 };
const formCard: React.CSSProperties = { background: "#fff", padding: 20, borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" };
const labelStyle: React.CSSProperties = { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 500 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 4, fontSize: 14, boxSizing: "border-box" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "8px 12px", borderBottom: "2px solid #eee", fontSize: 13, fontWeight: 600 };
const tdStyle: React.CSSProperties = { padding: "8px 12px", borderBottom: "1px solid #f0f0f0", fontSize: 14 };
