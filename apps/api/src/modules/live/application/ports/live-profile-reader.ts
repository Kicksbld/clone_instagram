export interface LiveProfile {
  id: string;
  username: string;
  /** URL publique de l'avatar (variante `thumb`), `null` sans avatar. */
  avatarUrl: string | null;
}

export interface LiveProfileReader {
  find(userId: string): Promise<LiveProfile | null>;
}
