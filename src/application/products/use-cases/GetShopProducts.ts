import { IProductRepository, ProductFilters } from '../../../domain/products/repositories/IProductRepository';
import { PaginatedResult, PaginationParams } from '../../../shared/types';
import { Product } from '../../../domain/products/entities/Product';
import { cacheGet, cacheSet } from '../../../infrastructure/cache/redis';
import { CACHE_PREFIX, CACHE_TTL } from '../../../shared/constants';

export class GetShopProductsUseCase {
  constructor(private readonly productRepo: IProductRepository) {}

  async execute(
    shopId: string,
    params: PaginationParams,
    filters?: ProductFilters,
    isPublic = false
  ): Promise<PaginatedResult<Product>> {
    // Cache public storefront product listings — they're hit frequently and rarely change
    if (isPublic && !filters?.search) {
      const cacheKey = `${CACHE_PREFIX.PRODUCT}shop:${shopId}:page:${params.page}:limit:${params.limit}`;
      const cached = await cacheGet<PaginatedResult<Product>>(cacheKey);
      if (cached) return cached;

      const result = await this.productRepo.findActiveByShopId(shopId, params, filters);
      await cacheSet(cacheKey, result, CACHE_TTL.PRODUCT);
      return result;
    }

    // Dashboard: return all products including drafts and archived
    return this.productRepo.findByShopId(shopId, params, filters);
  }
}
