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

interface UploadResult {
  name: string;
  phone: string;
  status: "created" | "skipped" | "error";
  reason?: string;
}

interface UploadResponse {
  summary: { total: number; created: number; skipped: number; errors: number };
  results: UploadResult[];
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
  const [showUpload, setShowUpload] = useState(false);
  const [uploadParsed, setUploadParsed] = useState<Array<{ firstName: string; lastName: string; phoneNumber: string; email?: string; birthday?: string }>>([]);
  const [uploadFileName, setUploadFileName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError("");
    setUploadResult(null);
    setUploadFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const rows = parseContactsCSV(text);
        if (rows.length === 0) {
          setUploadError("No valid rows found. Expected columns: firstName, lastName, phoneNumber (or phone).");
          setUploadParsed([]);
          return;
        }
        setUploadParsed(rows);
      } catch (err: any) {
        setUploadError(err.message || "Failed to parse file.");
        setUploadParsed([]);
      }
    };
    reader.readAsText(file);
  };

  const handleBulkUpload = async () => {
    if (uploadParsed.length === 0) return;
    setUploading(true);
    setUploadError("");
    setUploadResult(null);
    try {
      const result = await api.uploadContacts(uploadParsed);
      setUploadResult(result);
      loadContacts();
    } catch (err: any) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const resetUpload = () => {
    setShowUpload(false);
    setUploadParsed([]);
    setUploadFileName("");
    setUploadResult(null);
    setUploadError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ margin: 0 }}>Contacts</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => { resetUpload(); setShowUpload(!showUpload); setShowForm(false); }} style={{ ...btnPrimary, background: showUpload ? "#95a5a6" : "#2c3e50" }}>
            {showUpload ? "Cancel Upload" : "Upload CSV"}
          </button>
          <button onClick={() => { resetForm(); setShowForm(!showForm); setShowUpload(false); }} style={btnPrimary}>
            {showForm ? "Cancel" : "+ New Contact"}
          </button>
        </div>
      </div>

      {error && <div style={errorBox}>{error}</div>}

      {showUpload && (
        <div style={formCard}>
          <h3 style={{ marginTop: 0 }}>Upload Contacts CSV</h3>
          <p style={{ color: "#666", fontSize: 13, marginTop: 0 }}>
            Upload a CSV file with columns: <strong>firstName</strong>, <strong>lastName</strong>, <strong>phoneNumber</strong> (or <strong>phone</strong>).
            Optional columns: <strong>email</strong>, <strong>birthday</strong>.
            Phone numbers can be 10-digit (auto-prepends +1) or E.164 format.
          </p>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Select CSV File *</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt,.tsv"
              onChange={handleFileChange}
              style={{ fontSize: 14 }}
            />
          </div>

          {uploadError && <div style={errorBox}>{uploadError}</div>}

          {uploadParsed.length > 0 && !uploadResult && (
            <div>
              <p style={{ fontWeight: 500, marginBottom: 8 }}>
                Preview: {uploadParsed.length} contacts found in {uploadFileName}
              </p>
              <div style={{ overflowX: "auto", maxHeight: 200, overflowY: "auto", marginBottom: 12 }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>#</th>
                      <th style={thStyle}>First Name</th>
                      <th style={thStyle}>Last Name</th>
                      <th style={thStyle}>Phone</th>
                      <th style={thStyle}>Email</th>
                      <th style={thStyle}>Birthday</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uploadParsed.map((row, i) => (
                      <tr key={i}>
                        <td style={tdStyle}>{i + 1}</td>
                        <td style={tdStyle}>{row.firstName}</td>
                        <td style={tdStyle}>{row.lastName}</td>
                        <td style={tdStyle}>{row.phoneNumber}</td>
                        <td style={tdStyle}>{row.email || "-"}</td>
                        <td style={tdStyle}>{row.birthday || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button onClick={handleBulkUpload} disabled={uploading} style={{ ...btnPrimary, opacity: uploading ? 0.7 : 1 }}>
                {uploading ? "Importing..." : `Import ${uploadParsed.length} Contacts`}
              </button>
            </div>
          )}

          {uploadResult && (
            <div style={{ background: "#f0faf0", padding: 16, borderRadius: 8, marginTop: 12 }}>
              <h4 style={{ marginTop: 0 }}>Import Complete</h4>
              <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
                <span><strong>{uploadResult.summary.created}</strong> created</span>
                <span><strong>{uploadResult.summary.skipped}</strong> skipped</span>
                <span><strong>{uploadResult.summary.errors}</strong> errors</span>
              </div>
              {uploadResult.results.some((r) => r.status !== "created") && (
                <div style={{ overflowX: "auto", maxHeight: 200, overflowY: "auto" }}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Name</th>
                        <th style={thStyle}>Phone</th>
                        <th style={thStyle}>Status</th>
                        <th style={thStyle}>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {uploadResult.results.filter((r) => r.status !== "created").map((r, i) => (
                        <tr key={i}>
                          <td style={tdStyle}>{r.name}</td>
                          <td style={tdStyle}>{r.phone}</td>
                          <td style={tdStyle}>
                            <span style={{
                              padding: "2px 8px", borderRadius: 12, fontSize: 12, color: "#fff",
                              background: r.status === "skipped" ? "#f39c12" : "#e74c3c",
                            }}>
                              {r.status}
                            </span>
                          </td>
                          <td style={tdStyle}>{r.reason || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

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

function parseContactsCSV(text: string): Array<{ firstName: string; lastName: string; phoneNumber: string; email?: string; birthday?: string }> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];

  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const allRows = lines.map((line) => splitCSVLine(line, delimiter));

  const firstRow = allRows[0].map((c) => c.toLowerCase().trim());
  const headerKeywords = ["name", "first", "last", "phone", "email", "birthday", "mobile", "cell"];
  const isHeader = firstRow.some((cell) => headerKeywords.includes(cell) || headerKeywords.some((kw) => cell.includes(kw)));

  const dataRows = isHeader ? allRows.slice(1) : allRows;
  const results: Array<{ firstName: string; lastName: string; phoneNumber: string; email?: string; birthday?: string }> = [];

  if (isHeader) {
    const firstNameIdx = firstRow.findIndex((h) => h === "firstname" || h === "first name" || h === "first");
    const lastNameIdx = firstRow.findIndex((h) => h === "lastname" || h === "last name" || h === "last");
    const nameIdx = firstRow.findIndex((h) => h === "name" || h === "full name" || h === "fullname");
    const phoneIdx = firstRow.findIndex((h) => h === "phone" || h === "phonenumber" || h === "phone number" || h === "mobile" || h === "cell");
    const emailIdx = firstRow.findIndex((h) => h === "email" || h === "e-mail");
    const bdayIdx = firstRow.findIndex((h) => h === "birthday" || h === "birthdate" || h === "dob" || h === "date of birth");

    for (const row of dataRows) {
      let firstName = "";
      let lastName = "";

      if (firstNameIdx >= 0) {
        firstName = (row[firstNameIdx] || "").trim();
        lastName = lastNameIdx >= 0 ? (row[lastNameIdx] || "").trim() : "";
      } else if (nameIdx >= 0) {
        const parts = (row[nameIdx] || "").trim().split(/\s+/);
        firstName = parts[0] || "";
        lastName = parts.slice(1).join(" ") || "";
      } else {
        firstName = (row[0] || "").trim();
        lastName = (row[1] || "").trim();
      }

      const phone = (row[phoneIdx >= 0 ? phoneIdx : (nameIdx >= 0 ? 1 : 2)] || "").trim();
      const email = emailIdx >= 0 ? (row[emailIdx] || "").trim() || undefined : undefined;
      const birthday = bdayIdx >= 0 ? (row[bdayIdx] || "").trim() || undefined : undefined;

      if (firstName || phone) {
        results.push({ firstName, lastName, phoneNumber: phone, email, birthday });
      }
    }
  } else {
    // No header: assume col0=firstName, col1=lastName, col2=phone, col3=email (opt), col4=birthday (opt)
    for (const row of dataRows) {
      const firstName = (row[0] || "").trim();
      const lastName = (row[1] || "").trim();
      const phone = (row[2] || "").trim();
      const email = (row[3] || "").trim() || undefined;
      const birthday = (row[4] || "").trim() || undefined;
      if (firstName || phone) {
        results.push({ firstName, lastName, phoneNumber: phone, email, birthday });
      }
    }
  }

  return results;
}

function splitCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (char === delimiter && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
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
