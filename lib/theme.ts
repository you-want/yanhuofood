export type ThemeName = "modern" | "yanhuo" | "song" | "celadon";

const STORAGE_KEY = "yanhuofood.theme";

export const THEMES: { id: ThemeName; label: string; description: string }[] = [
  { id: "modern", label: "现代", description: "翠绿 + 石灰，清爽现代" },
  { id: "yanhuo", label: "烟火", description: "朱砂红 + 宣纸白，中国风" },
  { id: "song", label: "宋韵", description: "天青 + 月白，清雅极简" },
  { id: "celadon", label: "青瓷", description: "青瓷 + 竹影，温润克制" },
];

export function getStoredTheme(): ThemeName | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "modern" || stored === "yanhuo" || stored === "song" || stored === "celadon") return stored;
  return null;
}

export function applyTheme(theme: ThemeName): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}

export function storeTheme(theme: ThemeName): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, theme);
}

export function getInitialTheme(): ThemeName {
  const stored = getStoredTheme();
  return stored ?? "modern";
}
