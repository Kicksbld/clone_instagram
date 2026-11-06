/** Participant du Live commun (echimine/live-sdk), tel que transmis dans le Jeton de Participant. */
export interface LiveParticipant {
  id: string;
  /** Pseudo : 30 caractères visibles au plus, sinon le serveur Live refuse le jeton. */
  name: string;
  /** Avatar en `https`, sinon ignoré par le serveur Live. */
  picture?: string;
}

const NAME_MAX_GRAPHEMES = 30;
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function liveParticipantOf(profile: {
  id: string;
  username: string;
  avatarUrl: string | null;
}): LiveParticipant {
  const name = Array.from(graphemes.segment(profile.username.trim()), (s) => s.segment)
    .slice(0, NAME_MAX_GRAPHEMES)
    .join('');
  return {
    id: profile.id,
    name,
    ...(profile.avatarUrl?.startsWith('https://') && { picture: profile.avatarUrl }),
  };
}
