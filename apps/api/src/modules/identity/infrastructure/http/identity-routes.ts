import type { components, operations } from '@clone/contract';
import type { FastifyInstance } from 'fastify';

import { authenticatedUserId } from '../../../../shared/infrastructure/auth/authentication.ts';
import type { GetPlan } from '../../../billing/application/use-cases/get-plan.ts';
import { routeSchemaFor } from '../../../../shared/infrastructure/http/contract-schemas.ts';
import type { PublicMediaUrls } from '../../../../shared/infrastructure/http/public-media-urls.ts';
import type { CheckUsernameAvailability } from '../../application/use-cases/check-username-availability.ts';
import type { CompleteOnboarding } from '../../application/use-cases/complete-onboarding.ts';
import type { GetMe } from '../../application/use-cases/get-me.ts';
import type { GetProfile, ProfileView } from '../../application/use-cases/get-profile.ts';
import type { RemoveAvatar } from '../../application/use-cases/remove-avatar.ts';
import type { UpdateMe } from '../../application/use-cases/update-me.ts';
import type { UpdateSettings } from '../../application/use-cases/update-settings.ts';
import type { Profile } from '../../domain/profile.ts';

export interface IdentityUseCases {
  getMe: GetMe;
  updateMe: UpdateMe;
  updateSettings: UpdateSettings;
  removeAvatar: RemoveAvatar;
  completeOnboarding: CompleteOnboarding;
  checkUsernameAvailability: CheckUsernameAvailability;
  getProfile: GetProfile;
  /** Module `billing` : plan Clone Plus des réponses `Me` (ADR-012). */
  getPlan: GetPlan;
}

type Me = components['schemas']['Me'];
type UserProfile = components['schemas']['UserProfile'];
type JsonBody<Operation extends keyof operations> = operations[Operation] extends {
  requestBody: { content: { 'application/json': infer Body } };
}
  ? Body
  : never;

/** Routes du module `identity` : authentifiées par le scope `/v1` (voir `app.ts`). */
export function registerIdentityRoutes(
  app: FastifyInstance,
  useCases: IdentityUseCases,
  urls: PublicMediaUrls,
): void {
  const toMe = async ({ avatar, createdAt, ...profile }: Profile): Promise<Me> => {
    const { plan, expiresAt } = await useCases.getPlan.execute({ userId: profile.id });
    return {
      ...profile,
      ...(avatar && { avatar: urls.of(avatar.variants) }),
      plan,
      ...(expiresAt && { plusExpiresAt: expiresAt.toISOString() }),
      createdAt: createdAt.toISOString(),
    };
  };

  // Profil public : ni date de naissance, ni statut, ni date de création.
  const toUserProfile = ({ profile, relationship, canViewContent }: ProfileView): UserProfile => ({
    id: profile.id,
    username: profile.username,
    fullName: profile.fullName,
    bio: profile.bio,
    isPrivate: profile.isPrivate,
    followerCount: profile.followerCount,
    followingCount: profile.followingCount,
    postCount: profile.postCount,
    ...(profile.avatar && { avatar: urls.of(profile.avatar.variants) }),
    relationship,
    canViewContent,
  });

  app.get('/v1/me', { schema: routeSchemaFor('getMe') }, async (request): Promise<Me> => {
    return toMe(await useCases.getMe.execute({ userId: authenticatedUserId(request) }));
  });

  app.patch<{ Body: JsonBody<'updateMe'> }>(
    '/v1/me',
    { schema: routeSchemaFor('updateMe') },
    async (request): Promise<Me> => {
      const profile = await useCases.updateMe.execute({
        userId: authenticatedUserId(request),
        changes: request.body,
      });
      return toMe(profile);
    },
  );

  app.patch<{ Body: JsonBody<'updateSettings'> }>(
    '/v1/me/settings',
    { schema: routeSchemaFor('updateSettings') },
    async (request): Promise<Me> => {
      const profile = await useCases.updateSettings.execute({
        userId: authenticatedUserId(request),
        isPrivate: request.body.isPrivate,
      });
      return toMe(profile);
    },
  );

  app.delete(
    '/v1/me/avatar',
    { schema: routeSchemaFor('removeAvatar') },
    async (request): Promise<Me> => {
      return toMe(await useCases.removeAvatar.execute({ userId: authenticatedUserId(request) }));
    },
  );

  app.post<{ Body: JsonBody<'completeOnboarding'> }>(
    '/v1/me/onboarding',
    { schema: routeSchemaFor('completeOnboarding') },
    async (request, reply): Promise<Me> => {
      const profile = await useCases.completeOnboarding.execute({
        userId: authenticatedUserId(request),
        ...request.body,
      });
      reply.status(201);
      return toMe(profile);
    },
  );

  app.get<{ Params: { username: string } }>(
    '/v1/usernames/:username/availability',
    { schema: routeSchemaFor('getUsernameAvailability') },
    async (request): Promise<components['schemas']['UsernameAvailability']> => {
      return useCases.checkUsernameAvailability.execute({
        userId: authenticatedUserId(request),
        username: request.params.username,
      });
    },
  );

  app.get<{ Params: { username: string } }>(
    '/v1/users/:username',
    { schema: routeSchemaFor('getUserProfile') },
    async (request): Promise<UserProfile> => {
      const view = await useCases.getProfile.execute({
        viewerId: authenticatedUserId(request),
        username: request.params.username,
      });
      return toUserProfile(view);
    },
  );
}
