import { NotFoundError } from '../../../shared/domain/errors.ts';

/** Onboarding non terminé : pas de pseudo à transmettre au serveur Live. */
export class LiveProfileNotFoundError extends NotFoundError {
  constructor() {
    super('profile_not_found', 'Aucun profil : l’onboarding n’est pas terminé.');
  }
}

/** `LIVE_APP_ID` ou `LIVE_TOKEN_SECRET` absent : le Live n'est pas disponible sur cette API. */
export class LiveUnavailableError extends NotFoundError {
  constructor() {
    super('live_unavailable', 'Le Live n’est pas configuré sur ce serveur.');
  }
}
