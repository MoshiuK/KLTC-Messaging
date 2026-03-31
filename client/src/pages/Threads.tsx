import { useState, useEffect, useRef } from "react";
import { useAuth } from "../components/AuthContext";
import { api } from "../api/client";
import { ThreadSummary, ThreadMessage, OrgUser } from "../types";

export default function Threads() {
  const { user } = useAuth();
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [selectedThread, setSelectedThread] = useState<ThreadSummary | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [showNewThread, setShowNewThread] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadThreads();
    api.getUsers().then(setUsers).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedThread) {
      loadMessages(selectedThread.id);
    }
  }, [selectedThread]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadThreads = async () => {
    try {
      const data = await api.getThreads();
      setThreads(data);
    } catch {}
  };

  const loadMessages = async (threadId: string) => {
    try {
      const data = await api.getThreadMessages(threadId);
      setMessages(data);
    } catch {}
  };

  const handleSend = async () => {
    if (!selectedThread || !newMessage.trim()) return;
    setSending(true);
    try {
      await api.sendThreadMessage(selectedThread.id, newMessage.trim());
      setNewMessage("");
      await loadMessages(selectedThread.id);
      await loadThreads();
    } catch {}
    setSending(false);
  };

  const startThread = async (peerUserId: string) => {
    try {
      const thread = await api.createThread(peerUserId);
      setShowNewThread(false);
      await loadThreads();
      // Find the thread in the list
      const peer = users.find((u) => u.id === peerUserId);
      if (peer) {
        setSelectedThread({
          id: thread.id,
          peer: { id: peer.id, firstName: peer.firstName, lastName: peer.lastName, email: peer.email },
          lastMessage: null,
          createdAt: thread.createdAt,
        });
      }
    } catch {}
  };

  const otherUsers = users.filter((u) => u.id !== user?.id);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Messages</h1>
        <button onClick={() => setShowNewThread(!showNewThread)} style={btnPrimary}>
          {showNewThread ? "Cancel" : "New Conversation"}
        </button>
      </div>

      {showNewThread && (
        <div style={{ ...card, marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Start a conversation with:</h3>
          {otherUsers.length === 0 && <p style={{ color: "#666" }}>No other users in your organization.</p>}
          {otherUsers.map((u) => (
            <button
              key={u.id}
              onClick={() => startThread(u.id)}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", marginBottom: 4, background: "#f8f9fa", border: "1px solid #eee", borderRadius: 4, cursor: "pointer", fontSize: 14 }}
            >
              {u.firstName} {u.lastName} ({u.email})
            </button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 16, minHeight: 400 }}>
        {/* Thread list */}
        <div style={{ ...card, width: 280, minWidth: 280, overflowY: "auto", maxHeight: 500 }}>
          {threads.length === 0 && <p style={{ color: "#666", fontSize: 13 }}>No conversations yet.</p>}
          {threads.map((t) => (
            <div
              key={t.id}
              onClick={() => setSelectedThread(t)}
              style={{
                padding: "10px 12px",
                marginBottom: 4,
                borderRadius: 4,
                cursor: "pointer",
                background: selectedThread?.id === t.id ? "#e8f0fe" : "#f8f9fa",
                borderLeft: selectedThread?.id === t.id ? "3px solid #3498db" : "3px solid transparent",
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 14 }}>
                {t.peer.firstName} {t.peer.lastName}
              </div>
              {t.lastMessage && (
                <div style={{ fontSize: 12, color: "#666", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.lastMessage.body}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Messages */}
        <div style={{ ...card, flex: 1, display: "flex", flexDirection: "column" }}>
          {!selectedThread ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#999" }}>
              Select a conversation or start a new one
            </div>
          ) : (
            <>
              <div style={{ borderBottom: "1px solid #eee", paddingBottom: 8, marginBottom: 8 }}>
                <strong>{selectedThread.peer.firstName} {selectedThread.peer.lastName}</strong>
              </div>
              <div style={{ flex: 1, overflowY: "auto", maxHeight: 350, marginBottom: 8 }}>
                {messages.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      marginBottom: 8,
                      textAlign: m.senderUserId === user?.id ? "right" : "left",
                    }}
                  >
                    <div
                      style={{
                        display: "inline-block",
                        padding: "8px 12px",
                        borderRadius: 12,
                        maxWidth: "70%",
                        background: m.senderUserId === user?.id ? "#3498db" : "#f0f0f0",
                        color: m.senderUserId === user?.id ? "#fff" : "#333",
                        fontSize: 14,
                      }}
                    >
                      {m.body}
                    </div>
                    <div style={{ fontSize: 10, color: "#999", marginTop: 2 }}>
                      {new Date(m.createdAt).toLocaleTimeString()}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                  placeholder="Type a message..."
                  style={{ flex: 1, padding: "8px 12px", border: "1px solid #ddd", borderRadius: 4, fontSize: 14 }}
                />
                <button onClick={handleSend} disabled={sending || !newMessage.trim()} style={btnPrimary}>
                  {sending ? "..." : "Send"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const btnPrimary: React.CSSProperties = { padding: "8px 16px", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 14 };
const card: React.CSSProperties = { background: "#fff", padding: 16, borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" };
