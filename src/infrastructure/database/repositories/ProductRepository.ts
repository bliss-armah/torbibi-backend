import { Prisma, Product as PrismaProduct } from '@prisma/client';
import { IProductRepository, ProductFilters } from '../../../domain/products/repositories/IProductRepository';
import { Product, ProductImage, ProductStatus } from '../../../domain/products/entities/Product';
import { PaginatedResult, PaginationParams } from '../../../shared/types';
import { buildPaginatedResult, paginationOffset } from '../../../shared/utils/pagination';
import prisma from '../prisma';

function toProduct(row: PrismaProduct): Product {
  return Product.reconstitute({
    id: row.id,
    shopId: row.shopId,
    name: row.name,
    slug: row.slug,
    description: row.description,
    price: row.price,
    compareAtPrice: row.compareAtPrice,
    sku: row.sku,
    quantity: row.quantity,
    trackInventory: row.trackInventory,
    images: row.images as unknown as ProductImage[],
    categoryId: row.categoryId,
    tags: row.tags,
    status: row.status as ProductStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function buildWhere(
  shopId: string,
  filters?: ProductFilters
): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = { shopId };

  if (filters?.status) where.status = filters.status;
  if (filters?.categoryId) where.categoryId = filters.categoryId;
  if (filters?.minPrice !== undefined || filters?.maxPrice !== undefined) {
    where.price = {
      ...(filters.minPrice !== undefined && { gte: filters.minPrice }),
      ...(filters.maxPrice !== undefined && { lte: filters.maxPrice }),
    };
  }
  if (filters?.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { description: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  return where;
}

export class ProductRepository implements IProductRepository {
  async save(product: Product): Promise<void> {
    const d = product.toJSON();
    await prisma.product.create({
      data: {
        id: d.id,
        shopId: d.shopId,
        name: d.name,
        slug: d.slug,
        description: d.description,
        price: d.price,
        compareAtPrice: d.compareAtPrice,
        sku: d.sku,
        quantity: d.quantity,
        trackInventory: d.trackInventory,
        images: d.images as unknown as Prisma.InputJsonValue,
        categoryId: d.categoryId,
        tags: d.tags,
        status: d.status,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      },
    });
  }

  async update(product: Product): Promise<void> {
    const d = product.toJSON();
    await prisma.product.update({
      where: { id: d.id },
      data: {
        name: d.name,
        description: d.description,
        price: d.price,
        compareAtPrice: d.compareAtPrice,
        sku: d.sku,
        quantity: d.quantity,
        trackInventory: d.trackInventory,
        images: d.images as unknown as Prisma.InputJsonValue,
        categoryId: d.categoryId,
        tags: d.tags,
        status: d.status,
      },
    });
  }

  async findById(id: string): Promise<Product | null> {
    const row = await prisma.product.findUnique({ where: { id } });
    return row ? toProduct(row) : null;
  }

  async findByIdAndShopId(id: string, shopId: string): Promise<Product | null> {
    const row = await prisma.product.findUnique({ where: { id, shopId } });
    return row ? toProduct(row) : null;
  }

  async findBySlugAndShopId(slug: string, shopId: string): Promise<Product | null> {
    const row = await prisma.product.findUnique({
      where: { shopId_slug: { shopId, slug } },
    });
    return row ? toProduct(row) : null;
  }

  async findByShopId(
    shopId: string,
    params: PaginationParams,
    filters?: ProductFilters
  ): Promise<PaginatedResult<Product>> {
    const where = buildWhere(shopId, filters);
    const [rows, total] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        skip: paginationOffset(params),
        take: params.limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.product.count({ where }),
    ]);
    return buildPaginatedResult(rows.map(toProduct), total, params);
  }

  async findActiveByShopId(
    shopId: string,
    params: PaginationParams,
    filters?: ProductFilters
  ): Promise<PaginatedResult<Product>> {
    return this.findByShopId(shopId, params, { ...filters, status: 'active' });
  }

  async existsBySlugAndShopId(slug: string, shopId: string): Promise<boolean> {
    const count = await prisma.product.count({
      where: { shopId, slug },
    });
    return count > 0;
  }

  async delete(id: string, shopId: string): Promise<void> {
    await prisma.product.delete({ where: { id, shopId } });
  }
}
