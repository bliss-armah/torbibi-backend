import { User as PrismaUser } from '@prisma/client';
import { IUserRepository } from '../../../domain/users/repositories/IUserRepository';
import { User, UserRole } from '../../../domain/users/entities/User';
import prisma from '../prisma';

function toUser(row: PrismaUser): User {
  return User.reconstitute({
    id: row.id,
    phone: row.phone,
    name: row.name,
    email: row.email,
    role: row.role as UserRole,
    isPhoneVerified: row.isPhoneVerified,
    isActive: row.isActive,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class UserRepository implements IUserRepository {
  async save(user: User): Promise<void> {
    const d = user.toJSON();
    await prisma.user.create({
      data: {
        id: d.id,
        phone: d.phone,
        name: d.name,
        email: d.email,
        role: d.role,
        isPhoneVerified: d.isPhoneVerified,
        isActive: d.isActive,
        lastLoginAt: d.lastLoginAt,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      },
    });
  }

  async update(user: User): Promise<void> {
    const d = user.toJSON();
    await prisma.user.update({
      where: { id: d.id },
      data: {
        name: d.name,
        email: d.email,
        role: d.role,
        isPhoneVerified: d.isPhoneVerified,
        isActive: d.isActive,
        lastLoginAt: d.lastLoginAt,
      },
    });
  }

  async findById(id: string): Promise<User | null> {
    const row = await prisma.user.findUnique({ where: { id } });
    return row ? toUser(row) : null;
  }

  async findByPhone(phone: string): Promise<User | null> {
    const row = await prisma.user.findUnique({ where: { phone } });
    return row ? toUser(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await prisma.user.findUnique({ where: { email } });
    return row ? toUser(row) : null;
  }

  async existsByPhone(phone: string): Promise<boolean> {
    const count = await prisma.user.count({ where: { phone } });
    return count > 0;
  }
}
