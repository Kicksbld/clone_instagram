import type { components } from '@clone/contract';
import type { FastifyInstance } from 'fastify';

import { authenticatedUserId } from '../../../../shared/infrastructure/auth/authentication.ts';
import { routeSchemaFor } from '../../../../shared/infrastructure/http/contract-schemas.ts';
import type { CreateReport } from '../../application/use-cases/create-report.ts';

export interface ModerationUseCases {
  createReport: CreateReport;
}

/** 10 signalements par heure et par utilisateur (ADR-005). */
const CREATE_REPORT_RATE_LIMIT = { max: 10, timeWindow: '1 hour' } as const;

/** Routes du module `moderation` : authentifiées par le scope `/v1` (voir `app.ts`). */
export function registerModerationRoutes(app: FastifyInstance, useCases: ModerationUseCases): void {
  app.post<{ Body: components['schemas']['CreateReportRequest'] }>(
    '/v1/reports',
    { schema: routeSchemaFor('createReport'), config: { rateLimit: CREATE_REPORT_RATE_LIMIT } },
    async (request, reply): Promise<components['schemas']['ReportCreated']> => {
      const { targetType, targetId, reason, details } = request.body;
      const report = await useCases.createReport.execute({
        reporterId: authenticatedUserId(request),
        target: { type: targetType, id: targetId },
        reason,
        ...(details !== undefined && { details }),
      });
      reply.status(201);
      return report;
    },
  );
}
