import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/")({
  component: Girigo,
});

type Stage = "landing" | "ritual" | "transmitting" | "granted" | "curse";
const CURSE_KEY = "girigo:curse_end";
const REPRIEVE_KEY = "girigo:reprieve";
const CHANNEL_NAME = "girigo:sync";
const CURSE_MS = 24 * 60 * 60 * 1000;

function getPassedFrom(): string | null {
  if (typeof window === "undefined") return null;
  const p = new URLSearchParams(window.location.search);
  const v = p.get("passedFrom");
  return v ? v.trim() : null;
}

async function postReprieveServer(target: string) {
  try {
    await fetch("/api/reprieve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target }),
      keepalive: true,
    });
  } catch {
    /* noop */
  }
}

async function clearReprieveServer(target: string) {
  try {
    await fetch("/api/reprieve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target, clear: true }),
      keepalive: true,
    });
  } catch {
    /* noop */
  }
}

function broadcastReprieve(target: string) {
  const payload = { target, at: Date.now() };
  try {
    localStorage.setItem(REPRIEVE_KEY, JSON.stringify(payload));
  } catch {
    /* noop */
  }
  try {
    const bc = new BroadcastChannel(CHANNEL_NAME);
    bc.postMessage({ type: "reprieve", ...payload });
    bc.close();
  } catch {
    /* noop */
  }
  // Fire-and-forget server-side signal for cross-device sync
  void postReprieveServer(target);
}

function Girigo() {
  const [stage, setStage] = useState<Stage>(() => {
    if (typeof window === "undefined") return "landing";
    const end = Number(window.localStorage.getItem(CURSE_KEY));
    return end && end > Date.now() ? "curse" : "landing";
  });
  const [name, setName] = useState("");
  const [birth, setBirth] = useState("");

  // Safety net after hydration: honor active curse, clean up expired entry
  useEffect(() => {
    const end = Number(localStorage.getItem(CURSE_KEY));
    if (end && end > Date.now()) {
      setStage((s) => (s === "curse" ? s : "curse"));
    } else if (end) {
      localStorage.removeItem(CURSE_KEY);
    }
  }, []);

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* atmospheric layers */}
      <div className="pointer-events-none absolute inset-0 noise opacity-40" />
      <div className="pointer-events-none absolute inset-0 scanlines opacity-30" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, oklch(0.55 0.25 27 / 0.12), transparent 60%), radial-gradient(ellipse at 50% 100%, oklch(0.55 0.25 27 / 0.08), transparent 60%)",
        }}
      />
      <BrandMark />

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
          onContinue={() => {
            const from = getPassedFrom();
            if (from) {
              broadcastReprieve(from);
              // clean the URL so a refresh doesn't re-fire the reprieve
              try {
                const u = new URL(window.location.href);
                u.searchParams.delete("passedFrom");
                window.history.replaceState({}, "", u.toString());
              } catch {
                /* noop */
              }
            }
            localStorage.setItem(CURSE_KEY, String(Date.now() + CURSE_MS));
            setStage("curse");
          }}
        />
      )}
      {stage === "curse" && (
        <Curse
          name={name}
          onReset={() => {
            localStorage.removeItem(CURSE_KEY);
            setName("");
            setBirth("");
            setStage("landing");
          }}
        />
      )}
    </main>
  );
}

function BrandMark() {
  return (
    <div className="pointer-events-none absolute left-1/2 top-6 z-20 -translate-x-1/2 select-none text-center">
      <div className="font-display text-xs tracking-[0.6em] text-muted-foreground animate-flicker">
        GIRIGO
      </div>
      <div className="mt-1 font-display text-[10px] tracking-[0.4em] text-primary/70">
        기리고
      </div>
    </div>
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
  // Pixel-art praying hands rendered from a bitmap grid
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

/* ---------------- RITUAL ---------------- */
function Ritual({ onRecorded }: { onRecorded: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasCam, setHasCam] = useState(false);
  const [recording, setRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const RECORD_MS = 5000;

  useEffect(() => {
    let stream: MediaStream | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setHasCam(true);
        }
      } catch {
        setHasCam(false);
      }
    })();
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

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
        {hasCam ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-cover"
            style={{ transform: "scaleX(-1)" }}
          />
        ) : (
          <FeedPlaceholder />
        )}

        {/* viewfinder overlay */}
        <div className="pointer-events-none absolute inset-0">
          <Corner className="left-3 top-3" />
          <Corner className="right-3 top-3 rotate-90" />
          <Corner className="right-3 bottom-3 rotate-180" />
          <Corner className="left-3 bottom-3 -rotate-90" />

          <div className="absolute inset-x-0 top-3 flex items-center justify-between px-4 font-mono text-[10px] tracking-widest text-primary/80">
            <span className="flex items-center gap-1.5">
              <span
                className={
                  "inline-block h-1.5 w-1.5 rounded-full " +
                  (recording ? "bg-primary animate-pulse-blood" : "bg-primary/60")
                }
              />
              {recording ? "REC" : "LIVE"}
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
              <span>◉ 0{Math.floor(progress * 5)}:0{Math.floor((progress * 30) % 60).toString().padStart(2, "0")}</span>
              <span>{hasCam ? "SIGNAL LOCKED" : "SIM MODE"}</span>
            </div>
            <div className="mt-2 h-[2px] w-full bg-border">
              <div
                className="h-full bg-primary transition-[width] duration-75"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>

          {/* crosshair */}
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

function FeedPlaceholder() {
  return (
    <div className="relative flex h-full w-full items-center justify-center bg-gradient-to-b from-[oklch(0.08_0_0)] to-black">
      <div className="text-center">
        <div className="mx-auto h-16 w-16 rounded-full border border-primary/40 animate-pulse-blood" />
        <div className="mt-4 font-mono text-[10px] tracking-[0.4em] text-muted-foreground">
          CAMERA LIVE FEED
        </div>
        <div className="mt-1 font-mono text-[10px] tracking-[0.3em] text-primary/60 animate-flicker">
          NO SIGNAL — SIMULATING
        </div>
      </div>
    </div>
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

function Curse({ name, onReset }: { name: string; onReset: () => void }) {
  const [remaining, setRemaining] = useState(() => {
    const end = Number(localStorage.getItem(CURSE_KEY));
    return Math.max(0, end - Date.now());
  });
  const [phase, setPhase] = useState<CursePhase>("countdown");
  const [copied, setCopied] = useState(false);

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${window.location.pathname}?passedFrom=${encodeURIComponent(
          name || "anonymous",
        )}`
      : "";

  useEffect(() => {
    if (phase === "transferred") return;
    let raf: number;
    const tick = () => {
      const end = Number(localStorage.getItem(CURSE_KEY));
      setRemaining(Math.max(0, end - Date.now()));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // Cross-tab / cross-window reprieve listener: if another ritual was completed
  // with ?passedFrom=<this user's name>, the curse jumps to them.
  useEffect(() => {
    if (phase === "transferred") return;
    const target = (name || "anonymous").trim();
    const curseStart = (() => {
      const end = Number(localStorage.getItem(CURSE_KEY));
      return end ? end - CURSE_MS : 0;
    })();

    const accept = (payload: { target?: string; at?: number } | null) => {
      if (!payload) return;
      if (
        !payload.target ||
        payload.target.toLowerCase() !== target.toLowerCase()
      )
        return;
      if (typeof payload.at === "number" && payload.at < curseStart) return;
      completeTransfer();
    };

    // Check for a reprieve that landed before this component mounted
    try {
      const raw = localStorage.getItem(REPRIEVE_KEY);
      if (raw) accept(JSON.parse(raw));
    } catch {
      /* noop */
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key !== REPRIEVE_KEY || !e.newValue) return;
      try {
        accept(JSON.parse(e.newValue));
      } catch {
        /* noop */
      }
    };
    window.addEventListener("storage", onStorage);

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(CHANNEL_NAME);
      bc.onmessage = (ev) => {
        if (ev.data?.type === "reprieve") accept(ev.data);
      };
    } catch {
      /* noop */
    }

    // Cross-device sync: poll the mock server endpoint
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(
          `/api/reprieve?target=${encodeURIComponent(target)}`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const json = (await res.json()) as {
            reprieved: boolean;
            at: number | null;
          };
          if (json.reprieved && json.at) {
            accept({ target, at: json.at });
          }
        }
      } catch {
        /* noop */
      }
    };
    void poll();
    const pollId = window.setInterval(poll, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
      window.removeEventListener("storage", onStorage);
      bc?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, phase]);

  // Ominous heartbeat — speeds up while passing
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

  const completeTransfer = () => {
    playStatic();
    setPhase("transferred");
    localStorage.removeItem(CURSE_KEY);
    localStorage.removeItem(REPRIEVE_KEY);
    setTimeout(() => onReset(), 3200);
  };

  const hh = Math.floor(remaining / 3600000);
  const mm = Math.floor((remaining % 3600000) / 60000);
  const ss = Math.floor((remaining % 60000) / 1000);
  const ms = Math.floor((remaining % 1000) / 10);
  const expired = remaining <= 0;

  return (
    <section className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 animate-fade-up">
      <div className="mb-8 text-center">
        <div className="text-[10px] tracking-[0.6em] text-primary/80 animate-flicker">
          THE CURSE IS BOUND
        </div>
        <div className="mt-3 font-display text-sm tracking-[0.4em] text-muted-foreground">
          TIME UNTIL DESCENT
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
        <div className="flex items-baseline justify-center gap-1 font-mono font-bold tabular-nums text-glow-blood">
          <TimeBlock v={hh} />
          <Colon />
          <TimeBlock v={mm} />
          <Colon />
          <TimeBlock v={ss} />
          <Colon small />
          <TimeBlock v={ms} small />
        </div>
        <div className="mt-3 flex justify-center gap-8 font-mono text-[10px] tracking-[0.4em] text-muted-foreground">
          <span>HH</span><span>MM</span><span>SS</span><span>MS</span>
        </div>
      </div>

      {expired && (
        <div className="mt-10 font-display text-xl tracking-[0.5em] text-primary text-glow-blood animate-glitch">
          THE DESCENT HAS BEGUN.
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


function TimeBlock({ v, small }: { v: number; small?: boolean }) {
  const str = v.toString().padStart(2, "0");
  return (
    <span className={small ? "text-4xl md:text-5xl text-primary/80" : "text-6xl md:text-8xl"}>
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
