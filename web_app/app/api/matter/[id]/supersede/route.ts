import { NextRequest, NextResponse } from "next/server";
import { PACKAGE_ID, CLOCK_OBJECT_ID, suiClient } from "@/src/services/sui-client";
import { Transaction } from "@mysten/sui/transactions";

// Returns an unsigned PTB for the client wallet to sign.
// Only the original sealer can supersede — enforced on-chain.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const body = await req.json().catch(() => ({}));
  const reason: string = body.reason ?? "Superseded";
  const recordId = params.id;

  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::registry::supersede`,
    arguments: [
      tx.object(recordId),
      tx.pure.string(reason),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });

  const txBytes = await tx.build({ client: suiClient });
  return NextResponse.json({ txBase64: Buffer.from(txBytes).toString("base64") });
}
