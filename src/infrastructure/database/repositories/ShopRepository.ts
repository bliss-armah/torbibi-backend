import { Prisma, Shop as PrismaShop } from '@prisma/client';
import { IShopRepository } from '../../../domain/shops/repositories/IShopRepository';
import { Shop, ShopAddress, ShopStatus } from '../../../domain/shops/entities/Shop';
import { PaginatedResult, PaginationParams } from '../../../shared/types';
import { buildPaginatedResult, paginationOffset } from '../../../shared/utils/pagination';
import prisma from '../prisma';

function toShop(row: PrismaShop): Shop {
  return Shop.reconstitute({
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    slug: row.slug,
    description: row.description,
    logoUrl: row.logoUrl,
    bannerUrl: row.bannerUrl,
    phone: row.phone,
    email: row.email,
    address: row.address as ShopAddress | null,
    status: row.status as ShopStatus,
    currency: row.currency,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class ShopRepository implements IShopRepository {
  async save(shop: Shop): Promise<void> {
    const d = shop.toJSON();
    const trialDays = parseInt(process.env.TRIAL_DAYS ?? '30', 10);
    const trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);
    await prisma.shop.create({
      data: {
        id: d.id,
        ownerId: d.ownerId,
        name: d.name,
        slug: d.slug,
        description: d.description,
        logoUrl: d.logoUrl,
        bannerUrl: d.bannerUrl,
        phone: d.phone,
        email: d.email,
        address: (d.address ?? undefined) as unknown as Prisma.InputJsonValue,
        status: d.status,
        currency: d.currency,
        subscriptionStatus: 'trialing',
        trialEndsAt,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      },
    });
  }

  async update(shop: Shop): Promise<void> {
    const d = shop.toJSON();
    await prisma.shop.update({
      where: { id: d.id },
      data: {
        name: d.name,
        description: d.description,
        logoUrl: d.logoUrl,
        bannerUrl: d.bannerUrl,
        phone: d.phone,
        email: d.email,
        address: (d.address ?? undefined) as unknown as Prisma.InputJsonValue,
        status: d.status,
      },
    });
  }

  async findById(id: string): Promise<Shop | null> {
    const row = await prisma.shop.findUnique({ where: { id } });
    return row ? toShop(row) : null;
  }

  async findBySlug(slug: string): Promise<Shop | null> {
    const row = await prisma.shop.findUnique({ where: { slug } });
    return row ? toShop(row) : null;
  }

  async findByOwnerId(ownerId: string): Promise<Shop[]> {
    const rows = await prisma.shop.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toShop);
  }

  async existsBySlug(slug: string): Promise<boolean> {
    const count = await prisma.shop.count({ where: { slug } });
    return count > 0;
  }

  async findAll(params: PaginationParams): Promise<PaginatedResult<Shop>> {
    const [rows, total] = await prisma.$transaction([
      prisma.shop.findMany({
        skip: paginationOffset(params),
        take: params.limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.shop.count(),
    ]);
    return buildPaginatedResult(rows.map(toShop), total, params);
  }

  async findAllActive(params: PaginationParams): Promise<PaginatedResult<Shop>> {
    const where = { status: 'active' as const };
    const [rows, total] = await prisma.$transaction([
      prisma.shop.findMany({
        where,
        skip: paginationOffset(params),
        take: params.limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.shop.count({ where }),
    ]);
    return buildPaginatedResult(rows.map(toShop), total, params);
  }

  /**
   * Update only logo/banner URLs and their Cloudinary public IDs.
   * Kept separate from the entity update flow to avoid loading and re-mapping
   * the full Shop entity just for an image change.
   */
  async updateImages(
    id: string,
    data: {
      logoUrl?: string;
      logoPublicId?: string;
      bannerUrl?: string;
      bannerPublicId?: string;
    }
  ): Promise<void> {
    await prisma.shop.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await prisma.shop.delete({ where: { id } });
  }
}
