/** Message affiché (toast) pour un refus de l'API sur une action d'administration. */
export function moderationErrorMessage(status: number, code: string | undefined): string {
  switch (code) {
    case 'invalid_status_transition':
      return 'Le statut du compte ne permet pas cette action. Rechargez la page.';
    case 'cannot_moderate_self':
      return 'Vous ne pouvez pas appliquer cette action à votre propre compte.';
    case 'user_not_found':
      return 'Ce compte n’existe plus.';
    case 'admin_required':
      return 'Votre compte n’a pas accès au backoffice.';
    case 'validation_failed':
      return 'Le motif est invalide.';
    default:
      return status === 429
        ? 'Trop de requêtes. Réessayez dans une minute.'
        : 'L’action a échoué. Réessayez.';
  }
}
