export interface AuthUser {
  id: string;
  email: string;
  isAdmin: boolean;
}

export class AuthError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

export const AUTH_EXPIRED_EVENT = 'auth:expired';

/**
 * Any 401 coming from our own API (outside /api/auth) means the session is gone:
 * notify the app so it can send the user back to the login screen.
 */
export function installAuthInterceptor() {
  const w = window as any;
  if (w.__authInterceptorInstalled) return;
  w.__authInterceptorInstalled = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await originalFetch(input, init);
    const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
    if (res.status === 401 && url.startsWith('/api/') && !url.startsWith('/api/auth/')) {
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
    return res;
  };
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new AuthError(data?.error || `Erro ${res.status}`, data?.code);
  return data as T;
}

export const authApi = {
  async me(): Promise<AuthUser | null> {
    const res = await fetch('/api/auth/me');
    if (res.status === 401) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()).user as AuthUser;
  },
  async login(email: string, password: string): Promise<AuthUser> {
    return (await post<{ user: AuthUser }>('/api/auth/login', { email, password })).user;
  },
  register(email: string, password: string) {
    return post<{ message: string }>('/api/auth/register', { email, password });
  },
  resend(email: string) {
    return post<{ message: string }>('/api/auth/resend', { email });
  },
  async logout(): Promise<void> {
    await post('/api/auth/logout').catch(() => {});
  },
};
