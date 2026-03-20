import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../components/AuthContext";
import { useBranding } from "../components/BrandingContext";

export default function Login() {
  const { login, sessionExpired } = useAuth();
  const { branding } = useBranding();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim()) { setError("Please enter your email."); return; }
    if (!password) { setError("Please enter your password."); return; }

    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err: any) {
      setError(err.message || "Login failed. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#f5f5f5", padding: 16 }}>
      <form onSubmit={handleSubmit} style={{ background: "#fff", padding: 32, borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.1)", width: "100%", maxWidth: 360 }}>
        <h2 style={{ marginTop: 0 }}>{branding.appName}</h2>
        <p style={{ color: "#666" }}>Sign in to your account</p>

        {sessionExpired && (
          <div style={{ color: "#e67e22", marginBottom: 12, padding: 8, background: "#fff8e1", borderRadius: 4, border: "1px solid #ffe0b2" }}>
            Your session has expired. Please sign in again.
          </div>
        )}

        {error && <div style={{ color: "#e74c3c", marginBottom: 12, padding: 8, background: "#ffeaea", borderRadius: 4 }}>{error}</div>}

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", marginBottom: 4, fontSize: 14 }}>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={inputStyle} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", marginBottom: 4, fontSize: 14 }}>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={inputStyle} />
        </div>

        <div style={{ textAlign: "right", marginBottom: 12 }}>
          <Link to="/forgot-password" style={{ fontSize: 13, color: "#666" }}>Forgot password?</Link>
        </div>

        <button type="submit" disabled={loading} style={{ padding: "10px 16px", background: branding.primaryColor, color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 14, width: "100%", opacity: loading ? 0.7 : 1 }}>
          {loading ? "Signing in..." : "Sign In"}
        </button>

        <p style={{ textAlign: "center", marginTop: 16, fontSize: 14 }}>
          Don't have an account? <Link to="/register">Register</Link>
        </p>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  border: "1px solid #ddd",
  borderRadius: 4,
  fontSize: 14,
  boxSizing: "border-box",
};
