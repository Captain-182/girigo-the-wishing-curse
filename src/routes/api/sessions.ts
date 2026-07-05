import { createFileRoute } from "@tanstack/react-router";

// In-memory mock store — per-worker, resets on cold start. Sufficient for demo.
export type Session = {
  name: string;
  startedAt: number;
  endAt: number; // ms epoch; when paused, this represents "would-be end if resumed now"
  paused: boolean;
  pausedRemaining: number | null; // ms remaining captured at pause time
  reprieved: boolean;
  reprievedAt: number | null;
  updatedAt: number;
};

const g = globalThis as unknown as {
  __girigoSessions?: Map<string, Session>;
};
if (!g.__girigoSessions) g.__girigoSessions = new Map<string, Session>();
const store = g.__girigoSessions;

const CURSE_MS = 24 * 60 * 60 * 1000;
const ADMIN_PASSWORD = "girigo-admin"; // demo-only

const norm = (v: string) => v.trim().toLowerCase();

function serialize(s: Session) {
  return s;
}

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...(init.headers || {}),
    },
  });
}

export const Route = createFileRoute("/api/sessions")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const list = url.searchParams.get("list");
        const admin = url.searchParams.get("admin");
        if (list === "1") {
          if (admin !== ADMIN_PASSWORD) {
            return new Response("Forbidden", { status: 403 });
          }
          return json({
            sessions: Array.from(store.values()).sort(
              (a, b) => b.updatedAt - a.updatedAt,
            ),
          });
        }
        const name = url.searchParams.get("name");
        if (!name) return json({ session: null });
        const s = store.get(norm(name)) ?? null;
        return json({ session: s ? serialize(s) : null });
      },
      POST: async ({ request }) => {
        let body: Record<string, unknown> = {};
        try {
          body = await request.json();
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }
        const action = typeof body.action === "string" ? body.action : "";
        const rawName = typeof body.name === "string" ? body.name.trim() : "";
        if (!rawName || rawName.length > 128) {
          return new Response("Invalid name", { status: 400 });
        }
        const key = norm(rawName);
        const now = Date.now();
        const requireAdmin = () => {
          const p = typeof body.admin === "string" ? body.admin : "";
          return p === ADMIN_PASSWORD;
        };

        switch (action) {
          case "start": {
            const s: Session = {
              name: rawName,
              startedAt: now,
              endAt: now + CURSE_MS,
              paused: false,
              pausedRemaining: null,
              reprieved: false,
              reprievedAt: null,
              updatedAt: now,
            };
            store.set(key, s);
            return json({ ok: true, session: s });
          }
          case "register": {
            // Idempotent: register/resurrect a client-known session on the server
            // (used after cold-starts or when resuming from a URL timestamp).
            const endAt = Number(body.endAt);
            if (!Number.isFinite(endAt)) {
              return new Response("Invalid endAt", { status: 400 });
            }
            const existing = store.get(key);
            if (existing && !existing.reprieved) {
              // Server already has a live session — leave admin-modified state intact.
              return json({ ok: true, session: existing });
            }
            const s: Session = {
              name: rawName,
              startedAt: existing?.startedAt ?? now,
              endAt,
              paused: false,
              pausedRemaining: null,
              reprieved: false,
              reprievedAt: null,
              updatedAt: now,
            };
            store.set(key, s);
            return json({ ok: true, session: s });
          }
          case "reprieve": {
            const existing = store.get(key);
            const s: Session = existing
              ? { ...existing, reprieved: true, reprievedAt: now, updatedAt: now }
              : {
                  name: rawName,
                  startedAt: now,
                  endAt: now,
                  paused: false,
                  pausedRemaining: null,
                  reprieved: true,
                  reprievedAt: now,
                  updatedAt: now,
                };
            store.set(key, s);
            return json({ ok: true, session: s });
          }
          case "reset": {
            if (!requireAdmin()) return new Response("Forbidden", { status: 403 });
            store.delete(key);
            return json({ ok: true, cleared: true });
          }
          case "pause": {
            if (!requireAdmin()) return new Response("Forbidden", { status: 403 });
            const s = store.get(key);
            if (!s) return new Response("Not found", { status: 404 });
            if (s.paused) return json({ ok: true, session: s });
            const remaining = Math.max(0, s.endAt - now);
            const updated: Session = {
              ...s,
              paused: true,
              pausedRemaining: remaining,
              updatedAt: now,
            };
            store.set(key, updated);
            return json({ ok: true, session: updated });
          }
          case "resume": {
            if (!requireAdmin()) return new Response("Forbidden", { status: 403 });
            const s = store.get(key);
            if (!s) return new Response("Not found", { status: 404 });
            if (!s.paused) return json({ ok: true, session: s });
            const rem = s.pausedRemaining ?? 0;
            const updated: Session = {
              ...s,
              paused: false,
              pausedRemaining: null,
              endAt: now + rem,
              updatedAt: now,
            };
            store.set(key, updated);
            return json({ ok: true, session: updated });
          }
          case "extend": {
            if (!requireAdmin()) return new Response("Forbidden", { status: 403 });
            const delta = Number(body.deltaMs);
            if (!Number.isFinite(delta)) {
              return new Response("Invalid deltaMs", { status: 400 });
            }
            const s = store.get(key);
            if (!s) return new Response("Not found", { status: 404 });
            let updated: Session;
            if (s.paused) {
              updated = {
                ...s,
                pausedRemaining: Math.max(0, (s.pausedRemaining ?? 0) + delta),
                updatedAt: now,
              };
            } else {
              updated = {
                ...s,
                endAt: Math.max(now, s.endAt + delta),
                updatedAt: now,
              };
            }
            store.set(key, updated);
            return json({ ok: true, session: updated });
          }
          default:
            return new Response("Unknown action", { status: 400 });
        }
      },
    },
  },
});
