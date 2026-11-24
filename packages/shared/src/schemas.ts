import { z } from "zod";

/** Max sizes keep a single note from ballooning the DB or the request body. */
export const NOTE_TITLE_MAX = 200;
export const NOTE_CONTENT_MAX = 500_000;

export const noteIdSchema = z.uuid();
export const noteParamsSchema = z.object({ id: noteIdSchema });

export const noteSchema = z.object({
  id: noteIdSchema,
  title: z.string(),
  content: z.string(),
  pinned: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Note = z.infer<typeof noteSchema>;

/** List rows carry a short plain-text excerpt instead of the full body. */
export const noteSummarySchema = noteSchema
  .omit({ content: true })
  .extend({ excerpt: z.string() });
export type NoteSummary = z.infer<typeof noteSummarySchema>;

export const createNoteInputSchema = z.object({
  title: z.string().max(NOTE_TITLE_MAX).default(""),
  content: z.string().max(NOTE_CONTENT_MAX).default(""),
  pinned: z.boolean().default(false),
});
export type CreateNoteInput = z.input<typeof createNoteInputSchema>;

export const updateNoteInputSchema = z
  .object({
    title: z.string().max(NOTE_TITLE_MAX),
    content: z.string().max(NOTE_CONTENT_MAX),
    pinned: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: "Provide at least one field to update",
  });
export type UpdateNoteInput = z.input<typeof updateNoteInputSchema>;

export const listNotesQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
});
export type ListNotesQuery = z.infer<typeof listNotesQuerySchema>;

export const listNotesResponseSchema = z.object({
  notes: z.array(noteSummarySchema),
});
export type ListNotesResponse = z.infer<typeof listNotesResponseSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    issues: z.array(z.unknown()).optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;
