import { useState, useEffect } from "react";
import { useAuth } from "../components/AuthContext";
import { useBranding } from "../components/BrandingContext";
import { api } from "../api/client";
import { BrandingConfig } from "../types";

export default function Settings() {
  const { user } = useAuth();
  const { branding, refreshBranding } = useBranding();
  const [form, setForm] = useState<BrandingConfig>({ ...branding });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setForm({ ...branding });
  }, [branding]);

  if (user?.role !== "admin") {
    return (
      <div>
        <h1>Settings</h1>
        <p style={{ color: "#666" }}>Admin access required to manage settings.</p>
      </div>
    );
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await api.updateBranding({
        appName: form.appName,
        logoUrl: form.logoUrl || null,
        primaryColor: form.primaryColor,
        secondaryColor: form.secondaryColor,
        accentColor: form.accentColor,
      });
      await refreshBranding();
      setSuccess("Branding updated successfully!");
    } catch (err: any) {
      setError(err.message || "Failed to update branding");
    } finally {
      setSaving(false);
    }
  };

  const set = (key: keyof BrandingConfig, val: string | null) =>
    setForm((f) => ({ ...f, [key]: val }));

  return (
    <div>
      <h1>Settings</h1>
      <p style={{ color: "#666" }}>Customize your organization's branding.</p>

      {error && <div style={errorBox}>{error}</div>}
      {success && <div style={successBox}>{success}</div>}

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* Form */}
        <form onSubmit={handleSave} style={{ ...formCard, flex: "1 1 340px", minWidth: 300 }}>
          <h3 style={{ marginTop: 0 }}>Branding</h3>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>App Name</label>
            <input
              value={form.appName}
              onChange={(e) => set("appName", e.target.value)}
              style={inputStyle}
              placeholder="Faith Memorials"
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Logo URL</label>
            <input
              value={form.logoUrl || ""}
              onChange={(e) => set("logoUrl", e.target.value || null)}
              style={inputStyle}
              placeholder="https://example.com/logo.png"
            />
            {form.logoUrl && (
              <div style={{ marginTop: 8 }}>
                <img
                  src={form.logoUrl}
                  alt="Logo preview"
                  style={{ maxHeight: 40, maxWidth: 200, border: "1px solid #ddd", borderRadius: 4 }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Primary Color</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="color"
                  value={form.primaryColor}
                  onChange={(e) => set("primaryColor", e.target.value)}
                  style={{ width: 40, height: 32, border: "1px solid #ddd", borderRadius: 4, cursor: "pointer", padding: 0 }}
                />
                <input
                  value={form.primaryColor}
                  onChange={(e) => set("primaryColor", e.target.value)}
                  style={{ ...inputStyle, width: "auto", flex: 1 }}
                  placeholder="#1a1a2e"
                />
              </div>
            </div>

            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Secondary Color</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="color"
                  value={form.secondaryColor}
                  onChange={(e) => set("secondaryColor", e.target.value)}
                  style={{ width: 40, height: 32, border: "1px solid #ddd", borderRadius: 4, cursor: "pointer", padding: 0 }}
                />
                <input
                  value={form.secondaryColor}
                  onChange={(e) => set("secondaryColor", e.target.value)}
                  style={{ ...inputStyle, width: "auto", flex: 1 }}
                  placeholder="#3498db"
                />
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Accent Color</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="color"
                value={form.accentColor}
                onChange={(e) => set("accentColor", e.target.value)}
                style={{ width: 40, height: 32, border: "1px solid #ddd", borderRadius: 4, cursor: "pointer", padding: 0 }}
              />
              <input
                value={form.accentColor}
                onChange={(e) => set("accentColor", e.target.value)}
                style={{ ...inputStyle, width: "auto", flex: 1 }}
                placeholder="#f39c12"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            style={{
              padding: "10px 20px",
              background: form.primaryColor,
              color: "#fff",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 14,
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Saving..." : "Save Branding"}
          </button>
        </form>

        {/* Live Preview */}
        <div style={{ ...formCard, flex: "0 1 260px", minWidth: 220 }}>
          <h3 style={{ marginTop: 0 }}>Preview</h3>
          <div
            style={{
              background: form.primaryColor,
              borderRadius: 8,
              padding: 16,
              color: "#fff",
              minHeight: 200,
            }}
          >
            {form.logoUrl && (
              <img
                src={form.logoUrl}
                alt=""
                style={{ maxHeight: 30, maxWidth: "100%", marginBottom: 8, display: "block" }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            )}
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>{form.appName || "App Name"}</div>
            <div style={{ fontSize: 11, color: "#aaa", marginBottom: 16 }}>John Doe</div>

            <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 4, padding: "6px 10px", marginBottom: 4, fontSize: 12 }}>
              Dashboard
            </div>
            <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 4, padding: "6px 10px", marginBottom: 4, fontSize: 12 }}>
              Contacts
            </div>
            <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 4, padding: "6px 10px", marginBottom: 4, fontSize: 12 }}>
              Voice Calls
            </div>

            <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
              <span style={{ display: "inline-block", padding: "4px 10px", background: form.secondaryColor, borderRadius: 4, fontSize: 11 }}>
                Secondary
              </span>
              <span style={{ display: "inline-block", padding: "4px 10px", background: form.accentColor, borderRadius: 4, fontSize: 11 }}>
                Accent
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const errorBox: React.CSSProperties = { color: "#e74c3c", marginBottom: 12, padding: 8, background: "#ffeaea", borderRadius: 4 };
const successBox: React.CSSProperties = { color: "#27ae60", marginBottom: 12, padding: 8, background: "#eafff0", borderRadius: 4 };
const formCard: React.CSSProperties = { background: "#fff", padding: 20, borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" };
const labelStyle: React.CSSProperties = { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 500 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 4, fontSize: 14, boxSizing: "border-box" };
