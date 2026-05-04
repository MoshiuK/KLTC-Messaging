const BASE_URL = "/api";

function getToken(): string | null {
  return localStorage.getItem("token");
}

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
    case 503: return "The server is temporarily unavailable. Please try again.";
    default: return serverMessage || "Something went wrong. Please try again.";
  }
}

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
      const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

      if (res.status === 401) {
        if (token) {
          window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
          throw new Error("Your session has expired. Please sign in again.");
        }
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Invalid email or password.");
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(friendlyError(res.status, body.error));
      }

      return await res.json();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      const isNetworkError = lastError.message === "Failed to fetch" ||
        lastError.message.includes("NetworkError") ||
        lastError.message.includes("network");

      if (!isNetworkError || attempt >= retries) break;

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
    }, 0),

  register: (data: { email: string; password: string; firstName: string; lastName: string; organizationName: string }) =>
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

  // Users (admin)
  getUsers: () => request<any[]>("/users"),

  createUser: (data: { email: string; password: string; firstName: string; lastName: string; role?: string }) =>
    request<any>("/users", { method: "POST", body: JSON.stringify(data) }, 0),

  updateUser: (id: string, data: Record<string, unknown>) =>
    request<any>(`/users/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(data) }, 0),

  deleteUser: (id: string) =>
    request<any>(`/users/${encodeURIComponent(id)}`, { method: "DELETE" }, 0),

  // Branding
  getBranding: () => request<any>("/org/branding"),

  updateBranding: (data: Record<string, unknown>) =>
    request<any>("/org/branding", { method: "PATCH", body: JSON.stringify(data) }, 0),
};
