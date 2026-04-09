export interface SmsMessage {
  to: string;       // Phone number (with country code)
  message: string;
  from?: string;    // Sender ID
}

export interface SmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * SMS provider contract — decouples the SMS domain from any specific vendor.
 * Swap providers (Arkesel → Hubtel) by injecting a different implementation.
 */
export interface ISmsProvider {
  send(message: SmsMessage): Promise<SmsResult>;
  getName(): string;
}
