"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface RecipeImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  imageClassName?: string;
}

export function RecipeImage({ src, alt, className, imageClassName }: RecipeImageProps) {
  const normalizedSrc = src?.trim();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [normalizedSrc]);

  if (!normalizedSrc || failed) return null;

  return (
    <div className={cn("overflow-hidden bg-secondary", className)}>
      {/* Remote recipe images are user-provided, so a fixed Next.js host allowlist is not suitable here. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={normalizedSrc}
        alt={alt}
        loading="lazy"
        className={cn("h-full w-full object-cover", imageClassName)}
        onError={() => setFailed(true)}
      />
    </div>
  );
}
