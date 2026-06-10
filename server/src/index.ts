// Точка входа: загрузка конфига, БД, клиент PERCo, сборка приложения и запуск.
import { loadConfig } from "./config.js";
import { openDb } from "./db.js";
import { PercoClient } from "./perco/client.js";
import { PercoDb } from "./perco/percoDb.js";
import { RefreshState } from "./sync.js";
import { buildApp } from "./app.js";

async function main() {
  const config = loadConfig();

  if (!config.appPassword) {
    console.warn("ВНИМАНИЕ: APP_PASSWORD не задан — веб-интерфейс работает БЕЗ парольной защиты.");
  }
  if (!config.perco.host || !config.perco.password) {
    console.warn("ВНИМАНИЕ: PERCO_HOST/PERCO_PASSWORD не заданы — обновление из PERCo не сработает.");
  }

  const db = openDb(config.dbPath);

  const client = new PercoClient({
    host: config.perco.host,
    login: config.perco.login,
    password: config.perco.password,
    tlsRejectUnauthorized: config.perco.tlsRejectUnauthorized,
  });

  // Опциональное подключение к БД PERCo для счётчика сотрудников.
  const percoDb = config.percoDb ? new PercoDb(config.percoDb) : null;

  const refresh = new RefreshState(
    db,
    client,
    config.perco.concurrency,
    percoDb ? () => percoDb.getEmployeeCounts() : undefined,
  );

  const app = await buildApp({ config, db, refresh });
  await app.listen({ host: config.server.host, port: config.server.port });

  // Корректное завершение: закрыть сервер, пул БД PERCo и SQLite.
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info(`Получен ${signal}, завершаюсь…`);
    try {
      await app.close();
      if (percoDb) await percoDb.close();
      db.close();
    } catch (err) {
      app.log.error(err);
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
