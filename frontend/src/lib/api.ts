const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "staff" | "customer";
  companyId: string;
  customerId?: string | null;
};

export class ApiAbortError extends Error {
  constructor() {
    super("Request cancelled");
    this.name = "ApiAbortError";
  }
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = "name" in err ? String((err as { name?: string }).name) : "";
  const message = "message" in err ? String((err as { message?: string }).message) : "";
  return name === "AbortError" || message.toLowerCase().includes("aborted");
}

export async function api<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {}
): Promise<T> {
  const { token, headers, ...rest } = options;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...rest,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });
  } catch (err) {
    if (isAbortError(err)) throw new ApiAbortError();
    const isRelative = API_BASE.startsWith("/");
    throw new Error(
      isRelative
        ? "Cannot reach the server right now. Check your internet connection and refresh the page."
        : `Cannot reach API at ${API_BASE}. Start MongoDB and run: cd backend && npm run dev`
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (data as { error?: string }).error || `Request failed (${res.status})`
    );
  }
  return data as T;
}
