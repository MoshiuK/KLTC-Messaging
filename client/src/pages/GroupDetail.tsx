import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../api/client";
import { Contact, ContactGroupMember } from "../types";

export default function GroupDetail() {
  const { id } = useParams<{ id: string }>();
  const [members, setMembers] = useState<ContactGroupMember[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState("");

  const loadData = async () => {
    if (!id) return;
    try {
      const [m, c] = await Promise.all([api.getGroupMembers(id), api.getContacts()]);
      setMembers(m);
      setContacts(c);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const memberContactIds = new Set(members.map((m) => m.contactId));
  const availableContacts = contacts.filter((c) => !memberContactIds.has(c.id) && c.isActive);

  const toggleSelect = (cid: string) => {
    setSelectedIds((prev) => (prev.includes(cid) ? prev.filter((x) => x !== cid) : [...prev, cid]));
  };

  const addMembers = async () => {
    if (!id || selectedIds.length === 0) return;
    try {
      await api.addGroupMembers(id, selectedIds);
      setSelectedIds([]);
      setShowAdd(false);
      loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const removeMember = async (contactId: string) => {
    if (!id) return;
    try {
      await api.removeGroupMember(id, contactId);
      loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Link to="/groups" style={{ color: "#3498db", fontSize: 14 }}>&larr; Back to Groups</Link>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Group Members ({members.length})</h1>
        <button onClick={() => setShowAdd(!showAdd)} style={btnPrimary}>
          {showAdd ? "Cancel" : "+ Add Members"}
        </button>
      </div>

      {error && <div style={errorBox}>{error}</div>}

      {showAdd && (
        <div style={formCard}>
          <h3 style={{ marginTop: 0 }}>Add Contacts to Group</h3>
          {availableContacts.length === 0 ? (
            <p style={{ color: "#666" }}>All active contacts are already in this group.</p>
          ) : (
            <>
              <div style={{ maxHeight: 300, overflowY: "auto", border: "1px solid #eee", borderRadius: 4 }}>
                {availableContacts.map((c) => (
                  <label
                    key={c.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "8px 12px",
                      borderBottom: "1px solid #f5f5f5",
                      cursor: "pointer",
                      background: selectedIds.includes(c.id) ? "#e8f4fd" : "transparent",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(c.id)}
                      onChange={() => toggleSelect(c.id)}
                      style={{ marginRight: 10 }}
                    />
                    <span>{c.fullName}</span>
                    <span style={{ marginLeft: "auto", color: "#999", fontSize: 12 }}>{c.phoneNumber}</span>
                  </label>
                ))}
              </div>
              <button onClick={addMembers} disabled={selectedIds.length === 0} style={{ ...btnPrimary, marginTop: 12 }}>
                Add {selectedIds.length} Contact{selectedIds.length !== 1 ? "s" : ""}
              </button>
            </>
          )}
        </div>
      )}

      {members.length === 0 ? (
        <p style={{ color: "#666" }}>No members in this group yet.</p>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Phone</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td style={tdStyle}>{m.contact.fullName}</td>
                <td style={tdStyle}>{m.contact.phoneNumber}</td>
                <td style={tdStyle}>
                  {!m.contact.isActive && <Chip label="Inactive" color="#95a5a6" />}
                  {m.contact.isOptedOut && <Chip label="Opted Out" color="#e67e22" />}
                  {m.contact.isBlockedSuspected && <Chip label="Blocked" color="#e74c3c" />}
                  {m.contact.isActive && !m.contact.isOptedOut && !m.contact.isBlockedSuspected && <Chip label="Active" color="#27ae60" />}
                </td>
                <td style={tdStyle}>
                  <button onClick={() => removeMember(m.contactId)} style={{ ...btnSmall, background: "#e74c3c" }}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 12, background: color, color: "#fff", fontSize: 12, marginRight: 4 }}>
      {label}
    </span>
  );
}

const btnPrimary: React.CSSProperties = { padding: "8px 16px", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 14 };
const btnSmall: React.CSSProperties = { padding: "4px 10px", background: "#3498db", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 };
const errorBox: React.CSSProperties = { color: "#e74c3c", marginBottom: 12, padding: 8, background: "#ffeaea", borderRadius: 4 };
const formCard: React.CSSProperties = { background: "#fff", padding: 20, borderRadius: 8, marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "10px 12px", borderBottom: "2px solid #eee", fontSize: 13, fontWeight: 600 };
const tdStyle: React.CSSProperties = { padding: "10px 12px", borderBottom: "1px solid #f0f0f0", fontSize: 14 };
