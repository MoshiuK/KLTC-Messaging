import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../api/client";
import { Contact } from "../types";

// Debounce hook
function useDebounce(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function Contacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [form, setForm] = useState({ firstName: "", lastName: "", phoneNumber: "", email: "", birthday: "" });
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const loadContacts = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (debouncedSearch) params.search = debouncedSearch;
      const data = await api.getContacts(params);
      setContacts(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  const resetForm = () => {
    setForm({ firstName: "", lastName: "", phoneNumber: "", email: "", birthday: "" });
    setEditingId(null);
    setShowForm(false);
    setFormError("");
  };

  // Client-side phone validation
  const validatePhone = (phone: string): string | null => {
    if (!phone) return "Phone number is required.";
    if (!/^\+[1-9]\d{1,14}$/.test(phone)) return "Phone must be in E.164 format (e.g. +15551234567).";
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    // Client-side validation
    if (!form.firstName.trim()) { setFormError("First name is required."); return; }
    if (!form.lastName.trim()) { setFormError("Last name is required."); return; }
    const phoneErr = validatePhone(form.phoneNumber);
    if (phoneErr) { setFormError(phoneErr); return; }

    try {
      if (editingId) {
        await api.updateContact(editingId, form);
      } else {
        await api.createContact(form);
      }
      resetForm();
      loadContacts();
    } catch (err: any) {
      setFormError(err.message);
    }
  };

  const startEdit = (c: Contact) => {
    setForm({ firstName: c.firstName, lastName: c.lastName, phoneNumber: c.phoneNumber, email: c.email || "", birthday: c.birthday || "" });
    setEditingId(c.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteContact(id);
      setShowDeleteConfirm(null);
      loadContacts();
    } catch (err: any) {
      setError(err.message);
      setShowDeleteConfirm(null);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ margin: 0 }}>Contacts</h1>
        <button onClick={() => { resetForm(); setShowForm(!showForm); }} style={btnPrimary}>
          {showForm ? "Cancel" : "+ New Contact"}
        </button>
      </div>

      {error && <div style={errorBox}>{error}</div>}

      {showForm && (
        <form onSubmit={handleSubmit} style={formCard}>
          <h3 style={{ marginTop: 0 }}>{editingId ? "Edit Contact" : "New Contact"}</h3>
          {formError && <div style={errorBox}>{formError}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            <div>
              <label style={labelStyle}>First Name *</label>
              <input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Last Name *</label>
              <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Phone (E.164) *</label>
              <input value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} placeholder="+15551234567" required style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Birthday</label>
              <input type="date" value={form.birthday} onChange={(e) => setForm({ ...form, birthday: e.target.value })} style={inputStyle} />
            </div>
          </div>
          <button type="submit" style={{ ...btnPrimary, marginTop: 12 }}>{editingId ? "Update" : "Create"}</button>
        </form>
      )}

      <div style={{ marginBottom: 16 }}>
        <input
          placeholder="Search contacts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...inputStyle, maxWidth: 300 }}
        />
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : contacts.length === 0 ? (
        <p style={{ color: "#666" }}>No contacts found.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Phone</th>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Birthday</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id}>
                  <td style={tdStyle}>{c.fullName}</td>
                  <td style={tdStyle}>{c.phoneNumber}</td>
                  <td style={tdStyle}>{c.email || "-"}</td>
                  <td style={tdStyle}>{c.birthday || "-"}</td>
                  <td style={tdStyle}>
                    {!c.isActive && <Chip label="Inactive" color="#95a5a6" />}
                    {c.isOptedOut && <Chip label="Opted Out" color="#e67e22" />}
                    {c.isBlockedSuspected && <Chip label="Blocked" color="#e74c3c" />}
                    {c.isActive && !c.isOptedOut && !c.isBlockedSuspected && <Chip label="Active" color="#27ae60" />}
                  </td>
                  <td style={tdStyle}>
                    <button onClick={() => startEdit(c)} style={btnSmall}>Edit</button>
                    {c.isActive && (
                      showDeleteConfirm === c.id ? (
                        <span style={{ fontSize: 12 }}>
                          Sure?{" "}
                          <button onClick={() => handleDelete(c.id)} style={{ ...btnSmall, background: "#e74c3c" }}>Yes</button>
                          <button onClick={() => setShowDeleteConfirm(null)} style={{ ...btnSmall, background: "#95a5a6" }}>No</button>
                        </span>
                      ) : (
                        <button onClick={() => setShowDeleteConfirm(c.id)} style={{ ...btnSmall, background: "#e74c3c" }}>Deactivate</button>
                      )
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

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 12, background: color, color: "#fff", fontSize: 12, marginRight: 4 }}>
      {label}
    </span>
  );
}

const btnPrimary: React.CSSProperties = { padding: "8px 16px", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 14 };
const btnSmall: React.CSSProperties = { padding: "4px 10px", background: "#3498db", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12, marginRight: 4 };
const errorBox: React.CSSProperties = { color: "#e74c3c", marginBottom: 12, padding: 8, background: "#ffeaea", borderRadius: 4 };
const formCard: React.CSSProperties = { background: "#fff", padding: 20, borderRadius: 8, marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" };
const labelStyle: React.CSSProperties = { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 500 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 4, fontSize: 14, boxSizing: "border-box" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "10px 12px", borderBottom: "2px solid #eee", fontSize: 13, fontWeight: 600 };
const tdStyle: React.CSSProperties = { padding: "10px 12px", borderBottom: "1px solid #f0f0f0", fontSize: 14 };
