import { Prisma } from '@prisma/client';
import prisma from '../prisma';

export interface CreatePaymentData {
  orderId: string;
  shopId: string;
  amount: number;
  reference: string;
  currency?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdatePaymentData {
  status?: 'pending' | 'paid' | 'failed' | 'refunded';
  channel?: string;
  commissionRate?: number;
  commissionAmount?: number;
  netAmount?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Payment repository — CRUD for the payments table.
 * Payments are created when Paystack initializes a charge, and updated when
 * the webhook confirms success (at which point commission fields are populated).
 */
export class PaymentRepository {
  async create(data: CreatePaymentData) {
    return prisma.payment.create({
      data: {
        orderId: data.orderId,
        shopId: data.shopId,
        amount: data.amount,
        reference: data.reference,
        currency: data.currency ?? 'GHS',
        // Cast via unknown to satisfy Prisma's InputJsonValue constraint.
        // Record<string, unknown> is structurally valid JSON but the generated type
        // requires the exact InputJsonValue union.
        metadata: (data.metadata ?? {}) as unknown as Prisma.InputJsonValue,
        status: 'pending',
        provider: 'paystack',
      },
    });
  }

  async findByReference(reference: string) {
    return prisma.payment.findUnique({ where: { reference } });
  }

  async findByOrderId(orderId: string) {
    return prisma.payment.findMany({ where: { orderId } });
  }

  async update(id: string, data: UpdatePaymentData) {
    return prisma.payment.update({
      where: { id },
      data: {
        ...data,
        metadata: data.metadata
          ? (data.metadata as unknown as Prisma.InputJsonValue)
          : undefined,
      },
    });
  }
}
