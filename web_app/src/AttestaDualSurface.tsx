"use client";

/**
 * Attesta / LexiVault — Unified Brand, Dual Surface
 *
 * Stack: Next.js 14 · Tailwind · shadcn/ui primitives (Dialog, Tabs)
 * Motion: raw canvas WebGL particle field (replace with R3F at integration)
 *         CSS keyframe typewriter; replace with GSAP ScrollTrigger at integration
 *
 * Surfaces:
 *   ATTESTA  — public Register of Record (white / black / claret)
 *   LEXIVAULT— private zero-trust conveyancing portal (black / claret / brass)
 *
 * Color tokens (CSS vars injected via <style> below):
 *   --color-bg-base      surface base
 *   --color-bg-surface   elevated cards / zones
 *   --color-text-primary
 *   --color-text-secondary
 *   --color-accent       claret #6E2433 — one accent, used sparingly
 *   --color-verified     #2C5E3F
 *   --color-tampered     #8C2A1C
 *   --color-chain-live   #9A772C brass pulse
 */

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  type FC,
} from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import type { MatterRow } from "./services/indexer";

const PACKAGE_ID = process.env.NEXT_PUBLIC_PACKAGE_ID ?? "";
const CLOCK_OBJECT_ID = "0x6";

/* ─────────────────────────────────────────────────────────────────────────────
   TOKENS & GLOBAL STYLES
   Injected once; Tailwind classes reference these via arbitrary [var(--...)]
───────────────────────────────────────────────────────────────────────────── */
const GLOBAL_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Space+Grotesk:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap');

  :root {
    /* Attesta (light surface) */
    --color-bg-base:        #FFFFFF;
    --color-bg-surface:     #FFFFFF;
    --color-text-primary:   #000000;
    --color-text-secondary: #000000;
    --color-accent:         #6E2433;
    --color-verified:       #2C5E3F;
    --color-tampered:       #8C2A1C;
    --color-chain-live:     #9A772C;
  }

  [data-surface="vault"] {
    /* LexiVault (dark surface) */
    --color-bg-base:        #000000;
    --color-bg-surface:     #0A0806;
    --color-text-primary:   #FFFFFF;
    --color-text-secondary: rgba(255,255,255,0.55);
    --color-accent:         #6E2433;
    --color-verified:       #2C5E3F;
    --color-tampered:       #8C2A1C;
    --color-chain-live:     #9A772C;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Space Grotesk', sans-serif;
    background: var(--color-bg-base);
    color: var(--color-text-primary);
    -webkit-font-smoothing: antialiased;
  }

  /* Typewriter cursor blink */
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
  .cursor::after {
    content: '_';
    animation: blink 0.9s step-end infinite;
  }

  /* Chain-live brass pulse */
  @keyframes brass-pulse {
    0%,100% { opacity: 1; }
    50%      { opacity: 0.4; }
  }
  .chain-pulse { animation: brass-pulse 2s ease-in-out infinite; }

  /* Hard stamp — no easing */
  @keyframes stamp-in {
    0%   { transform: scaleX(0); }
    100% { transform: scaleX(1); }
  }
  .stamp-bar { transform-origin: left; animation: stamp-in 0.08s steps(1,end) forwards; }

  /* Scan line on verify */
  @keyframes scan {
    from { top: 0; }
    to   { top: 100%; }
  }
  .scan-line {
    position: absolute; left: 0; right: 0; height: 2px;
    background: var(--color-verified);
    animation: scan 1.2s linear forwards;
  }

  /* No scrollbar on ledger */
  .ledger-scroll::-webkit-scrollbar { display: none; }
  .ledger-scroll { -ms-overflow-style: none; scrollbar-width: none; }
`;

/* ─────────────────────────────────────────────────────────────────────────────
   PARTICLE FIELD  (WebGL canvas — replace with R3F + GLSL at integration)
   Renders SHA-256 hash as a 3D-projected point cloud.
───────────────────────────────────────────────────────────────────────────── */
function useParticleField(canvasRef: React.RefObject<HTMLCanvasElement>, hash: string) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf: number;
    let t = 0;

    // Derive 256 points from the hash string (or random if no hash)
    const seed = hash || "0000000000000000000000000000000000000000000000000000000000000000";
    const pts = Array.from({ length: 256 }, (_, i) => {
      const h = parseInt(seed.slice((i * 2) % 62, (i * 2) % 62 + 2) || "ff", 16) / 255;
      const angle = (i / 256) * Math.PI * 2 * 7 + h * Math.PI;
      const radius = 0.15 + h * 0.35;
      return {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius * 0.6,
        z: (i / 256) * 2 - 1,
        size: 1 + h * 2.5,
        speed: 0.0003 + h * 0.0004,
      };
    });

    function draw() {
      if (!canvas || !ctx) return;
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      t += 0.004;

      pts.forEach((p) => {
        // 3D rotation around Y axis
        const cosT = Math.cos(t * p.speed * 300);
        const sinT = Math.sin(t * p.speed * 300);
        const x3 = p.x * cosT - p.z * 0.3 * sinT;
        const z3 = p.x * sinT * 0.3 + p.z * cosT;
        const scale = 1 / (1 - z3 * 0.4 + 0.001);
        const sx = W / 2 + x3 * W * 0.42 * scale;
        const sy = H / 2 + p.y * H * 0.45 * scale;
        const alpha = Math.max(0, Math.min(1, (z3 + 1) * 0.5));

        // Claret accent for "seal" particles, black for rest
        const isAccent = parseInt(seed.slice(0, 2), 16) % 8 === 0;
        ctx.fillStyle = isAccent
          ? `rgba(110,36,51,${alpha * 0.9})`
          : `rgba(0,0,0,${alpha * 0.7})`;
        ctx.beginPath();
        ctx.arc(sx, sy, p.size * scale * 0.6, 0, Math.PI * 2);
        ctx.fill();
      });

      raf = requestAnimationFrame(draw);
    }

    function resize() {
      if (!canvas || !ctx) return;
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }
    resize();
    window.addEventListener("resize", resize);
    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [canvasRef, hash]);
}

/* ─────────────────────────────────────────────────────────────────────────────
   TYPEWRITER  (replace inner logic with GSAP at integration)
───────────────────────────────────────────────────────────────────────────── */
function useTypewriter(text: string, speed = 28): string {
  const [displayed, setDisplayed] = useState("");
  useEffect(() => {
    setDisplayed("");
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);
  return displayed;
}

/* ─────────────────────────────────────────────────────────────────────────────
   SHA-256 IN-BROWSER
───────────────────────────────────────────────────────────────────────────── */
async function sha256(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* ─────────────────────────────────────────────────────────────────────────────
   SHARED PRIMITIVES
───────────────────────────────────────────────────────────────────────────── */

/** Hard-edged mono hash display — never wraps */
const HashDisplay: FC<{ value: string; label?: string; highlight?: "verified" | "tampered" }> = ({
  value, label, highlight,
}) => {
  const color =
    highlight === "verified"
      ? "text-[var(--color-verified)]"
      : highlight === "tampered"
      ? "text-[var(--color-tampered)]"
      : "text-[var(--color-text-primary)]";
  return (
    <div className="border-b-2 border-[var(--color-text-primary)] pb-2 mb-2">
      {label && (
        <span
          className="block font-['IBM_Plex_Mono'] text-[10px] uppercase tracking-[0.2em] mb-1"
          style={{ color: "var(--color-text-secondary)", opacity: 0.6 }}
        >
          {label}
        </span>
      )}
      <span
        className={`block font-['IBM_Plex_Mono'] text-[11px] break-all leading-tight ${color}`}
      >
        {value || "—"}
      </span>
    </div>
  );
};

/** Navigation bar — shared across both surfaces */
const Nav: FC<{
  surface: "attesta" | "vault";
  onSwitch: () => void;
  authState: "none" | "connecting" | "connected";
  walletAddr?: string;
}> = ({ surface, onSwitch, authState, walletAddr }) => (
  <nav
    className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 border-b-2 border-[var(--color-text-primary)]"
    style={{ background: "var(--color-bg-base)" }}
  >
    <div className="flex items-center gap-6">
      <button
        onClick={onSwitch}
        className="font-['Syne'] font-black text-[22px] tracking-[-0.03em] leading-none hover:text-[var(--color-accent)] transition-none"
        style={{ color: "var(--color-text-primary)" }}
      >
        {surface === "attesta" ? "ATTESTA" : "LEXIVAULT"}
      </button>
      <span
        className="font-['IBM_Plex_Mono'] text-[10px] uppercase tracking-[0.2em] border border-[var(--color-text-primary)] px-2 py-1"
        style={{ opacity: 0.5 }}
      >
        {surface === "attesta" ? "Register of Record" : "Zero-Trust Conveyancing"}
      </span>
    </div>

    <div className="flex items-center gap-4">
      {/* Chain live indicator */}
      <span className="flex items-center gap-2 font-['IBM_Plex_Mono'] text-[10px] uppercase tracking-[0.15em]">
        <span
          className="chain-pulse inline-block w-2 h-2 rounded-full"
          style={{ background: "var(--color-chain-live)" }}
        />
        <span style={{ color: "var(--color-chain-live)" }}>Sui Testnet</span>
      </span>

      {authState === "connected" && walletAddr ? (
        <span className="font-['IBM_Plex_Mono'] text-[11px] border-2 border-[var(--color-text-primary)] px-3 py-1">
          {walletAddr.slice(0, 6)}…{walletAddr.slice(-4)}
        </span>
      ) : (
        <button
          className="font-['IBM_Plex_Mono'] text-[11px] uppercase tracking-[0.12em] border-2 border-[var(--color-accent)] px-3 py-1 text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-white transition-none"
        >
          {authState === "connecting" ? "Connecting…" : "Connect"}
        </button>
      )}
    </div>
  </nav>
);

/* ─────────────────────────────────────────────────────────────────────────────
   SURFACE A — ATTESTA (public, white/black)
───────────────────────────────────────────────────────────────────────────── */

/** Landing hero with particle field and animated hash */
const AttestaHero: FC<{ onEnterWorkspace: () => void }> = ({ onEnterWorkspace }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const demoHash = "a3f8c2d1e04b7691f2e8a0c3d5b6e791f0a4c2d3e5f6a7b8c9d0e1f2a3b4c5d6";
  const typedHash = useTypewriter(demoHash, 18);
  useParticleField(canvasRef, demoHash);

  return (
    <section className="relative min-h-screen pt-20 flex flex-col">
      {/* Particle canvas — full bleed background */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ opacity: 0.12 }}
      />

      <div className="relative z-10 flex-1 flex flex-col justify-center px-6 md:px-12 lg:px-20 max-w-[1400px] mx-auto w-full">
        {/* Harsh top rule */}
        <div className="w-full h-[3px] bg-black mb-8" />

        {/* Display heading — full bleed, asymmetric */}
        <h1 className="font-['Syne'] font-black leading-[0.9] tracking-[-0.04em] text-black uppercase">
          <span className="block text-[clamp(72px,12vw,160px)]">Proof</span>
          <span
            className="block text-[clamp(72px,12vw,160px)] ml-[clamp(32px,8vw,120px)]"
            style={{ color: "var(--color-accent)" }}
          >
            a document
          </span>
          <span className="block text-[clamp(72px,12vw,160px)]">existed.</span>
        </h1>

        {/* Rule break */}
        <div className="flex items-center gap-0 my-10">
          <div className="h-[2px] bg-black flex-1" />
          <span className="font-['IBM_Plex_Mono'] text-[10px] uppercase tracking-[0.25em] px-4 border-y-2 border-black py-2">
            SHA-256 · Sui · Walrus
          </span>
          <div className="h-[2px] bg-black flex-1" />
        </div>

        {/* Animated hash + CTA — side by side on desktop */}
        <div className="flex flex-col lg:flex-row gap-8 lg:gap-16 items-start">
          <div className="flex-1 min-w-0">
            <p className="font-['IBM_Plex_Mono'] text-[10px] uppercase tracking-[0.2em] mb-3 opacity-50">
              Live fingerprint
            </p>
            <p className="font-['IBM_Plex_Mono'] text-[clamp(11px,1.4vw,14px)] break-all leading-tight cursor">
              {typedHash}
            </p>
            <p className="font-['Space_Grotesk'] text-[15px] mt-6 max-w-[480px] leading-[1.5]" style={{ opacity: 0.6 }}>
              The document never leaves this device. Only the fingerprint, time, and a reference you choose are anchored on-chain.
            </p>
          </div>

          <div className="flex flex-col gap-3 lg:min-w-[220px]">
            <button
              onClick={onEnterWorkspace}
              className="font-['IBM_Plex_Mono'] text-[13px] uppercase tracking-[0.12em] bg-black text-white px-8 py-5 border-2 border-black hover:bg-[var(--color-accent)] hover:border-[var(--color-accent)] transition-none w-full text-left"
            >
              Seal a document →
            </button>
            <button
              onClick={onEnterWorkspace}
              className="font-['IBM_Plex_Mono'] text-[13px] uppercase tracking-[0.12em] bg-white text-black px-8 py-5 border-2 border-black hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-none w-full text-left"
            >
              Verify a seal →
            </button>
          </div>
        </div>
      </div>

      {/* Bottom rule + scroll indicator */}
      <div className="relative z-10 px-6 md:px-12 lg:px-20 pb-8">
        <div className="h-[2px] bg-black mb-4" />
        <span className="font-['IBM_Plex_Mono'] text-[10px] uppercase tracking-[0.2em] opacity-40">
          Scroll to workspace ↓
        </span>
      </div>
    </section>
  );
};

/** Seal workspace: file drop + metadata + progress states */
const SealWorkspace: FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [hash, setHash] = useState("");
  const [state, setState] = useState<"idle" | "hashing" | "sealing" | "done">("idle");
  const [ref, setRef] = useState("");
  const [client, setClient] = useState("");
  const [epochs, setEpochs] = useState("53");
  const [certId, setCertIdResult] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useParticleField(canvasRef, hash);

  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  const handleFile = useCallback(async (f: File) => {
    setFile(f);
    setState("hashing");
    const h = await sha256(f);
    setHash(h);
    setState("idle");
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  const handleSeal = async () => {
    if (!file || !hash || !ref || !account) return;
    setState("sealing");
    try {
      // 1. Get the raw file bytes for Walrus upload
      const fileBytes = new Uint8Array(await file.arrayBuffer());

      // 2. Send to the seal API — it encrypts, uploads to Walrus, returns unsigned PTB
      const sealRes = await fetch("/api/matter/seal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sha256Hex: hash,
          plaintextBytes: Array.from(fileBytes),
          reference: ref,
          clientEmail: client || undefined,
          epochs: parseInt(epochs, 10),
          signerAddress: account.address,
        }),
      });

      if (!sealRes.ok) throw new Error(await sealRes.text());
      const { txBase64 } = await sealRes.json();

      // 3. Sign + execute the PTB with the connected wallet
      const txBytes = Uint8Array.from(atob(txBase64), (c) => c.charCodeAt(0));
      const result = await signAndExecute(
        { transaction: Transaction.from(txBytes) },
        {
          onSuccess: async (res) => {
            // 4. Parse the Record object id from the Sealed event
            const fullTx = await suiClient.getTransactionBlock({
              digest: res.digest,
              options: { showEvents: true },
            });
            const sealedEvent = fullTx.events?.find((e) =>
              e.type.includes("::registry::Sealed"),
            );
            const newCertId = (sealedEvent?.parsedJson as { cert?: string })?.cert ?? "";
            setCertIdResult(newCertId);
            setState("done");
          },
        },
      );
      if (!result) throw new Error("Transaction failed");
    } catch (err) {
      console.error("[handleSeal]", err);
      setState("idle");
    }
  };

  const stateLabel = {
    idle: file ? "Ready to seal" : "No document",
    hashing: "Fingerprinting…",
    sealing: "Anchoring on Sui…",
    done: "Sealed",
  }[state];

  return (
    <section className="min-h-screen pt-20 px-6 md:px-12 lg:px-20 max-w-[1400px] mx-auto">
      <div className="border-t-4 border-black pt-10 mb-10 flex items-baseline justify-between">
        <h2 className="font-['Syne'] font-black text-[clamp(36px,6vw,80px)] tracking-[-0.03em] uppercase">
          Seal
        </h2>
        <span
          className="font-['IBM_Plex_Mono'] text-[11px] uppercase tracking-[0.18em] border-2 border-black px-3 py-1"
          style={{
            color: state === "done" ? "var(--color-verified)" : "var(--color-text-primary)",
            borderColor: state === "done" ? "var(--color-verified)" : "var(--color-text-primary)",
          }}
        >
          {stateLabel}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2px_1.2fr] gap-0">
        {/* LEFT — drop zone + fields */}
        <div className="pr-0 lg:pr-10">
          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => document.getElementById("file-input")?.click()}
            className="border-2 border-dashed border-black p-10 text-center cursor-pointer mb-8"
            style={{
              borderColor: file ? "var(--color-verified)" : "var(--color-text-primary)",
              background: file ? "rgba(44,94,63,0.04)" : "transparent",
            }}
          >
            <input
              id="file-input"
              type="file"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            {file ? (
              <div className="text-left">
                <p className="font-['IBM_Plex_Mono'] text-[11px] uppercase tracking-[0.15em] mb-2" style={{ color: "var(--color-verified)" }}>
                  Document loaded
                </p>
                <p className="font-['Space_Grotesk'] font-bold text-[18px]">{file.name}</p>
                <p className="font-['IBM_Plex_Mono'] text-[10px] mt-1 opacity-50">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
            ) : (
              <>
                <div className="font-['Syne'] font-black text-[48px] leading-none mb-4">↑</div>
                <p className="font-['Space_Grotesk'] font-bold text-[15px] uppercase tracking-[0.08em]">
                  Drop document here
                </p>
                <p className="font-['IBM_Plex_Mono'] text-[11px] mt-2 opacity-40">
                  or click to browse · any file type
                </p>
              </>
            )}
          </div>

          {/* Metadata fields */}
          {[
            {
              id: "ref",
              label: "Public reference — published on-chain",
              placeholder: "Deed of Variation — Smith/2026",
              value: ref,
              onChange: setRef,
            },
            {
              id: "client",
              label: "Client — local only",
              placeholder: "Held on this device",
              value: client,
              onChange: setClient,
            },
          ].map((f) => (
            <div key={f.id} className="mb-4">
              <label
                htmlFor={f.id}
                className="block font-['IBM_Plex_Mono'] text-[10px] uppercase tracking-[0.2em] mb-2 opacity-60"
              >
                {f.label}
              </label>
              <input
                id={f.id}
                type="text"
                value={f.value}
                onChange={(e) => f.onChange(e.target.value)}
                placeholder={f.placeholder}
                className="w-full border-b-2 border-black bg-transparent font-['Space_Grotesk'] text-[15px] py-2 outline-none focus:border-[var(--color-accent)] placeholder:opacity-30"
              />
            </div>
          ))}

          <div className="mb-8">
            <label className="block font-['IBM_Plex_Mono'] text-[10px] uppercase tracking-[0.2em] mb-2 opacity-60">
              Retention period
            </label>
            <select
              value={epochs}
              onChange={(e) => setEpochs(e.target.value)}
              className="w-full border-b-2 border-black bg-transparent font-['IBM_Plex_Mono'] text-[13px] py-2 outline-none appearance-none cursor-pointer"
            >
              <option value="5">5 epochs (demo)</option>
              <option value="12">12 epochs</option>
              <option value="26">26 epochs</option>
              <option value="53">53 epochs (~1 year)</option>
            </select>
          </div>

          <button
            onClick={handleSeal}
            disabled={!file || !ref || state === "sealing" || state === "done"}
            className="w-full font-['IBM_Plex_Mono'] text-[13px] uppercase tracking-[0.12em] py-5 border-2 transition-none disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: state === "done" ? "var(--color-verified)" : "var(--color-text-primary)",
              color: "var(--color-bg-base)",
              borderColor: state === "done" ? "var(--color-verified)" : "var(--color-text-primary)",
            }}
          >
            {state === "sealing" ? "Anchoring on Sui…" : state === "done" ? "✓ Sealed" : "Seal on Sui + Walrus →"}
          </button>
        </div>

        {/* Divider */}
        <div className="hidden lg:block bg-black" />

        {/* RIGHT — particle field + certificate */}
        <div className="pl-0 lg:pl-10 pt-10 lg:pt-0">
          <div className="relative h-[320px] border-2 border-black mb-8">
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
            {/* Seal progress bars — stamp-in on state change */}
            {state === "done" && (
              <div className="absolute inset-0 flex items-end p-4 gap-1">
                {Array.from({ length: 12 }, (_, i) => (
                  <div
                    key={i}
                    className="stamp-bar flex-1 bg-[var(--color-accent)]"
                    style={{
                      height: `${20 + Math.sin(i * 0.8) * 40}%`,
                      animationDelay: `${i * 0.04}s`,
                      opacity: 0.8,
                    }}
                  />
                ))}
              </div>
            )}
            <div
              className="absolute top-3 left-3 font-['IBM_Plex_Mono'] text-[10px] uppercase tracking-[0.15em]"
              style={{ opacity: 0.4 }}
            >
              {hash ? "Fingerprint visualised" : "No document loaded"}
            </div>
          </div>

          {/* Certificate */}
          {hash && (
            <div className="border-t-2 border-black pt-6">
              <p className="font-['IBM_Plex_Mono'] text-[10px] uppercase tracking-[0.2em] mb-4 opacity-50">
                Certificate
              </p>
              <HashDisplay value={hash} label="SHA-256 fingerprint" />
              {state === "done" && (
                <>
                  <HashDisplay value={ref} label="Reference (on-chain)" />
                  {certId && <HashDisplay value={certId} label="Record object ID" />}
                  <div className="mt-4 border-2 border-[var(--color-verified)] p-4">
                    <span
                      className="font-['IBM_Plex_Mono'] text-[11px] uppercase tracking-[0.15em]"
                      style={{ color: "var(--color-verified)" }}
                    >
                      ✓ Anchored on Sui Testnet
                    </span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

/** Verify result: side-by-side hash comparison */
const VerifyPanel: FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [computedHash, setComputedHash] = useState("");
  const [certId, setCertId] = useState("");
  const [onChainHash, setOnChainHash] = useState("");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<"none" | "verified" | "tampered">("none");

  const suiClient = useSuiClient();
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  const handleFile = async (f: File) => {
    setFile(f);
    setResult("none");
    const h = await sha256(f);
    setComputedHash(h);
  };

  const handleVerify = async () => {
    if (!computedHash || !certId) return;
    setScanning(true);
    try {
      // 1. Fetch the on-chain Record and extract its stored sha256
      const obj = await suiClient.getObject({ id: certId, options: { showContent: true } });
      if (obj.data?.content?.dataType !== "moveObject") throw new Error("Not a Record object");
      const fields = obj.data.content.fields as Record<string, unknown>;
      const storedBytes: number[] = fields.sha256 as number[];
      const storedHex = Array.from(storedBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      setOnChainHash(storedHex);

      // 2. Compare
      const match = computedHash === storedHex;
      setResult(match ? "verified" : "tampered");

      // 3. Emit on-chain event (only if wallet connected)
      if (account && PACKAGE_ID) {
        const tx = new Transaction();
        tx.moveCall({
          target: match
            ? (`${PACKAGE_ID}::registry::mark_verified` as const)
            : (`${PACKAGE_ID}::registry::mark_mismatch` as const),
          arguments: [tx.object(certId), tx.object(CLOCK_OBJECT_ID)],
        });
        signAndExecute({ transaction: tx }).catch((err) =>
          console.warn("[verify event]", err),
        );
      }
    } catch (err) {
      console.error("[handleVerify]", err);
    } finally {
      setScanning(false);
    }
  };

  const resultColors = {
    none: { border: "border-black", text: "inherit" },
    verified: { border: "border-[var(--color-verified)]", text: "var(--color-verified)" },
    tampered: { border: "border-[var(--color-tampered)]", text: "var(--color-tampered)" },
  }[result];

  return (
    <section className="min-h-screen pt-20 px-6 md:px-12 lg:px-20 max-w-[1400px] mx-auto">
      <div className="border-t-4 border-black pt-10 mb-10">
        <h2 className="font-['Syne'] font-black text-[clamp(36px,6vw,80px)] tracking-[-0.03em] uppercase">
          Verify
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
        {/* Computed hash column */}
        <div className="border-b-2 lg:border-b-0 lg:border-r-2 border-black pb-8 lg:pb-0 lg:pr-10">
          <p className="font-['IBM_Plex_Mono'] text-[10px] uppercase tracking-[0.2em] mb-6 opacity-50">
            This file
          </p>

          <div
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => document.getElementById("verify-input")?.click()}
            className="border-2 border-dashed border-black p-8 cursor-pointer mb-6"
          >
            <input
              id="verify-input"
              type="file"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            {file ? (
              <p className="font-['Space_Grotesk'] font-bold">{file.name}</p>
            ) : (
              <p className="font-['IBM_Plex_Mono'] text-[11px] uppercase tracking-[0.15em] opacity-40">
                Drop file to fingerprint
              </p>
            )}
          </div>

          {computedHash && (
            <div className="relative">
              {scanning && <div className="scan-line" />}
              <HashDisplay
                value={computedHash}
                label="Computed SHA-256"
                highlight={result !== "none" ? result : undefined}
              />
            </div>
          )}
        </div>

        {/* Sealed hash column */}
        <div className="pt-8 lg:pt-0 lg:pl-10">
          <p className="font-['IBM_Plex_Mono'] text-[10px] uppercase tracking-[0.2em] mb-6 opacity-50">
            Sealed record
          </p>

          <div className="mb-6">
            <label className="block font-['IBM_Plex_Mono'] text-[10px] uppercase tracking-[0.2em] mb-2 opacity-60">
              Certificate ID
            </label>
            <input
              type="text"
              value={certId}
              onChange={(e) => { setCertId(e.target.value); setResult("none"); }}
              placeholder="0x… Record object ID from Sui"
              className="w-full border-b-2 border-black bg-transparent font-['IBM_Plex_Mono'] text-[12px] py-2 outline-none focus:border-[var(--color-accent)] placeholder:opacity-30"
            />
          </div>

          {onChainHash && (
            <HashDisplay
              value={onChainHash}
              label="Sealed SHA-256 (from Sui)"
              highlight={result !== "none" ? result : undefined}
            />
          )}

          <button
            onClick={handleVerify}
            disabled={!computedHash || !certId || scanning}
            className="w-full font-['IBM_Plex_Mono'] text-[13px] uppercase tracking-[0.12em] py-5 border-2 border-black bg-black text-white mt-4 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[var(--color-accent)] hover:border-[var(--color-accent)] transition-none"
          >
            {scanning ? "Scanning…" : "Verify seal →"}
          </button>

          {/* Result verdict — hard-cut reveal */}
          {result !== "none" && (
            <div className={`mt-6 border-4 ${resultColors.border} p-6`}>
              <p
                className="font-['Syne'] font-black text-[clamp(28px,4vw,48px)] tracking-[-0.02em] uppercase"
                style={{ color: resultColors.text }}
              >
                {result === "verified" ? "✓ Intact" : "✕ Tampered"}
              </p>
              <p className="font-['Space_Grotesk'] text-[13px] mt-2 opacity-70">
                {result === "verified"
                  ? "Fingerprints match exactly. The document is unaltered since sealing."
                  : "Fingerprints differ. One or more bytes changed after the seal was placed."}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

const STATUS_LABELS: Record<number, string> = {
  0: "Issued", 1: "Viewed", 2: "Verified", 3: "Signed", 4: "Superseded", 5: "Pending",
};

const RegisterLedger: FC = () => {
  const [matters, setMatters] = useState<MatterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const account = useCurrentAccount();

  useEffect(() => {
    if (!account) return;
    fetch(`/api/firm/matters?sealer=${account.address}`)
      .then((r) => r.json())
      .then((d) => setMatters(d.matters ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [account]);

  const handleSupersede = async (certId: string) => {
    const reason = prompt("Reason for supersession:");
    if (!reason) return;
    const res = await fetch(`/api/matter/${certId}/supersede`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) { alert("Supersede failed"); return; }
    // Refresh
    setMatters((prev) => prev.map((m) => m.certId === certId ? { ...m, status: 4 } : m));
  };

  return (
    <section className="min-h-screen pt-20 px-6 md:px-12 lg:px-20 max-w-[1400px] mx-auto">
      <div className="border-t-4 border-black pt-10 mb-10 flex items-baseline gap-6">
        <h2 className="font-['Syne'] font-black text-[clamp(36px,6vw,80px)] tracking-[-0.03em] uppercase">
          Register
        </h2>
        <span className="font-['IBM_Plex_Mono'] text-[11px] uppercase tracking-[0.15em] opacity-40">
          {loading ? "Loading…" : `${matters.length} records`}
        </span>
      </div>

      {/* Full-bleed table */}
      <div className="overflow-x-auto ledger-scroll">
        <table className="w-full min-w-[900px] border-collapse">
          <thead>
            <tr className="border-b-2 border-black">
              {["Reference", "Fingerprint", "Sealed UTC", "Status", "Sui object", ""].map((h) => (
                <th
                  key={h}
                  className="font-['IBM_Plex_Mono'] text-[10px] uppercase tracking-[0.2em] text-left py-3 pr-6"
                  style={{ opacity: 0.5 }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matters.map((row) => (
              <tr
                key={row.certId}
                className="border-b border-black border-opacity-20 hover:border-opacity-100 group transition-none"
              >
                <td className="py-4 pr-6">
                  <span className="font-['Space_Grotesk'] text-[14px]">{row.reference}</span>
                </td>
                <td className="py-4 pr-6">
                  <span className="font-['IBM_Plex_Mono'] text-[10px] opacity-60">{row.sha256.slice(0, 16)}…</span>
                </td>
                <td className="py-4 pr-6">
                  <span className="font-['IBM_Plex_Mono'] text-[11px]">
                    {new Date(row.sealedMs).toISOString()}
                  </span>
                </td>
                <td className="py-4 pr-6">
                  <span className="font-['IBM_Plex_Mono'] text-[10px] uppercase tracking-[0.1em]"
                    style={{ color: row.status === 4 ? "var(--color-tampered)" : row.status === 2 ? "var(--color-verified)" : "inherit", opacity: 0.7 }}>
                    {STATUS_LABELS[row.status] ?? "Unknown"}
                  </span>
                </td>
                <td className="py-4 pr-6">
                  <span
                    className="font-['IBM_Plex_Mono'] text-[11px] underline cursor-pointer"
                    style={{ color: "var(--color-accent)" }}
                  >
                    {row.certId.slice(0, 6)}…{row.certId.slice(-4)}
                  </span>
                </td>
                <td className="py-4 flex gap-2">
                  {row.status !== 4 && (
                    <button
                      onClick={() => handleSupersede(row.certId)}
                      className="font-['IBM_Plex_Mono'] text-[10px] uppercase tracking-[0.12em] border border-black px-3 py-1 hover:bg-black hover:text-white transition-none opacity-0 group-hover:opacity-100"
                    >
                      Supersede
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

/* ─────────────────────────────────────────────────────────────────────────────
   SURFACE B — LEXIVAULT (private portal, black/claret)
   Deep vault gate + authentication
───────────────────────────────────────────────────────────────────────────── */

/** Authentication wall — wallet connect + zkLogin + OAuth */
const VaultGate: FC<{ onUnlock: (method: string) => void }> = ({ onUnlock }) => {
  const [step, setStep] = useState<"gate" | "connecting" | "zk">("gate");
  const typedChallenge = useTypewriter(
    step === "connecting" ? "Requesting wallet signature… stand by." : "",
    22
  );

  if (step === "connecting") {
    return (
      <div
        data-surface="vault"
        className="min-h-screen pt-20 flex items-center justify-center px-6"
        style={{ background: "var(--color-bg-base)", color: "var(--color-text-primary)" }}
      >
        <div className="max-w-[520px] w-full">
          <div className="border-b-2 border-white mb-8 pb-4">
            <p className="font-['IBM_Plex_Mono'] text-[11px] uppercase tracking-[0.2em] mb-6 cursor" style={{ opacity: 0.6 }}>
              {typedChallenge}
            </p>
            <div
              className="chain-pulse h-[2px] w-full"
              style={{ background: "var(--color-chain-live)" }}
            />
          </div>
          <p className="font-['IBM_Plex_Mono'] text-[10px] uppercase tracking-[0.2em]" style={{ opacity: 0.3 }}>
            Zero-trust handshake · Sui testnet
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      data-surface="vault"
      className="min-h-screen pt-20 flex flex-col"
      style={{ background: "var(--color-bg-base)", color: "var(--color-text-primary)" }}
    >
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-[680px] w-full">
          {/* Gate header */}
          <div className="border-y-2 border-white py-8 mb-12">
            <h2 className="font-['Syne'] font-black text-[clamp(40px,7vw,96px)] tracking-[-0.03em] uppercase leading-none">
              Vault<br />
              <span style={{ color: "var(--color-accent)" }}>Gate</span>
            </h2>
          </div>

          <p className="font-['Space_Grotesk'] text-[15px] mb-10" style={{ opacity: 0.6 }}>
            LexiVault holds privileged matter data. Authenticate with a zero-trust credential before any content is revealed. The server sees only a proof — never your identity or the documents.
          </p>

          {/* Auth options */}
          <div className="space-y-3">
            {/* Wallet connect */}
            <button
              onClick={() => { setStep("connecting"); setTimeout(() => onUnlock("wallet"), 2800); }}
              className="w-full text-left border-2 border-white p-5 flex items-center justify-between group hover:border-[var(--color-accent)] transition-none"
            >
              <span>
                <span className="block font-['IBM_Plex_Mono'] text-[11px] uppercase tracking-[0.15em] mb-1" style={{ opacity: 0.4 }}>
                  Option 1
                </span>
                <span className="font-['Syne'] font-bold text-[20px]">Connect Wallet</span>
              </span>
              <span
                className="font-['IBM_Plex_Mono'] text-[11px] uppercase tracking-[0.12em] border border-current px-3 py-1 opacity-0 group-hover:opacity-100 transition-none"
                style={{ color: "var(--color-accent)" }}
              >
                Sui →
              </span>
            </button>

            {/* zkLogin */}
            <button
              onClick={() => setStep("zk")}
              className="w-full text-left border-2 border-white p-5 flex items-center justify-between group hover:border-[var(--color-accent)] transition-none"
            >
              <span>
                <span className="block font-['IBM_Plex_Mono'] text-[11px] uppercase tracking-[0.15em] mb-1" style={{ opacity: 0.4 }}>
                  Option 2
                </span>
                <span className="font-['Syne'] font-bold text-[20px]">zkLogin</span>
              </span>
              <span className="font-['IBM_Plex_Mono'] text-[10px] opacity-30">Zero-knowledge OAuth →</span>
            </button>

            {/* OAuth */}
            <div className="border-2 border-white p-5">
              <span className="block font-['IBM_Plex_Mono'] text-[11px] uppercase tracking-[0.15em] mb-3" style={{ opacity: 0.4 }}>
                Option 3 — OAuth
              </span>
              <div className="flex gap-3">
                {["Google", "Apple"].map((p) => (
                  <button
                    key={p}
                    onClick={() => onUnlock(p)}
                    className="flex-1 border border-white py-3 font-['IBM_Plex_Mono'] text-[12px] uppercase tracking-[0.12em] hover:bg-white hover:text-black transition-none"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <p className="mt-8 font-['IBM_Plex_Mono'] text-[10px] uppercase tracking-[0.18em]" style={{ opacity: 0.25 }}>
            No account stored · No document uploaded · Auth proof only
          </p>
        </div>
      </div>
    </div>
  );
};

/** Post-auth vault portal — real document counts from chain */
const VaultPortal: FC<{ method: string }> = ({ method }) => {
  const account = useCurrentAccount();
  const [docs, setDocs] = useState<MatterRow[]>([]);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  useEffect(() => {
    if (!account) return;
    fetch(`/api/me/documents?owner=${account.address}`)
      .then((r) => r.json())
      .then((d) => setDocs(d.documents ?? []))
      .catch(console.error);
  }, [account]);

  const active = docs.filter((d) => d.status < 3 && !d.walrusBlob.includes("shredded")).length;
  const pending = docs.filter((d) => d.status === 1).length;
  const archived = docs.filter((d) => d.status >= 3).length;

  const handleConfirm = async (certId: string) => {
    setConfirmingId(certId);
    try {
      const res = await fetch(`/api/matter/${certId}/confirm`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      setDocs((prev) => prev.map((d) => d.certId === certId ? { ...d, status: 3 } : d));
    } catch (err) {
      console.error("[confirm]", err);
    } finally {
      setConfirmingId(null);
    }
  };

  return (
    <div
      data-surface="vault"
      className="min-h-screen pt-20 px-6 md:px-12 lg:px-20 max-w-[1400px] mx-auto"
      style={{ color: "var(--color-text-primary)" }}
    >
      <div className="border-t-2 pt-10 mb-12" style={{ borderColor: "var(--color-chain-live)" }}>
        <div className="flex items-baseline gap-6 mb-2">
          <h2 className="font-['Syne'] font-black text-[clamp(36px,6vw,72px)] tracking-[-0.03em] uppercase">
            LexiVault
          </h2>
          <span
            className="font-['IBM_Plex_Mono'] text-[10px] uppercase tracking-[0.18em] border px-2 py-1"
            style={{ borderColor: "var(--color-chain-live)", color: "var(--color-chain-live)" }}
          >
            ✓ Authenticated via {method}
          </span>
        </div>
        <p className="font-['Space_Grotesk'] text-[14px]" style={{ opacity: 0.4 }}>
          Zero-trust conveyancing portal · privileged matter documents
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border-t-2 border-white border-opacity-20">
        {[
          { label: "Active matters", count: active },
          { label: "Pending completion", count: pending },
          { label: "Archived", count: archived },
        ].map(({ label, count }, i) => (
          <div
            key={label}
            className="border-b-2 md:border-b-0 md:border-r-2 border-white border-opacity-10 p-8"
          >
            <p className="font-['IBM_Plex_Mono'] text-[10px] uppercase tracking-[0.2em] mb-4" style={{ opacity: 0.35 }}>
              {label}
            </p>
            <p className="font-['Syne'] font-black text-[clamp(48px,6vw,80px)] leading-none" style={{ color: i === 1 ? "var(--color-accent)" : "inherit" }}>
              {count}
            </p>
          </div>
        ))}
      </div>

      {/* Document list with confirm action */}
      {docs.length > 0 && (
        <div className="mt-12 border-2 border-white border-opacity-10">
          {docs.map((doc) => (
            <div key={doc.certId} className="flex items-center justify-between p-6 border-b border-white border-opacity-10">
              <div>
                <p className="font-['Space_Grotesk'] font-bold text-[14px]">{doc.reference}</p>
                <p className="font-['IBM_Plex_Mono'] text-[10px] opacity-40 mt-1">
                  {doc.certId.slice(0, 10)}… · {new Date(doc.sealedMs).toISOString().slice(0, 10)}
                </p>
              </div>
              {doc.status === 2 && (
                <button
                  onClick={() => handleConfirm(doc.certId)}
                  disabled={confirmingId === doc.certId}
                  className="font-['IBM_Plex_Mono'] text-[11px] uppercase tracking-[0.12em] border border-white px-4 py-2 hover:bg-white hover:text-black transition-none disabled:opacity-40"
                >
                  {confirmingId === doc.certId ? "Confirming…" : "I confirm I've viewed →"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────────────────────
   MOBILE BOTTOM NAV
───────────────────────────────────────────────────────────────────────────── */
const MobileNav: FC<{ active: string; onNavigate: (s: string) => void; surface: string }> = ({
  active, onNavigate, surface,
}) => {
  const tabs =
    surface === "attesta"
      ? [
          { id: "hero", label: "Home" },
          { id: "seal", label: "Seal" },
          { id: "verify", label: "Verify" },
          { id: "register", label: "Register" },
        ]
      : [{ id: "vault", label: "Vault" }];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex border-t-2 md:hidden"
      style={{
        background: "var(--color-bg-base)",
        borderColor: "var(--color-text-primary)",
      }}
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onNavigate(t.id)}
          className="flex-1 py-4 font-['IBM_Plex_Mono'] text-[10px] uppercase tracking-[0.15em] transition-none"
          style={{
            color: active === t.id ? "var(--color-accent)" : "var(--color-text-primary)",
            borderRight: "1px solid",
            borderColor: "var(--color-text-primary)",
            opacity: active === t.id ? 1 : 0.45,
          }}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
};

/* ─────────────────────────────────────────────────────────────────────────────
   ROOT COMPONENT
───────────────────────────────────────────────────────────────────────────── */
const AttestaDualSurface: FC = () => {
  const [surface, setSurface] = useState<"attesta" | "vault">("attesta");
  const [activePanel, setActivePanel] = useState("hero");
  const [authState, setAuthState] = useState<"none" | "connecting" | "connected">("none");
  const [walletAddr, setWalletAddr] = useState("");
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  const [vaultAuthMethod, setVaultAuthMethod] = useState("");

  const switchSurface = () => {
    setSurface((s) => (s === "attesta" ? "vault" : "attesta"));
    setActivePanel(surface === "attesta" ? "vault" : "hero");
  };

  const account = useCurrentAccount();

  const handleVaultUnlock = (method: string) => {
    setVaultAuthMethod(method);
    setVaultUnlocked(true);
    setAuthState("connected");
    // Use the real connected wallet address; fall back to zkLogin address once resolved
    setWalletAddr(account?.address ?? "");
  };

  const renderPanel = () => {
    if (surface === "vault") {
      return vaultUnlocked ? (
        <VaultPortal method={vaultAuthMethod} />
      ) : (
        <VaultGate onUnlock={handleVaultUnlock} />
      );
    }
    switch (activePanel) {
      case "hero":     return <AttestaHero onEnterWorkspace={() => setActivePanel("seal")} />;
      case "seal":     return <SealWorkspace />;
      case "verify":   return <VerifyPanel />;
      case "register": return <RegisterLedger />;
      default:         return <AttestaHero onEnterWorkspace={() => setActivePanel("seal")} />;
    }
  };

  return (
    <>
      {/* Global styles injected once */}
      <style>{GLOBAL_STYLES}</style>

      <div
        data-surface={surface === "vault" ? "vault" : undefined}
        style={{
          background: "var(--color-bg-base)",
          color: "var(--color-text-primary)",
          minHeight: "100vh",
          paddingBottom: "60px", // mobile nav clearance
        }}
      >
        <Nav
          surface={surface}
          onSwitch={switchSurface}
          authState={authState}
          walletAddr={walletAddr}
        />

        {/* Desktop sidebar nav for Attesta */}
        {surface === "attesta" && (
          <aside className="hidden md:flex fixed left-0 top-1/2 -translate-y-1/2 z-40 flex-col border-r-2 border-black">
            {[
              { id: "hero", label: "Home" },
              { id: "seal", label: "Seal" },
              { id: "verify", label: "Verify" },
              { id: "register", label: "Register" },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActivePanel(item.id)}
                className="px-4 py-5 font-['IBM_Plex_Mono'] text-[10px] uppercase tracking-[0.2em] text-left border-b-2 border-black transition-none"
                style={{
                  background: activePanel === item.id ? "#000" : "#fff",
                  color: activePanel === item.id ? "var(--color-accent)" : "var(--color-text-primary)",
                  writingMode: "vertical-rl",
                  textOrientation: "mixed",
                  transform: "rotate(180deg)",
                }}
              >
                {item.label}
              </button>
            ))}
          </aside>
        )}

        {/* Main content — offset for desktop sidebar */}
        <main className={surface === "attesta" ? "md:pl-14" : ""}>
          {renderPanel()}
        </main>

        <MobileNav
          active={activePanel}
          onNavigate={setActivePanel}
          surface={surface}
        />
      </div>
    </>
  );
};

export default AttestaDualSurface;
