const BASE_URL = "/api";

function getToken(): string | null {
  return localStorage.getItem("token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }

  return res.json();
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    request<{ token: string; user: any }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

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
    }),

  getMe: () => request<any>("/auth/me"),

  forgotPassword: (email: string) =>
    request<{ message: string; resetLink?: string }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token: string, password: string) =>
    request<{ message: string }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    }),

  // Contacts
  getContacts: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<any[]>(`/contacts${qs}`);
  },

  createContact: (data: { firstName: string; lastName: string; phoneNumber: string; email?: string }) =>
    request<any>("/contacts", { method: "POST", body: JSON.stringify(data) }),

  updateContact: (id: string, data: Record<string, unknown>) =>
    request<any>(`/contacts/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  deleteContact: (id: string) =>
    request<any>(`/contacts/${id}`, { method: "DELETE" }),

  // Groups
  getGroups: () => request<any[]>("/groups"),

  createGroup: (data: { name: string; description?: string }) =>
    request<any>("/groups", { method: "POST", body: JSON.stringify(data) }),

  updateGroup: (id: string, data: { name?: string; description?: string | null }) =>
    request<any>(`/groups/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  deleteGroup: (id: string) =>
    request<any>(`/groups/${id}`, { method: "DELETE" }),

  // Group members
  getGroupMembers: (groupId: string) => request<any[]>(`/groups/${groupId}/members`),

  addGroupMembers: (groupId: string, contactIds: string[]) =>
    request<any>(`/groups/${groupId}/members`, {
      method: "POST",
      body: JSON.stringify({ contactIds }),
    }),

  removeGroupMember: (groupId: string, contactId: string) =>
    request<any>(`/groups/${groupId}/members/${contactId}`, { method: "DELETE" }),

  // SMS
  sendDirect: (to: string, body: string) =>
    request<any>("/sms/send", { method: "POST", body: JSON.stringify({ to, body }) }),

  sendGroup: (groupId: string, body: string) =>
    request<any>("/sms/send-group", {
      method: "POST",
      body: JSON.stringify({ groupId, body }),
    }),

  // Notifications
  getNotifications: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<{ events: any[]; total: number }>(`/notifications${qs}`);
  },
};
