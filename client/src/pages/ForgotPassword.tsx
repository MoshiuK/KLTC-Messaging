import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [resetLink, setResetLink] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess(false);
    setResetLink("");
    setLoading(true);
    try {
      const res = await api.forgotPassword(email);
      setSuccess(true);
      if (res.resetLink) {
        setResetLink(res.resetLink);
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#f5f5f5" }}>
      <form onSubmit={handleSubmit} style={{ background: "#fff", padding: 32, borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.1)", width: 360 }}>
        <h2 style={{ marginTop: 0 }}>Reset Password</h2>
        <p style={{ color: "#666", fontSize: 14 }}>Enter your email address and we'll generate a reset link.</p>

        {error && <div style={{ color: "#e74c3c", marginBottom: 12, padding: 8, background: "#ffeaea", borderRadius: 4 }}>{error}</div>}

        {success && (
          <div style={{ color: "#27ae60", marginBottom: 12, padding: 12, background: "#eafaf1", borderRadius: 4 }}>
            <strong>Reset link generated!</strong>
            {resetLink && (
              <div style={{ marginTop: 8 }}>
                <Link to={resetLink} style={{ color: "#1a1a2e", fontWeight: 600 }}>
                  Click here to reset your password
                </Link>
              </div>
            )}
          </div>
        )}

        {!success && (
          <>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", marginBottom: 4, fontSize: 14 }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                style={inputStyle}
              />
            </div>

            <button type="submit" disabled={loading} style={{ ...btnStyle, width: "100%", opacity: loading ? 0.7 : 1 }}>
              {loading ? "Sending..." : "Send Reset Link"}
            </button>
          </>
        )}

        <p style={{ textAlign: "center", marginTop: 16, fontSize: 14 }}>
          <Link to="/login">Back to Login</Link>
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

const btnStyle: React.CSSProperties = {
  padding: "10px 16px",
  background: "#1a1a2e",
  color: "#fff",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 14,
};
