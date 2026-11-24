import type { z } from "zod";
import { routes } from "./routes";
import {
  apiErrorSchema,
  listNotesResponseSchema,
  noteSchema,
  type CreateNoteInput,
  type ListNotesQuery,
  type Note,
  type NoteSummary,
  type UpdateNoteInput,
} from "./schemas";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly issues?: unknown[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface NotesClientOptions {
  /** Origin the API lives on, e.g. "http://localhost:4310". Empty = same origin. */
  baseUrl?: string;
  /** Custom fetch (tests, SSR, auth wrappers). Defaults to globalThis.fetch. */
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  headers?: Record<string, string>;
}

/**
 * Typed client for the Notes API. Framework-agnostic: works in the browser,
 * Node, scripts, or another service. Responses are validated with the same
 * zod schemas the server uses.
 */
export function createNotesClient(options: NotesClientOptions = {}) {
  const baseUrl = (options.baseUrl ?? "").replace(/\/$/, "");
  const doFetch = options.fetch ?? ((url, init) => globalThis.fetch(url, init));

  async function request<T>(
    path: string,
    init: RequestInit,
    schema: z.ZodType<T> | null,
  ): Promise<T> {
    const res = await doFetch(baseUrl + path, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
        ...(init.headers as Record<string, string> | undefined),
      },
    });

    if (!res.ok) {
      const body: unknown = await res.json().catch(() => null);
      const parsed = apiErrorSchema.safeParse(body);
      if (parsed.success) {
        const { code, message, issues } = parsed.data.error;
        throw new ApiError(res.status, code, message, issues);
      }
      throw new ApiError(res.status, "http_error", res.statusText || "Request failed");
    }

    if (schema === null || res.status === 204) return undefined as T;
    return schema.parse(await res.json());
  }

  return {
    async list(query: ListNotesQuery = {}): Promise<NoteSummary[]> {
      const qs = query.q ? `?${new URLSearchParams({ q: query.q })}` : "";
      const data = await request(routes.notes + qs, { method: "GET" }, listNotesResponseSchema);
      return data.notes;
    },
    get(id: string, init: RequestInit = {}): Promise<Note> {
      return request(routes.note(id), { ...init, method: "GET" }, noteSchema);
    },
    create(input: CreateNoteInput = {}): Promise<Note> {
      return request(
        routes.notes,
        { method: "POST", body: JSON.stringify(input) },
        noteSchema,
      );
    },
    update(id: string, input: UpdateNoteInput): Promise<Note> {
      return request(
        routes.note(id),
        { method: "PATCH", body: JSON.stringify(input) },
        noteSchema,
      );
    },
    remove(id: string): Promise<void> {
      return request(routes.note(id), { method: "DELETE" }, null);
    },
  };
}

export type NotesClient = ReturnType<typeof createNotesClient>;
