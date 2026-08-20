"use client";

import type { ProductEventName } from "@/lib/analytics/product-events";

type Primitive = string | number | boolean;

export function trackProductEvent(event: ProductEventName, properties: Record<string, Primitive> = {}) {
  fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, properties }),
    keepalive: true,
  }).catch(() => {
    // Analytics must never interrupt the product workflow.
  });
}
