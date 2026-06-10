// Тесты Этапа 5: парольный гейт, security-заголовки, открытость без пароля.
import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "./db.js";
import { RefreshState } from "./sync.js";
import { buildApp } from "./app.js";
import type { AppConfig } from "./config.js";
import type { PercoClient } from "./perco/client.js";

function cfg(appPassword: string): AppConfig {
  return {
    perco: { host: "https://x", login: "a", password: "b", concurrency: 4, tlsRejectUnauthorized: true },
    percoDb: null,
    server: { host: "127.0.0.1", port: 0 },
    dbPath: ":memory:",
    appPassword,
    cookieSecret: "test-secret-which-is-long-enough-000000",
    staticDir: "",
    importantTemplates: [],
  };
}

function deps() {
  const db = openDb(":memory:");
  const refresh = new RefreshState(db, {} as unknown as PercoClient, 4);
  return { db, refresh };
}

const JSON_HEADERS = { "content-type": "application/json" };

test("без пароля API открыт", async () => {
  const app = await buildApp({ config: cfg(""), ...deps(), logger: false, serveStatic: false });
  const res = await app.inject({ method: "GET", url: "/api/state/matrix" });
  assert.equal(res.statusCode, 200);
  await app.close();
});

test("с паролем: 401 без сессии, 401 на неверный пароль, доступ по cookie", async () => {
  const app = await buildApp({ config: cfg("secret"), ...deps(), logger: false, serveStatic: false });

  const unauthed = await app.inject({ method: "GET", url: "/api/state/matrix" });
  assert.equal(unauthed.statusCode, 401);

  const bad = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: JSON_HEADERS,
    payload: JSON.stringify({ password: "nope" }),
  });
  assert.equal(bad.statusCode, 401);

  const good = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: JSON_HEADERS,
    payload: JSON.stringify({ password: "secret" }),
  });
  assert.equal(good.statusCode, 200);
  const session = good.cookies.find((c) => c.name === "perco_session");
  assert.ok(session, "должна быть установлена cookie сессии");

  const authed = await app.inject({
    method: "GET",
    url: "/api/state/matrix",
    cookies: { perco_session: session!.value },
  });
  assert.equal(authed.statusCode, 200);
  await app.close();
});

test("гейт нельзя обойти URL-кодированием пути (/%61pi → /api)", async () => {
  const app = await buildApp({ config: cfg("secret"), ...deps(), logger: false, serveStatic: false });
  // роутер декодирует %61→a и направит в /api/state/matrix — авторизация обязана сработать
  const encoded = await app.inject({ method: "GET", url: "/%61pi/state/matrix" });
  assert.equal(encoded.statusCode, 401);
  const encodedRefresh = await app.inject({ method: "POST", url: "/%61pi/refresh/all" });
  assert.equal(encodedRefresh.statusCode, 401);
  await app.close();
});

test("status и health доступны без авторизации", async () => {
  const app = await buildApp({ config: cfg("secret"), ...deps(), logger: false, serveStatic: false });
  const status = await app.inject({ method: "GET", url: "/api/auth/status" });
  assert.equal(status.statusCode, 200);
  assert.equal((status.json() as { required: boolean }).required, true);
  const health = await app.inject({ method: "GET", url: "/api/health" });
  assert.equal(health.statusCode, 200);
  await app.close();
});

test("security-заголовки присутствуют (helmet)", async () => {
  const app = await buildApp({ config: cfg(""), ...deps(), logger: false, serveStatic: false });
  const res = await app.inject({ method: "GET", url: "/api/health" });
  assert.ok(res.headers["content-security-policy"], "должен быть CSP");
  assert.equal(res.headers["x-content-type-options"], "nosniff");
  await app.close();
});
