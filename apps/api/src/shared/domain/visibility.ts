/**
 * Politique de visibilité unique (ADR-006), appelée par chaque use case de lecture. Les requêtes de
 * liste (feed, recherche, listes d'abonnés…) traduisent ces mêmes règles en SQL. Un contenu invisible
 * renvoie 404, jamais 403.
 */

export type AccountStatus = 'active' | 'suspended' | 'banned';

/** Propriétaire d'un profil ou d'un contenu, tel que la politique le lit. */
export interface VisibilitySubject {
  id: string;
  status: AccountStatus;
  isPrivate: boolean;
}

/** Relation entre l'appelant (`viewer`) et le propriétaire (`owner`), lue par `RelationshipReader`. */
export interface Relationship {
  viewerFollowsOwner: boolean;
  ownerFollowsViewer: boolean;
  /** Blocage dans un sens ou dans l'autre. */
  blocked: boolean;
  /** L'appelant est dans les amis proches du propriétaire (P1). */
  viewerIsCloseFriend: boolean;
}

export type StoryAudience = 'everyone' | 'close_friends';

export interface StorySubject {
  author: VisibilitySubject;
  audience: StoryAudience;
}

/** Relation de soi à soi : aucun abonnement ni blocage. */
export const SELF_RELATIONSHIP: Relationship = {
  viewerFollowsOwner: false,
  ownerFollowsViewer: false,
  blocked: false,
  viewerIsCloseFriend: false,
};

/** Aucun blocage dans un sens ou dans l'autre, et compte actif ; on voit toujours son propre profil. */
export function canViewProfile(
  viewerId: string,
  owner: VisibilitySubject,
  relation: Relationship,
): boolean {
  if (viewerId === owner.id) return true;
  return !relation.blocked && owner.status === 'active';
}

/** `canViewProfile`, et compte public, soi-même ou abonné. */
export function canViewContent(
  viewerId: string,
  owner: VisibilitySubject,
  relation: Relationship,
): boolean {
  if (!canViewProfile(viewerId, owner, relation)) return false;
  return !owner.isPrivate || viewerId === owner.id || relation.viewerFollowsOwner;
}

/** `canViewContent`, et audience `everyone` ou appelant dans les amis proches de l'auteur. */
export function canViewStory(
  viewerId: string,
  story: StorySubject,
  relation: Relationship,
): boolean {
  if (!canViewContent(viewerId, story.author, relation)) return false;
  return (
    story.audience === 'everyone' || viewerId === story.author.id || relation.viewerIsCloseFriend
  );
}

/** `canViewProfile` (P2 : demande de message si le destinataire ne suit pas l'expéditeur). */
export function canMessage(
  senderId: string,
  recipient: VisibilitySubject,
  relation: Relationship,
): boolean {
  return canViewProfile(senderId, recipient, relation);
}

/** Abonnement dans les deux sens. */
export function isMutual(relation: Relationship): boolean {
  return relation.viewerFollowsOwner && relation.ownerFollowsViewer;
}
