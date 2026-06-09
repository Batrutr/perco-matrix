// Dev-сидер: наполняет SQLite синтетическими данными «сотни × сотни»,
// чтобы проверить матрицу и производительность без реального сервера PERCo.
// Запуск: DB_PATH=./data/perco.sqlite npm run seed --workspace server
import { loadConfig } from "./config.js";
import { openDb, setMeta } from "./db.js";
import { roomsTreeSchema, templateDetailSchema, templateListSchema } from "./perco/schemas.js";
import { replaceRooms, replaceTemplates, saveTemplateAccess, setEmployeeCounts } from "./repo.js";
import type { RoomNode } from "./perco/schemas.js";

const BUILDINGS = 5;
const FLOORS = 6;
const ROOMS = 12;
const TEMPLATES = 180;

const SCHEDULES = [
  { id: 2, name: "Всегда" },
  { id: 3, name: "Рабочее время" },
  { id: 4, name: "Только день" },
];
const SCHEDULE_TYPE = { id: 1, name: "Временные зоны" };

let idSeq = 1;

function buildTree(): { tree: RoomNode[]; leafIds: number[] } {
  const leafIds: number[] = [];
  const node = (name: string, parentId: number | null, children?: RoomNode[]): RoomNode => {
    const id = idSeq++;
    return {
      id,
      is_const: parentId === null ? 1 : 0,
      name,
      parent_id: parentId,
      node_type: "room",
      segment_id: null,
      with_rights: true,
      room_id: id,
      children,
    };
  };

  const root = node("Объект", null);
  root.children = Array.from({ length: BUILDINGS }, (_, b) => {
    const building = node(`Здание ${b + 1}`, root.id);
    building.children = Array.from({ length: FLOORS }, (_, f) => {
      const floor = node(`Этаж ${f + 1}`, building.id);
      floor.children = Array.from({ length: ROOMS }, (_, r) => {
        const room = node(`Помещение ${b + 1}.${f + 1}.${r + 1}`, floor.id);
        leafIds.push(room.room_id);
        return room;
      });
      return floor;
    });
    return building;
  });

  return { tree: [root], leafIds };
}

function main(): void {
  const config = loadConfig();
  const db = openDb(config.dbPath);

  const { tree, leafIds } = buildTree();
  const roomsCount = replaceRooms(db, roomsTreeSchema.parse(tree));

  const list = templateListSchema.parse(
    Array.from({ length: TEMPLATES }, (_, i) => ({
      id: 100000 + i,
      name: `Шаблон ${String(i + 1).padStart(3, "0")}`,
      comment: i % 7 === 0 ? "с комментарием" : "",
      is_removed: 0,
    })),
  );
  replaceTemplates(db, list);

  for (const t of list) {
    // каждый шаблон даёт доступ в случайные ~40% помещений
    const access = leafIds
      .filter(() => Math.random() < 0.4)
      .map((zoneId) => {
        const sched = SCHEDULES[Math.floor(Math.random() * SCHEDULES.length)]!;
        return {
          access_zone_id: zoneId,
          template_type: 0,
          rights: {
            is_guard: Math.random() < 0.2 ? 1 : 0,
            is_antipass: Math.random() < 0.3 ? 1 : 0,
            is_verify: 0,
            schedule_type: SCHEDULE_TYPE,
            schedule: sched,
          },
        };
      });
    saveTemplateAccess(db, templateDetailSchema.parse({ id: t.id, name: t.name, comment: t.comment, access }));
  }

  // Демо-счётчики сотрудников (как будто из БД PERCo)
  setEmployeeCounts(db, new Map(list.map((t) => [t.id, Math.floor(Math.random() * 120)])));

  setMeta(db, "last_update_templates", new Date().toISOString());

  console.log(
    `Засеяно: помещений ${roomsCount}, шаблонов ${list.length}, листовых зон ${leafIds.length}`,
  );
}

main();
