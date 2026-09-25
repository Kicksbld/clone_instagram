/** Supabase Storage vu par l'API (ADR-004, ADR-008) : l'API ne transporte jamais le fichier. */
export interface MediaStorage {
  /** URL présignée d'un seul envoi (`PUT` du contenu brut) vers `path` du bucket `uploads`. */
  createUploadUrl(path: string): Promise<{ url: string; expiresAt: Date }>;
}
