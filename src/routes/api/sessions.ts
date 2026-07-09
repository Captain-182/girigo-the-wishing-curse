import { createFileRoute } from "@tanstack/react-router";

// Global session store backed by Postgres (girigo_sessions table).
// All reads/writes go through supabaseAdmin (service_role) so every worker
// instance and every device sees the same state — required for the cross-device
// admin dashboard to work correctly.
export type Session = {
  name: string;
  startedAt: number;
  endAt: number;
  paused: boolean;
  pausedRemaining: number | null;
  reprieved: boolean;
  reprievedAt: number | null;
  updatedAt: number;
};

type Row = {
  name_key: string;
  name: string;
  started_at: number;
  end_at: number;
  paused: boolean;
  paused_remaining: number | null;
  reprieved: boolean;
  reprieved_at: number | null;
  updated_at: number;
};

const CURSE_MS = 24 * 60 * 60 * 1000;
const ADMIN_PASSWORD = "girigo-admin"; // demo-only

const norm = (v: string) => v.trim().toLowerCase();

function rowToSession(r: Row): Session {
  return {
    name: r.name,
    startedAt: Number(r.started_at),
    endAt: Number(r.end_at),
    paused: r.paused,
    pausedRemaining: r.paused_remaining == null ? null : Number(r.paused_remaining),
    reprieved: r.reprieved,
    reprievedAt: r.reprieved_at == null ? null : Number(r.reprieved_at),
    updatedAt: Number(r.updated_at),
  };
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

async function getRow(key: string): Promise<Row | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("girigo_sessions")
    .select("*")
    .eq("name_key", key)
    .maybeSingle();
  if (error) throw error;
  return (data as Row | null) ?? null;
}

async function upsertRow(row: Row): Promise<Row> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("girigo_sessions")
    .upsert(row, { onConflict: "name_key" })
    .select()
    .single();
  if (error) throw error;
  return data as Row;
}

async function deleteRow(key: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("girigo_sessions")
    .delete()
    .eq("name_key", key);
  if (error) throw error;
}

async function listRows(): Promise<Row[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("girigo_sessions")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data as Row[]) ?? [];
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
          const rows = await listRows();
          return json({ sessions: rows.map(rowToSession) });
        }
        const name = url.searchParams.get("name");
        if (!name) return json({ session: null });
        const r = await getRow(norm(name));
        return json({ session: r ? rowToSession(r) : null });
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
            const row: Row = {
              name_key: key,
              name: rawName,
              started_at: now,
              end_at: now + CURSE_MS,
              paused: false,
              paused_remaining: null,
              reprieved: false,
              reprieved_at: null,
              updated_at: now,
            };
            const saved = await upsertRow(row);
            return json({ ok: true, session: rowToSession(saved) });
          }
          case "register": {
            const endAt = Number(body.endAt);
            if (!Number.isFinite(endAt)) {
              return new Response("Invalid endAt", { status: 400 });
            }
            const existing = await getRow(key);
            if (existing && !existing.reprieved) {
              // Preserve any admin modifications.
              return json({ ok: true, session: rowToSession(existing) });
            }
            const row: Row = {
              name_key: key,
              name: rawName,
              started_at: existing?.started_at ?? now,
              end_at: endAt,
              paused: false,
              paused_remaining: null,
              reprieved: false,
              reprieved_at: null,
              updated_at: now,
            };
            const saved = await upsertRow(row);
            return json({ ok: true, session: rowToSession(saved) });
          }
          case "reprieve": {
            const existing = await getRow(key);
            const row: Row = existing
              ? {
                  ...existing,
                  reprieved: true,
                  reprieved_at: now,
                  updated_at: now,
                }
              : {
                  name_key: key,
                  name: rawName,
                  started_at: now,
                  end_at: now,
                  paused: false,
                  paused_remaining: null,
                  reprieved: true,
                  reprieved_at: now,
                  updated_at: now,
                };
            const saved = await upsertRow(row);
            return json({ ok: true, session: rowToSession(saved) });
          }
          case "reset": {
            if (!requireAdmin()) return new Response("Forbidden", { status: 403 });
            await deleteRow(key);
            return json({ ok: true, cleared: true });
          }
          case "pause": {
            if (!requireAdmin()) return new Response("Forbidden", { status: 403 });
            const s = await getRow(key);
            if (!s) return new Response("Not found", { status: 404 });
            if (s.paused) return json({ ok: true, session: rowToSession(s) });
            const remaining = Math.max(0, Number(s.end_at) - now);
            const saved = await upsertRow({
              ...s,
              paused: true,
              paused_remaining: remaining,
              updated_at: now,
            });
            return json({ ok: true, session: rowToSession(saved) });
          }
          case "resume": {
            if (!requireAdmin()) return new Response("Forbidden", { status: 403 });
            const s = await getRow(key);
            if (!s) return new Response("Not found", { status: 404 });
            if (!s.paused) return json({ ok: true, session: rowToSession(s) });
            const rem = Number(s.paused_remaining ?? 0);
            const saved = await upsertRow({
              ...s,
              paused: false,
              paused_remaining: null,
              end_at: now + rem,
              updated_at: now,
            });
            return json({ ok: true, session: rowToSession(saved) });
          }
          case "extend": {
            if (!requireAdmin()) return new Response("Forbidden", { status: 403 });
            const delta = Number(body.deltaMs);
            if (!Number.isFinite(delta)) {
              return new Response("Invalid deltaMs", { status: 400 });
            }
            const s = await getRow(key);
            if (!s) return new Response("Not found", { status: 404 });
            const saved = s.paused
              ? await upsertRow({
                  ...s,
                  paused_remaining: Math.max(0, Number(s.paused_remaining ?? 0) + delta),
                  updated_at: now,
                })
              : await upsertRow({
                  ...s,
                  end_at: Math.max(now, Number(s.end_at) + delta),
                  updated_at: now,
                });
            return json({ ok: true, session: rowToSession(saved) });
          }
          default:
            return new Response("Unknown action", { status: 400 });
        }
      },
    },
  },
});
