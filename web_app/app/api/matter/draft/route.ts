import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";

// Canonicalise fields and compute server-side SHA-256 for parity check.
// The client recomputes the hash from the file bytes and compares — if they
// match, the client knows exactly what was hashed before sealing.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { docType, fields } = body as { docType?: string; fields?: Record<string, string> };
  if (!docType || !fields) {
    return NextResponse.json({ error: "docType and fields are required" }, { status: 400 });
  }

  // Canonical serialisation: sorted keys, no trailing whitespace.
  // The client must use the same serialisation to confirm parity.
  const canonical = JSON.stringify(
    Object.fromEntries(
      Object.entries(fields)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, String(v).trim()]),
    ),
  );

  const sha256 = createHash("sha256").update(canonical, "utf8").digest("hex");

  return NextResponse.json({
    canonical,
    sha256,
    docType,
    preview: fields,
  });
}
