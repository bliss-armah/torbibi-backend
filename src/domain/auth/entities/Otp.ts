import { v4 as uuidv4 } from 'uuid';

export type OtpType = 'login' | 'register' | 'reset';

export interface OtpProps {
  id: string;
  phone: string;
  code: string;
  type: OtpType;
  expiresAt: Date;
  verified: boolean;
  attempts: number;
  createdAt: Date;
}

/**
 * OTP entity — represents a one-time password request.
 * Business rules:
 *  - Max 3 verification attempts before invalidation
 *  - Expires after creation window (enforced by expiresAt)
 *  - Single-use: once verified it cannot be re-verified
 */
export class Otp {
  private readonly props: OtpProps;

  private static readonly MAX_ATTEMPTS = 3;

  private constructor(props: OtpProps) {
    this.props = props;
  }

  static create(params: {
    phone: string;
    code: string;
    type: OtpType;
    expiresAt: Date;
  }): Otp {
    return new Otp({
      id: uuidv4(),
      phone: params.phone,
      code: params.code,
      type: params.type,
      expiresAt: params.expiresAt,
      verified: false,
      attempts: 0,
      createdAt: new Date(),
    });
  }

  static reconstitute(props: OtpProps): Otp {
    return new Otp(props);
  }

  get id(): string { return this.props.id; }
  get phone(): string { return this.props.phone; }
  get code(): string { return this.props.code; }
  get type(): OtpType { return this.props.type; }
  get expiresAt(): Date { return this.props.expiresAt; }
  get verified(): boolean { return this.props.verified; }
  get attempts(): number { return this.props.attempts; }
  get createdAt(): Date { return this.props.createdAt; }

  isExpired(): boolean {
    return new Date() > this.props.expiresAt;
  }

  isExhausted(): boolean {
    return this.props.attempts >= Otp.MAX_ATTEMPTS;
  }

  /**
   * Attempts to verify the OTP. Returns true if code matches and OTP is valid.
   * Increments attempt count regardless — guards against brute-force.
   */
  verify(inputCode: string): boolean {
    this.props.attempts += 1;

    if (this.isExpired() || this.isExhausted() || this.props.verified) {
      return false;
    }

    if (this.props.code === inputCode) {
      this.props.verified = true;
      return true;
    }

    return false;
  }

  toJSON(): OtpProps {
    return { ...this.props };
  }
}
