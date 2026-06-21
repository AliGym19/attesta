const PUBLISHER = process.env.WALRUS_PUBLISHER ?? "https://publisher.walrus-testnet.walrus.space";
const AGGREGATOR = process.env.WALRUS_AGGREGATOR ?? "https://aggregator.walrus-testnet.walrus.space";

export type WalrusUploadResult = {
  blobId: string;
  blobObjectId: string;
  endEpoch: number;
};

/**
 * Upload bytes to Walrus and return the blob id + Sui object id.
 * `epochs` controls storage duration (testnet epoch ≈ 1 day).
 */
export async function uploadBlob(
  bytes: Uint8Array,
  epochs: number = 53,
): Promise<WalrusUploadResult> {
  const res = await fetch(`${PUBLISHER}/v1/blobs?epochs=${epochs}`, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream" },
    body: bytes.buffer as ArrayBuffer,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Walrus upload failed (${res.status}): ${text}`);
  }

  const json = await res.json();

  // Walrus returns either { newlyCreated: { blobObject: { ... } } }
  // or { alreadyCertified: { blobId, ... } }
  if (json.newlyCreated) {
    const obj = json.newlyCreated.blobObject;
    return {
      blobId: obj.blobId,
      blobObjectId: obj.id,
      endEpoch: obj.storage?.endEpoch ?? 0,
    };
  }
  if (json.alreadyCertified) {
    return {
      blobId: json.alreadyCertified.blobId,
      blobObjectId: json.alreadyCertified.blobObject?.id ?? "",
      endEpoch: json.alreadyCertified.endEpoch ?? 0,
    };
  }

  throw new Error(`Unexpected Walrus response: ${JSON.stringify(json)}`);
}

/** Fetch raw bytes for a blob from the Walrus aggregator. */
export async function fetchBlob(blobId: string): Promise<Uint8Array> {
  const res = await fetch(`${AGGREGATOR}/v1/blobs/${blobId}`);
  if (!res.ok) throw new Error(`Walrus fetch failed (${res.status}) for blob ${blobId}`);
  return new Uint8Array(await res.arrayBuffer());
}
