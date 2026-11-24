import { NOTE_TITLE_MAX } from "@notes/shared";

interface NoteTitleInputProps {
  value: string;
  onChange: (title: string) => void;
  onSubmit: () => void;
  autoFocus: boolean;
}

export function NoteTitleInput({ value, onChange, onSubmit, autoFocus }: NoteTitleInputProps) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.nativeEvent.isComposing) {
          event.preventDefault();
          onSubmit();
        }
      }}
      autoFocus={autoFocus}
      maxLength={NOTE_TITLE_MAX}
      placeholder="Untitled"
      aria-label="Note title"
      enterKeyHint="next"
      className="w-full bg-transparent py-2 text-2xl font-medium tracking-headline md:text-4xl outline-none placeholder:text-muted-foreground/50"
    />
  );
}
