/**
 * Gas station — sponsors PTBs for whitelisted calls so clients pay no gas.
 * Whitelisted: `registry::confirm_view`, `registry::confirm_signoff` only.
 *
 * For MVP the funded keypair is loaded from GAS_STATION_PRIVATE_KEY env var.
 * For production: key lives in a KMS; the gas-station runs as a separate process
 * with rate limiting and gas-coin locking.
 *
 * This module is SERVER-SIDE ONLY — never import in client components.
 */

import { PACKAGE_ID, CLOCK_OBJECT_ID, suiClient } from "./sui-client";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

const WHITELISTED_FUNCTIONS = new Set([
  `${PACKAGE_ID}::registry::confirm_view`,
  `${PACKAGE_ID}::registry::confirm_signoff`,
]);

function getKeypair(): Ed25519Keypair {
  const key = process.env.GAS_STATION_PRIVATE_KEY;
  if (!key) throw new Error("GAS_STATION_PRIVATE_KEY not set");
  return Ed25519Keypair.fromSecretKey(Buffer.from(key, "base64"));
}

/** Sponsor a confirm_view PTB for the given Record object id. */
export async function sponsorConfirmView(recordObjectId: string): Promise<string> {
  const target = `${PACKAGE_ID}::registry::confirm_view` as const;
  if (!WHITELISTED_FUNCTIONS.has(target)) throw new Error("Not whitelisted");

  const tx = new Transaction();
  tx.moveCall({
    target,
    arguments: [tx.object(recordObjectId), tx.object(CLOCK_OBJECT_ID)],
  });

  const keypair = getKeypair();
  const result = await suiClient.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
    options: { showEffects: true, showEvents: true },
  });

  if (result.effects?.status?.status !== "success") {
    throw new Error(`confirm_view failed: ${JSON.stringify(result.effects?.status)}`);
  }

  return result.digest;
}

/** Sponsor a confirm_signoff PTB for the given Record object id. */
export async function sponsorConfirmSignoff(recordObjectId: string): Promise<string> {
  const target = `${PACKAGE_ID}::registry::confirm_signoff` as const;
  if (!WHITELISTED_FUNCTIONS.has(target)) throw new Error("Not whitelisted");

  const tx = new Transaction();
  tx.moveCall({
    target,
    arguments: [tx.object(recordObjectId), tx.object(CLOCK_OBJECT_ID)],
  });

  const keypair = getKeypair();
  const result = await suiClient.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
    options: { showEffects: true, showEvents: true },
  });

  if (result.effects?.status?.status !== "success") {
    throw new Error(`confirm_signoff failed: ${JSON.stringify(result.effects?.status)}`);
  }

  return result.digest;
}
