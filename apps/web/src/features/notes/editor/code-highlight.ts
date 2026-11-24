import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

/**
 * CodeMirror syntax colors as CSS variables (defined in markdown-editor.css),
 * so code blocks follow the light/dark theme without rebuilding the editor.
 */
const highlightStyle = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.operatorKeyword], color: "var(--code-keyword)" },
  { tag: [t.string, t.special(t.string), t.regexp], color: "var(--code-string)" },
  { tag: [t.number, t.bool, t.null, t.atom], color: "var(--code-number)" },
  { tag: [t.comment, t.meta], color: "var(--code-comment)", fontStyle: "italic" },
  {
    tag: [t.function(t.variableName), t.function(t.propertyName), t.className, t.typeName],
    color: "var(--code-function)",
  },
  { tag: [t.propertyName, t.attributeName, t.tagName], color: "var(--code-property)" },
  { tag: t.heading, fontWeight: "600" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strong, fontWeight: "600" },
  { tag: t.link, textDecoration: "underline" },
  { tag: t.invalid, color: "var(--destructive)" },
]);

export const codeHighlightTheme = syntaxHighlighting(highlightStyle);
