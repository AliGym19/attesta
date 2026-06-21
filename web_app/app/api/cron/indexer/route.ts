import { NextResponse } from "next/server";
import { getAllMatters } from "@/src/services/indexer";
import { upsertMatter } from "@/src/services/supabase";

// Cron: poll Sealed events and persist to Supabase mirror.
// Vercel cron: set up in vercel.json
export async function GET() {
  const matters = await getAllMatters(200);

  let synced = 0;
  for (const m of matters) {
    try {
      await upsertMatter({
        cert_id: m.certId,
        reference: m.reference,
        sha256: m.sha256,
        walrus_blob: m.walrusBlob,
        sealed_ms: m.sealedMs,
        sealer: m.sealer,
        status: m.status,
        client_identity: null,
      });
      synced++;
    } catch {
      // continue on individual failures
    }
  }

  return NextResponse.json({ synced, total: matters.length, at: new Date().toISOString() });
}
