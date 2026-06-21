import { NextRequest, NextResponse } from "next/server";
import { getMattersBySealer } from "@/src/services/indexer";

// Returns all matters for a given sealer address, optionally filtered by status.
// In production this is scoped by the solicitor's session (RBAC); for MVP we
// accept the address as a query param.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sealer = searchParams.get("sealer");
  const statusFilter = searchParams.get("status");

  if (!sealer) {
    return NextResponse.json({ error: "sealer query param required" }, { status: 400 });
  }

  let matters = await getMattersBySealer(sealer);

  if (statusFilter !== null) {
    const code = parseInt(statusFilter, 10);
    matters = matters.filter((m) => m.status === code);
  }

  return NextResponse.json({ matters });
}
