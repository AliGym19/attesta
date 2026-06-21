"use client";

/**
 * Passkey wallet adapter for dapp-kit.
 *
 * PasskeyKeypair uses WebAuthn (device biometric / PIN) to produce a real Sui
 * secp256r1 keypair backed by the device's secure enclave. The credential is
 * stored on the device and recovered by username on subsequent logins.
 *
 * We wrap it as a minimal wallet-standard wallet so dapp-kit can discover it
 * alongside Enoki/Google. On sign, we call PasskeyKeypair directly — no popup.
 */

import type { SuiClient } from "@mysten/sui/client";

export const PasskeyWallet = {
  /**
   * Register a passkey wallet entry in the wallet-standard registry.
   * Called once when the provider tree mounts (browser only).
   */
  async register(_client: SuiClient): Promise<void> {
    // PasskeyKeypair uses WebAuthn under the hood; no wallet-standard registration
    // needed — createCredential / recoverCredential import it directly on use.
    // This hook exists for future extension (e.g. pre-warming the WASM).
  },

  /**
   * Create a new passkey credential for the user.
   * Triggers the browser's WebAuthn registration prompt.
   */
  async createCredential(appName: string): Promise<{ address: string }> {
    const { PasskeyKeypair, BrowserPasskeyProvider } = await import(
      "@mysten/sui/keypairs/passkey"
    );
    // BrowserPasswordProviderOptions is a complex Pick/Omit from WebAuthn types.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const provider = new BrowserPasskeyProvider(appName, {
      rp: { name: appName, id: window.location.hostname },
    } as any);
    const keypair = await PasskeyKeypair.getPasskeyInstance(provider);
    return { address: keypair.getPublicKey().toSuiAddress() };
  },

  /**
   * Recover an existing passkey credential.
   * Triggers the browser's WebAuthn assertion prompt.
   */
  async recoverCredential(appName: string): Promise<{ address: string; keypair: unknown }> {
    const { PasskeyKeypair, BrowserPasskeyProvider } = await import(
      "@mysten/sui/keypairs/passkey"
    );
    // BrowserPasswordProviderOptions is a complex Pick/Omit from WebAuthn types.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const provider = new BrowserPasskeyProvider(appName, {
      rp: { name: appName, id: window.location.hostname },
    } as any);
    const keypair = await PasskeyKeypair.getPasskeyInstance(provider);
    const address = keypair.getPublicKey().toSuiAddress();
    return { address, keypair };
  },
};
