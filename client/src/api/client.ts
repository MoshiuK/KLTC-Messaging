const BASE_URL = "/api";

function getToken(): string | null {
  return localStorage.getItem("token");
}

// Friendly error messages for common network/server errors
function friendlyError(status: number, serverMessage?: string): string {
  if (serverMessage && serverMessage !== "Internal server error") {
    return serverMessage;
  }
  switch (status) {
    case 400: return "Invalid request. Please check your input.";
    case 401: return "Your session has expired. Please sign in again.";
    case 403: return "You don't have permission to do that.";
    case 404: return "The requested resource was not found.";
    case 409: return "This record already exists.";
    case 429: return "Too many requests. Please slow down and try again.";
    case 502: return "The messaging service is temporarily unavailable.";
    case 503: return "The server is temporarily unavailable. Please try again.";
    default: return serverMessage || "Something went wrong. Please try again.";
  }
}

// Custom event for session expiry (so AuthContext can listen)
export const SESSION_EXPIRED_EVENT = "session-expired";

async function request<T>(path: string, options: RequestInit = {}, retries = 2): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        ...options,
        headers,
      });

      if (res.status === 401) {
        // Dispatch event so AuthContext can handle gracefully
        window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
        throw new Error("Your session has expired. Please sign in again.");
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(friendlyError(res.status, body.error));
      }

      return await res.json();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Don't retry on client errors (4xx) or if it's not a network error
      const isNetworkError = lastError.message === "Failed to fetch" ||
        lastError.message.includes("NetworkError") ||
        lastError.message.includes("network");

      if (!isNetworkError || attempt >= retries) {
        break;
      }

      // Wait before retrying (exponential backoff)
      await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
    }
  }

  throw lastError || new Error("Request failed");
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    request<{ token: string; user: any }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }, 0), // no retries for login

  register: (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    organizationName: string;
  }) =>
    request<{ token: string; user: any }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    }, 0),

  getMe: () => request<any>("/auth/me"),

  forgotPassword: (email: string) =>
    request<{ message: string; resetLink?: string }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }, 0),

  resetPassword: (token: string, password: string) =>
    request<{ message: string }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    }, 0),

  // Contacts
  getContacts: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<any[]>(`/contacts${qs}`);
  },

  createContact: (data: { firstName: string; lastName: string; phoneNumber: string; email?: string }) =>
    request<any>("/contacts", { method: "POST", body: JSON.stringify(data) }, 0),

  updateContact: (id: string, data: Record<string, unknown>) =>
    request<any>(`/contacts/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(data) }, 0),

  deleteContact: (id: string) =>
    request<any>(`/contacts/${encodeURIComponent(id)}`, { method: "DELETE" }, 0),

  // Groups
  getGroups: () => request<any[]>("/groups"),

  createGroup: (data: { name: string; description?: string }) =>
    request<any>("/groups", { method: "POST", body: JSON.stringify(data) }, 0),

  updateGroup: (id: string, data: { name?: string; description?: string | null }) =>
    request<any>(`/groups/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(data) }, 0),

  deleteGroup: (id: string) =>
    request<any>(`/groups/${encodeURIComponent(id)}`, { method: "DELETE" }, 0),

  // Group members
  getGroupMembers: (groupId: string) => request<any[]>(`/groups/${encodeURIComponent(groupId)}/members`),

  addGroupMembers: (groupId: string, contactIds: string[]) =>
    request<any>(`/groups/${encodeURIComponent(groupId)}/members`, {
      method: "POST",
      body: JSON.stringify({ contactIds }),
    }, 0),

  removeGroupMember: (groupId: string, contactId: string) =>
    request<any>(`/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(contactId)}`, { method: "DELETE" }, 0),

  // SMS / MMS
  sendDirect: (to: string, body: string, mediaUrl?: string) =>
    request<any>("/sms/send", { method: "POST", body: JSON.stringify({ to, body, mediaUrl }) }, 0),

  sendGroup: (groupId: string, body: string, mediaUrl?: string) =>
    request<any>("/sms/send-group", {
      method: "POST",
      body: JSON.stringify({ groupId, body, mediaUrl }),
    }, 0),

  sendBirthday: (groupId: string, body: string, contactName: string, mediaUrl?: string) =>
    request<any>("/sms/send-birthday", {
      method: "POST",
      body: JSON.stringify({ groupId, body, contactName, mediaUrl }),
    }, 0),

  // Birthdays
  getBirthdays: () => request<any>("/contacts/birthdays"),

  // Notifications
  getNotifications: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<{ events: any[]; total: number }>(`/notifications${qs}`);
  },

  // Voice calls
  voiceCall: (to: string, message: string, voice?: string, language?: string) =>
    request<any>("/voice/call", {
      method: "POST",
      body: JSON.stringify({ to, message, voice, language }),
    }, 0),

  voiceCallGroup: (groupId: string, message: string, voice?: string, language?: string) =>
    request<any>("/voice/call-group", {
      method: "POST",
      body: JSON.stringify({ groupId, message, voice, language }),
    }, 0),

  // Users (admin)
  getUsers: () => request<any[]>("/users"),

  createUser: (data: { email: string; password: string; firstName: string; lastName: string; role?: string }) =>
    request<any>("/users", { method: "POST", body: JSON.stringify(data) }, 0),

  updateUser: (id: string, data: Record<string, unknown>) =>
    request<any>(`/users/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(data) }, 0),

  deleteUser: (id: string) =>
    request<any>(`/users/${encodeURIComponent(id)}`, { method: "DELETE" }, 0),

  // Scheduled Messages
  getScheduledMessages: (status?: string) => {
    const qs = status ? `?status=${status}` : "";
    return request<any[]>(`/scheduled${qs}`);
  },

  createScheduledMessage: (data: {
    groupId?: string;
    contactId?: string;
    body: string;
    mediaUrl?: string;
    scheduledAt: string;
    recurrence?: string;
    type?: string;
  }) =>
    request<any>("/scheduled", { method: "POST", body: JSON.stringify(data) }, 0),

  cancelScheduledMessage: (id: string) =>
    request<any>(`/scheduled/${encodeURIComponent(id)}`, { method: "DELETE" }, 0),

  // Branding
  getBranding: () => request<any>("/org/branding"),

  updateBranding: (data: Record<string, unknown>) =>
    request<any>("/org/branding", {
      method: "PATCH",
      body: JSON.stringify(data),
    }, 0),
};
