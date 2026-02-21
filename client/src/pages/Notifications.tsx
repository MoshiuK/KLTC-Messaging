import { useState, useEffect } from "react";
import { api } from "../api/client";
import { ContactStatusEvent } from "../types";

const EVENT_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  opted_out: { label: "Opted Out", color: "#e67e22" },
  opted_in: { label: "Opted In", color: "#27ae60" },
  blocked_suspected: { label: "Blocked", color: "#e74c3c" },
  undelivered: { label: "Undelivered", color: "#c0392b" },
  failed: { label: "Failed", color: "#e74c3c" },
  reactivated: { label: "Reactivated", color: "#2ecc71" },
};

export default function Notifications() {
  const [events, setEvents] = useState<ContactStatusEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterType, setFilterType] = useState("");
  const [page, setPage] = useState(0);
  const limit = 25;

  const loadEvents = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        limit: limit.toString(),
        offset: (page * limit).toString(),
      };
      if (filterType) params.eventType = filterType;
      const data = await api.getNotifications(params);
      setEvents(data.events);
      setTotal(data.total);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, [page, filterType]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <h1>Notifications & Alerts</h1>
      <p style={{ color: "#666" }}>Contact status events: opt-outs, delivery failures, and blocks.</p>

      {error && <div style={errorBox}>{error}</div>}

      <div style={{ marginBottom: 16, display: "flex", gap: 8, alignItems: "center" }}>
        <label style={{ fontSize: 14, fontWeight: 500 }}>Filter:</label>
        <select
          value={filterType}
          onChange={(e) => { setFilterType(e.target.value); setPage(0); }}
          style={{ padding: "6px 10px", border: "1px solid #ddd", borderRadius: 4, fontSize: 14 }}
        >
          <option value="">All Events</option>
          <option value="opted_out">Opted Out</option>
          <option value="opted_in">Opted In</option>
          <option value="blocked_suspected">Blocked</option>
          <option value="undelivered">Undelivered</option>
          <option value="failed">Failed</option>
          <option value="reactivated">Reactivated</option>
        </select>
        <span style={{ fontSize: 13, color: "#999" }}>{total} total events</span>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : events.length === 0 ? (
        <p style={{ color: "#666" }}>No events found.</p>
      ) : (
        <>
          <div style={{ background: "#fff", borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.1)", overflow: "hidden" }}>
            {events.map((ev) => {
              const typeInfo = EVENT_TYPE_LABELS[ev.eventType] || { label: ev.eventType, color: "#666" };
              return (
                <div
                  key={ev.id}
                  style={{
                    padding: "12px 16px",
                    borderBottom: "1px solid #f0f0f0",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      padding: "2px 10px",
                      borderRadius: 12,
                      background: typeInfo.color,
                      color: "#fff",
                      fontSize: 12,
                      fontWeight: 500,
                      minWidth: 80,
                      textAlign: "center",
                    }}
                  >
                    {typeInfo.label}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>{ev.contact.fullName}</div>
                    <div style={{ fontSize: 12, color: "#999" }}>{ev.contact.phoneNumber}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 12, color: "#666" }}>{ev.source}</div>
                    {ev.detail && <div style={{ fontSize: 12, color: "#999" }}>{ev.detail}</div>}
                    {ev.errorCode && <div style={{ fontSize: 11, color: "#c0392b" }}>Error: {ev.errorCode}</div>}
                  </div>
                  <div style={{ fontSize: 12, color: "#bbb", minWidth: 130, textAlign: "right" }}>
                    {new Date(ev.createdAt).toLocaleString()}
                  </div>
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
              <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} style={pageBtn}>
                Previous
              </button>
              <span style={{ padding: "6px 12px", fontSize: 14 }}>
                Page {page + 1} of {totalPages}
              </span>
              <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} style={pageBtn}>
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const errorBox: React.CSSProperties = { color: "#e74c3c", marginBottom: 12, padding: 8, background: "#ffeaea", borderRadius: 4 };
const pageBtn: React.CSSProperties = { padding: "6px 14px", border: "1px solid #ddd", borderRadius: 4, background: "#fff", cursor: "pointer", fontSize: 13 };
