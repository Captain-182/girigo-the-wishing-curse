import { createFileRoute } from "@tanstack/react-router";

// In-memory mock store. Note: on serverless/edge, this lives only per worker
// instance and resets on cold starts — sufficient for demoing the transfer
// mechanic, not for production persistence.
const g = globalThis as unknown as {
  __girigoReprieves?: Map<string, number>;
};
if (!g.__girigoReprieves) g.__girigoReprieves = new Map<string, number>();
const store = g.__girigoReprieves;

const normalize = (v: string) => v.trim().toLowerCase();

export const Route = createFileRoute("/api/reprieve")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const target = url.searchParams.get("target");
        if (!target) {
          return Response.json({ reprieved: false, at: null });
        }
        const at = store.get(normalize(target)) ?? null;
        return new Response(
          JSON.stringify({ reprieved: at !== null, at }),
          {
            headers: {
              "content-type": "application/json",
              "cache-control": "no-store",
            },
          },
        );
      },
      POST: async ({ request }) => {
        let body: { target?: unknown; clear?: unknown } = {};
        try {
          body = await request.json();
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }
        const target =
          typeof body.target === "string" ? body.target.trim() : "";
        if (!target || target.length > 128) {
          return new Response("Invalid target", { status: 400 });
        }
        const key = normalize(target);
        if (body.clear === true) {
          store.delete(key);
          return Response.json({ ok: true, cleared: true });
        }
        const at = Date.now();
        store.set(key, at);
        return Response.json({ ok: true, target: key, at });
      },
    },
  },
});
