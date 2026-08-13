// Подхват .env при запуске без Docker/systemd (те подают переменные сами через
// env_file/EnvironmentFile, а голые `npm run dev`/`npm start` файл не читали).
// Ищем в cwd и на уровень выше: workspace-скрипты работают из server/, а .env
// лежит в корне репозитория. Реальные переменные окружения имеют приоритет —
// process.loadEnvFile не перезаписывает уже заданные значения.
//
// Импортируется только из точки входа (index.ts): тесты собирают окружение
// сами, и подхват настоящего .env в них был бы утечкой конфигурации.
import { existsSync } from "node:fs";
import path from "node:path";

for (const dir of [process.cwd(), path.resolve(process.cwd(), "..")]) {
    const file = path.join(dir, ".env");
    if (existsSync(file)) {
        process.loadEnvFile(file);
        break;
    }
}
