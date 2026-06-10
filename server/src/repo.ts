// Запись и чтение данных PERCo в SQLite: разворачивание дерева, пакетная замена
// таблиц и выборки для внутреннего API.
import type { Room, Template, MatrixCell, StateMeta } from "@perco/shared";
import type { DB } from "./db.js";
import { setMeta, getMeta } from "./db.js";
import type { RoomNode, TemplateListItem, TemplateDetail } from "./perco/schemas.js";

export interface FlatRoom {
  id: number;
  parentId: number | null;
  name: string;
  roomId: number;
  nodeType: string;
  isConst: number;
  withRights: number;
  depth: number;
  sortOrder: number;
}

/** DFS-разворачивание дерева помещений в плоский список с depth и порядком. */
export function flattenTree(nodes: RoomNode[]): FlatRoom[] {
  const out: FlatRoom[] = [];
  let order = 0;

  const walk = (node: RoomNode, depth: number): void => {
    out.push({
      id: node.id,
      parentId: node.parent_id,
      name: node.name,
      roomId: node.room_id,
      nodeType: node.node_type,
      isConst: node.is_const ? 1 : 0,
      withRights: node.with_rights ? 1 : 0,
      depth,
      sortOrder: order++,
    });
    for (const child of node.children ?? []) walk(child, depth + 1);
  };

  for (const root of nodes) walk(root, 0);
  return out;
}

/** Выполнить функцию в транзакции (node:sqlite не имитирует .transaction()). */
function inTransaction(db: DB, fn: () => void): void {
  db.exec("BEGIN");
  try {
    fn();
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/** Полностью заменить дерево помещений. */
export function replaceRooms(db: DB, tree: RoomNode[]): number {
  const rooms = flattenTree(tree);
  const insert = db.prepare(
    `INSERT INTO rooms (id, parent_id, name, room_id, node_type, is_const, with_rights, depth, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  inTransaction(db, () => {
    db.exec("DELETE FROM rooms");
    for (const r of rooms) {
      insert.run(
        r.id,
        r.parentId,
        r.name,
        r.roomId,
        r.nodeType,
        r.isConst,
        r.withRights,
        r.depth,
        r.sortOrder,
      );
    }
  });
  setMeta(db, "last_update_rooms", new Date().toISOString());
  return rooms.length;
}

/** Полностью заменить список шаблонов (метаданные). */
export function replaceTemplates(db: DB, list: TemplateListItem[]): void {
  const insert = db.prepare(
    `INSERT INTO templates (id, name, comment, is_removed, fetched_at) VALUES (?, ?, ?, ?, NULL)`,
  );
  inTransaction(db, () => {
    db.exec("DELETE FROM templates");
    db.exec("DELETE FROM template_access");
    for (const t of list) {
      insert.run(t.id, t.name, t.comment, t.is_removed ? 1 : 0);
    }
  });
}

/** Записать детали одного шаблона (его строки доступа). Вызывается из пула N+1. */
export function saveTemplateAccess(db: DB, detail: TemplateDetail): void {
  const insert = db.prepare(
    `INSERT INTO template_access
       (template_id, access_zone_id, template_type, is_guard, is_antipass, is_verify,
        schedule_type_id, schedule_type_name, schedule_id, schedule_name, raw_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(template_id, access_zone_id) DO UPDATE SET
       template_type=excluded.template_type, is_guard=excluded.is_guard,
       is_antipass=excluded.is_antipass, is_verify=excluded.is_verify,
       schedule_type_id=excluded.schedule_type_id, schedule_type_name=excluded.schedule_type_name,
       schedule_id=excluded.schedule_id, schedule_name=excluded.schedule_name,
       raw_json=excluded.raw_json`,
  );
  const touch = db.prepare(`UPDATE templates SET fetched_at = ? WHERE id = ?`);

  inTransaction(db, () => {
    db.prepare("DELETE FROM template_access WHERE template_id = ?").run(detail.id);
    for (const a of detail.access) {
      insert.run(
        detail.id,
        a.access_zone_id,
        a.template_type,
        a.rights.is_guard ? 1 : 0,
        a.rights.is_antipass ? 1 : 0,
        a.rights.is_verify ? 1 : 0,
        a.rights.schedule_type.id,
        a.rights.schedule_type.name,
        a.rights.schedule.id,
        a.rights.schedule.name,
        JSON.stringify(a.rights),
      );
    }
    touch.run(new Date().toISOString(), detail.id);
  });
}

// --- Чтение для внутреннего API ---

export function getRooms(db: DB): Room[] {
  const rows = db
    .prepare(
      `SELECT id, parent_id, name, room_id, node_type, is_const, with_rights, depth, sort_order
       FROM rooms ORDER BY sort_order`,
    )
    .all() as Array<{
    id: number;
    parent_id: number | null;
    name: string;
    room_id: number;
    node_type: string;
    is_const: number;
    with_rights: number;
    depth: number;
    sort_order: number;
  }>;
  return rows.map((r) => ({
    id: r.id,
    parentId: r.parent_id,
    name: r.name,
    roomId: r.room_id,
    nodeType: r.node_type,
    isConst: r.is_const === 1,
    withRights: r.with_rights === 1,
    depth: r.depth,
    sortOrder: r.sort_order,
  }));
}

export function getTemplates(db: DB): Template[] {
  const rows = db
    .prepare(
      `SELECT t.id, t.name, t.comment, t.is_removed, t.employee_count,
              (SELECT COUNT(*) FROM template_access a WHERE a.template_id = t.id) AS room_count
       FROM templates t ORDER BY t.name`,
    )
    .all() as Array<{
    id: number;
    name: string;
    comment: string | null;
    is_removed: number;
    employee_count: number | null;
    room_count: number;
  }>;
  return rows.map((t) => ({
    id: t.id,
    name: t.name,
    comment: t.comment,
    isRemoved: t.is_removed === 1,
    roomCount: t.room_count,
    employeeCount: t.employee_count,
  }));
}

/** Записать число сотрудников на шаблон (из БД PERCo). Шаблоны не из карты — обнуляются. */
export function setEmployeeCounts(db: DB, counts: Map<number, number>): void {
  const update = db.prepare("UPDATE templates SET employee_count = ? WHERE id = ?");
  inTransaction(db, () => {
    db.exec("UPDATE templates SET employee_count = NULL");
    for (const [id, count] of counts) update.run(count, id);
  });
}

export function getCells(db: DB): MatrixCell[] {
  const rows = db
    .prepare(
      `SELECT template_id, access_zone_id, is_guard, is_antipass,
              schedule_type_id, schedule_type_name, schedule_id, schedule_name
       FROM template_access`,
    )
    .all() as Array<{
    template_id: number;
    access_zone_id: number;
    is_guard: number;
    is_antipass: number;
    schedule_type_id: number;
    schedule_type_name: string;
    schedule_id: number;
    schedule_name: string;
  }>;
  return rows.map((c) => ({
    templateId: c.template_id,
    roomId: c.access_zone_id,
    isGuard: c.is_guard === 1,
    isAntipass: c.is_antipass === 1,
    scheduleTypeId: c.schedule_type_id,
    scheduleTypeName: c.schedule_type_name,
    scheduleId: c.schedule_id,
    scheduleName: c.schedule_name,
  }));
}

export function getStateMeta(db: DB): StateMeta {
  const count = (table: string): number =>
    (db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c;
  return {
    lastUpdateRooms: getMeta(db, "last_update_rooms"),
    lastUpdateTemplates: getMeta(db, "last_update_templates"),
    lastUpdateEmployees: getMeta(db, "last_update_employees"),
    roomsCount: count("rooms"),
    templatesCount: count("templates"),
  };
}
