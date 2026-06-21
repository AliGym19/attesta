"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { handleZkLoginCallback } from "@/src/services/zklogin";

/**
 * Google OAuth callback page — /auth/callback
 * Google redirects here after the user authenticates.
 * Reads the id_token from the URL fragment, fetches ZKP from Enoki,
 * computes the Sui address, persists the session, and redirects home.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"processing" | "error">("processing");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    handleZkLoginCallback()
      .then(() => {
        // Session persisted — go back to the app
        router.replace("/");
      })
      .catch((err: Error) => {
        setError(err.message);
        setStatus("error");
      });
  }, [router]);

  if (status === "error") {
    return (
      <div style={{ padding: "2rem", fontFamily: "monospace" }}>
        <p style={{ color: "#ff4444" }}>zkLogin failed: {error}</p>
        <button onClick={() => router.replace("/")}>Back</button>
      </div>
    );
  }

  return (
    <div style={{ padding: "2rem", fontFamily: "monospace" }}>
      <p>Verifying identity…</p>
    </div>
  );
}
