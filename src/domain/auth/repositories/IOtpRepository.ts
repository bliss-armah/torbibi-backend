import { Otp, OtpType } from '../entities/Otp';

export interface IOtpRepository {
  save(otp: Otp): Promise<void>;
  findLatestByPhone(phone: string, type: OtpType): Promise<Otp | null>;
  update(otp: Otp): Promise<void>;
  invalidateAllForPhone(phone: string, type: OtpType): Promise<void>;
}
