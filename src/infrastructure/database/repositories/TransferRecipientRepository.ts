import prisma from '../prisma';

export interface CreateRecipientData {
  shopId: string;
  recipientCode: string;
  type: string;
  accountName: string;
  accountNumber: string;
  bankCode: string;
  currency?: string;
}

/**
 * TransferRecipient repository — stores Paystack recipient codes per shop.
 * A shop must register once; subsequent calls to upsert update the recipient.
 */
export class TransferRecipientRepository {
  async upsert(data: CreateRecipientData) {
    return prisma.transferRecipient.upsert({
      where: { shopId: data.shopId },
      update: {
        recipientCode: data.recipientCode,
        type: data.type,
        accountName: data.accountName,
        accountNumber: data.accountNumber,
        bankCode: data.bankCode,
        currency: data.currency ?? 'GHS',
      },
      create: {
        shopId: data.shopId,
        recipientCode: data.recipientCode,
        type: data.type,
        accountName: data.accountName,
        accountNumber: data.accountNumber,
        bankCode: data.bankCode,
        currency: data.currency ?? 'GHS',
      },
    });
  }

  async findByShopId(shopId: string) {
    return prisma.transferRecipient.findUnique({ where: { shopId } });
  }
}
