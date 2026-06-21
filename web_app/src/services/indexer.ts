import { suiClient, PACKAGE_ID, STATUS, type StatusValue } from "./sui-client";
import type { SuiEvent } from "@mysten/sui/client";
import { upsertMatter, getMattersBySealer as dbGetBySealer, getMattersByClientIdentity as dbGetByClient } from "./supabase";

export type MatterRow = {
  certId: string;
  reference: string;
  sha256: string;
  sealedMs: number;
  sealer: string;
  status: StatusValue;
  walrusBlob: string;
};

/**
 * Query all `Sealed` events for this package and return them as MatterRow[].
 * For production, this would be backed by a Postgres mirror with a persisted
 * cursor; for MVP we query the chain directly (fine for testnet scale).
 */
export async function getAllMatters(limit = 50): Promise<MatterRow[]> {
  const { data } = await suiClient.queryEvents({
    query: { MoveEventType: `${PACKAGE_ID}::registry::Sealed` },
    limit,
    order: "descending",
  });

  return data.map(eventToMatterRow).filter(Boolean) as MatterRow[];
}

/** Query matters scoped to a specific sealer address — reads Supabase mirror first. */
export async function getMattersBySealer(
  sealerAddress: string,
  limit = 50,
): Promise<MatterRow[]> {
  try {
    const rows = await dbGetBySealer(sealerAddress);
    if (rows.length > 0) {
      return rows.map((r) => ({
        certId: r.cert_id,
        reference: r.reference,
        sha256: r.sha256,
        sealedMs: r.sealed_ms,
        sealer: r.sealer,
        status: r.status as StatusValue,
        walrusBlob: r.walrus_blob,
      }));
    }
  } catch {
    // fall through to chain query
  }
  const all = await getAllMatters(limit);
  return all.filter((r) => r.sealer === sealerAddress);
}

/** Query Record objects owned by a specific address — Supabase mirror + chain fallback. */
export async function getDocumentsByOwner(ownerAddress: string): Promise<MatterRow[]> {
  try {
    const rows = await dbGetByClient(ownerAddress);
    if (rows.length > 0) {
      return rows.map((r) => ({
        certId: r.cert_id,
        reference: r.reference,
        sha256: r.sha256,
        sealedMs: r.sealed_ms,
        sealer: r.sealer,
        status: r.status as StatusValue,
        walrusBlob: r.walrus_blob,
      }));
    }
  } catch {
    // fall through to chain query
  }

  // Chain fallback: query owned Record objects
  const { data } = await suiClient.getOwnedObjects({
    owner: ownerAddress,
    filter: { StructType: `${PACKAGE_ID}::registry::Record` },
    options: { showContent: true },
  });

  return data
    .map((obj) => {
      if (obj.data?.content?.dataType !== "moveObject") return null;
      const fields = obj.data.content.fields as Record<string, unknown>;
      return {
        certId: obj.data.objectId,
        reference: String(fields.reference ?? ""),
        sha256: bytesToHex(fields.sha256 as number[]),
        sealedMs: Number(fields.sealed_ms ?? 0),
        sealer: String(fields.sealer ?? ""),
        status: Number(fields.status ?? 0) as StatusValue,
        walrusBlob: String(fields.walrus_blob ?? ""),
      };
    })
    .filter(Boolean) as MatterRow[];
}

/** Fetch a single Record by object id and resolve its current on-chain state. */
export async function getRecord(objectId: string): Promise<MatterRow | null> {
  const res = await suiClient.getObject({ id: objectId, options: { showContent: true } });
  if (res.data?.content?.dataType !== "moveObject") return null;
  const fields = res.data.content.fields as Record<string, unknown>;
  return {
    certId: objectId,
    reference: String(fields.reference ?? ""),
    sha256: bytesToHex(fields.sha256 as number[]),
    sealedMs: Number(fields.sealed_ms ?? 0),
    sealer: String(fields.sealer ?? ""),
    status: Number(fields.status ?? 0) as StatusValue,
    walrusBlob: String(fields.walrus_blob ?? ""),
  };
}

function eventToMatterRow(event: SuiEvent): MatterRow | null {
  const j = event.parsedJson as Record<string, unknown> | undefined;
  if (!j) return null;
  return {
    certId: String(j.cert ?? ""),
    reference: String(j.reference ?? ""),
    sha256: bytesToHex(j.sha256 as number[]),
    sealedMs: Number(j.sealed_ms ?? 0),
    sealer: String(j.sealer ?? ""),
    status: STATUS.ISSUED,
    walrusBlob: "",
  };
}

function bytesToHex(bytes: number[] | undefined): string {
  if (!bytes) return "";
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
