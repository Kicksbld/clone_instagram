import type { NewReport } from '../../domain/report.ts';

/** Signalements (table `reports`). */
export interface ReportRepository {
  create(report: NewReport): Promise<void>;
}
