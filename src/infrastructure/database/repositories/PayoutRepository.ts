import prisma from '../prisma';

export interface CreatePayoutData {
  shopId: string;
  paymentId: string;
  orderId: string;
  amount: number;
  reference: string;
}

export interface UpdatePayoutData {
  status?: 'pending' | 'processing' | 'paid' | 'failed';
  transferCode?: string;
  failureReason?: string;
  paidAt?: Date;
}

/**
 * Payout repository — tracks money owed and sent to shop owners.
 * One Payout record is created per Payment after commission is deducted.
 */
export class PayoutRepository {
  async create(data: CreatePayoutData) {
    return prisma.payout.create({
      data: {
        shopId: data.shopId,
        paymentId: data.paymentId,
        orderId: data.orderId,
        amount: data.amount,
        reference: data.reference,
        status: 'pending',
      },
    });
  }

  async findById(id: string) {
    return prisma.payout.findUnique({ where: { id } });
  }

  async findByPaymentId(paymentId: string) {
    return prisma.payout.findUnique({ where: { paymentId } });
  }

  async findByTransferCode(transferCode: string) {
    return prisma.payout.findFirst({ where: { transferCode } });
  }

  async findByShopId(shopId: string, take = 20, skip = 0) {
    const [items, total] = await Promise.all([
      prisma.payout.findMany({
        where: { shopId },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      prisma.payout.count({ where: { shopId } }),
    ]);
    return { items, total };
  }

  async update(id: string, data: UpdatePayoutData) {
    return prisma.payout.update({ where: { id }, data });
  }
}
