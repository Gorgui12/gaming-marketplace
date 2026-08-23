import type { Request, Response } from 'express';
import { z } from 'zod';
import { TransactionState } from '@gm/types';
import { asyncHandler } from '../../lib/async-handler.js';
import { TransactionModel } from './admin-stats.models.js';

const stateFilterValues: [string, ...string[]] = ['ALL', ...Object.values(TransactionState)];

export const listAdminTransactions = asyncHandler(async (req: Request, res: Response) => {
  const query = z
    .object({
      state: z.enum(stateFilterValues).default('ALL'),
      page: z.coerce.number().int().positive().default(1),
      pageSize: z.coerce.number().int().positive().max(50).default(20),
    })
    .parse(req.query);

  const filter = query.state === 'ALL' ? {} : { escrowStatus: query.state };
  const skip = (query.page - 1) * query.pageSize;

  const [transactions, total] = await Promise.all([
    TransactionModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(query.pageSize)
      .select('-stateHistory')
      .populate('buyer', 'email username')
      .populate('seller', 'email username')
      .populate('listing', 'title slug'),
    TransactionModel.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: {
      transactions,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  });
});
