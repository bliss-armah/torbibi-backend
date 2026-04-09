import { Product } from '../entities/Product';
import { PaginatedResult, PaginationParams } from '../../../shared/types';

export interface ProductFilters {
  status?: 'active' | 'draft' | 'archived';
  categoryId?: string;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
}

export interface IProductRepository {
  save(product: Product): Promise<void>;
  update(product: Product): Promise<void>;
  findById(id: string): Promise<Product | null>;
  findByIdAndShopId(id: string, shopId: string): Promise<Product | null>;
  findBySlugAndShopId(slug: string, shopId: string): Promise<Product | null>;
  findByShopId(
    shopId: string,
    params: PaginationParams,
    filters?: ProductFilters
  ): Promise<PaginatedResult<Product>>;
  findActiveByShopId(
    shopId: string,
    params: PaginationParams,
    filters?: ProductFilters
  ): Promise<PaginatedResult<Product>>;
  existsBySlugAndShopId(slug: string, shopId: string): Promise<boolean>;
  delete(id: string, shopId: string): Promise<void>;
}
