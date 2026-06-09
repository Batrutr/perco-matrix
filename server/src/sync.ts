// Оркестрация обновления данных из PERCo в SQLite.
// Держит единое состояние прогресса (RefreshState) — ровно одно обновление за раз.
import type { RefreshKind, RefreshStatus } from "@perco/shared";
import type { DB } from "./db.js";
import { setMeta } from "./db.js";
import type { PercoClient } from "./perco/client.js";
import { replaceRooms, replaceTemplates, saveTemplateAccess } from "./repo.js";
import { runWithConcurrency } from "./util/pool.js";

export class RefreshState {
  private status: RefreshStatus = {
    running: false,
    kind: null,
    done: 0,
    total: 0,
    error: null,
  };

  constructor(
    private readonly db: DB,
    private readonly client: PercoClient,
    private readonly concurrency: number,
  ) {}

  getStatus(): RefreshStatus {
    return { ...this.status };
  }

  /** Запустить обновление. Возвращает false, если другое уже идёт. */
  start(kind: RefreshKind): boolean {
    if (this.status.running) return false;
    this.status = { running: true, kind, done: 0, total: 0, error: null };

    void this.run(kind)
      .catch((err: unknown) => {
        this.status.error = err instanceof Error ? err.message : String(err);
      })
      .finally(() => {
        this.status.running = false;
      });

    return true;
  }

  private async run(kind: RefreshKind): Promise<void> {
    if (kind === "rooms" || kind === "all") {
      await this.syncRooms();
    }
    if (kind === "templates" || kind === "all") {
      await this.syncTemplates();
    }
  }

  private async syncRooms(): Promise<void> {
    const tree = await this.client.getRoomsTree();
    replaceRooms(this.db, tree);
  }

  private async syncTemplates(): Promise<void> {
    const list = await this.client.getTemplateList();
    replaceTemplates(this.db, list);

    this.status.total = list.length;
    this.status.done = 0;

    await runWithConcurrency(
      list,
      this.concurrency,
      async (item) => {
        const detail = await this.client.getTemplateDetail(item.id);
        saveTemplateAccess(this.db, detail);
      },
      {
        onProgress: (done, total) => {
          this.status.done = done;
          this.status.total = total;
        },
      },
    );

    setMeta(this.db, "last_update_templates", new Date().toISOString());
  }
}
