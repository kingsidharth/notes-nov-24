import { languages } from "@codemirror/language-data";
import { CrepeBuilder } from "@milkdown/crepe/builder";
import { blockEdit } from "@milkdown/crepe/feature/block-edit";
import { codeMirror } from "@milkdown/crepe/feature/code-mirror";
import { cursor } from "@milkdown/crepe/feature/cursor";
import { imageBlock } from "@milkdown/crepe/feature/image-block";
import { linkTooltip } from "@milkdown/crepe/feature/link-tooltip";
import { listItem } from "@milkdown/crepe/feature/list-item";
import { placeholder } from "@milkdown/crepe/feature/placeholder";
import { table } from "@milkdown/crepe/feature/table";
import { toolbar } from "@milkdown/crepe/feature/toolbar";
import { editorViewCtx } from "@milkdown/kit/core";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { codeHighlightTheme } from "./code-highlight";
import "./crepe-styles.css";
import "./markdown-editor.css";

export interface MarkdownEditorHandle {
  focus: () => void;
}

export interface MarkdownEditorProps {
  /** Initial markdown. Read once on mount; remount (via `key`) to load another note. */
  defaultValue: string;
  onChange: (markdown: string) => void;
  ref?: Ref<MarkdownEditorHandle>;
}

/**
 * Crepe assembled feature by feature (CrepeBuilder) instead of `new Crepe()`,
 * so unused features — LaTeX/KaTeX, AI, the one-dark code theme — stay out of
 * the bundle. Same set and order as Crepe's defaults, minus LaTeX.
 */
function createEditor(root: HTMLElement, defaultValue: string) {
  return new CrepeBuilder({ root, defaultValue })
    .addFeature(cursor)
    .addFeature(listItem)
    .addFeature(linkTooltip)
    .addFeature(imageBlock)
    .addFeature(blockEdit)
    .addFeature(placeholder, { text: "Start writing…", mode: "doc" })
    .addFeature(toolbar)
    .addFeature(codeMirror, { languages, theme: codeHighlightTheme })
    .addFeature(table);
}

function CrepeEditor({ defaultValue, onChange, ref }: MarkdownEditorProps) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Uncontrolled by design: the editor owns the document after mount (empty deps).
  const { get } = useEditor(
    (root) =>
      createEditor(root, defaultValue).on((listener) => {
        listener.markdownUpdated((_ctx, markdown, prevMarkdown) => {
          if (markdown !== prevMarkdown) onChangeRef.current(markdown);
        });
      }),
    [],
  );

  useImperativeHandle(
    ref,
    () => ({
      focus: () => get()?.action((ctx) => ctx.get(editorViewCtx).focus()),
    }),
    [get],
  );

  return <Milkdown />;
}

/** Live-preview markdown editor (Milkdown Crepe). Lazy-loaded: it's the heaviest chunk. */
export default function MarkdownEditor(props: MarkdownEditorProps) {
  return (
    <MilkdownProvider>
      <CrepeEditor {...props} />
    </MilkdownProvider>
  );
}
