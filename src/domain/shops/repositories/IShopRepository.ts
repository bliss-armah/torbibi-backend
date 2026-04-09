import { Shop } from '../entities/Shop';
import { PaginatedResult, PaginationParams } from '../../../shared/types';

export interface IShopRepository {
  save(shop: Shop): Promise<void>;
  update(shop: Shop): Promise<void>;
  findById(id: string): Promise<Shop | null>;
  findBySlug(slug: string): Promise<Shop | null>;
  findByOwnerId(ownerId: string): Promise<Shop[]>;
  existsBySlug(slug: string): Promise<boolean>;
  findAll(params: PaginationParams): Promise<PaginatedResult<Shop>>;
  delete(id: string): Promise<void>;
}
