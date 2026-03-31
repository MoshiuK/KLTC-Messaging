import { useState, useEffect } from "react";
import { useAuth } from "../components/AuthContext";
import { api } from "../api/client";
import { OrgUser } from "../types";

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "", role: "member" });
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const loadUsers = async () => {
    try {
      const data = await api.getUsers();
      setUsers(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  if (currentUser?.role !== "admin") {
    return (
      <div>
        <h1>User Management</h1>
        <p style={{ color: "#666" }}>Admin access required.</p>
      </div>
    );
  }

  const resetForm = () => {
    setForm({ firstName: "", lastName: "", email: "", password: "", role: "member" });
    setShowForm(false);
    setFormError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setSuccess("");

    if (!form.firstName.trim()) { setFormError("First name is required."); return; }
    if (!form.lastName.trim()) { setFormError("Last name is required."); return; }
    if (!form.email.trim()) { setFormError("Email is required."); return; }
    if (!form.password || form.password.length < 6) { setFormError("Password must be at least 6 characters."); return; }

    try {
      await api.createUser({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        password: form.password,
        role: form.role,
      });
      setSuccess(`User ${form.firstName} ${form.lastName} created successfully!`);
      resetForm();
      loadUsers();
    } catch (err: any) {
      setFormError(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteUser(id);
      setDeleteConfirm(null);
      setSuccess("User removed successfully.");
      loadUsers();
    } catch (err: any) {
      setError(err.message);
      setDeleteConfirm(null);
    }
  };

  const handleRoleChange = async (id: string, newRole: string) => {
    try {
      await api.updateUser(id, { role: newRole });
      loadUsers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ margin: 0 }}>User Management</h1>
        <button onClick={() => { resetForm(); setShowForm(!showForm); }} style={btnPrimary}>
          {showForm ? "Cancel" : "+ Add User"}
        </button>
      </div>

      {error && <div style={errorBox}>{error}</div>}
      {success && <div style={successBox}>{success}</div>}

      {showForm && (
        <form onSubmit={handleSubmit} style={formCard}>
          <h3 style={{ marginTop: 0 }}>Add New User</h3>
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
              <label style={labelStyle}>Email *</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Password *</label>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6} style={inputStyle} placeholder="Min 6 characters" />
            </div>
            <div>
              <label style={labelStyle}>Role</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} style={inputStyle}>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <button type="submit" style={{ ...btnPrimary, marginTop: 12 }}>Create User</button>
        </form>
      )}

      {loading ? (
        <p>Loading...</p>
      ) : users.length === 0 ? (
        <p style={{ color: "#666" }}>No users found.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Role</th>
                <th style={thStyle}>Joined</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={tdStyle}>{u.firstName} {u.lastName}</td>
                  <td style={tdStyle}>{u.email}</td>
                  <td style={tdStyle}>
                    <select
                      value={u.role}
                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
                      disabled={u.id === currentUser?.id}
                      style={{ padding: "4px 8px", borderRadius: 4, border: "1px solid #ddd", fontSize: 13 }}
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td style={tdStyle}>{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td style={tdStyle}>
                    {u.id === currentUser?.id ? (
                      <span style={{ color: "#999", fontSize: 12 }}>You</span>
                    ) : deleteConfirm === u.id ? (
                      <span style={{ fontSize: 12 }}>
                        Sure?{" "}
                        <button onClick={() => handleDelete(u.id)} style={{ ...btnSmall, background: "#e74c3c" }}>Yes</button>
                        <button onClick={() => setDeleteConfirm(null)} style={{ ...btnSmall, background: "#95a5a6" }}>No</button>
                      </span>
                    ) : (
                      <button onClick={() => setDeleteConfirm(u.id)} style={{ ...btnSmall, background: "#e74c3c" }}>Remove</button>
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

const btnPrimary: React.CSSProperties = { padding: "8px 16px", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 14 };
const btnSmall: React.CSSProperties = { padding: "4px 10px", background: "#3498db", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12, marginRight: 4 };
const errorBox: React.CSSProperties = { color: "#e74c3c", marginBottom: 12, padding: 8, background: "#ffeaea", borderRadius: 4 };
const successBox: React.CSSProperties = { color: "#27ae60", marginBottom: 12, padding: 8, background: "#eafff0", borderRadius: 4 };
const formCard: React.CSSProperties = { background: "#fff", padding: 20, borderRadius: 8, marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" };
const labelStyle: React.CSSProperties = { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 500 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 4, fontSize: 14, boxSizing: "border-box" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "10px 12px", borderBottom: "2px solid #eee", fontSize: 13, fontWeight: 600 };
const tdStyle: React.CSSProperties = { padding: "10px 12px", borderBottom: "1px solid #f0f0f0", fontSize: 14 };
