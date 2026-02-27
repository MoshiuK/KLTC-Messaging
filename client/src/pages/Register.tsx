import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../components/AuthContext";
import { useBranding } from "../components/BrandingContext";

export default function Register() {
  const { register } = useAuth();
  const { branding } = useBranding();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "", firstName: "", lastName: "", organizationName: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (key: string, val: string) => setForm((f) => ({ ...f, [key]: val }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(form);
      navigate("/");
    } catch (err: any) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#f5f5f5" }}>
      <form onSubmit={handleSubmit} style={{ background: "#fff", padding: 32, borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.1)", width: 400 }}>
        <h2 style={{ marginTop: 0 }}>Create Account</h2>

        {error && <div style={{ color: "#e74c3c", marginBottom: 12, padding: 8, background: "#ffeaea", borderRadius: 4 }}>{error}</div>}

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>First Name</label>
            <input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} required style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Last Name</label>
            <input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} required style={inputStyle} />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Organization Name</label>
          <input value={form.organizationName} onChange={(e) => set("organizationName", e.target.value)} required style={inputStyle} />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Email</label>
          <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required style={inputStyle} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Password</label>
          <input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} required minLength={6} style={inputStyle} />
        </div>

        <button type="submit" disabled={loading} style={{ padding: "10px 16px", background: branding.primaryColor, color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 14, width: "100%", opacity: loading ? 0.7 : 1 }}>
          {loading ? "Creating..." : "Create Account"}
        </button>

        <p style={{ textAlign: "center", marginTop: 16, fontSize: 14 }}>
          Already have an account? <Link to="/login">Sign In</Link>
        </p>
      </form>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: "block", marginBottom: 4, fontSize: 14 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 4, fontSize: 14, boxSizing: "border-box" };
