import { useState } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      await api.resetPassword(token, password);
      setSuccess(true);
      setTimeout(() => navigate("/login"), 3000);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#f5f5f5" }}>
        <div style={{ background: "#fff", padding: 32, borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.1)", width: 360, textAlign: "center" }}>
          <h2 style={{ marginTop: 0 }}>Invalid Reset Link</h2>
          <p style={{ color: "#666" }}>This reset link is missing a token. Please request a new one.</p>
          <Link to="/forgot-password" style={{ color: "#1a1a2e", fontWeight: 600 }}>Request New Reset Link</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#f5f5f5" }}>
      <form onSubmit={handleSubmit} style={{ background: "#fff", padding: 32, borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.1)", width: 360 }}>
        <h2 style={{ marginTop: 0 }}>Set New Password</h2>
        <p style={{ color: "#666", fontSize: 14 }}>Enter your new password below.</p>

        {error && <div style={{ color: "#e74c3c", marginBottom: 12, padding: 8, background: "#ffeaea", borderRadius: 4 }}>{error}</div>}

        {success ? (
          <div style={{ color: "#27ae60", padding: 12, background: "#eafaf1", borderRadius: 4 }}>
            <strong>Password reset successfully!</strong>
            <p style={{ margin: "8px 0 0", fontSize: 14 }}>Redirecting to login...</p>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4, fontSize: 14 }}>New Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="Min 6 characters"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", marginBottom: 4, fontSize: 14 }}>Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                placeholder="Re-enter password"
                style={inputStyle}
              />
            </div>

            <button type="submit" disabled={loading} style={{ ...btnStyle, width: "100%", opacity: loading ? 0.7 : 1 }}>
              {loading ? "Resetting..." : "Reset Password"}
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
