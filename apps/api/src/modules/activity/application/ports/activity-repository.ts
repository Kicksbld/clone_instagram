/** Écriture de l'état de lecture des notifications. */
export interface ActivityRepository {
  /** Marque comme lues toutes les notifications non lues du destinataire. */
  markAllRead(recipientId: string): Promise<void>;
}
