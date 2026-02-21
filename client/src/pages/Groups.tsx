import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { ContactGroup } from "../types";

export default function Groups() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const loadGroups = async () => {
    try {
      const data = await api.getGroups();
      setGroups(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGroups();
  }, []);

  const resetForm = () => {
    setForm({ name: "", description: "" });
    setEditingId(null);
    setShowForm(false);
    setFormError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    try {
      if (editingId) {
        await api.updateGroup(editingId, form);
      } else {
        await api.createGroup(form);
      }
      resetForm();
      loadGroups();
    } catch (err: any) {
      setFormError(err.message);
    }
  };

  const startEdit = (g: ContactGroup) => {
    setForm({ name: g.name, description: g.description || "" });
    setEditingId(g.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteGroup(id);
      setConfirmDeleteId(null);
      loadGroups();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Groups</h1>
        <button onClick={() => { resetForm(); setShowForm(!showForm); }} style={btnPrimary}>
          {showForm ? "Cancel" : "+ New Group"}
        </button>
      </div>

      {error && <div style={errorBox}>{error}</div>}

      {showForm && (
        <form onSubmit={handleSubmit} style={formCard}>
          <h3 style={{ marginTop: 0 }}>{editingId ? "Edit Group" : "New Group"}</h3>
          {formError && <div style={errorBox}>{formError}</div>}
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Name *</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required style={inputStyle} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
          </div>
          <button type="submit" style={btnPrimary}>{editingId ? "Update" : "Create"}</button>
        </form>
      )}

      {loading ? (
        <p>Loading...</p>
      ) : groups.length === 0 ? (
        <p style={{ color: "#666" }}>No groups yet.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {groups.map((g) => (
            <div key={g.id} style={{ background: "#fff", padding: 16, borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                <div>
                  <h3 style={{ margin: "0 0 4px" }}>{g.name}</h3>
                  {g.description && <p style={{ margin: "0 0 8px", color: "#666", fontSize: 13 }}>{g.description}</p>}
                </div>
                <span style={{ background: "#eee", padding: "2px 8px", borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
                  {g._count.members} members
                </span>
              </div>
              <p style={{ fontSize: 12, color: "#999", margin: "8px 0" }}>
                Created by {g.createdBy.firstName} {g.createdBy.lastName}
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => navigate(`/groups/${g.id}`)} style={btnSmall}>Manage Members</button>
                <button onClick={() => startEdit(g)} style={{ ...btnSmall, background: "#f39c12" }}>Edit</button>
                {confirmDeleteId === g.id ? (
                  <>
                    <button onClick={() => handleDelete(g.id)} style={{ ...btnSmall, background: "#e74c3c" }}>Confirm Delete</button>
                    <button onClick={() => setConfirmDeleteId(null)} style={{ ...btnSmall, background: "#95a5a6" }}>Cancel</button>
                  </>
                ) : (
                  <button onClick={() => setConfirmDeleteId(g.id)} style={{ ...btnSmall, background: "#e74c3c" }}>Delete</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const btnPrimary: React.CSSProperties = { padding: "8px 16px", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 14 };
const btnSmall: React.CSSProperties = { padding: "4px 10px", background: "#3498db", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 };
const errorBox: React.CSSProperties = { color: "#e74c3c", marginBottom: 12, padding: 8, background: "#ffeaea", borderRadius: 4 };
const formCard: React.CSSProperties = { background: "#fff", padding: 20, borderRadius: 8, marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" };
const labelStyle: React.CSSProperties = { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 500 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 4, fontSize: 14, boxSizing: "border-box" };
