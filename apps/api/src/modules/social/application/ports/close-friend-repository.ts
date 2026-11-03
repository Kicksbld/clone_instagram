/** Amis proches (table `close_friends`) : liste privée de son propriétaire, sans notification (ADR-006). */
export interface CloseFriendRepository {
  /** `ownerId` ajoute `friendId` ; `false`, sans effet, s'il y était déjà. */
  add(ownerId: string, friendId: string): Promise<boolean>;
  /** `ownerId` retire `friendId` ; `false`, sans effet, s'il n'y était pas. */
  remove(ownerId: string, friendId: string): Promise<boolean>;
}
