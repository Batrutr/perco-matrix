// Обращения к внутреннему API сервера.
import type { MatrixResponse, RefreshKind, RefreshStatus } from "@perco/shared";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export function fetchMatrix(): Promise<MatrixResponse> {
  return getJson<MatrixResponse>("/api/state/matrix");
}

export function fetchRefreshStatus(): Promise<RefreshStatus> {
  return getJson<RefreshStatus>("/api/refresh/status");
}

export interface RefreshResult {
  started: boolean;
  status: RefreshStatus;
}

export async function startRefresh(kind: RefreshKind): Promise<RefreshResult> {
  const res = await fetch(`/api/refresh/${kind}`, { method: "POST" });
  // 409 = уже идёт обновление; тело содержит started:false + статус
  if (res.status === 409) return res.json() as Promise<RefreshResult>;
  if (!res.ok) throw new Error(`Запуск обновления (${kind}) → HTTP ${res.status}`);
  return res.json() as Promise<RefreshResult>;
}

// --- Авторизация интерфейса ---

export interface AuthStatus {
  required: boolean;
  authenticated: boolean;
}

export function fetchAuthStatus(): Promise<AuthStatus> {
  return getJson<AuthStatus>("/api/auth/status");
}

/** Вход. Возвращает false при неверном пароле. */
export async function login(password: string): Promise<boolean> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (res.status === 401) return false;
  if (!res.ok) throw new Error(`Вход → HTTP ${res.status}`);
  return true;
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}
