import { NextRequest, NextResponse } from "next/server";
import { uploadBlob } from "@/src/services/walrus";
import { encrypt, derivePolicyId } from "@/src/services/seal-gateway";
import { sendMatterReference } from "@/src/services/mailer";
import { verifyUrl } from "@/src/services/cert-gen";
import { PACKAGE_ID, CLOCK_OBJECT_ID, suiClient } from "@/src/services/sui-client";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

// Full issuance flow:
// 1. Validate + hash
// 2. Seal-encrypt under policy
// 3. Upload ciphertext to Walrus → blobId
// 4. Build + upload manifest blob → manifestBlobId
// 5. PTB: registry::seal_record + optional vault::mint_vault
// 6. Parse Record id from Sealed event
// 7. Dispatch reference email
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const {
    sha256Hex,
    plaintextBytes,
    reference,
    clientEmail,
    clientIdentity,
    epochs = 53,
    isPrivate = false,
    firmName,
    signerAddress,
  } = body as {
    sha256Hex: string;
    plaintextBytes: number[];
    reference: string;
    clientEmail?: string;
    clientIdentity?: string;
    epochs?: number;
    isPrivate?: boolean;
    firmName?: string;
    signerAddress: string;
  };

  if (!sha256Hex || !plaintextBytes || !reference || !signerAddress) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const hashBytes = new Uint8Array(
    sha256Hex.match(/.{2}/g)!.map((h) => parseInt(h, 16)),
  );
  const plaintext = new Uint8Array(plaintextBytes);

  // Encrypt under a policy that allows solicitor + named client to decrypt
  const policyId = await derivePolicyId(reference);
  const ciphertext = await encrypt(plaintext, { policyId, allowedIds: [signerAddress, clientIdentity ?? ""].filter(Boolean) });

  // Upload ciphertext to Walrus
  const { blobId } = await uploadBlob(ciphertext, epochs);

  // Build + upload manifest (plaintext JSON — no sensitive content)
  const manifest = new TextEncoder().encode(
    JSON.stringify({ reference, sha256Hex, blobId, sealerAddress: signerAddress, clientIdentity }),
  );
  const { blobId: manifestBlobId } = await uploadBlob(manifest, epochs);

  // Build PTB
  // Note: the signer keypair must be loaded from the session or passed from
  // the client's dapp-kit wallet. For server-side signing (solicitor flow),
  // load from env. For client wallet signing, return an unsigned tx instead.
  const tx = new Transaction();

  tx.moveCall({
    target: `${PACKAGE_ID}::registry::seal_record`,
    arguments: [
      tx.pure.vector("u8", Array.from(hashBytes)),
      tx.pure.string(manifestBlobId),
      tx.pure.string(reference),
      clientIdentity
        ? tx.pure.option("address", clientIdentity)
        : tx.pure.option("address", null),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });

  if (isPrivate && clientIdentity) {
    tx.moveCall({
      target: `${PACKAGE_ID}::vault::mint_vault`,
      arguments: [
        tx.pure.string(reference),
        tx.pure.string(blobId),
        tx.pure.vector("u8", Array.from(hashBytes)),
        tx.pure.address(clientIdentity),
      ],
    });
  }

  // Serialize the unsigned tx and return to the client for wallet signing.
  // This keeps the private key in the browser wallet — the server never signs.
  const txBytes = await tx.build({ client: suiClient });
  const txBase64 = Buffer.from(txBytes).toString("base64");

  // Dispatch reference email (async, don't block response)
  if (clientEmail) {
    sendMatterReference({
      to: clientEmail,
      matterReference: reference,
      verifyUrl: verifyUrl("(pending)", process.env.NEXT_PUBLIC_APP_URL ?? ""),
      firmName,
    }).catch((err) => console.error("[mailer]", err));
  }

  return NextResponse.json({
    txBase64,
    blobId,
    manifestBlobId,
    sha256Hex,
  });
}
