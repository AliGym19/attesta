import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";

export const PACKAGE_ID = process.env.NEXT_PUBLIC_PACKAGE_ID!;
export const NETWORK = (process.env.NEXT_PUBLIC_NETWORK ?? "testnet") as "testnet" | "mainnet";
export const RPC_URL = process.env.NEXT_PUBLIC_RPC ?? getFullnodeUrl(NETWORK);

export const suiClient = new SuiClient({ url: RPC_URL });

// Shared Clock object id on all Sui networks
export const CLOCK_OBJECT_ID = "0x6";

// Status constants mirror the Move contract
export const STATUS = {
  ISSUED: 0,
  VIEWED: 1,
  VERIFIED: 2,
  SIGNED: 3,
  SUPERSEDED: 4,
  PENDING_APPROVAL: 5,
} as const;

export type StatusValue = (typeof STATUS)[keyof typeof STATUS];
