import axios from 'axios';
import crypto from 'crypto';
import { logger } from '../../shared/utils/logger';
import { PaymentError } from '../../shared/errors';

export interface InitializePaymentParams {
  email: string;
  amount: number;         // In pesewas (Paystack uses kobo, but we convert for GHS)
  reference: string;
  phone?: string;
  metadata?: Record<string, unknown>;
  callbackUrl?: string;
}

export interface InitializePaymentResult {
  authorizationUrl: string;
  reference: string;
  accessCode: string;
}

export interface VerifyPaymentResult {
  status: 'success' | 'failed' | 'pending';
  reference: string;
  amount: number;
  channel: string;
  paidAt: Date | null;
  customerEmail: string;
  metadata: Record<string, unknown>;
}

// ─── Transfer types ──────────────────────────────────────────────────────────

export interface CreateTransferRecipientParams {
  type: 'mobile_money' | 'ghipss';
  name: string;
  accountNumber: string;  // Phone for mobile money, account number for bank
  bankCode: string;       // 'MTN' | 'ATL' | 'VOD' for mobile money, bank code for ghipss
  currency?: string;
}

export interface CreateTransferRecipientResult {
  recipientCode: string;
  type: string;
  accountName: string;
  accountNumber: string;
  bankCode: string;
}

export interface InitiateTransferParams {
  amount: number;     // In pesewas
  recipient: string;  // Paystack recipient_code
  reason: string;
  reference: string;  // Our internal payout reference
}

export interface InitiateTransferResult {
  transferCode: string;
  status: string;  // 'pending' | 'success' | 'failed'
}

export interface VerifyTransferResult {
  status: 'success' | 'failed' | 'pending' | 'reversed' | 'otp';
  transferCode: string;
  amount: number;
  reference: string;
}

/**
 * Paystack integration — primary payment gateway in Ghana.
 * Supports mobile money (MTN MoMo, Vodafone Cash, AirtelTigo Money) and cards.
 * Amount is always in the smallest unit (pesewas for GHS).
 *
 * Extended with Transfers API for the aggregator payout model:
 *   1. Platform collects payment from customer (existing charge flow)
 *   2. Platform deducts commission
 *   3. Platform sends remainder to shop owner via Transfer
 */
export class PaystackService {
  private readonly secretKey: string;
  private readonly baseUrl = 'https://api.paystack.co';

  constructor() {
    this.secretKey = process.env.PAYSTACK_SECRET_KEY ?? '';
  }

  private get headers() {
    return {
      Authorization: `Bearer ${this.secretKey}`,
      'Content-Type': 'application/json',
    };
  }

  async initializePayment(params: InitializePaymentParams): Promise<InitializePaymentResult> {
    try {
      const response = await axios.post<{
        status: boolean;
        data: { authorization_url: string; reference: string; access_code: string };
      }>(
        `${this.baseUrl}/transaction/initialize`,
        {
          email: params.email,
          amount: params.amount, // Paystack uses kobo/pesewas natively
          reference: params.reference,
          currency: 'GHS',
          channels: ['mobile_money', 'card', 'bank'],
          callback_url: params.callbackUrl,
          metadata: {
            ...params.metadata,
            custom_fields: params.phone
              ? [{ display_name: 'Phone', variable_name: 'phone', value: params.phone }]
              : [],
          },
        },
        { headers: this.headers, timeout: 15000 }
      );

      if (!response.data.status) {
        throw new PaymentError('Failed to initialize payment with Paystack');
      }

      return {
        authorizationUrl: response.data.data.authorization_url,
        reference: response.data.data.reference,
        accessCode: response.data.data.access_code,
      };
    } catch (error) {
      if (error instanceof PaymentError) throw error;
      logger.error('Paystack initialize failed', { error });
      throw new PaymentError('Payment initialization failed');
    }
  }

  async verifyPayment(reference: string): Promise<VerifyPaymentResult> {
    try {
      const response = await axios.get<{
        status: boolean;
        data: {
          status: string;
          reference: string;
          amount: number;
          channel: string;
          paid_at: string | null;
          customer: { email: string };
          metadata: Record<string, unknown>;
        };
      }>(
        `${this.baseUrl}/transaction/verify/${encodeURIComponent(reference)}`,
        { headers: this.headers, timeout: 15000 }
      );

      const { data } = response.data;

      return {
        status: data.status === 'success' ? 'success' : data.status === 'failed' ? 'failed' : 'pending',
        reference: data.reference,
        amount: data.amount,
        channel: data.channel,
        paidAt: data.paid_at ? new Date(data.paid_at) : null,
        customerEmail: data.customer.email,
        metadata: data.metadata ?? {},
      };
    } catch (error) {
      logger.error('Paystack verify failed', { reference, error });
      throw new PaymentError('Payment verification failed');
    }
  }

  /**
   * Register a transfer recipient (mobile money or bank account).
   * Must be done before initiating a transfer to that account.
   * The returned recipient_code is stored in TransferRecipient table.
   */
  async createTransferRecipient(
    params: CreateTransferRecipientParams
  ): Promise<CreateTransferRecipientResult> {
    try {
      const response = await axios.post<{
        status: boolean;
        message: string;
        data: {
          recipient_code: string;
          type: string;
          details: {
            account_name: string;
            account_number: string;
            bank_code: string;
          };
        };
      }>(
        `${this.baseUrl}/transferrecipient`,
        {
          type: params.type,
          name: params.name,
          account_number: params.accountNumber,
          bank_code: params.bankCode,
          currency: params.currency ?? 'GHS',
        },
        { headers: this.headers, timeout: 15000 }
      );

      if (!response.data.status) {
        throw new PaymentError('Failed to create transfer recipient');
      }

      const { data } = response.data;
      return {
        recipientCode: data.recipient_code,
        type: data.type,
        accountName: data.details.account_name,
        accountNumber: data.details.account_number,
        bankCode: data.details.bank_code,
      };
    } catch (error) {
      if (error instanceof PaymentError) throw error;
      logger.error('Paystack createTransferRecipient failed', { params, error });
      throw new PaymentError('Failed to register transfer recipient');
    }
  }

  /**
   * Initiate a transfer to a registered recipient.
   * Paystack will process it and send a transfer.success / transfer.failed webhook.
   */
  async initiateTransfer(params: InitiateTransferParams): Promise<InitiateTransferResult> {
    try {
      const response = await axios.post<{
        status: boolean;
        data: { transfer_code: string; status: string };
      }>(
        `${this.baseUrl}/transfer`,
        {
          source: 'balance',
          amount: params.amount,
          recipient: params.recipient,
          reason: params.reason,
          reference: params.reference,
          currency: 'GHS',
        },
        { headers: this.headers, timeout: 15000 }
      );

      if (!response.data.status) {
        throw new PaymentError('Failed to initiate transfer');
      }

      return {
        transferCode: response.data.data.transfer_code,
        status: response.data.data.status,
      };
    } catch (error) {
      if (error instanceof PaymentError) throw error;
      logger.error('Paystack initiateTransfer failed', { reference: params.reference, error });
      throw new PaymentError('Failed to initiate payout transfer');
    }
  }

  /**
   * Verify a transfer by its Paystack reference.
   * Use this for manual checks — normally status comes via webhook.
   */
  async verifyTransfer(reference: string): Promise<VerifyTransferResult> {
    try {
      const response = await axios.get<{
        status: boolean;
        data: { status: string; transfer_code: string; amount: number; reference: string };
      }>(
        `${this.baseUrl}/transfer/verify/${encodeURIComponent(reference)}`,
        { headers: this.headers, timeout: 15000 }
      );

      const { data } = response.data;
      return {
        status: data.status as VerifyTransferResult['status'],
        transferCode: data.transfer_code,
        amount: data.amount,
        reference: data.reference,
      };
    } catch (error) {
      logger.error('Paystack verifyTransfer failed', { reference, error });
      throw new PaymentError('Transfer verification failed');
    }
  }

  /**
   * Validates a Paystack webhook signature.
   * Must be called before processing any webhook payload.
   */
  validateWebhookSignature(rawBody: string, signature: string): boolean {
    const webhookSecret = process.env.PAYSTACK_WEBHOOK_SECRET ?? this.secretKey;
    const hash = crypto
      .createHmac('sha512', webhookSecret)
      .update(rawBody)
      .digest('hex');
    return hash === signature;
  }
}

export const paystackService = new PaystackService();
