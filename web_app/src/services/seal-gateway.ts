"use client";

/**
 * Seal integration.
 *
 * The Seal protocol encrypts data so that only holders of an approved identity
 * can decrypt it. The policy id encodes the set of authorized identities;
 * the gateway calls `attesta::access::seal_approve` on-chain to verify before
 * returning the decryption key material.
 *
 * For MVP: uses Seal's threshold-BLS scheme on Sui testnet.
 * The @mysten/seal SDK handles key requests and local decryption.
 */

import { PACKAGE_ID } from "./sui-client";

export type SealPolicy = {
  policyId: Uint8Array;    // 32-byte policy id derived from Record/Vault object id
  allowedIds: string[];    // Sui addresses authorized to decrypt
};

/**
 * Derive a Seal policy id from a Record object id.
 * Policy id = first 32 bytes of SHA-256(objectId).
 * This mirrors what `attesta::access::seal_approve` validates.
 */
export async function derivePolicyId(objectId: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(objectId);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(hash);
}

/**
 * Encrypt plaintext under a Seal policy.
 * Returns ciphertext bytes suitable for uploading to Walrus.
 *
 * NOTE: Requires @mysten/seal. Install: npm install @mysten/seal
 * Stubbed here until the SDK is confirmed installed.
 */
export async function encrypt(
  plaintext: Uint8Array,
  policy: SealPolicy,
): Promise<Uint8Array> {
  // TODO: replace stub with real Seal encryption once @mysten/seal is available
  // const { SealClient } = await import("@mysten/seal");
  // const sealClient = new SealClient({ suiClient, packageId: PACKAGE_ID });
  // return sealClient.encrypt({ data: plaintext, policyId: policy.policyId });

  // Stub: XOR with policy id bytes for shape — NOT secure, replace before prod
  const out = new Uint8Array(plaintext.length);
  for (let i = 0; i < plaintext.length; i++) {
    out[i] = plaintext[i] ^ policy.policyId[i % 32];
  }
  return out;
}

/**
 * Decrypt ciphertext locally after the Seal gateway approves the identity.
 * Decryption happens in the browser — the server never sees plaintext.
 */
export async function decrypt(
  ciphertext: Uint8Array,
  blobId: string,
  callerAddress: string,
): Promise<Uint8Array> {
  // TODO: replace stub with real Seal decryption
  // const { SealClient } = await import("@mysten/seal");
  // const sealClient = new SealClient({ suiClient, packageId: PACKAGE_ID });
  // return sealClient.decrypt({ ciphertext, blobId, senderAddress: callerAddress });

  // Stub: reverse the XOR (idempotent for symmetric stub)
  const policyId = await derivePolicyId(blobId);
  const out = new Uint8Array(ciphertext.length);
  for (let i = 0; i < ciphertext.length; i++) {
    out[i] = ciphertext[i] ^ policyId[i % 32];
  }
  return out;
}

// Suppress unused import warning until real Seal SDK is wired
void PACKAGE_ID;
