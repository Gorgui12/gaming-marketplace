import { AuditLogModel } from './audit-log.model.js';
import { logger } from '../../lib/logger.js';

export class AuditService {
  static async log(entry: {
    actor: string | null;
    action: string;
    entityType: string;
    entityId: string;
    metadata?: Record<string, unknown>;
    ip?: string;
    userAgent?: string;
  }): Promise<void> {
    try {
      await AuditLogModel.create(entry);
    } catch (err) {
      // Un échec d'écriture d'audit ne doit jamais faire échouer l'opération
      // métier principale — on logue l'incident pour investigation.
      logger.error({ err, entry }, "Échec écriture AuditLog");
    }
  }
}
