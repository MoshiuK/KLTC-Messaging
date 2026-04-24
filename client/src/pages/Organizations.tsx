import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Organization } from "../types";

export default function Organizations() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSaving, setFormSaving] = useState(false);
  const [form, setForm] = useState({
    organizationName: "",
    adminEmail: "",
    adminFirstName: "",
    adminLastName: "",
    adminPassword: "",
    monthlyMessageLimit: "",
    contactLimit: "",
    userLimit: "",
  });

  const load = async () => {
    try {
      setError("");
      const data = await api.listOrganizations();
      setOrgs(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load organizations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setFormSaving(true);
    try {
      const payload: Record<string, unknown> = {
        organizationName: form.organizationName.trim(),
        adminEmail: form.adminEmail.trim(),
        adminFirstName: form.adminFirstName.trim(),
        adminLastName: form.adminLastName.trim(),
        adminPassword: form.adminPassword,
      };
      if (form.monthlyMessageLimit) payload.monthlyMessageLimit = Number(form.monthlyMessageLimit);
      if (form.contactLimit) payload.contactLimit = Number(form.contactLimit);
      if (form.userLimit) payload.userLimit = Number(form.userLimit);
      await api.createOrganization(payload);
      setShowForm(false);
      setForm({ organizationName: "", adminEmail: "", adminFirstName: "", adminLastName: "", adminPassword: "", monthlyMessageLimit: "", contactLimit: "", userLimit: "" });
      await load();
    } catch (err: any) {
      setFormError(err?.message || "Failed to create organization");
    } finally {
      setFormSaving(false);
    }
  };

  const toggleActive = async (org: Organization) => {
    try {
      await api.updateOrganization(org.id, { isActive: !org.isActive });
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to update organization");
    }
  };

  const updateLimit = async (org: Organization, field: "monthlyMessageLimit" | "contactLimit" | "userLimit", value: string) => {
    const parsed = value.trim() === "" ? null : Number(value);
    if (parsed !== null && (Number.isNaN(parsed) || parsed < 0)) return;
    try {
      await api.updateOrganization(org.id, { [field]: parsed });
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to update limit");
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0 }}>Organizations</h1>
          <p style={{ marginTop: 4, color: "#666" }}>Manage tenant organizations, their admins, and usage limits.</p>
        </div>
        <button onClick={() => setShowForm(true)} style={{ padding: "8px 16px", background: "#1f2937", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}>+ Create Organization</button>
      </div>

      {error && <div style={{ padding: 12, background: "#fee", color: "#900", borderRadius: 4, marginBottom: 12 }}>{error}</div>}

      {showForm && (
        <div style={{ border: "1px solid #ddd", borderRadius: 6, padding: 16, marginBottom: 16, background: "#fafafa" }}>
          <h2 style={{ marginTop: 0 }}>New Organization</h2>
          <form onSubmit={handleCreate}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label>Organization Name *<input required value={form.organizationName} onChange={(e) => setForm({ ...form, organizationName: e.target.value })} style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }} /></label>
              <label>Admin Email *<input required type="email" value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }} /></label>
              <label>Admin First Name *<input required value={form.adminFirstName} onChange={(e) => setForm({ ...form, adminFirstName: e.target.value })} style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }} /></label>
              <label>Admin Last Name *<input required value={form.adminLastName} onChange={(e) => setForm({ ...form, adminLastName: e.target.value })} style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }} /></label>
              <label>Admin Password *<input required type="password" minLength={8} value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }} /></label>
              <div />
              <label>Monthly Message Limit<input type="number" min={0} placeholder="unlimited" value={form.monthlyMessageLimit} onChange={(e) => setForm({ ...form, monthlyMessageLimit: e.target.value })} style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }} /></label>
              <label>Contact Limit<input type="number" min={0} placeholder="unlimited" value={form.contactLimit} onChange={(e) => setForm({ ...form, contactLimit: e.target.value })} style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }} /></label>
              <label>User Limit<input type="number" min={0} placeholder="unlimited" value={form.userLimit} onChange={(e) => setForm({ ...form, userLimit: e.target.value })} style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }} /></label>
            </div>
            {formError && <div style={{ marginTop: 8, color: "#900" }}>{formError}</div>}
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <button type="submit" disabled={formSaving} style={{ padding: "8px 16px", background: "#1f2937", color: "#fff", border: "none", borderRadius: 4, cursor: formSaving ? "wait" : "pointer" }}>{formSaving ? "Creating..." : "Create"}</button>
              <button type="button" onClick={() => { setShowForm(false); setFormError(""); }} style={{ padding: "8px 16px", background: "#fff", color: "#333", border: "1px solid #ccc", borderRadius: 4, cursor: "pointer" }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div>Loading organizations...</div>
      ) : orgs.length === 0 ? (
        <div style={{ padding: 32, textAlign: "center", color: "#777" }}>No organizations yet. Click &quot;Create Organization&quot; to add one.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff" }}>
            <thead>
              <tr style={{ background: "#f3f4f6", textAlign: "left" }}>
                <th style={{ padding: 8, borderBottom: "1px solid #ddd" }}>Name</th>
                <th style={{ padding: 8, borderBottom: "1px solid #ddd" }}>Status</th>
                <th style={{ padding: 8, borderBottom: "1px solid #ddd" }}>Users</th>
                <th style={{ padding: 8, borderBottom: "1px solid #ddd" }}>Contacts</th>
                <th style={{ padding: 8, borderBottom: "1px solid #ddd" }}>Msgs this month</th>
                <th style={{ padding: 8, borderBottom: "1px solid #ddd" }}>Msg Limit</th>
                <th style={{ padding: 8, borderBottom: "1px solid #ddd" }}>Contact Limit</th>
                <th style={{ padding: 8, borderBottom: "1px solid #ddd" }}>User Limit</th>
                <th style={{ padding: 8, borderBottom: "1px solid #ddd" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => (
                <tr key={o.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: 8 }}>{o.name}</td>
                  <td style={{ padding: 8 }}>
                    <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 12, background: o.isActive ? "#d1fae5" : "#fee2e2", color: o.isActive ? "#065f46" : "#991b1b" }}>
                      {o.isActive ? "active" : "suspended"}
                    </span>
                  </td>
                  <td style={{ padding: 8 }}>{o.usage.users}</td>
                  <td style={{ padding: 8 }}>{o.usage.contacts}</td>
                  <td style={{ padding: 8 }}>{o.usage.messagesThisMonth}</td>
                  <td style={{ padding: 8 }}><input type="number" min={0} defaultValue={o.monthlyMessageLimit ?? ""} placeholder="∞" onBlur={(e) => updateLimit(o, "monthlyMessageLimit", e.target.value)} style={{ width: 80, padding: 4 }} /></td>
                  <td style={{ padding: 8 }}><input type="number" min={0} defaultValue={o.contactLimit ?? ""} placeholder="∞" onBlur={(e) => updateLimit(o, "contactLimit", e.target.value)} style={{ width: 80, padding: 4 }} /></td>
                  <td style={{ padding: 8 }}><input type="number" min={0} defaultValue={o.userLimit ?? ""} placeholder="∞" onBlur={(e) => updateLimit(o, "userLimit", e.target.value)} style={{ width: 80, padding: 4 }} /></td>
                  <td style={{ padding: 8 }}>
                    <button onClick={() => toggleActive(o)} style={{ padding: "4px 10px", background: o.isActive ? "#fca5a5" : "#86efac", color: "#1f2937", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>
                      {o.isActive ? "Suspend" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 12, color: "#777", marginTop: 8 }}>Tip: edit a limit cell and click elsewhere to save. Leave empty for unlimited.</p>
        </div>
      )}
    </div>
  );
}
