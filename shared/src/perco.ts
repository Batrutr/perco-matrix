// Типы, описывающие «сырые» ответы API PERCo.
// Используются на бэке для валидации (zod-схемы выводятся из них) и как ориентир.

/** Узел дерева помещений: GET /api/rooms/tree */
export interface PercoRoomNode {
    id: number;
    is_const: number;
    name: string;
    parent_id: number | null;
    node_type: string; // "room"
    segment_id: number | null;
    with_rights: boolean;
    room_id: number;
    children?: PercoRoomNode[];
}

/** Элемент списка шаблонов: GET /api/accessTemplates/list */
export interface PercoTemplateListItem {
    id: number;
    name: string;
    comment: string;
    is_removed: number;
}

/** Справочник id+name (right_type, schedule, commission_type и т.п.) */
export interface PercoRef {
    id: number;
    name: string;
}

/** Права доступа внутри одной зоны шаблона */
export interface PercoRights {
    is_guard: number;
    is_antipass: number;
    is_verify: number;
    right_type: PercoRef;
    commission_type: PercoRef;
    commission_group_1: number;
    commission_group_2: number;
    template_type_name: string;
    schedule_type: PercoRef;
    schedule: PercoRef;
    verify_po_schedule: PercoRef;
    verify_pdu_schedule: PercoRef;
    verify_vvu_schedule: PercoRef;
    verify_alcobarier_schedule: PercoRef;
}

/** Одна запись доступа шаблона в зону (помещение) */
export interface PercoAccessEntry {
    access_zone_id: number;
    template_type: number;
    rights: PercoRights;
}

/** Детали шаблона: GET /api/accessTemplates/{id} */
export interface PercoTemplateDetail {
    id: number;
    name: string;
    comment: string | null;
    access: PercoAccessEntry[];
}

/** Ответ авторизации: POST /api/system/auth */
export interface PercoAuthResponse {
    token: string;
}
