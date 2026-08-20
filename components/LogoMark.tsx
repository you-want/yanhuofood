"use client";

import { cn } from "@/lib/utils";
import { useTheme } from "@/components/ThemeProvider";

export function LogoMark({ className }: { className?: string }) {
  const { theme } = useTheme();
  const isDanqing = theme === "yanhuo";
  const isCeladon = theme === "celadon";

  if (isDanqing) {
    return (
      <svg
        viewBox="0 0 64 64"
        role="img"
        aria-label="烟火食间"
        className={cn("h-9 w-9", className)}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="64" height="64" rx="12" fill="#2c2419" />
        <rect x="3" y="3" width="58" height="58" rx="10" fill="none" stroke="#c68a2e" strokeWidth="1.5" />
        <path d="M18 31c0-7.7 6.3-14 14-14s14 6.3 14 14v2H18v-2Z" fill="#f4ecd8" />
        <path d="M14 33h36v4c0 8.8-7.2 16-16 16h-4c-8.8 0-16-7.2-16-16v-4Z" fill="#c4362c" />
        <path d="M20 37h24" stroke="#2c2419" strokeWidth="3" strokeLinecap="round" opacity=".4" />
        <path d="M25 45h14" stroke="#2c2419" strokeWidth="3" strokeLinecap="round" opacity=".4" />
        <path d="M24 14c-2.3-3-1.8-5.4 1.3-7.4M32 13c-1.8-3.2-.9-5.8 2.6-7.6M40 15c-1.5-2.8-.7-5.2 2.4-7" stroke="#c68a2e" strokeWidth="3" strokeLinecap="round" />
        <circle cx="32" cy="30" r="4" fill="#2c2419" />
        <path d="M28 30c1.4-4.4 6.6-4.4 8 0" stroke="#b9322a" strokeWidth="2" strokeLinecap="round" />
        <text x="32" y="58" textAnchor="middle" fontSize="7" fontFamily="serif" fill="#c68a2e" fontWeight="bold">烟火</text>
      </svg>
    );
  }

  if (isCeladon) {
    return (
      <svg
        viewBox="0 0 64 64"
        role="img"
        aria-label="烟火食间"
        className={cn("h-9 w-9", className)}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="64" height="64" rx="12" fill="#2d4a3e" />
        <rect x="3" y="3" width="58" height="58" rx="10" fill="none" stroke="#a3c7b2" strokeWidth="1.5" />
        <path d="M18 31c0-7.7 6.3-14 14-14s14 6.3 14 14v2H18v-2Z" fill="#f7faf8" />
        <path d="M14 33h36v4c0 8.8-7.2 16-16 16h-4c-8.8 0-16-7.2-16-16v-4Z" fill="#6fa68c" />
        <path d="M20 37h24M25 45h14" stroke="#2d4a3e" strokeWidth="3" strokeLinecap="round" opacity=".4" />
        <path d="M24 14c-2.3-3-1.8-5.4 1.3-7.4M32 13c-1.8-3.2-.9-5.8 2.6-7.6M40 15c-1.5-2.8-.7-5.2 2.4-7" stroke="#a3c7b2" strokeWidth="3" strokeLinecap="round" />
        <circle cx="32" cy="30" r="4" fill="#2d4a3e" />
        <path d="M28 30c1.4-4.4 6.6-4.4 8 0" stroke="#517966" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-label="烟火食间"
      className={cn("h-9 w-9", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="64" height="64" rx="16" fill="#047857" />
      <path d="M18 31c0-7.7 6.3-14 14-14s14 6.3 14 14v2H18v-2Z" fill="#FDF7E7" />
      <path d="M14 33h36v4c0 8.8-7.2 16-16 16h-4c-8.8 0-16-7.2-16-16v-4Z" fill="#F59E0B" />
      <path d="M20 37h24" stroke="#78350F" strokeWidth="3" strokeLinecap="round" opacity=".35" />
      <path d="M25 45h14" stroke="#78350F" strokeWidth="3" strokeLinecap="round" opacity=".35" />
      <path d="M24 14c-2.3-3-1.8-5.4 1.3-7.4M32 13c-1.8-3.2-.9-5.8 2.6-7.6M40 15c-1.5-2.8-.7-5.2 2.4-7" stroke="#FBBF24" strokeWidth="3" strokeLinecap="round" />
      <circle cx="32" cy="30" r="4" fill="#047857" />
      <path d="M28 30c1.4-4.4 6.6-4.4 8 0" stroke="#064E3B" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
