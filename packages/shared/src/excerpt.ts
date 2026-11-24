export const EXCERPT_LENGTH = 160;

/**
 * Rough markdown → plain text, good enough for list previews. Shared so the
 * server (list responses) and clients (live cache patches) agree exactly.
 */
export function toExcerpt(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>\n]+>/g, " ") // inline HTML, incl. the <br /> Milkdown writes for blank lines
    .replace(/^\s*\|?(\s*:?-+:?\s*\|)+\s*(:?-+:?\s*)?$/gm, " ") // table separator rows
    .replace(/^\s{0,3}([-*_]\s*){3,}$/gm, " ") // horizontal rules
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/\[[ xX]\]\s+/g, "")
    .replace(/\\([^\w\s])/g, "$1") // markdown escapes
    .replace(/[*_~`|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, EXCERPT_LENGTH);
}
