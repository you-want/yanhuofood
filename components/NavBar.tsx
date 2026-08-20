"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { CalendarDays, ChevronDown, ClipboardList, CircleHelp, Home, MapPinned, MessageSquarePlus, MoreHorizontal, Palette, Settings2, Soup, Sparkles, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { LogoMark } from "@/components/LogoMark";
import { useAuth } from "@/components/AuthProvider";
import { ThemeDrawer } from "@/components/ThemeDrawer";
import { cn } from "@/lib/utils";

const primaryNavItems = [
  { href: "/", label: "总览", icon: Home },
  { href: "/today", label: "今天", icon: Sparkles },
  { href: "/nearby", label: "附近", icon: MapPinned },
  { href: "/menus", label: "菜单", icon: CalendarDays },
  { href: "/ingredients", label: "清单", icon: ClipboardList },
  { href: "/recipes", label: "食谱", icon: Soup },
];

const secondaryNavItems = [
  { href: "/model-settings", label: "模型设置", icon: Settings2 },
  { href: "/guide", label: "使用帮助", icon: CircleHelp },
  { href: "https://github.com/you-want/yanhuofood/issues", label: "问题反馈", icon: MessageSquarePlus, external: true },
  { href: "/account", label: "账户", icon: UserRound },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function NavLink({
  href,
  label,
  icon: Icon,
  pathname,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  pathname: string;
}) {
  const active = isActive(pathname, href);
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-12 min-w-[3.75rem] shrink-0 flex-col items-center justify-center gap-1 rounded-md px-2 text-[11px] font-medium text-muted-foreground transition hover:bg-card hover:text-foreground sm:h-9 sm:min-w-0 sm:flex-row sm:gap-1.5 sm:px-3 sm:text-sm sm:text-muted-foreground",
        active && "bg-primary/10 text-primary sm:bg-card sm:shadow-sm"
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span>{label}</span>
    </Link>
  );
}

function SecondaryNavMenu({
  pathname,
  user,
  onOpenTheme,
  onCloseMenu,
  mobile = false,
}: {
  pathname: string;
  user: ReturnType<typeof useAuth>["user"];
  onOpenTheme: () => void;
  onCloseMenu: () => void;
  mobile?: boolean;
}) {
  return (
    <div
      className={cn(
        "absolute right-0 top-12 z-30 min-w-44 rounded-md border border-border bg-card p-1.5 shadow-xl",
        mobile && "right-0 min-w-52"
      )}
    >
      {/* 主题设置 — 放在最上方 */}
      <button
        type="button"
        onClick={() => {
          onOpenTheme();
          onCloseMenu();
        }}
        aria-label="主题设置"
        className="flex h-10 w-full items-center gap-2 rounded px-3 text-sm leading-5 text-foreground transition hover:bg-muted"
      >
        <Palette className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>主题设置</span>
      </button>

      {secondaryNavItems.map((item) => {
        const Icon = item.icon;
        const label = item.href === "/account" && user ? "我的账户" : item.label;
        const active = !item.external && isActive(pathname, item.href);
        const className = cn(
          "flex h-10 items-center gap-2 rounded px-3 text-sm leading-5 text-foreground transition hover:bg-muted",
          active && "bg-primary/10 font-medium text-primary"
        );

        const separator = item.href === "/account" ? (
          <div className="my-1 border-t border-border" role="separator" />
        ) : null;

        if (item.external) {
          return (
            <div key={item.href}>
              {separator}
              <a
                href={item.href}
                target="_blank"
                rel="noreferrer"
                aria-label={label}
                className={className}
                onClick={onCloseMenu}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </a>
            </div>
          );
        }

        return (
          <div key={item.href}>
            {separator}
            <Link href={item.href} aria-label={label} className={className} onClick={onCloseMenu}>
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </Link>
          </div>
        );
      })}
    </div>
  );
}

export default function NavBar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [themeDrawerOpen, setThemeDrawerOpen] = useState(false);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const secondaryActive = secondaryNavItems.some((item) => isActive(pathname, item.href));

  const closeMenu = () => {
    if (detailsRef.current) {
      detailsRef.current.open = false;
    }
  };

  return (
    <>
      <nav className="sticky top-0 z-20 border-b border-border bg-card/90 backdrop-blur-xl print:hidden" aria-label="全局导航">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-3 px-3 pt-2.5 sm:flex-nowrap sm:gap-5 sm:px-6 sm:py-3 lg:px-8">
          <Link href="/" aria-label="烟火食间首页" className="flex min-w-fit items-center gap-2">
            <LogoMark className="h-8 w-8 shadow-sm sm:h-9 sm:w-9" />
            <span className="hidden sm:block">
              <span className="block text-sm font-semibold leading-4 text-foreground">烟火食间</span>
              <span className="block text-xs text-muted-foreground">AI 饮食规划</span>
            </span>
          </Link>

          <div className="order-3 -mx-3 mt-2 w-[calc(100%+1.5rem)] overflow-x-auto border-t border-border px-3 py-1 sm:order-none sm:mx-0 sm:mt-0 sm:flex sm:w-auto sm:flex-1 sm:justify-end sm:overflow-visible sm:border-0 sm:p-0">
            <div className="flex min-w-max items-center gap-1 sm:rounded-md sm:bg-secondary sm:p-1">
              {primaryNavItems.map((item) => (
                <NavLink key={item.href} href={item.href} label={item.label} icon={item.icon} pathname={pathname} />
              ))}
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2 sm:ml-0">
            <details ref={detailsRef} className="group relative">
              <summary
                aria-label="打开更多入口"
                className={cn(
                  "flex h-10 list-none cursor-pointer items-center gap-1.5 rounded px-2.5 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground sm:px-3 [&::-webkit-details-marker]:hidden",
                  secondaryActive && "bg-primary/10 text-primary"
                )}
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">更多</span>
                <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" aria-hidden="true" />
              </summary>
              <SecondaryNavMenu pathname={pathname} user={user} onOpenTheme={() => setThemeDrawerOpen(true)} onCloseMenu={closeMenu} mobile />
            </details>
          </div>
        </div>
      </nav>

      <ThemeDrawer open={themeDrawerOpen} onOpenChange={setThemeDrawerOpen} />
    </>
  );
}
