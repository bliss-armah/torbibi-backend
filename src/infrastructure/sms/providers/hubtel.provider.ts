import axios from 'axios';
import { ISmsProvider, SmsMessage, SmsResult } from '../ISmsProvider';
import { logger } from '../../../shared/utils/logger';

/**
 * Hubtel SMS provider — fallback provider.
 * Hubtel is a major Ghanaian fintech with reliable local SMS delivery.
 */
export class HubtelProvider implements ISmsProvider {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly senderId: string;
  private readonly baseUrl = 'https://smsc.hubtel.com/v1/messages/send';

  constructor() {
    this.clientId = process.env.HUBTEL_CLIENT_ID ?? '';
    this.clientSecret = process.env.HUBTEL_CLIENT_SECRET ?? '';
    this.senderId = process.env.HUBTEL_SENDER_ID ?? 'TORBIBI';
  }

  getName(): string {
    return 'hubtel';
  }

  async send(message: SmsMessage): Promise<SmsResult> {
    try {
      const response = await axios.get<{ status: number; messageId: string }>(
        this.baseUrl,
        {
          params: {
            clientsecret: this.clientSecret,
            clientid: this.clientId,
            from: message.from ?? this.senderId,
            to: message.to,
            content: message.message,
          },
          timeout: 10000,
        }
      );

      if (response.data.status === 0) {
        return { success: true, messageId: response.data.messageId };
      }

      return { success: false, error: `Hubtel status: ${response.data.status}` };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Hubtel SMS failed', { error: errorMessage, to: message.to });
      return { success: false, error: errorMessage };
    }
  }
}
