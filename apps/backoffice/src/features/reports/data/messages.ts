/** Message affiché (toast) pour un refus de l'API au traitement d'un signalement. */
export function resolutionErrorMessage(status: number, code: string | undefined): string {
  switch (code) {
    case 'report_already_resolved':
      return 'Ce signalement a déjà été traité. Rechargez la page.';
    case 'cannot_remove_user':
      return 'Un compte ne peut être que classé ; sanctionnez-le depuis sa fiche.';
    case 'report_not_found':
      return 'Ce signalement n’existe plus.';
    case 'admin_required':
      return 'Votre compte n’a pas accès au backoffice.';
    case 'validation_failed':
      return 'La note est invalide.';
    default:
      return status === 429
        ? 'Trop de requêtes. Réessayez dans une minute.'
        : 'L’action a échoué. Réessayez.';
  }
}
