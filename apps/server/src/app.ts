import { zValidator } from "@hono/zod-validator";
import {
  API_PREFIX,
  createNoteInputSchema,
  listNotesQuerySchema,
  noteParamsSchema,
  updateNoteInputSchema,
  type ApiErrorBody,
  type ListNotesResponse,
} from "@notes/shared";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { z } from "zod";
import type { NotesRepo } from "./notes-repo";

function errorBody(code: string, message: string, issues?: unknown[]): ApiErrorBody {
  return { error: { code, message, ...(issues ? { issues } : {}) } };
}

/** Uniform 400 response for every zod validation failure. */
const validate = <T extends z.ZodType, Target extends "json" | "query" | "param">(
  target: Target,
  schema: T,
) =>
  zValidator(target, schema, (result, c) => {
    if (!result.success) {
      return c.json(
        errorBody("validation_error", "Request validation failed", result.error.issues),
        400,
      );
    }
  });

const idParam = validate("param", noteParamsSchema);

function notFound(c: Context) {
  return c.json(errorBody("not_found", "Note not found"), 404);
}

export interface AppOptions {
  repo: NotesRepo;
  corsOrigin?: string | string[];
}

export function createApp({ repo, corsOrigin = "*" }: AppOptions) {
  const api = new Hono()
    .get("/health", (c) => c.json({ ok: true }))
    .get("/notes", validate("query", listNotesQuerySchema), (c) => {
      const { q } = c.req.valid("query");
      return c.json({ notes: repo.list(q || undefined) } satisfies ListNotesResponse);
    })
    .post("/notes", validate("json", createNoteInputSchema), (c) => {
      const note = repo.create(c.req.valid("json"));
      c.header("Location", `${API_PREFIX}/notes/${note.id}`);
      return c.json(note, 201);
    })
    .get("/notes/:id", idParam, (c) => {
      const note = repo.get(c.req.valid("param").id);
      return note ? c.json(note) : notFound(c);
    })
    .patch("/notes/:id", idParam, validate("json", updateNoteInputSchema), (c) => {
      const note = repo.update(c.req.valid("param").id, c.req.valid("json"));
      return note ? c.json(note) : notFound(c);
    })
    .delete("/notes/:id", idParam, (c) => {
      return repo.remove(c.req.valid("param").id) ? c.body(null, 204) : notFound(c);
    });

  const app = new Hono();
  app.use(`${API_PREFIX}/*`, cors({ origin: corsOrigin }));
  app.use(`${API_PREFIX}/*`, bodyLimit({ maxSize: 1024 * 1024 }));
  app.route(API_PREFIX, api);

  app.notFound((c) =>
    c.json(errorBody("not_found", `No route for ${c.req.method} ${c.req.path}`), 404),
  );
  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json(errorBody("http_error", err.message), err.status as ContentfulStatusCode);
    }
    console.error(err);
    return c.json(errorBody("internal_error", "Something went wrong"), 500);
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
