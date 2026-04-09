import axios from 'axios';
import { ISmsProvider, SmsMessage, SmsResult } from '../ISmsProvider';
import { logger } from '../../../shared/utils/logger';

/**
 * Arkesel SMS provider — primary provider for Ghana.
 * Arkesel supports local Ghanaian numbers and MTN/Vodafone/AirtelTigo routes.
 * API docs: https://developers.arkesel.com
 */
export class ArkeselProvider implements ISmsProvider {
  private readonly apiKey: string;
  private readonly senderId: string;
  private readonly baseUrl = 'https://sms.arkesel.com/api/v2/sms/send';

  constructor() {
    this.apiKey = process.env.ARKESEL_API_KEY ?? '';
    this.senderId = process.env.ARKESEL_SENDER_ID ?? 'TORBIBI';
  }

  getName(): string {
    return 'arkesel';
  }

  async send(message: SmsMessage): Promise<SmsResult> {
    try {
      const response = await axios.post<{ status: string; data: { id: string } }>(
        this.baseUrl,
        {
          sender: message.from ?? this.senderId,
          message: message.message,
          recipients: [message.to],
        },
        {
          headers: {
            'api-key': this.apiKey,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      if (response.data.status === 'success') {
        return { success: true, messageId: response.data.data?.id };
      }

      return { success: false, error: 'Arkesel returned non-success status' };
    } catch (error) {
      const message_error = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Arkesel SMS failed', { error: message_error, to: message.to });
      return { success: false, error: message_error };
    }
  }
}
