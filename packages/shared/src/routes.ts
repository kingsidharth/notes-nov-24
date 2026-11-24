/** Single source of truth for API paths, shared by server and clients. */
export const API_PREFIX = "/api";

export const routes = {
  health: `${API_PREFIX}/health`,
  notes: `${API_PREFIX}/notes`,
  note: (id: string) => `${API_PREFIX}/notes/${encodeURIComponent(id)}`,
} as const;
