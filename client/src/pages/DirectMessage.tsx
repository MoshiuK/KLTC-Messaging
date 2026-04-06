import { useState, useEffect } from "react";
import { api } from "../api/client";
import { Contact } from "../types";

export default function DirectMessage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContactId, setSelectedContactId] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [body, setBody] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getContacts()
      .then(setContacts)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const getToNumber = (): string => {
    if (manualPhone.trim()) return manualPhone.trim();
    const contact = contacts.find((c) => c.id === selectedContactId);
    return contact?.phoneNumber || "";
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const to = getToNumber();
    if (!to) { setError("Please select a contact or enter a phone number."); return; }
    if (!body.trim()) { setError("Please enter a message."); return; }
    setError("");
    setResult(null);
    setSending(true);
    try {
      const res = await api.sendDirect(to, body, mediaUrl || undefined);
      setResult(res);
      setBody("");
      setMediaUrl("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const selectedContact = contacts.find((c) => c.id === selectedContactId);

  return (
    <div>
      <h1>Direct Message</h1>
      <p style={{ color: "#666" }}>Send a message to an individual contact or phone number.</p>

      {error && <div style={errorBox}>{error}</div>}

      <form onSubmit={handleSend} style={formCard}>
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Select Contact</label>
          {loading ? (
            <p>Loading contacts...</p>
          ) : (
            <select
              value={selectedContactId}
              onChange={(e) => { setSelectedContactId(e.target.value); setManualPhone(""); }}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              <option value="">-- Choose a contact --</option>
              {contacts
                .filter((c) => c.isActive && !c.isOptedOut && !c.isBlockedSuspected)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName} ({c.phoneNumber})
                  </option>
                ))}
            </select>
          )}
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Or Enter Phone Number (E.164 format)</label>
          <input
            value={manualPhone}
            onChange={(e) => { setManualPhone(e.target.value); setSelectedContactId(""); }}
            placeholder="+15551234567"
            style={inputStyle}
          />
          <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>
            Must include country code, e.g. +1 for US numbers.
          </div>
        </div>

        {selectedContact && (
          <div style={{ marginBottom: 12, padding: 10, background: "#f8f9fa", borderRadius: 4, fontSize: 13 }}>
            Sending to: <strong>{selectedContact.fullName}</strong> — {selectedContact.phoneNumber}
            {selectedContact.isOptedOut && <span style={{ color: "#e74c3c", marginLeft: 8 }}>(Opted out)</span>}
            {selectedContact.isBlockedSuspected && <span style={{ color: "#e74c3c", marginLeft: 8 }}>(Blocked)</span>}
          </div>
        )}

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
          <label style={labelStyle}>Media URL (optional — JPG, PNG, or Video)</label>
          <input
            value={mediaUrl}
            onChange={(e) => setMediaUrl(e.target.value)}
            placeholder="https://example.com/image.jpg"
            style={inputStyle}
          />
          <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>
            Paste a public URL to a JPG, PNG, GIF, or MP4 file to send as MMS.
          </div>
          {mediaUrl && (
            <div style={{ marginTop: 8 }}>
              {/\.(jpg|jpeg|png|gif)$/i.test(mediaUrl) ? (
                <img src={mediaUrl} alt="Preview" style={{ maxHeight: 100, maxWidth: 200, borderRadius: 4, border: "1px solid #ddd" }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              ) : /\.(mp4|mov)$/i.test(mediaUrl) ? (
                <video src={mediaUrl} style={{ maxHeight: 100, maxWidth: 200, borderRadius: 4 }} controls />
              ) : null}
            </div>
          )}
        </div>

        <button type="submit" disabled={sending || (!selectedContactId && !manualPhone.trim()) || !body.trim()} style={{ ...btnPrimary, opacity: sending ? 0.7 : 1 }}>
          {sending ? "Sending..." : "Send Message"}
        </button>
      </form>

      {result && (
        <div style={{ background: "#fff", padding: 20, borderRadius: 8, marginTop: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <h3 style={{ marginTop: 0 }}>
            {result.message?.status === "failed" ? "Message Failed" : "Message Sent"}
          </h3>
          <div style={{ fontSize: 14 }}>
            <p><strong>To:</strong> {result.message?.toNumber}</p>
            <p><strong>Status:</strong>{" "}
              <span style={{
                padding: "2px 8px",
                borderRadius: 12,
                fontSize: 12,
                color: "#fff",
                background: result.message?.status === "failed" ? "#e74c3c" : "#27ae60",
              }}>
                {result.message?.status}
              </span>
            </p>
            {result.telnyxId && <p><strong>Telnyx ID:</strong> {result.telnyxId}</p>}
            {result.message?.errorMessage && <p style={{ color: "#e74c3c" }}><strong>Error:</strong> {result.message.errorMessage}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

const btnPrimary: React.CSSProperties = { padding: "10px 20px", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 14 };
const errorBox: React.CSSProperties = { color: "#e74c3c", marginBottom: 12, padding: 8, background: "#ffeaea", borderRadius: 4 };
const formCard: React.CSSProperties = { background: "#fff", padding: 20, borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" };
const labelStyle: React.CSSProperties = { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 500 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 4, fontSize: 14, boxSizing: "border-box" };
