// zod-схемы для валидации «сырых» ответов PERCo.
// Лояльны к неизвестным полям (passthrough), строги к тем, что используем.
import { z } from "zod";

export const authResponseSchema = z.object({
  token: z.string().min(1),
});

/** Узел дерева помещений (рекурсивный) */
export const roomNodeSchema: z.ZodType<RoomNode> = z.lazy(() =>
  z.object({
    id: z.number(),
    is_const: z.number(),
    name: z.string(),
    parent_id: z.number().nullable(),
    node_type: z.string(),
    segment_id: z.number().nullable(),
    with_rights: z.boolean(),
    room_id: z.number(),
    children: z.array(roomNodeSchema).optional(),
  }),
);

export interface RoomNode {
  id: number;
  is_const: number;
  name: string;
  parent_id: number | null;
  node_type: string;
  segment_id: number | null;
  with_rights: boolean;
  room_id: number;
  children?: RoomNode[];
}

export const roomsTreeSchema = z.array(roomNodeSchema);

export const templateListItemSchema = z.object({
  id: z.number(),
  name: z.string(),
  comment: z.string().nullable().default(""),
  is_removed: z.number(),
});

export const templateListSchema = z.array(templateListItemSchema);

const refSchema = z.object({ id: z.number(), name: z.string() });

/** Права доступа: парсим значимые поля, остальное сохраняем как есть. */
export const rightsSchema = z
  .object({
    is_guard: z.number(),
    is_antipass: z.number(),
    is_verify: z.number(),
    schedule_type: refSchema,
    schedule: refSchema,
  })
  .passthrough();

export const accessEntrySchema = z.object({
  access_zone_id: z.number(),
  template_type: z.number(),
  rights: rightsSchema,
});

export const templateDetailSchema = z.object({
  id: z.number(),
  name: z.string(),
  comment: z.string().nullable(),
  access: z.array(accessEntrySchema).default([]),
});

export type TemplateDetail = z.infer<typeof templateDetailSchema>;
export type TemplateListItem = z.infer<typeof templateListItemSchema>;
export type AccessEntry = z.infer<typeof accessEntrySchema>;
