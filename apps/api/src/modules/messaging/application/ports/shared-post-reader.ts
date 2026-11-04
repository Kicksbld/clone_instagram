import type { VisibilitySubject } from '../../../../shared/domain/visibility.ts';
import type { SharedPost } from '../../domain/conversation.ts';

/** Messaging owns its referenced-content read model; no dependency on the posts module. */
export interface SharedPostReader {
  find(id: string): Promise<{ owner: VisibilitySubject; preview: SharedPost } | null>;
}
