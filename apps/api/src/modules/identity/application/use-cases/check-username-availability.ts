import { MAX_USERNAME_SUGGESTIONS, usernameSuggestionCandidates } from '../../domain/username.ts';
import type { ProfileRepository } from '../ports/profile-repository.ts';

export interface UsernameAvailability {
  username: string;
  available: boolean;
  suggestions: string[];
}

/**
 * Disponibilité d'un username, vérifiée en direct pendant l'onboarding. Le username de l'appelant
 * est disponible pour lui ; s'il est pris, jusqu'à 3 suggestions libres (ADR-018).
 */
export class CheckUsernameAvailability {
  constructor(private readonly profiles: ProfileRepository) {}

  async execute(input: { userId: string; username: string }): Promise<UsernameAvailability> {
    const { userId, username } = input;
    const taken = await this.profiles.findTakenUsernames([username], userId);
    if (!taken.has(username)) return { username, available: true, suggestions: [] };

    const candidates = usernameSuggestionCandidates(username);
    const takenCandidates = await this.profiles.findTakenUsernames(candidates, userId);
    const suggestions = candidates
      .filter((candidate) => !takenCandidates.has(candidate))
      .slice(0, MAX_USERNAME_SUGGESTIONS);
    return { username, available: false, suggestions };
  }
}
