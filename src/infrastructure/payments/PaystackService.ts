import axios from 'axios';
import crypto from 'crypto';
import { logger } from '../../shared/utils/logger';
import { PaymentError } from '../../shared/errors';

export interface InitializePaymentParams {
  email: string;
  amount: number;       // In pesewas
  reference: string;
  phone?: string;
  metadata?: Record<string, unknown>;
  callbackUrl?: string;
  subaccount?: string;  // Paystack subaccount code (ACCT_xxx) for split payments
  bearer?: 'account' | 'subaccount' | 'all'; // Who bears Paystack's transaction fee
  plan?: string;        // Paystack plan code — auto-creates subscription after payment
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

// ─── Subaccount types ────────────────────────────────────────────────────────

export interface CreateSubaccountParams {
  businessName: string;
  settlementBank: string;  // Bank code: 'MTN' | 'ATL' | 'VOD' for MoMo; bank code for GHIPSS
  accountNumber: string;   // MoMo phone or bank account number
  percentageCharge: number; // Platform commission % e.g. 5 = platform keeps 5%, shop gets 95%
  primaryContactName?: string;
  primaryContactEmail?: string;
  primaryContactPhone?: string;
}

export interface CreateSubaccountResult {
  subaccountCode: string;  // e.g. ACCT_xxxxxxxxxx
  businessName: string;
  settlementBank: string;
  accountNumber: string;
}

/**
 * Paystack integration — primary payment gateway in Ghana.
 * Supports mobile money (MTN MoMo, Vodafone Cash, AirtelTigo Money) and cards.
 *
 * Uses Split Payments via subaccounts:
 *   1. Shop registers once → Paystack subaccount created (ACCT_xxx stored on shop)
 *   2. On each transaction, subaccount code is passed → Paystack auto-splits payment
 *   3. Shop's cut lands in their MoMo/bank account next business day — no manual transfers
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
          amount: params.amount,
          reference: params.reference,
          currency: 'GHS',
          channels: ['mobile_money', 'card', 'bank'],
          callback_url: params.callbackUrl,
          plan: params.plan,
          subaccount: params.subaccount,
          bearer: params.subaccount ? (params.bearer ?? 'account') : undefined,
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
   * Create a Paystack subaccount for a shop.
   * The returned subaccount_code is stored on the Shop record and passed on every
   * transaction to automatically split payment between platform and shop owner.
   */
  async createSubaccount(params: CreateSubaccountParams): Promise<CreateSubaccountResult> {
    try {
      const response = await axios.post<{
        status: boolean;
        message: string;
        data: {
          subaccount_code: string;
          business_name: string;
          settlement_bank: string;
          account_number: string;
        };
      }>(
        `${this.baseUrl}/subaccount`,
        {
          business_name: params.businessName,
          settlement_bank: params.settlementBank,
          account_number: params.accountNumber,
          percentage_charge: params.percentageCharge,
          primary_contact_name: params.primaryContactName,
          primary_contact_email: params.primaryContactEmail,
          primary_contact_phone: params.primaryContactPhone,
        },
        { headers: this.headers, timeout: 15000 }
      );

      if (!response.data.status) {
        throw new PaymentError('Failed to create Paystack subaccount');
      }

      const { data } = response.data;
      return {
        subaccountCode: data.subaccount_code,
        businessName: data.business_name,
        settlementBank: data.settlement_bank,
        accountNumber: data.account_number,
      };
    } catch (error) {
      if (error instanceof PaymentError) throw error;
      const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      logger.error('Paystack createSubaccount failed', { error: msg ?? (error as Error).message });
      throw new PaymentError(msg ?? 'Failed to create payout account');
    }
  }

  /**
   * Disable (cancel) a Paystack subscription.
   * Requires the subscription code and the email token sent with the subscription.create webhook.
   */
  async disableSubscription(subscriptionCode: string, emailToken: string): Promise<void> {
    try {
      await axios.post(
        `${this.baseUrl}/subscription/disable`,
        { code: subscriptionCode, token: emailToken },
        { headers: this.headers, timeout: 15000 }
      );
    } catch (error) {
      const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      logger.error('Paystack disableSubscription failed', { subscriptionCode, error: msg });
      throw new PaymentError(msg ?? 'Failed to cancel subscription');
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
