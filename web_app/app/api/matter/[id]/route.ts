import { NextRequest, NextResponse } from "next/server";
import { getRecord } from "@/src/services/indexer";
import { STATUS } from "@/src/services/sui-client";

const STATUS_LABELS: Record<number, string> = {
  [STATUS.ISSUED]: "Issued",
  [STATUS.VIEWED]: "Viewed",
  [STATUS.VERIFIED]: "Verified",
  [STATUS.SIGNED]: "Signed",
  [STATUS.SUPERSEDED]: "Superseded",
  [STATUS.PENDING_APPROVAL]: "Pending Approval",
};

// Public, rate-limited lookup by matter reference (8-char or full object id).
// Returns only non-sensitive fields — never the hash, walrus blob, or sealer.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ref = params.id;
  if (!ref || ref.length < 4) {
    return NextResponse.json({ error: "Invalid reference" }, { status: 400 });
  }

  const record = await getRecord(ref).catch(() => null);

  if (!record) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(
    {
      certId: record.certId,
      reference: record.reference,
      statusCode: record.status,
      statusLabel: STATUS_LABELS[record.status] ?? "Unknown",
      sealedAt: new Date(record.sealedMs).toISOString(),
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    },
  );
}
