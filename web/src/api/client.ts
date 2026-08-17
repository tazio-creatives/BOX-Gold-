const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1';

export class ApiError extends Error {
  status: number;
  fields?: { path: string; message: string }[];

  constructor(status: number, message: string, fields?: { path: string; message: string }[]) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

// credentials: 'include' — every request carries the guest-cart-session
// cookie (plan §11) and, once logged in, the customer session cookie.
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const isStateChanging = !!options.method && options.method !== 'GET';

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      // CSRF defense-in-depth header the backend requires on state-changing
      // requests (plan §8) — see backend/src/middleware/csrf.js.
      ...(isStateChanging ? { 'X-Requested-With': 'box-diamonds' } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      body.error?.message ?? response.statusText,
      body.error?.fields,
    );
  }

  if (response.status === 204) return undefined as T;
  return response.json();
}
