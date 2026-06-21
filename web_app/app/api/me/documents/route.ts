import { NextRequest, NextResponse } from "next/server";
import { getDocumentsByOwner } from "@/src/services/indexer";

// Returns all Record objects owned by the authenticated client.
// For MVP: address from query param. Production: read from session.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const owner = searchParams.get("owner");

  if (!owner) {
    return NextResponse.json({ error: "owner query param required" }, { status: 400 });
  }

  const documents = await getDocumentsByOwner(owner);
  return NextResponse.json({ documents });
}
