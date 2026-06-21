"use client";

import { SuiClientProvider, WalletProvider } from "@mysten/dapp-kit";
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";

import "@mysten/dapp-kit/dist/index.css";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  const networks = {
    testnet: { url: getFullnodeUrl("testnet") },
  } as const;

  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networks} defaultNetwork="testnet">
        {/*
          WalletProvider: discovers browser-extension wallets + Passkey.
          zkLogin is handled via the raw flow in src/services/zklogin.ts —
          we own the ephemeral keypair + ZKP, so no wallet adapter is needed.
        */}
        <WalletProvider autoConnect>
          <PasskeyRegistrar />
          {children}
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}

function PasskeyRegistrar() {
  useEffect(() => {
    const client = new SuiClient({ url: getFullnodeUrl("testnet") });
    import("./passkey-wallet")
      .then(({ PasskeyWallet }) => PasskeyWallet.register(client))
      .catch((err) => console.warn("[passkey] registration skipped:", err));
  }, []);
  return null;
}
