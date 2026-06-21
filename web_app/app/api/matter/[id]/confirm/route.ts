import { NextRequest, NextResponse } from "next/server";
import { sponsorConfirmView } from "@/src/services/gas-station";

// Gas-station sponsors confirm_view — client pays no gas.
// In production: verify the caller's session before sponsoring.
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const digest = await sponsorConfirmView(params.id);
  return NextResponse.json({ digest });
}
