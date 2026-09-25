import type { VisibilitySubject } from '../../../../shared/domain/visibility.ts';

/** Compte visé par un abonnement : ce que la politique de visibilité lit, et son compteur. */
export interface Account extends VisibilitySubject {
  followerCount: number;
}

/** Lecture des comptes (table `profiles`) par le module `social`. */
export interface AccountReader {
  findById(id: string): Promise<Account | null>;
}
