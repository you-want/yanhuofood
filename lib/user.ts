import { v4 as uuidv4 } from "uuid";

// Provide a simple helper to ensure a client id.
// Pass in any existing cookie value if available; returns a stable id.
export function ensureClientId(existing?: string) {
  return existing && existing.length > 0 ? existing : uuidv4();
}