import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";

export const Route = createFileRoute("/")({
  component: Girigo,
});

type Stage = "landing" | "ritual" | "transmitting" | "granted" | "curse" | "prayer";
const NAME_KEY = "girigo:name";
const ADMIN_PASSWORD = "girigo-admin";
const CURSE_MS = 24 * 60 * 60 * 1000;

type Session = {
  name: string;
  startedAt: number;
  endAt: number;
  paused: boolean;
  pausedRemaining: number | null;
  reprieved: boolean;
  reprievedAt: number | null;
  updatedAt: number;
};

function getPassedFrom(): string | null {
  if (typeof window === "undefined") return null;
  const p = new URLSearchParams(window.location.search);
  const v = p.get("passedFrom");
  return v ? v.trim() : null;
}

function getUserParam(): string | null {
  if (typeof window === "undefined") return null;
  const p = new URLSearchParams(window.location.search);
  const v = p.get("user");
  return v ? v.trim() : null;
}

function setUserParam(name: string) {
  if (typeof window === "undefined") return;
  try {
    const u = new URL(window.location.href);
    u.searchParams.set("user", name);
    u.searchParams.delete("passedFrom");
    window.history.replaceState({}, "", u.toString());
  } catch {
    /* noop */
  }
}

function clearUserParam() {
  if (typeof window === "undefined") return;
  try {
    const u = new URL(window.location.href);
    u.searchParams.delete("user");
    window.history.replaceState({}, "", u.toString());
  } catch {
    /* noop */
  }
}

async function apiGetSession(name: string): Promise<Session | null> {
  try {
    const res = await fetch(`/api/sessions?name=${encodeURIComponent(name)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { session: Session | null };
    return json.session;
  } catch {
    return null;
  }
}

async function apiPost(body: Record<string, unknown>) {
  try {
    await fetch("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    });
  } catch {
    /* noop */
  }
}

function sessionRemaining(s: Session): number {
  if (s.reprieved) return 0;
  if (s.paused) return Math.max(0, s.pausedRemaining ?? 0);
  return Math.max(0, s.endAt - Date.now());
}

function sessionActive(s: Session): boolean {
  if (s.reprieved) return false;
  return sessionRemaining(s) > 0 || s.paused;
}

function Girigo() {
  const [stage, setStage] = useState<Stage>("landing");
  const [name, setName] = useState("");
  const [birth, setBirth] = useState("");
  const [booted, setBooted] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);

  // On mount: hydrate from server (source of truth)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const storedName = localStorage.getItem(NAME_KEY);
      if (!storedName) {
        if (!cancelled) setBooted(true);
        return;
      }
      const s = await apiGetSession(storedName);
      if (cancelled) return;
      if (s && sessionActive(s)) {
        setName(storedName);
        setStage("curse");
      } else {
        // stale/expired
        localStorage.removeItem(NAME_KEY);
      }
      setBooted(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!booted) {
    return (
      <main className="relative min-h-screen bg-background text-foreground">
        <div className="pointer-events-none absolute inset-0 noise opacity-40" />
        <div className="pointer-events-none absolute inset-0 scanlines opacity-30" />
        <div className="flex min-h-screen items-center justify-center">
          <div className="font-display text-xs tracking-[0.6em] text-muted-foreground animate-flicker">
            SUMMONING…
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 noise opacity-40" />
      <div className="pointer-events-none absolute inset-0 scanlines opacity-30" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, oklch(0.55 0.25 27 / 0.12), transparent 60%), radial-gradient(ellipse at 50% 100%, oklch(0.55 0.25 27 / 0.08), transparent 60%)",
        }}
      />
      <BrandMark onSecret={() => setAdminOpen(true)} />

      {stage === "landing" && (
        <Landing
          name={name}
          birth={birth}
          setName={setName}
          setBirth={setBirth}
          onSubmit={() => setStage("ritual")}
        />
      )}
      {stage === "ritual" && (
        <Ritual onRecorded={() => setStage("transmitting")} />
      )}
      {stage === "transmitting" && (
        <Transmitting onDone={() => setStage("granted")} />
      )}
      {stage === "granted" && (
        <Granted
          onContinue={async () => {
            const from = getPassedFrom();
            if (from) {
              await apiPost({ action: "reprieve", name: from });
              try {
                const u = new URL(window.location.href);
                u.searchParams.delete("passedFrom");
                window.history.replaceState({}, "", u.toString());
              } catch {
                /* noop */
              }
            }
            const own = (name || "anonymous").trim();
            localStorage.setItem(NAME_KEY, own);
            await apiPost({ action: "start", name: own });
            setStage("curse");
          }}
        />
      )}
      {stage === "curse" && (
        <Curse
          name={name}
          onReset={() => {
            localStorage.removeItem(NAME_KEY);
            setName("");
            setBirth("");
            setStage("landing");
          }}
          onExpired={() => setStage("prayer")}
        />
      )}
      {stage === "prayer" && (
        <Prayer
          onDone={() => {
            localStorage.removeItem(NAME_KEY);
            setName("");
            setBirth("");
            setStage("landing");
          }}
        />
      )}

      {adminOpen && <AdminPanel onClose={() => setAdminOpen(false)} />}
    </main>
  );
}

/* ---------------- BRAND / SECRET TRIGGER ---------------- */
function BrandMark({ onSecret }: { onSecret: () => void }) {
  const tapsRef = useRef<number[]>([]);
  const handleTap = () => {
    const now = Date.now();
    tapsRef.current = tapsRef.current.filter((t) => now - t < 3000);
    tapsRef.current.push(now);
    if (tapsRef.current.length >= 5) {
      tapsRef.current = [];
      onSecret();
    }
  };
  return (
    <button
      type="button"
      onClick={handleTap}
      className="absolute left-1/2 top-6 z-20 -translate-x-1/2 select-none text-center"
      aria-label="Girigo"
    >
      <div className="font-display text-xs tracking-[0.6em] text-muted-foreground animate-flicker">
        GIRIGO
      </div>
      <div className="mt-1 font-display text-[10px] tracking-[0.4em] text-primary/70">
        기리고
      </div>
    </button>
  );
}

/* ---------------- LANDING ---------------- */
function Landing({
  name,
  birth,
  setName,
  setBirth,
  onSubmit,
}: {
  name: string;
  birth: string;
  setName: (v: string) => void;
  setBirth: (v: string) => void;
  onSubmit: () => void;
}) {
  const valid = name.trim().length > 1 && /^\d{4}-\d{2}-\d{2}$/.test(birth);
  return (
    <section className="relative z-10 mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-6 py-20 animate-fade-up">
      <PrayingHands />
      <h1 className="mt-8 text-center font-display text-2xl font-semibold tracking-[0.35em] text-glow-ghost">
        IF WISHES
        <br />
        COULD KILL
      </h1>
      <p className="mt-4 max-w-xs text-center text-xs leading-relaxed tracking-widest text-muted-foreground">
        Speak your name into the void.
        <br />
        The ritual requires an offering.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onSubmit();
        }}
        className="mt-10 w-full space-y-4"
      >
        <Field
          label="FULL NAME"
          value={name}
          onChange={setName}
          placeholder="Your true name"
        />
        <Field
          label="BIRTHDATE"
          value={birth}
          onChange={setBirth}
          placeholder="YYYY-MM-DD"
          mono
          type="date"
        />

        <button
          type="submit"
          disabled={!valid}
          className="btn-ominous mt-8 w-full py-4 font-display text-xs tracking-[0.5em] disabled:cursor-not-allowed disabled:opacity-40"
        >
          INSCRIBE RITUAL
        </button>
      </form>

      <p className="mt-10 max-w-xs text-center text-[10px] tracking-[0.3em] text-muted-foreground/60">
        BY PROCEEDING, YOU CONSENT TO BE BOUND.
      </p>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  mono,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[10px] tracking-[0.4em] text-muted-foreground">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={
          "w-full border-b border-border bg-transparent py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary " +
          (mono ? "font-mono tracking-widest" : "tracking-wider")
        }
      />
    </label>
  );
}

function PrayingHands() {
  const grid = [
    "..........XX..XX..........",
    ".........XWWXXWWX.........",
    "........XWWWXXWWWX........",
    "........XWWWXXWWWX........",
    "........XWWWXXWWWX........",
    ".......XWWWWXXWWWWX.......",
    ".......XWWWWXXWWWWX.......",
    "......XWWWWWXXWWWWWX......",
    "......XWWWWWXXWWWWWX......",
    ".....XWWWWWWXXWWWWWWX.....",
    ".....XWWWWWWXXWWWWWWX.....",
    "....XWWWWWWWXXWWWWWWWX....",
    "....XWWWWWWWXXWWWWWWWX....",
    "...XWWWWWWWWXXWWWWWWWWX...",
    "...XWWWWWWWWXXWWWWWWWWX...",
    "..XWWWWWWWWWXXWWWWWWWWWX..",
    "..XWWWWWWWWWXXWWWWWWWWWX..",
    "..XWWWWWWWWWXXWWWWWWWWWX..",
    "..XRWWWWWWWWXXWWWWWWWWRX..",
    "...XRWWWWWWWXXWWWWWWWRX...",
    "....XRRWWWWWXXWWWWWRRX....",
    ".....XRRRWWWWWWWWRRRX.....",
    "......XRRRRRRRRRRRRX......",
    ".......XXXXXXXXXXXX.......",
  ];
  const size = 6;
  return (
    <div className="animate-hand-pulse">
      <svg
        width={grid[0].length * size}
        height={grid.length * size}
        viewBox={`0 0 ${grid[0].length * size} ${grid.length * size}`}
        style={{ imageRendering: "pixelated" }}
      >
        {grid.map((row, y) =>
          row.split("").map((c, x) => {
            if (c === ".") return null;
            const fill =
              c === "W"
                ? "oklch(0.98 0 0)"
                : c === "R"
                  ? "oklch(0.55 0.25 27)"
                  : "oklch(0.15 0 0)";
            return (
              <rect
                key={`${x}-${y}`}
                x={x * size}
                y={y * size}
                width={size}
                height={size}
                fill={fill}
              />
            );
          }),
        )}
      </svg>
    </div>
  );
}

/* ---------------- RITUAL (fully simulated, no camera access) ---------------- */
function Ritual({ onRecorded }: { onRecorded: () => void }) {
  const [recording, setRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const RECORD_MS = 5000;

  useEffect(() => {
    if (!recording) return;
    const start = Date.now();
    const id = setInterval(() => {
      const p = Math.min(1, (Date.now() - start) / RECORD_MS);
      setProgress(p);
      if (p >= 1) {
        clearInterval(id);
        setRecording(false);
        onRecorded();
      }
    }, 33);
    return () => clearInterval(id);
  }, [recording, onRecorded]);

  return (
    <section className="relative z-10 mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-6 py-20 animate-fade-up">
      <div className="mb-6 text-center">
        <div className="text-[10px] tracking-[0.5em] text-primary/80">
          STEP 02
        </div>
        <h2 className="mt-2 font-display text-lg tracking-[0.35em] text-glow-ghost">
          RECORD YOUR WISH
        </h2>
      </div>

      <div className="relative aspect-[3/4] w-full overflow-hidden border border-border bg-black">
        <SimulatedFeed />

        <div className="pointer-events-none absolute inset-0">
          <Corner className="left-3 top-3" />
          <Corner className="right-3 top-3 rotate-90" />
          <Corner className="right-3 bottom-3 rotate-180" />
          <Corner className="left-3 bottom-3 -rotate-90" />

          <div className="absolute inset-x-0 top-3 flex items-center justify-between px-4 font-mono text-[10px] tracking-widest text-primary/80">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse-blood" />
              {recording ? "REC" : "RECORDING"}
            </span>
            <span>GIRIGO-CH01</span>
          </div>

          <div className="absolute inset-0 scanlines opacity-40" />
          <div
            className="absolute inset-x-0 h-16 animate-scan"
            style={{
              background:
                "linear-gradient(180deg, transparent, oklch(0.98 0 0 / 0.08), transparent)",
            }}
          />

          <div className="absolute inset-x-0 bottom-3 px-4 font-mono text-[10px] tracking-widest text-primary/70">
            <div className="flex justify-between">
              <span>
                ◉ 0{Math.floor(progress * 5)}:0
                {Math.floor((progress * 30) % 60).toString().padStart(2, "0")}
              </span>
              <span>SIGNAL LOCKED</span>
            </div>
            <div className="mt-2 h-[2px] w-full bg-border">
              <div
                className="h-full bg-primary transition-[width] duration-75"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>

          <div className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 border border-primary/40">
            <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 bg-primary" />
          </div>
        </div>
      </div>

      <button
        onClick={() => !recording && setRecording(true)}
        disabled={recording}
        className="btn-ominous mt-8 w-full py-4 font-display text-xs tracking-[0.5em]"
      >
        {recording ? "TRANSMITTING…" : "RECORD 5-SECOND WISH"}
      </button>
      <p className="mt-4 text-center text-[10px] tracking-[0.3em] text-muted-foreground/60">
        SPEAK CLEARLY. IT IS LISTENING.
      </p>
    </section>
  );
}

function Corner({ className = "" }: { className?: string }) {
  return (
    <div
      className={"absolute h-5 w-5 " + className}
      style={{
        borderTop: "1px solid oklch(0.55 0.25 27 / 0.8)",
        borderLeft: "1px solid oklch(0.55 0.25 27 / 0.8)",
      }}
    />
  );
}

function SimulatedFeed() {
  // Canvas-based animated static noise + moving vignette so it *looks* like a live feed
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const W = (c.width = 160);
    const H = (c.height = 213);
    let raf = 0;
    const draw = () => {
      const img = ctx.createImageData(W, H);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = 20 + Math.random() * 60;
        d[i] = v;
        d[i + 1] = v * 0.6;
        d[i + 2] = v * 0.55;
        d[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      // dark vignette
      const grd = ctx.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, 140);
      grd.addColorStop(0, "rgba(0,0,0,0)");
      grd.addColorStop(1, "rgba(0,0,0,0.75)");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, W, H);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ filter: "blur(1px) contrast(1.1)" }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center opacity-70">
          <div className="mx-auto h-16 w-16 rounded-full border border-primary/40 animate-pulse-blood" />
          <div className="mt-4 font-mono text-[10px] tracking-[0.4em] text-muted-foreground">
            BACKGROUND CAPTURE
          </div>
          <div className="mt-1 font-mono text-[10px] tracking-[0.3em] text-primary/70 animate-flicker">
            SUBJECT ACQUIRED
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------------- TRANSMITTING ---------------- */
function Transmitting({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <section className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6">
      <div className="relative flex h-64 w-64 items-center justify-center">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="absolute h-full w-full rounded-full border border-primary"
            style={{
              animation: `ring-expand 2.4s ease-out ${i * 0.8}s infinite`,
            }}
          />
        ))}
        <span className="absolute h-6 w-6 rounded-full bg-primary animate-pulse-blood" />
      </div>
      <div className="mt-16 font-display text-sm tracking-[0.6em] text-glow-ghost animate-flicker">
        TRANSMITTING
      </div>
      <div className="mt-2 font-mono text-[10px] tracking-[0.4em] text-muted-foreground">
        BINDING SIGNAL TO SOUL
      </div>
    </section>
  );
}

/* ---------------- GRANTED ---------------- */
function Granted({ onContinue }: { onContinue: () => void }) {
  useEffect(() => {
    const t = setTimeout(onContinue, 2200);
    return () => clearTimeout(t);
  }, [onContinue]);
  return (
    <section className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 animate-fade-up">
      <div className="font-display text-4xl tracking-[0.35em] text-glow-blood animate-glitch">
        WISH GRANTED.
      </div>
      <div className="mt-6 font-mono text-[10px] tracking-[0.4em] text-muted-foreground">
        THE DEBT HAS BEEN RECORDED
      </div>
    </section>
  );
}

/* ---------------- CURSE COUNTDOWN ---------------- */
type CursePhase = "countdown" | "passing" | "transferred";

function Curse({
  name,
  onReset,
  onExpired,
}: {
  name: string;
  onReset: () => void;
  onExpired: () => void;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [tick, setTick] = useState(0);
  const [phase, setPhase] = useState<CursePhase>("countdown");
  const [copied, setCopied] = useState(false);
  const target = (name || "anonymous").trim();
  const expiredFiredRef = useRef(false);

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${window.location.pathname}?passedFrom=${encodeURIComponent(
          target,
        )}`
      : "";

  // Poll server for authoritative session state
  useEffect(() => {
    if (phase === "transferred") return;
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      const s = await apiGetSession(target);
      if (cancelled) return;
      setSession(s);
      if (s?.reprieved) {
        completeTransfer();
      }
    };
    void poll();
    const id = window.setInterval(poll, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, phase]);

  // Local tick for smooth display between polls
  useEffect(() => {
    if (phase === "transferred") return;
    if (session?.paused) return; // frozen when paused
    let raf: number;
    const loop = () => {
      setTick((t) => t + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, session?.paused]);

  // Heartbeat audio
  useEffect(() => {
    if (phase === "transferred") return;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    ctx.resume().catch(() => {});
    const master = ctx.createGain();
    master.gain.value = phase === "passing" ? 0.5 : 0.35;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 220;
    master.connect(filter).connect(ctx.destination);

    const thump = (when: number, freq: number, dur: number, vol: number) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.setValueAtTime(freq * 2, when);
      osc.frequency.exponentialRampToValueAtTime(freq, when + 0.05);
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(vol, when + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      osc.connect(g).connect(master);
      osc.start(when);
      osc.stop(when + dur + 0.05);
    };

    let stopped = false;
    const interval = phase === "passing" ? 460 : 1100;
    const gap = phase === "passing" ? 0.12 : 0.22;
    const schedule = () => {
      if (stopped) return;
      const t = ctx.currentTime;
      thump(t, 55, 0.18, 0.9);
      thump(t + gap, 48, 0.22, 0.7);
      setTimeout(schedule, interval);
    };
    schedule();
    return () => {
      stopped = true;
      ctx.close().catch(() => {});
    };
  }, [phase]);

  const playStatic = () => {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const dur = 1.2;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const decay = 1 - i / data.length;
      data[i] = (Math.random() * 2 - 1) * decay;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    g.gain.value = 0.4;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 800;
    src.connect(hp).connect(g).connect(ctx.destination);
    src.start();
    src.onended = () => ctx.close().catch(() => {});
  };

  const openPassing = async () => {
    setPhase("passing");
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const completeTransfer = useCallback(() => {
    if (phase === "transferred") return;
    playStatic();
    setPhase("transferred");
    void apiPost({ action: "reprieve", name: target });
    setTimeout(() => {
      localStorage.removeItem(NAME_KEY);
      onReset();
    }, 3200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, target, onReset]);

  const remaining = session ? sessionRemaining(session) : 0;
  const paused = !!session?.paused;

  // Fire zero-hit exactly once (only after we have a session and it's not paused)
  useEffect(() => {
    if (!session || paused) return;
    if (phase !== "countdown") return;
    if (remaining <= 0 && !expiredFiredRef.current) {
      expiredFiredRef.current = true;
      onExpired();
    }
  }, [session, paused, remaining, phase, onExpired]);

  const hh = Math.floor(remaining / 3600000);
  const mm = Math.floor((remaining % 3600000) / 60000);
  const ss = Math.floor((remaining % 60000) / 1000);
  const ms = Math.floor((remaining % 1000) / 10);
  // reference tick so react re-renders even when session doesn't change
  void tick;

  return (
    <section className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 animate-fade-up">
      <div className="mb-8 text-center">
        <div className="text-[10px] tracking-[0.6em] text-primary/80 animate-flicker">
          THE CURSE IS BOUND
        </div>
        <div className="mt-3 font-display text-sm tracking-[0.4em] text-muted-foreground">
          {paused ? "TIME SUSPENDED" : "TIME UNTIL DESCENT"}
        </div>
      </div>

      <div className="relative w-full max-w-2xl">
        <div
          className="absolute inset-0 -z-10 blur-3xl"
          style={{
            background:
              "radial-gradient(circle, oklch(0.55 0.25 27 / 0.35), transparent 70%)",
          }}
        />
        <div
          className={
            "flex items-baseline justify-center gap-1 font-mono font-bold tabular-nums text-glow-blood " +
            (paused ? "opacity-60" : "")
          }
        >
          <TimeBlock v={hh} />
          <Colon />
          <TimeBlock v={mm} />
          <Colon />
          <TimeBlock v={ss} />
          <Colon small />
          <TimeBlock v={ms} small />
        </div>
        <div className="mt-3 flex justify-center gap-8 font-mono text-[10px] tracking-[0.4em] text-muted-foreground">
          <span>HH</span>
          <span>MM</span>
          <span>SS</span>
          <span>MS</span>
        </div>
      </div>

      {paused && (
        <div className="mt-8 font-mono text-[11px] tracking-[0.4em] text-primary/80 animate-flicker">
          ▍▍ FROZEN BY UNSEEN HAND ▍▍
        </div>
      )}

      <div className="mt-16 max-w-md border-t border-border pt-6 text-center">
        <p className="text-[11px] leading-relaxed tracking-[0.25em] text-muted-foreground">
          TO HALT THE DESCENT, THE RITUAL
          <br />
          MUST BE PASSED. CONVINCE ANOTHER
          <br />
          TO RECORD THEIR DESIRES.
        </p>
        <button
          onClick={openPassing}
          className="btn-ominous mt-6 px-8 py-3 font-display text-[10px] tracking-[0.5em]"
        >
          PASS THE RITUAL
        </button>
      </div>

      {phase === "passing" && (
        <PassingModal
          url={shareUrl}
          copied={copied}
          onCopy={async () => {
            try {
              await navigator.clipboard.writeText(shareUrl);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
          onClose={() => setPhase("countdown")}
          onSimulate={completeTransfer}
        />
      )}

      {phase === "transferred" && <TransferFlash />}
    </section>
  );
}

function PassingModal({
  url,
  copied,
  onCopy,
  onClose,
  onSimulate,
}: {
  url: string;
  copied: boolean;
  onCopy: () => void;
  onClose: () => void;
  onSimulate: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center">
      <div className="scanlines relative w-full max-w-md animate-fade-up border border-primary/40 bg-[oklch(0.06_0_0)] p-6 shadow-[0_0_60px_oklch(0.55_0.25_27/0.4)]">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 font-mono text-[10px] tracking-widest text-muted-foreground hover:text-primary"
          aria-label="Close"
        >
          [ X ]
        </button>

        <div className="text-[10px] tracking-[0.5em] text-primary/80 animate-flicker">
          ◉ SIGNAL LOCK ACQUIRED
        </div>
        <h3 className="mt-3 font-display text-base leading-relaxed tracking-[0.25em] text-glow-ghost">
          THE LINK HAS BEEN
          <br />
          GEOLOCATED.
        </h3>
        <p className="mt-3 text-[11px] leading-relaxed tracking-[0.2em] text-muted-foreground">
          COPY AND TRANSMIT TO AN UNWITTING SOUL.
        </p>

        <div className="mt-5 flex items-center gap-2 border border-border bg-black/60 p-2">
          <span className="truncate font-mono text-[10px] text-primary/80">
            {url}
          </span>
          <button
            onClick={onCopy}
            className="ml-auto shrink-0 border border-primary/60 px-3 py-1 font-mono text-[9px] tracking-widest text-primary hover:bg-primary/10"
          >
            {copied ? "COPIED" : "COPY"}
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <ShareBtn
            label="WHATSAPP"
            onClick={() =>
              window.open(
                `https://wa.me/?text=${encodeURIComponent(url)}`,
                "_blank",
              )
            }
          />
          <ShareBtn
            label="DISCORD"
            onClick={() => {
              navigator.clipboard.writeText(url).catch(() => {});
              window.open("https://discord.com/channels/@me", "_blank");
            }}
          />
        </div>

        <div className="mt-6 border-t border-border pt-4 text-center">
          <button
            onClick={onSimulate}
            className="font-mono text-[9px] tracking-[0.35em] text-muted-foreground/40 underline-offset-4 hover:text-primary/70 hover:underline"
          >
            simulate friend accepting curse
          </button>
        </div>
      </div>
    </div>
  );
}

function ShareBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="border border-border bg-black/40 py-3 font-display text-[10px] tracking-[0.35em] text-muted-foreground hover:border-primary/60 hover:text-primary"
    >
      {label}
    </button>
  );
}

function TransferFlash() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black">
      <div
        className="absolute inset-0 animate-flash-red"
        style={{ background: "oklch(0.55 0.25 27)" }}
      />
      <div className="relative z-10 text-center">
        <div className="font-display text-3xl tracking-[0.4em] text-glow-blood animate-glitch">
          REPRIEVE GRANTED.
        </div>
        <div className="mt-6 max-w-xs font-mono text-[11px] leading-relaxed tracking-[0.3em] text-muted-foreground">
          THE BURDEN BELONGS TO ANOTHER NOW.
        </div>
      </div>
    </div>
  );
}

/* ---------------- PRAYER (countdown reached zero) ---------------- */
function Prayer({ onDone }: { onDone: () => void }) {
  return (
    <section className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 animate-fade-up">
      <div
        className="pointer-events-none absolute inset-0 -z-10 blur-3xl"
        style={{
          background:
            "radial-gradient(circle at 50% 40%, oklch(0.98 0 0 / 0.15), transparent 60%)",
        }}
      />
      <PrayingHands />
      <h2 className="mt-10 max-w-md text-center font-display text-2xl leading-relaxed tracking-[0.2em] text-glow-ghost">
        Allah saved you,
        <br />
        go pray 2 nafl as thanks.
      </h2>
      <p className="mt-8 font-mono text-[10px] tracking-[0.4em] text-muted-foreground">
        الحمد لله
      </p>
      <button
        onClick={onDone}
        className="btn-ominous mt-16 px-10 py-3 font-display text-[10px] tracking-[0.5em]"
      >
        RETURN
      </button>
    </section>
  );
}

function TimeBlock({ v, small }: { v: number; small?: boolean }) {
  const str = v.toString().padStart(2, "0");
  return (
    <span
      className={
        small ? "text-4xl md:text-5xl text-primary/80" : "text-6xl md:text-8xl"
      }
    >
      {str}
    </span>
  );
}
function Colon({ small }: { small?: boolean }) {
  return (
    <span
      className={
        "animate-flicker text-primary " +
        (small ? "text-3xl md:text-4xl" : "text-5xl md:text-7xl")
      }
    >
      :
    </span>
  );
}

/* ---------------- ADMIN PANEL ---------------- */
function AdminPanel({ onClose }: { onClose: () => void }) {
  const [pw, setPw] = useState("");
  const [authed, setAuthed] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!authed) return;
    try {
      const res = await fetch(
        `/api/sessions?list=1&admin=${encodeURIComponent(pw)}`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const json = (await res.json()) as { sessions: Session[] };
      setSessions(json.sessions);
    } catch {
      /* noop */
    }
  }, [authed, pw]);

  useEffect(() => {
    if (!authed) return;
    void refresh();
    const id = window.setInterval(refresh, 2500);
    return () => window.clearInterval(id);
  }, [authed, refresh]);

  const act = async (
    name: string,
    action: string,
    extra: Record<string, unknown> = {},
  ) => {
    setBusy(`${name}:${action}`);
    try {
      await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, name, admin: pw, ...extra }),
      });
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/90 p-4 backdrop-blur-md">
      <div className="scanlines relative my-8 w-full max-w-2xl border border-primary/40 bg-[oklch(0.05_0_0)] p-6 shadow-[0_0_60px_oklch(0.55_0.25_27/0.3)]">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 font-mono text-[10px] tracking-widest text-muted-foreground hover:text-primary"
        >
          [ X ]
        </button>
        <div className="text-[10px] tracking-[0.5em] text-primary/80 animate-flicker">
          ◉ RESTRICTED ACCESS
        </div>
        <h3 className="mt-2 font-display text-lg tracking-[0.3em] text-glow-ghost">
          ADMIN CONTROL
        </h3>

        {!authed ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (pw === ADMIN_PASSWORD) {
                setAuthed(true);
                setError("");
              } else {
                setError("DENIED");
              }
            }}
            className="mt-8 space-y-4"
          >
            <label className="block">
              <span className="mb-2 block text-[10px] tracking-[0.4em] text-muted-foreground">
                PASSWORD
              </span>
              <input
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                autoFocus
                className="w-full border-b border-border bg-transparent py-3 font-mono tracking-widest outline-none focus:border-primary"
              />
            </label>
            {error && (
              <div className="font-mono text-[10px] tracking-[0.4em] text-primary">
                {error}
              </div>
            )}
            <button
              type="submit"
              className="btn-ominous w-full py-3 font-display text-xs tracking-[0.5em]"
            >
              ENTER
            </button>
          </form>
        ) : (
          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between font-mono text-[10px] tracking-[0.35em] text-muted-foreground">
              <span>ACTIVE SESSIONS ({sessions.length})</span>
              <button
                onClick={() => void refresh()}
                className="text-primary/70 hover:text-primary"
              >
                REFRESH
              </button>
            </div>
            {sessions.length === 0 && (
              <div className="border border-border/60 p-6 text-center font-mono text-[10px] tracking-[0.3em] text-muted-foreground/70">
                NO SOULS BOUND
              </div>
            )}
            <ul className="space-y-3">
              {sessions.map((s) => (
                <SessionRow
                  key={s.name}
                  s={s}
                  busy={busy}
                  onPause={() => act(s.name, "pause")}
                  onResume={() => act(s.name, "resume")}
                  onExtend={(deltaMs) =>
                    act(s.name, "extend", { deltaMs })
                  }
                  onReprieve={() => act(s.name, "reprieve")}
                  onReset={() => act(s.name, "reset")}
                />
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function SessionRow({
  s,
  busy,
  onPause,
  onResume,
  onExtend,
  onReprieve,
  onReset,
}: {
  s: Session;
  busy: string | null;
  onPause: () => void;
  onResume: () => void;
  onExtend: (deltaMs: number) => void;
  onReprieve: () => void;
  onReset: () => void;
}) {
  const rem = sessionRemaining(s);
  const hh = Math.floor(rem / 3600000);
  const mm = Math.floor((rem % 3600000) / 60000);
  const ss = Math.floor((rem % 60000) / 1000);
  const status = s.reprieved
    ? "REPRIEVED"
    : s.paused
      ? "PAUSED"
      : rem <= 0
        ? "EXPIRED"
        : "ACTIVE";
  const isBusy = (a: string) => busy === `${s.name}:${a}`;
  return (
    <li className="border border-border/60 bg-black/40 p-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0 truncate font-display text-sm tracking-[0.2em] text-glow-ghost">
          {s.name}
        </div>
        <div
          className={
            "shrink-0 font-mono text-[9px] tracking-[0.4em] " +
            (status === "ACTIVE"
              ? "text-primary"
              : status === "PAUSED"
                ? "text-yellow-400"
                : status === "REPRIEVED"
                  ? "text-emerald-400"
                  : "text-muted-foreground")
          }
        >
          {status}
        </div>
      </div>
      <div className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
        {hh.toString().padStart(2, "0")}:
        {mm.toString().padStart(2, "0")}:
        {ss.toString().padStart(2, "0")}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {s.paused ? (
          <AdminBtn onClick={onResume} loading={isBusy("resume")}>
            RESUME
          </AdminBtn>
        ) : (
          <AdminBtn
            onClick={onPause}
            loading={isBusy("pause")}
            disabled={s.reprieved || rem <= 0}
          >
            PAUSE
          </AdminBtn>
        )}
        <AdminBtn
          onClick={() => onExtend(60 * 60 * 1000)}
          loading={isBusy("extend")}
        >
          +1H
        </AdminBtn>
        <AdminBtn
          onClick={() => onExtend(-60 * 60 * 1000)}
          loading={isBusy("extend")}
        >
          −1H
        </AdminBtn>
        <AdminBtn
          onClick={() => {
            const raw = window.prompt("Modify hours (e.g. 2 or -0.5)", "1");
            if (raw == null) return;
            const n = Number(raw);
            if (!Number.isFinite(n)) return;
            onExtend(Math.round(n * 60 * 60 * 1000));
          }}
        >
          ± HOURS
        </AdminBtn>
        <AdminBtn onClick={onReprieve} loading={isBusy("reprieve")}>
          REPRIEVE
        </AdminBtn>
        <AdminBtn onClick={onReset} loading={isBusy("reset")} danger>
          RESET
        </AdminBtn>
      </div>
    </li>
  );
}

function AdminBtn({
  onClick,
  children,
  loading,
  disabled,
  danger,
}: {
  onClick: () => void;
  children: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={
        "border px-2.5 py-1 font-mono text-[9px] tracking-[0.3em] transition-colors disabled:cursor-not-allowed disabled:opacity-40 " +
        (danger
          ? "border-primary/60 text-primary hover:bg-primary/10"
          : "border-border text-muted-foreground hover:border-primary/60 hover:text-primary")
      }
    >
      {loading ? "…" : children}
    </button>
  );
}
