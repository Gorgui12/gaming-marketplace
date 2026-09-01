import { NotificationType } from '@gm/types';
import { NotificationModel } from './notification.model.js';
import { logger } from '../../lib/logger.js';

/**
 * Point d'entrée unique pour créer une notification in-app. Volontairement
 * best-effort (jamais bloquant, jamais throw) — comme EmailService, une
 * notification qui échoue à s'écrire ne doit jamais casser le flux métier
 * principal (paiement, livraison...).
 */
export class NotificationService {
  static async create(input: {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await NotificationModel.create({
        user: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        metadata: input.metadata,
      });
    } catch (err) {
      logger.error({ err, userId: input.userId, type: input.type }, 'Échec création notification');
    }
  }

  static async listMine(userId: string, limit = 50) {
    return NotificationModel.find({ user: userId }).sort({ createdAt: -1 }).limit(limit);
  }

  static async countUnread(userId: string): Promise<number> {
    return NotificationModel.countDocuments({ user: userId, read: false });
  }

  static async markRead(notificationId: string, userId: string): Promise<void> {
    await NotificationModel.updateOne(
      { _id: notificationId, user: userId },
      { $set: { read: true } },
    );
  }

  static async markAllRead(userId: string): Promise<void> {
    await NotificationModel.updateMany({ user: userId, read: false }, { $set: { read: true } });
  }
}
