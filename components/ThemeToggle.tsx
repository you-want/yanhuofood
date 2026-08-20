"use client";

import { Palette } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { THEMES } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div
      className={cn(
        "relative inline-flex items-center gap-1 rounded-xl border p-1 transition-all",
        "bg-card"
      )}
      data-theme-toggle
    >
      <Palette className="ml-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
      {THEMES.map((t) => {
        const active = theme === t.id;
        const isDanqing = t.id === "yanhuo";
        const isSong = t.id === "song";
        const isCeladon = t.id === "celadon";

        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setTheme(t.id)}
            title={t.description}
            className={cn(
              "relative rounded-lg px-3 py-1 text-xs font-medium transition-all duration-200",
              active
                ? isDanqing
                  ? "bg-[#b9322a] text-[#fdf6e9] shadow-md ring-1 ring-[#7a1812]/30"
                  : isSong
                  ? "bg-[#3a5462] text-[#f8f7f2] shadow-sm ring-1 ring-[#4a6877]/40"
                  : isCeladon
                  ? "bg-[#517966] text-[#f7faf8] shadow-sm ring-1 ring-[#6fa68c]/45"
                  : "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}
          >
            {active && isDanqing && (
              <span className="pointer-events-none absolute inset-0 rounded-lg opacity-30"
                style={{
                  backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.5' numOctaves='2'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.15'/%3E%3C/svg%3E\")",
                }}
              />
            )}
            <span className="relative">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
