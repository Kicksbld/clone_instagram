/** Signed URLs of the private bucket `media-private` (ADR-008, ADR-023). */
export interface PrivateMediaUrls {
  /** URL valid for one hour (ADR-023). */
  sign(path: string): Promise<{ url: string; expiresAt: Date }>;
}
