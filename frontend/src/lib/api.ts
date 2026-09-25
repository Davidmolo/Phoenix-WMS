const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "staff" | "customer";
  companyId: string;
  customerId?: string | null;
};

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
  } catch {
    throw new Error(
      `Cannot reach API at ${API_BASE}. Start MongoDB and run: cd backend && npm run dev`
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}
