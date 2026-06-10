// Типы внутреннего API (бэкенд → фронтенд). Контракт, общий для обеих сторон.

/** Помещение в плоском виде (узел дерева, развёрнутый из children) */
export interface Room {
  id: number;
  parentId: number | null;
  name: string;
  roomId: number;
  nodeType: string;
  isConst: boolean;
  withRights: boolean;
  depth: number;
  sortOrder: number;
}

/** Шаблон доступа (метаданные) */
export interface Template {
  id: number;
  name: string;
  comment: string | null;
  isRemoved: boolean;
  /** К скольким помещениям (зонам) применён шаблон — из кэша template_access */
  roomCount: number;
  /** К скольким сотрудникам применён; null — счётчик недоступен (БД PERCo не настроена) */
  employeeCount: number | null;
}

/** Содержимое ячейки матрицы: права шаблона в помещение */
export interface MatrixCell {
  templateId: number;
  /** id зоны/помещения (= Room.roomId) */
  roomId: number;
  isGuard: boolean;
  isAntipass: boolean;
  scheduleTypeId: number;
  scheduleTypeName: string;
  scheduleId: number;
  scheduleName: string;
}

/** Тип сущности для обновления */
export type RefreshKind = "rooms" | "templates" | "all" | "employees";

/** Статус фонового обновления */
export interface RefreshStatus {
  running: boolean;
  kind: RefreshKind | null;
  /** Сколько шаблонов уже загружено (для N+1 прогресса) */
  done: number;
  /** Всего шаблонов к загрузке */
  total: number;
  error: string | null;
}

/** Метаданные состояния кэша */
export interface StateMeta {
  lastUpdateRooms: string | null;
  lastUpdateTemplates: string | null;
  lastUpdateEmployees: string | null;
  roomsCount: number;
  templatesCount: number;
}

/** Агрегированный ответ матрицы */
export interface MatrixResponse {
  rooms: Room[];
  templates: Template[];
  cells: MatrixCell[];
  meta: StateMeta;
}
