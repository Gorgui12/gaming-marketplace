import type { Request, Response } from 'express';
import { z } from 'zod';
import { UserAccountStatus } from '@gm/types';
import { asyncHandler } from '../../lib/async-handler.js';
import { AppError } from '../../lib/errors/app-error.js';
import { ErrorCode } from '../../lib/errors/error-codes.js';
import { AuditService } from '../audit/audit.service.js';
import { UserModel } from './admin-stats.models.js';

const USER_SEARCH_MAX = 50;

export const listAdminUsers = asyncHandler(async (req: Request, res: Response) => {
  const query = z
    .object({
      search: z.string().trim().max(200).optional(),
      status: z.enum(Object.values(UserAccountStatus) as [string, ...string[]]).optional(),
      page: z.coerce.number().int().positive().default(1),
      pageSize: z.coerce.number().int().positive().max(USER_SEARCH_MAX).default(20),
    })
    .parse(req.query);

  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;
  if (query.search) {
    const rx = new RegExp(query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ email: rx }, { username: rx }, { firstName: rx }, { lastName: rx }];
  }

  const skip = (query.page - 1) * query.pageSize;
  const [users, total] = await Promise.all([
    UserModel.find(filter)
      .select(
        '-passwordHash -referredByAffiliate',
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(query.pageSize),
    UserModel.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: {
      users,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  });
});

const updateStatusSchema = z.object({
  status: z.enum([UserAccountStatus.ACTIVE, UserAccountStatus.SUSPENDED, UserAccountStatus.BANNED]),
});

export const updateUserStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status } = updateStatusSchema.parse(req.body);
  const userId = req.params.id!;

  const user = await UserModel.findById(userId);
  if (!user) {
    throw AppError.notFound(ErrorCode.NOT_FOUND, 'Utilisateur introuvable');
  }
  if (user.roles.includes('SUPER_ADMIN') && status !== UserAccountStatus.ACTIVE) {
    throw AppError.forbidden('Un SUPER_ADMIN ne peut pas être suspendu ou banni');
  }

  user.status = status;
  await user.save();

  await AuditService.log({
    actor: req.user!.id,
    action: `user.${status.toLowerCase()}`,
    entityType: 'User',
    entityId: String(user._id),
    metadata: { email: user.email },
  });

  res.status(200).json({
    success: true,
    data: {
      id: user._id,
      email: user.email,
      username: user.username,
      status: user.status,
    },
  });
});
