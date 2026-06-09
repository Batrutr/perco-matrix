// Точка входа: загрузка конфига, БД, клиент PERCo, сборка приложения и запуск.
import { loadConfig } from "./config.js";
import { openDb } from "./db.js";
import { PercoClient } from "./perco/client.js";
import { RefreshState } from "./sync.js";
import { buildApp } from "./app.js";

async function main() {
  const config = loadConfig();
  const db = openDb(config.dbPath);

  const client = new PercoClient({
    host: config.perco.host,
    login: config.perco.login,
    password: config.perco.password,
    tlsRejectUnauthorized: config.perco.tlsRejectUnauthorized,
  });
  const refresh = new RefreshState(db, client, config.perco.concurrency);

  const app = await buildApp({ config, db, refresh });
  await app.listen({ host: config.server.host, port: config.server.port });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
