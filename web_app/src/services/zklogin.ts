"use client";

/**
 * Raw zkLogin flow — full control via @mysten/sui/zklogin + @mysten/enoki.
 *
 * Enoki manages epoch + randomness internally. The client owns:
 *   - ephemeral keypair (created per login)
 *   - nonce metadata (persisted to sessionStorage across the OAuth redirect)
 *   - ZkLoginSignatureInputs (returned by Enoki after JWT exchange)
 *
 * Flow:
 *  1. startZkLoginOAuth()    — generate ephemeral keypair, get nonce from Enoki, redirect to Google
 *  2. handleZkLoginCallback() — read JWT from hash, exchange for ZKP + salt, compute address
 *  3. signWithZkLogin()       — build the zkLogin signature envelope for any PTB
 */

import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { jwtToAddress, getZkLoginSignature } from "@mysten/sui/zklogin";
import type { ZkLoginSignatureInputs } from "@mysten/sui/zklogin";
import { EnokiClient } from "@mysten/enoki";
import { suiClient } from "./sui-client";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ZkLoginSession = {
  address: string;
  ephemeralKeypair: Ed25519Keypair;
  zkInputs: ZkLoginSignatureInputs;
  maxEpoch: number;
};

type NonceMetadata = {
  ephemeralPrivateKey: string;
  maxEpoch: number;
  randomness: string;
};

const SESSION_KEY = "zklogin.session";
const NONCE_KEY = "zklogin.nonce_meta";
const APP_NAME = "Attesta / LexiVault";

// ── Enoki client ──────────────────────────────────────────────────────────────

function enoki(): EnokiClient {
  const apiKey = process.env.NEXT_PUBLIC_ENOKI_API_KEY;
  if (!apiKey || apiKey === "your_enoki_api_key_here") {
    throw new Error("NEXT_PUBLIC_ENOKI_API_KEY not configured");
  }
  return new EnokiClient({ apiKey });
}

// ── Step 1: start OAuth ───────────────────────────────────────────────────────

export async function startZkLoginOAuth(): Promise<void> {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId || clientId === "your_google_client_id_here") {
    throw new Error("NEXT_PUBLIC_GOOGLE_CLIENT_ID not configured");
  }

  // Fresh ephemeral keypair per login attempt
  const ephemeralKeypair = new Ed25519Keypair();

  // Enoki creates the nonce and returns maxEpoch + randomness — we store them
  const { nonce, maxEpoch, randomness } = await enoki().createZkLoginNonce({
    network: "testnet",
    ephemeralPublicKey: ephemeralKeypair.getPublicKey(),
  });

  const meta: NonceMetadata = {
    ephemeralPrivateKey: ephemeralKeypair.getSecretKey(),
    maxEpoch,
    randomness,
  };
  sessionStorage.setItem(NONCE_KEY, JSON.stringify(meta));

  const redirectUri = `${window.location.origin}/auth/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "id_token",
    scope: "openid email",
    nonce,
    prompt: "select_account",
  });

  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

// ── Step 2: handle the OAuth redirect ────────────────────────────────────────

export async function handleZkLoginCallback(): Promise<ZkLoginSession> {
  // Google returns: /auth/callback#id_token=...
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const jwt = hash.get("id_token");
  if (!jwt) throw new Error("No id_token in callback URL");

  const raw = sessionStorage.getItem(NONCE_KEY);
  if (!raw) throw new Error("No nonce metadata in sessionStorage — restart login");

  const { ephemeralPrivateKey, maxEpoch, randomness } = JSON.parse(raw) as NonceMetadata;
  const ephemeralKeypair = Ed25519Keypair.fromSecretKey(ephemeralPrivateKey);

  // createZkLoginZkp returns ZkLoginSignatureInputs (proofPoints, issBase64Details,
  // headerBase64, addressSeed) plus a `salt` field used to derive the Sui address.
  const zkProof = await enoki().createZkLoginZkp({
    network: "testnet",
    jwt,
    ephemeralPublicKey: ephemeralKeypair.getPublicKey(),
    maxEpoch,
    randomness,
  });

  // zkProof IS ZkLoginSignatureInputs — cast is safe per type declaration
  const zkInputs = zkProof as ZkLoginSignatureInputs;

  // jwtToAddress: JWT sub+iss hashed with Enoki-managed salt → stable Sui address
  const salt = (zkProof as ZkLoginSignatureInputs & { salt?: string }).salt ?? "0";
  const address = jwtToAddress(jwt, salt);

  const session: ZkLoginSession = { address, ephemeralKeypair, zkInputs, maxEpoch };

  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      address,
      ephemeralPrivateKey: ephemeralKeypair.getSecretKey(),
      zkInputs,
      maxEpoch,
    }),
  );
  sessionStorage.removeItem(NONCE_KEY);

  return session;
}

// ── Step 3: sign a transaction ────────────────────────────────────────────────

export async function signWithZkLogin(
  session: ZkLoginSession,
  txBytes: Uint8Array,
): Promise<string> {
  const { signature: ephemeralSig } =
    await session.ephemeralKeypair.signTransaction(txBytes);

  return getZkLoginSignature({
    inputs: session.zkInputs,
    maxEpoch: session.maxEpoch,
    userSignature: ephemeralSig,
  });
}

// ── Session persistence ───────────────────────────────────────────────────────

export function loadZkLoginSession(): ZkLoginSession | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const { address, ephemeralPrivateKey, zkInputs, maxEpoch } = JSON.parse(raw);
    const ephemeralKeypair = Ed25519Keypair.fromSecretKey(ephemeralPrivateKey);
    return { address, ephemeralKeypair, zkInputs, maxEpoch };
  } catch {
    return null;
  }
}

export function clearZkLoginSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(NONCE_KEY);
}
