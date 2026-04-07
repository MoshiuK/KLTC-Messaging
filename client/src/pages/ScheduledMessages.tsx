import { useState, useEffect, useRef } from "react";
import { api } from "../api/client";

interface ScheduledMessage {
  id: string;
  contactName: string;
  phoneNumber: string;
  birthday: string;
  messageTemplate: string;
  scheduledTime: string;
  recurrence: string;
  isActive: boolean;
  createdAt: string;
}

interface UploadResult {
  name: string;
  birthday: string;
  status: "created" | "skipped" | "error";
  reason?: string;
}

interface UploadResponse {
  summary: { total: number; created: number; skipped: number; errors: number };
  results: UploadResult[];
}

export default function ScheduledMessages() {
  const [messages, setMessages] = useState<ScheduledMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [messageTemplate, setMessageTemplate] = useState("Happy Birthday, {name}! Wishing you a wonderful day!");
  const [parsedRows, setParsedRows] = useState<Array<{ name: string; birthday: string; phone?: string }>>([]);
  const [fileName, setFileName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadMessages = async () => {
    try {
      const data = await api.getScheduledMessages();
      setMessages(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMessages();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError("");
    setUploadResult(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const rows = parseCSV(text);
        if (rows.length === 0) {
          setUploadError("No valid rows found in the file. Expected columns: name, birthday (and optionally phone).");
          setParsedRows([]);
          return;
        }
        setParsedRows(rows);
      } catch (err: any) {
        setUploadError(err.message || "Failed to parse file.");
        setParsedRows([]);
      }
    };
    reader.readAsText(file);
  };

  const handleUpload = async () => {
    if (parsedRows.length === 0) return;
    if (!messageTemplate.trim()) {
      setUploadError("Please enter a message template.");
      return;
    }

    setUploading(true);
    setUploadError("");
    setUploadResult(null);

    try {
      const result = await api.uploadBirthdays(parsedRows, messageTemplate);
      setUploadResult(result);
      loadMessages();
    } catch (err: any) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteScheduledMessage(id);
      setDeleteConfirm(null);
      loadMessages();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleToggleActive = async (id: string, isActive: boolean) => {
    try {
      await api.updateScheduledMessage(id, { isActive: !isActive });
      loadMessages();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const resetUpload = () => {
    setShowUpload(false);
    setParsedRows([]);
    setFileName("");
    setUploadResult(null);
    setUploadError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ margin: 0 }}>Scheduled Messages</h1>
        <button onClick={() => { resetUpload(); setShowUpload(!showUpload); }} style={btnPrimary}>
          {showUpload ? "Cancel" : "Upload Birthday List"}
        </button>
      </div>

      {error && <div style={errorBox}>{error}</div>}

      {showUpload && (
        <div style={formCard}>
          <h3 style={{ marginTop: 0 }}>Upload Birthday List</h3>
          <p style={{ color: "#666", fontSize: 13, marginTop: 0 }}>
            Upload a CSV file with columns: <strong>name</strong> and <strong>birthday</strong> (and optionally <strong>phone</strong>).
            Supported date formats: MM/DD, MM-DD, MM/DD/YYYY, YYYY-MM-DD.
          </p>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Birthday Message Template *</label>
            <textarea
              value={messageTemplate}
              onChange={(e) => setMessageTemplate(e.target.value)}
              rows={3}
              maxLength={1600}
              placeholder="Happy Birthday, {name}! ..."
              style={{ ...inputStyle, resize: "vertical" }}
            />
            <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>
              Use <code>{"{name}"}</code> to insert the person's name. Messages will be sent at 8:05 AM on their birthday.
            </div>
          </div>

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

          {parsedRows.length > 0 && !uploadResult && (
            <div>
              <p style={{ fontWeight: 500, marginBottom: 8 }}>
                Preview: {parsedRows.length} entries found in {fileName}
              </p>
              <div style={{ overflowX: "auto", maxHeight: 200, overflowY: "auto", marginBottom: 12 }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>#</th>
                      <th style={thStyle}>Name</th>
                      <th style={thStyle}>Birthday</th>
                      {parsedRows.some((r) => r.phone) && <th style={thStyle}>Phone</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.map((row, i) => (
                      <tr key={i}>
                        <td style={tdStyle}>{i + 1}</td>
                        <td style={tdStyle}>{row.name}</td>
                        <td style={tdStyle}>{row.birthday}</td>
                        {parsedRows.some((r) => r.phone) && <td style={tdStyle}>{row.phone || "-"}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button onClick={handleUpload} disabled={uploading} style={{ ...btnPrimary, opacity: uploading ? 0.7 : 1 }}>
                {uploading ? "Creating Scheduled Messages..." : `Create ${parsedRows.length} Scheduled Birthday Messages`}
              </button>
            </div>
          )}

          {uploadResult && (
            <div style={{ background: "#f0faf0", padding: 16, borderRadius: 8, marginTop: 12 }}>
              <h4 style={{ marginTop: 0 }}>Upload Complete</h4>
              <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
                <SummaryChip label="Total" value={uploadResult.summary.total} color="#333" />
                <SummaryChip label="Created" value={uploadResult.summary.created} color="#27ae60" />
                <SummaryChip label="Skipped" value={uploadResult.summary.skipped} color="#f39c12" />
                <SummaryChip label="Errors" value={uploadResult.summary.errors} color="#e74c3c" />
              </div>
              {uploadResult.results.some((r) => r.status !== "created") && (
                <div style={{ overflowX: "auto", maxHeight: 200, overflowY: "auto" }}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Name</th>
                        <th style={thStyle}>Birthday</th>
                        <th style={thStyle}>Status</th>
                        <th style={thStyle}>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {uploadResult.results.filter((r) => r.status !== "created").map((r, i) => (
                        <tr key={i}>
                          <td style={tdStyle}>{r.name}</td>
                          <td style={tdStyle}>{r.birthday}</td>
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

      {loading ? (
        <p>Loading...</p>
      ) : messages.length === 0 ? (
        <p style={{ color: "#666" }}>No scheduled messages yet. Upload a birthday list to get started.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Birthday</th>
                <th style={thStyle}>Time</th>
                <th style={thStyle}>Message</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((m) => (
                <tr key={m.id} style={{ opacity: m.isActive ? 1 : 0.5 }}>
                  <td style={tdStyle}>{m.contactName}</td>
                  <td style={tdStyle}>{formatMMDD(m.birthday)}</td>
                  <td style={tdStyle}>{m.scheduledTime} AM</td>
                  <td style={{ ...tdStyle, maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.messageTemplate}
                  </td>
                  <td style={tdStyle}>
                    <span style={{
                      display: "inline-block", padding: "2px 8px", borderRadius: 12, fontSize: 12, color: "#fff",
                      background: m.isActive ? "#27ae60" : "#95a5a6",
                    }}>
                      {m.isActive ? "Active" : "Paused"}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <button onClick={() => handleToggleActive(m.id, m.isActive)} style={{ ...btnSmall, background: m.isActive ? "#f39c12" : "#27ae60" }}>
                      {m.isActive ? "Pause" : "Resume"}
                    </button>
                    {deleteConfirm === m.id ? (
                      <span style={{ fontSize: 12 }}>
                        Sure?{" "}
                        <button onClick={() => handleDelete(m.id)} style={{ ...btnSmall, background: "#e74c3c" }}>Yes</button>
                        <button onClick={() => setDeleteConfirm(null)} style={{ ...btnSmall, background: "#95a5a6" }}>No</button>
                      </span>
                    ) : (
                      <button onClick={() => setDeleteConfirm(m.id)} style={{ ...btnSmall, background: "#e74c3c" }}>Delete</button>
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

function SummaryChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 12, color: "#666" }}>{label}</div>
    </div>
  );
}

function formatMMDD(mmdd: string): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const [mm, dd] = mmdd.split("-");
  const monthIdx = parseInt(mm, 10) - 1;
  return `${months[monthIdx] || mm} ${parseInt(dd, 10)}`;
}

/**
 * Parse CSV text into rows with name and birthday.
 * Handles headers or headerless files.
 */
function parseCSV(text: string): Array<{ name: string; birthday: string; phone?: string }> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];

  // Detect delimiter
  const delimiter = lines[0].includes("\t") ? "\t" : ",";

  const allRows = lines.map((line) => splitCSVLine(line, delimiter));

  // Detect if first row is a header
  const firstRow = allRows[0].map((c) => c.toLowerCase().trim());
  const headerKeywords = ["name", "birthday", "date", "first", "last", "phone", "dob", "birth"];
  const isHeader = firstRow.some((cell) => headerKeywords.includes(cell) || headerKeywords.some((kw) => cell.includes(kw)));

  let dataRows = isHeader ? allRows.slice(1) : allRows;
  const results: Array<{ name: string; birthday: string; phone?: string }> = [];

  if (isHeader) {
    // Map by header names
    const nameIdx = firstRow.findIndex((h) => h === "name" || h === "full name" || h === "fullname");
    const firstNameIdx = firstRow.findIndex((h) => h === "first name" || h === "firstname" || h === "first");
    const lastNameIdx = firstRow.findIndex((h) => h === "last name" || h === "lastname" || h === "last");
    const bdayIdx = firstRow.findIndex((h) => h === "birthday" || h === "birth date" || h === "birthdate" || h === "dob" || h === "date" || h === "date of birth");
    const phoneIdx = firstRow.findIndex((h) => h === "phone" || h === "phonenumber" || h === "phone number" || h === "mobile");

    for (const row of dataRows) {
      let name = "";
      if (nameIdx >= 0) {
        name = (row[nameIdx] || "").trim();
      } else if (firstNameIdx >= 0) {
        name = [(row[firstNameIdx] || "").trim(), (row[lastNameIdx] || "").trim()].filter(Boolean).join(" ");
      } else {
        name = (row[0] || "").trim();
      }

      const birthday = (row[bdayIdx >= 0 ? bdayIdx : 1] || "").trim();
      const phone = phoneIdx >= 0 ? (row[phoneIdx] || "").trim() : undefined;

      if (name || birthday) {
        results.push({ name, birthday, phone });
      }
    }
  } else {
    // No header: assume col 0 = name, col 1 = birthday, col 2 = phone (optional)
    for (const row of dataRows) {
      const name = (row[0] || "").trim();
      const birthday = (row[1] || "").trim();
      const phone = (row[2] || "").trim() || undefined;
      if (name || birthday) {
        results.push({ name, birthday, phone });
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
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
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
