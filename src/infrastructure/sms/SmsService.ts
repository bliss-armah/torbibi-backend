import { ISmsProvider, SmsMessage, SmsResult } from './ISmsProvider';
import { ArkeselProvider } from './providers/arkesel.provider';
import { HubtelProvider } from './providers/hubtel.provider';
import { logger } from '../../shared/utils/logger';

/**
 * SMS service facade with automatic provider fallback.
 *
 * Priority order: configured primary → automatic fallback to secondary.
 * In production, if Arkesel is down, Hubtel absorbs the load transparently.
 * Both providers are initialized at startup to avoid cold-init latency during fallback.
 */
export class SmsService {
  private readonly primary: ISmsProvider;
  private readonly fallback: ISmsProvider;

  constructor() {
    const primaryName = process.env.SMS_PROVIDER ?? 'arkesel';

    if (primaryName === 'hubtel') {
      this.primary = new HubtelProvider();
      this.fallback = new ArkeselProvider();
    } else {
      this.primary = new ArkeselProvider();
      this.fallback = new HubtelProvider();
    }
  }

  async send(message: SmsMessage): Promise<SmsResult> {
    const result = await this.primary.send(message);

    if (!result.success) {
      logger.warn('Primary SMS provider failed, trying fallback', {
        primary: this.primary.getName(),
        fallback: this.fallback.getName(),
        to: message.to,
      });

      return this.fallback.send(message);
    }

    return result;
  }

  async sendOtp(phone: string, code: string): Promise<SmsResult> {
    return this.send({
      to: phone,
      message: `Your Torbibi verification code is: ${code}. Valid for 10 minutes. Do not share this code.`,
    });
  }

  async sendOrderConfirmation(
    phone: string,
    orderNumber: string,
    shopName: string
  ): Promise<SmsResult> {
    return this.send({
      to: phone,
      message: `Order ${orderNumber} confirmed at ${shopName}! We'll notify you when it's ready. Thank you for shopping on Torbibi.`,
    });
  }

  async sendPaymentConfirmation(
    phone: string,
    orderNumber: string,
    amount: string
  ): Promise<SmsResult> {
    return this.send({
      to: phone,
      message: `Payment of GHS ${amount} received for order ${orderNumber}. Your order is being processed. - Torbibi`,
    });
  }

  async sendShopOwnerNewOrder(
    phone: string,
    orderNumber: string,
    total: string
  ): Promise<SmsResult> {
    return this.send({
      to: phone,
      message: `New order ${orderNumber} received! Total: GHS ${total}. Login to your Torbibi dashboard to manage it.`,
    });
  }

  async sendSubscriptionPaymentFailed(phone: string, shopName: string): Promise<SmsResult> {
    return this.send({
      to: phone,
      message: `Your Torbibi subscription payment for ${shopName} failed. Please update your billing details to keep your shop active.`,
    });
  }

  async sendSubscriptionCancelled(phone: string, shopName: string): Promise<SmsResult> {
    return this.send({
      to: phone,
      message: `Your Torbibi subscription for ${shopName} has been cancelled. Your storefront is now suspended. Subscribe again to reactivate.`,
    });
  }
}

// Singleton — one instance serves all use cases
export const smsService = new SmsService();
