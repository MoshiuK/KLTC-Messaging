import { useState, useEffect, useRef } from "react";
import { api } from "../api/client";
import { ContactGroup } from "../types";

interface ScheduledMessage {
  id: string;
  contactName: string;
  phoneNumber: string;
  birthday: string;
  isActive: boolean;
  lastSentYear: number | null;
  createdAt: string;
}

interface BirthdayConfig {
  groupId: string | null;
  template1: string;
  template2: string;
  template3: string;
  template4: string;
  template5: string;
  rotationIndex: number;
  isEnabled: boolean;
  scheduledTime: string;
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
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [config, setConfig] = useState<BirthdayConfig>({
    groupId: null,
    template1: "Happy Birthday, {name}! Wishing you a wonderful day!",
    template2: "It's {name}'s birthday today! Let's wish them a great one!",
    template3: "Happy Birthday to {name}! Hope your day is amazing!",
    template4: "Wishing the happiest of birthdays to {name}! Enjoy your special day!",
    template5: "Birthday shoutout to {name}! Have an incredible birthday!",
    rotationIndex: 0,
    isEnabled: false,
    scheduledTime: "08:05",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [configSaving, setConfigSaving] = useState(false);
  const [configSuccess, setConfigSuccess] = useState("");

  // Upload state
  const [showUpload, setShowUpload] = useState(false);
  const [parsedRows, setParsedRows] = useState<Array<{ name: string; birthday: string; phone?: string }>>([]);
  const [fileName, setFileName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ created: number; skipped: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      api.getScheduledMessages(),
      api.getBirthdayConfig(),
      api.getGroups(),
    ]).then(([msgs, cfg, grps]) => {
      setMessages(msgs);
      setConfig(cfg);
      setGroups(grps);
    }).catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const loadMessages = async () => {
    try {
      const data = await api.getScheduledMessages();
      setMessages(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSaveConfig = async () => {
    setConfigSaving(true);
    setError("");
    setConfigSuccess("");
    try {
      const saved = await api.updateBirthdayConfig({ ...config });
      setConfig(saved);
      setConfigSuccess("Configuration saved successfully!");
      setTimeout(() => setConfigSuccess(""), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setConfigSaving(false);
    }
  };

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
          setUploadError("No valid rows found. Expected columns: name, birthday (and optionally phone).");
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
    setUploading(true);
    setUploadError("");
    setUploadResult(null);
    try {
      const result = await api.uploadBirthdays(parsedRows);
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

  const handleSyncFromContacts = async () => {
    setSyncing(true);
    setSyncResult(null);
    setError("");
    try {
      const result = await api.syncBirthdaysFromContacts();
      setSyncResult(result.summary);
      loadMessages();
      if (result.summary.created > 0) {
        setConfigSuccess(`Synced ${result.summary.created} birthday(s) from contacts!`);
        setTimeout(() => setConfigSuccess(""), 3000);
      } else {
        setConfigSuccess("All contacts with birthdays are already in the list.");
        setTimeout(() => setConfigSuccess(""), 3000);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSyncing(false);
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

  const currentYear = new Date().getFullYear();

  if (loading) return <p style={{ padding: 20 }}>Loading...</p>;

  return (
    <div>
      <h1>Scheduled Messages</h1>
      <p style={{ color: "#666", marginTop: 0 }}>
        Configure automatic birthday announcements sent to your entire group at 8:05 AM.
      </p>

      {error && <div style={errorBox}>{error}</div>}
      {configSuccess && <div style={successBox}>{configSuccess}</div>}

      {/* ─── Birthday Announcement Config ─── */}
      <div style={formCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Birthday Announcement Settings</h3>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={config.isEnabled}
              onChange={(e) => setConfig({ ...config, isEnabled: e.target.checked })}
              style={{ width: 18, height: 18 }}
            />
            <span style={{ fontWeight: 600, color: config.isEnabled ? "#27ae60" : "#95a5a6" }}>
              {config.isEnabled ? "Enabled" : "Disabled"}
            </span>
          </label>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Announcement Group *</label>
          <select
            value={config.groupId || ""}
            onChange={(e) => setConfig({ ...config, groupId: e.target.value || null })}
            style={{ ...inputStyle, cursor: "pointer" }}
          >
            <option value="">-- Select a group --</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} ({g._count.members} members)
              </option>
            ))}
          </select>
          <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>
            All active members in this group will receive birthday announcements.
          </div>
        </div>

        <div style={{ marginBottom: 8 }}>
          <label style={{ ...labelStyle, marginBottom: 8 }}>Rotating Message Templates (5)</label>
          <div style={{ fontSize: 12, color: "#999", marginBottom: 12 }}>
            Messages rotate automatically: Template 1, 2, 3, 4, 5, then back to 1.
            Use <code>{"{name}"}</code> to insert the birthday person's name.
            Currently on template <strong>{config.rotationIndex + 1}</strong>.
          </div>
        </div>

        {[1, 2, 3, 4, 5].map((i) => {
          const key = `template${i}` as keyof BirthdayConfig;
          const isNext = config.rotationIndex === i - 1;
          return (
            <div key={i} style={{ marginBottom: 12, position: "relative" }}>
              <label style={labelStyle}>
                Template {i}
                {isNext && <span style={{ color: "#27ae60", marginLeft: 8, fontSize: 11 }}>(next to send)</span>}
              </label>
              <textarea
                value={config[key] as string}
                onChange={(e) => setConfig({ ...config, [key]: e.target.value })}
                rows={2}
                maxLength={1600}
                style={{ ...inputStyle, resize: "vertical", borderColor: isNext ? "#27ae60" : "#ddd" }}
              />
            </div>
          );
        })}

        <button
          onClick={handleSaveConfig}
          disabled={configSaving}
          style={{ ...btnPrimary, opacity: configSaving ? 0.7 : 1 }}
        >
          {configSaving ? "Saving..." : "Save Settings"}
        </button>
      </div>

      {/* ─── Birthday CSV Upload ─── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24, marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Birthday List ({messages.length} entries)</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleSyncFromContacts} disabled={syncing} style={{ ...btnPrimary, background: "#2c3e50", opacity: syncing ? 0.7 : 1 }}>
            {syncing ? "Syncing..." : "Sync from Contacts"}
          </button>
          <button onClick={() => { resetUpload(); setShowUpload(!showUpload); }} style={btnPrimary}>
            {showUpload ? "Cancel" : "Upload Birthday CSV"}
          </button>
        </div>
      </div>

      {showUpload && (
        <div style={formCard}>
          <p style={{ color: "#666", fontSize: 13, marginTop: 0 }}>
            Upload a CSV with columns: <strong>name</strong>, <strong>birthday</strong>, and optionally <strong>phone</strong>.
            Supported formats: MM/DD, MM-DD, MM/DD/YYYY, YYYY-MM-DD. Duplicates are automatically skipped.
          </p>

          <div style={{ marginBottom: 16 }}>
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
                Preview: {parsedRows.length} entries from {fileName}
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
                {uploading ? "Importing..." : `Import ${parsedRows.length} Birthdays`}
              </button>
            </div>
          )}

          {uploadResult && (
            <div style={{ background: "#f0faf0", padding: 16, borderRadius: 8, marginTop: 12 }}>
              <h4 style={{ marginTop: 0 }}>Import Complete</h4>
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

      {/* ─── Birthday Entries List ─── */}
      {messages.length === 0 ? (
        <p style={{ color: "#666" }}>No birthday entries yet. Upload a CSV to get started.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Birthday</th>
                <th style={thStyle}>Phone</th>
                <th style={thStyle}>Last Sent</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((m) => (
                <tr key={m.id} style={{ opacity: m.isActive ? 1 : 0.5 }}>
                  <td style={tdStyle}>{m.contactName}</td>
                  <td style={tdStyle}>{formatMMDD(m.birthday)}</td>
                  <td style={tdStyle}>{m.phoneNumber || "-"}</td>
                  <td style={tdStyle}>
                    {m.lastSentYear === currentYear ? (
                      <span style={{ color: "#27ae60" }}>Sent {currentYear}</span>
                    ) : m.lastSentYear ? (
                      <span style={{ color: "#999" }}>Last: {m.lastSentYear}</span>
                    ) : (
                      <span style={{ color: "#999" }}>Never</span>
                    )}
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

function parseCSV(text: string): Array<{ name: string; birthday: string; phone?: string }> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];

  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const allRows = lines.map((line) => splitCSVLine(line, delimiter));

  const firstRow = allRows[0].map((c) => c.toLowerCase().trim());
  const headerKeywords = ["name", "birthday", "date", "first", "last", "phone", "dob", "birth"];
  const isHeader = firstRow.some((cell) => headerKeywords.includes(cell) || headerKeywords.some((kw) => cell.includes(kw)));

  const dataRows = isHeader ? allRows.slice(1) : allRows;
  const results: Array<{ name: string; birthday: string; phone?: string }> = [];

  if (isHeader) {
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

      if (name || birthday) results.push({ name, birthday, phone });
    }
  } else {
    for (const row of dataRows) {
      const name = (row[0] || "").trim();
      const birthday = (row[1] || "").trim();
      const phone = (row[2] || "").trim() || undefined;
      if (name || birthday) results.push({ name, birthday, phone });
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
const successBox: React.CSSProperties = { color: "#27ae60", marginBottom: 12, padding: 8, background: "#eafaea", borderRadius: 4 };
const formCard: React.CSSProperties = { background: "#fff", padding: 20, borderRadius: 8, marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" };
const labelStyle: React.CSSProperties = { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 500 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 4, fontSize: 14, boxSizing: "border-box" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "10px 12px", borderBottom: "2px solid #eee", fontSize: 13, fontWeight: 600 };
const tdStyle: React.CSSProperties = { padding: "10px 12px", borderBottom: "1px solid #f0f0f0", fontSize: 14 };
