import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme, type ThemePreference } from "./theme-provider";

const NEXT: Record<ThemePreference, ThemePreference> = {
  system: "light",
  light: "dark",
  dark: "system",
};

const ICONS = { system: Monitor, light: Sun, dark: Moon } as const;

/** Cycles system → light → dark. */
export function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  const Icon = ICONS[preference];
  const label = `Theme: ${preference}. Switch to ${NEXT[preference]}`;
  return (
    <Button
      variant="ghost"
      size="icon-lg"
      aria-label={label}
      title={label}
      onClick={() => setPreference(NEXT[preference])}
    >
      <Icon />
    </Button>
  );
}
