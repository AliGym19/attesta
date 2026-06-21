/**
 * Mailer — sends pointer-only emails to clients.
 * The email contains ONLY the matter reference and the verify URL.
 * No document content, no hash, no sensitive data ever.
 *
 * Anti-phishing copy is baked into the template and not configurable at send time.
 *
 * Configure: set MAILER_API_KEY and MAILER_FROM in .env.local.
 * Uses Resend by default; swap the fetch call for any transactional provider.
 */

const FROM = process.env.MAILER_FROM ?? "noreply@attesta.app";
const API_KEY = process.env.MAILER_API_KEY ?? "";

export type MailerPayload = {
  to: string;
  matterReference: string;
  verifyUrl: string;
  firmName?: string;
};

export async function sendMatterReference(payload: MailerPayload): Promise<void> {
  if (!API_KEY) {
    console.warn("[mailer] MAILER_API_KEY not set — skipping send in dev");
    return;
  }

  const html = buildHtml(payload);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: payload.to,
      subject: `Your document reference: ${payload.matterReference}`,
      html,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mailer failed (${res.status}): ${text}`);
  }
}

function buildHtml({ matterReference, verifyUrl, firmName }: MailerPayload): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /></head>
<body style="font-family:monospace;max-width:560px;margin:40px auto;color:#000;">
  <p style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;opacity:0.5;margin-bottom:24px;">
    ATTESTA — Register of Record
  </p>

  <p style="font-size:18px;font-weight:bold;margin-bottom:8px;">
    ${firmName ? `${firmName} has issued you a sealed document.` : "A document has been sealed for you."}
  </p>

  <p style="font-size:14px;line-height:1.6;margin-bottom:24px;">
    Your matter reference is <strong>${matterReference}</strong>.
    Use it and the link below to verify the document fingerprint on the blockchain.
  </p>

  <p style="margin-bottom:32px;">
    <a href="${verifyUrl}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;">
      Verify document →
    </a>
  </p>

  <hr style="border:none;border-top:1px solid #000;opacity:0.1;margin-bottom:24px;" />

  <p style="font-size:11px;opacity:0.4;line-height:1.6;">
    <strong>Anti-phishing notice:</strong> Attesta will never ask for your password, private keys,
    or payment details by email. This email contains a reference only — no document was attached
    and no sensitive data was transmitted. If you did not expect this email, contact the firm directly
    using contact details from their official website, not from this email.
  </p>
</body>
</html>
  `.trim();
}
