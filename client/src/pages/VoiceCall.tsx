import { useState, useEffect } from "react";
import { api } from "../api/client";
import { useBranding } from "../components/BrandingContext";
import { ContactGroup, Contact, GroupVoiceCallResponse, VoiceCallResult } from "../types";

export default function VoiceCall() {
  const { branding } = useBranding();
  const [mode, setMode] = useState<"group" | "individual">("group");
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [selectedContactPhone, setSelectedContactPhone] = useState("");
  const [message, setMessage] = useState("");
  const [voice, setVoice] = useState("alice");
  const [calling, setCalling] = useState(false);
  const [result, setResult] = useState<GroupVoiceCallResponse | null>(null);
  const [singleResult, setSingleResult] = useState<VoiceCallResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getGroups(), api.getContacts()])
      .then(([g, c]) => {
        setGroups(g);
        setContacts(c);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setError("");
    setResult(null);
    setSingleResult(null);
    setCalling(true);

    try {
      if (mode === "group") {
        if (!selectedGroupId) return;
        const res = await api.voiceCallGroup(selectedGroupId, message, voice);
        setResult(res);
        setMessage("");
      } else {
        if (!selectedContactPhone) return;
        const res = await api.voiceCall(selectedContactPhone, message, voice);
        const contact = contacts.find((c) => c.phoneNumber === selectedContactPhone);
        setSingleResult({
          contactId: contact?.id || "",
          contactName: contact?.fullName || selectedContactPhone,
          phoneNumber: selectedContactPhone,
          status: res.callSid ? "called" : "failed",
          callSid: res.callSid,
        });
        setMessage("");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCalling(false);
    }
  };

  return (
    <div>
      <h1>Voice Calls</h1>
      <p style={{ color: "#666" }}>Make automated voice calls with a text-to-speech message.</p>

      {error && <div style={errorBox}>{error}</div>}

      <form onSubmit={handleSubmit} style={formCard}>
        {/* Mode toggle */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => setMode("group")}
            style={{
              padding: "8px 16px",
              background: mode === "group" ? branding.primaryColor : "#eee",
              color: mode === "group" ? "#fff" : "#333",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Group Call
          </button>
          <button
            type="button"
            onClick={() => setMode("individual")}
            style={{
              padding: "8px 16px",
              background: mode === "individual" ? branding.primaryColor : "#eee",
              color: mode === "individual" ? "#fff" : "#333",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Individual Call
          </button>
        </div>

        {/* Group / Contact selector */}
        <div style={{ marginBottom: 12 }}>
          {mode === "group" ? (
            <>
              <label style={labelStyle}>Select Group *</label>
              {loading ? (
                <p>Loading...</p>
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
            </>
          ) : (
            <>
              <label style={labelStyle}>Select Contact *</label>
              {loading ? (
                <p>Loading...</p>
              ) : (
                <select
                  value={selectedContactPhone}
                  onChange={(e) => setSelectedContactPhone(e.target.value)}
                  required
                  style={{ ...inputStyle, cursor: "pointer" }}
                >
                  <option value="">-- Choose a contact --</option>
                  {contacts
                    .filter((c) => c.isActive && !c.isOptedOut && !c.isBlockedSuspected)
                    .map((c) => (
                      <option key={c.id} value={c.phoneNumber}>
                        {c.fullName} ({c.phoneNumber})
                      </option>
                    ))}
                </select>
              )}
            </>
          )}
        </div>

        {/* Voice selector */}
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Voice</label>
          <select
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            style={{ ...inputStyle, cursor: "pointer", width: "auto", minWidth: 160 }}
          >
            <option value="alice">Alice (Female)</option>
            <option value="man">Man</option>
            <option value="woman">Woman</option>
          </select>
        </div>

        {/* Message */}
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Message (Text-to-Speech) *</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
            rows={4}
            maxLength={5000}
            placeholder="Type the message to be spoken..."
            style={{ ...inputStyle, resize: "vertical" }}
          />
          <div style={{ textAlign: "right", fontSize: 12, color: "#999" }}>{message.length}/5000</div>
        </div>

        <button
          type="submit"
          disabled={calling || !message.trim() || (mode === "group" ? !selectedGroupId : !selectedContactPhone)}
          style={{ padding: "10px 20px", background: branding.primaryColor, color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 14, opacity: calling ? 0.7 : 1 }}
        >
          {calling ? "Calling..." : mode === "group" ? "Call Group" : "Make Call"}
        </button>
      </form>

      {/* Group call results */}
      {result && (
        <div style={{ background: "#fff", padding: 20, borderRadius: 8, marginTop: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <h3 style={{ marginTop: 0 }}>Call Results</h3>

          <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
            <SummaryChip label="Total" value={result.summary.total} color="#333" />
            <SummaryChip label="Called" value={result.summary.called} color="#27ae60" />
            <SummaryChip label="Skipped" value={result.summary.skipped} color="#f39c12" />
            <SummaryChip label="Failed" value={result.summary.failed} color="#e74c3c" />
          </div>

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
                        background: r.status === "called" ? "#27ae60" : r.status === "skipped" ? "#f39c12" : "#e74c3c",
                      }}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td style={tdStyle}>{r.reason || r.callSid || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Single call result */}
      {singleResult && (
        <div style={{ background: "#fff", padding: 20, borderRadius: 8, marginTop: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <h3 style={{ marginTop: 0 }}>Call Result</h3>
          <p>
            <strong>{singleResult.contactName}</strong> ({singleResult.phoneNumber}):&nbsp;
            <span
              style={{
                padding: "2px 8px",
                borderRadius: 12,
                fontSize: 12,
                color: "#fff",
                background: singleResult.status === "called" ? "#27ae60" : "#e74c3c",
              }}
            >
              {singleResult.status}
            </span>
          </p>
          {singleResult.callSid && (
            <p style={{ fontSize: 13, color: "#999" }}>Call SID: {singleResult.callSid}</p>
          )}
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

const errorBox: React.CSSProperties = { color: "#e74c3c", marginBottom: 12, padding: 8, background: "#ffeaea", borderRadius: 4 };
const formCard: React.CSSProperties = { background: "#fff", padding: 20, borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" };
const labelStyle: React.CSSProperties = { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 500 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 4, fontSize: 14, boxSizing: "border-box" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "8px 12px", borderBottom: "2px solid #eee", fontSize: 13, fontWeight: 600 };
const tdStyle: React.CSSProperties = { padding: "8px 12px", borderBottom: "1px solid #f0f0f0", fontSize: 14 };
