import { Otp as PrismaOtp } from '@prisma/client';
import { IOtpRepository } from '../../../domain/auth/repositories/IOtpRepository';
import { Otp, OtpType } from '../../../domain/auth/entities/Otp';
import prisma from '../prisma';

function toOtp(row: PrismaOtp): Otp {
  return Otp.reconstitute({
    id: row.id,
    phone: row.phone,
    code: row.code,
    type: row.type as OtpType,
    expiresAt: row.expiresAt,
    verified: row.verified,
    attempts: row.attempts,
    createdAt: row.createdAt,
  });
}

export class OtpRepository implements IOtpRepository {
  async save(otp: Otp): Promise<void> {
    const d = otp.toJSON();
    await prisma.otp.create({
      data: {
        id: d.id,
        phone: d.phone,
        code: d.code,
        type: d.type,
        expiresAt: d.expiresAt,
        verified: d.verified,
        attempts: d.attempts,
        createdAt: d.createdAt,
      },
    });
  }

  async findLatestByPhone(phone: string, type: OtpType): Promise<Otp | null> {
    const row = await prisma.otp.findFirst({
      where: { phone, type, verified: false },
      orderBy: { createdAt: 'desc' },
    });
    return row ? toOtp(row) : null;
  }

  async update(otp: Otp): Promise<void> {
    const d = otp.toJSON();
    await prisma.otp.update({
      where: { id: d.id },
      data: { verified: d.verified, attempts: d.attempts },
    });
  }

  async invalidateAllForPhone(phone: string, type: OtpType): Promise<void> {
    await prisma.otp.updateMany({
      where: { phone, type, verified: false },
      data: { verified: true },
    });
  }
}
