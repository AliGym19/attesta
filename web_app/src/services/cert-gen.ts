/**
 * Certificate generator.
 * Produces a machine-readable JSON certificate (PDF generation requires
 * a PDF library — add @react-pdf/renderer or pdf-lib for that layer).
 * The JSON is the canonical artifact; PDF is a rendering of it.
 */

export type CertificateData = {
  certId: string;
  txDigest: string;
  reference: string;
  sha256: string;
  sealedMs: number;
  sealer: string;
  status: number;
  verifyUrl: string;
};

/** Build a canonical certificate object for a sealed Record. */
export function buildCertificate(data: CertificateData): CertificateData & {
  issuedAt: string;
  packageId: string;
} {
  return {
    ...data,
    issuedAt: new Date(data.sealedMs).toISOString(),
    packageId: process.env.NEXT_PUBLIC_PACKAGE_ID ?? "",
  };
}

/**
 * Generate the public verify URL for a certificate.
 * Format: /verify?cert=<objectId>
 */
export function verifyUrl(certId: string, baseUrl = ""): string {
  return `${baseUrl}/verify?cert=${encodeURIComponent(certId)}`;
}
