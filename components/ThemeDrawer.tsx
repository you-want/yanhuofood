"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Palette, X } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { THEMES } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function ThemeDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { theme, setTheme } = useTheme();

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={() => onOpenChange(false)}
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed right-0 top-0 z-50 h-full w-80 max-w-[90vw] overflow-y-auto border-l border-border bg-card shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <Palette className="h-5 w-5 text-primary" />
                <h2 className="text-base font-semibold text-foreground">主题设置</h2>
              </div>
              <button
                type="button"
                aria-label="关闭主题设置"
                onClick={() => onOpenChange(false)}
                className="rounded-md p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <p className="text-sm text-muted-foreground">
                选择一个你喜欢的界面主题，随时可以切换。
              </p>

              <div className="space-y-3">
                {THEMES.map((t) => {
                  const active = theme === t.id;
                  const isDanqing = t.id === "yanhuo";
                  const isSong = t.id === "song";
                  const isCeladon = t.id === "celadon";

                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setTheme(t.id);
                        onOpenChange(false);
                      }}
                      className={cn(
                        "w-full rounded-md border-2 p-4 text-left transition-all",
                        active
                          ? isDanqing
                            ? "border-[#b9322a] bg-[#b9322a]/5 shadow-md"
                            : isSong
                            ? "border-[#4a6877] bg-[#4a6877]/5 shadow-md"
                            : isCeladon
                            ? "border-[#517966] bg-[#517966]/5 shadow-md"
                            : "border-primary bg-primary/5 shadow-md"
                          : "border-border hover:border-border-strong hover:bg-muted"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        {/* 主题预览缩略图 */}
                        <div
                          className={cn(
                            "flex h-12 w-12 shrink-0 items-center justify-center rounded border",
                            isDanqing
                              ? "border-[#c68a2e]/40 bg-gradient-to-br from-[#f7f0dd] to-[#ede2c8]"
                              : isSong
                              ? "border-[#4a6877]/40 bg-gradient-to-br from-[#f7f6f0] to-[#d1d3c9]"
                              : isCeladon
                              ? "border-[#6fa68c]/50 bg-gradient-to-br from-[#f7faf8] to-[#dde8df]"
                              : "border-primary/30 bg-gradient-to-br from-[#f7f5ef] to-[#e8e3d6]"
                          )}
                        >
                          {isDanqing ? (
                            <span className="text-lg font-bold text-[#b9322a]" style={{ fontFamily: "Songti SC, STSong, SimSun, serif" }}>
                              丹
                            </span>
                          ) : isSong ? (
                            <span className="text-lg font-medium text-[#3a5462]" style={{ fontFamily: "STFangsong, FangSong, STSong, serif", letterSpacing: "0.1em" }}>
                              宋
                            </span>
                          ) : isCeladon ? (
                            <span className="text-lg font-medium text-[#517966]" style={{ fontFamily: "Songti SC, STSong, SimSun, serif", letterSpacing: "0.08em" }}>
                              瓷
                            </span>
                          ) : (
                            <span className="text-lg font-bold text-primary">现</span>
                          )}
                        </div>

                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">
                              {t.label}主题
                            </span>
                            {active && (
                              <span
                                className={cn(
                                  "rounded-full px-2 py-0.5 text-[10px] font-medium",
                                  isDanqing
                                    ? "bg-[#b9322a] text-white"
                                    : isSong
                                    ? "bg-[#3a5462] text-white"
                                    : isCeladon
                                    ? "bg-[#517966] text-white"
                                    : "bg-primary text-primary-foreground"
                                )}
                              >
                                当前
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t.description}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
