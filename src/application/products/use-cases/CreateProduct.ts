import { IProductRepository } from '../../../domain/products/repositories/IProductRepository';
import { IShopRepository } from '../../../domain/shops/repositories/IShopRepository';
import { Product } from '../../../domain/products/entities/Product';
import { CreateProductDto } from '../dtos/product.dto';
import { ForbiddenError, NotFoundError } from '../../../shared/errors';
import { slugify, generateUniqueSlug } from '../../../shared/utils/slug';
import { cacheDelPattern } from '../../../infrastructure/cache/redis';
import { CACHE_PREFIX } from '../../../shared/constants';

export class CreateProductUseCase {
  constructor(
    private readonly productRepo: IProductRepository,
    private readonly shopRepo: IShopRepository
  ) {}

  async execute(shopId: string, ownerId: string, dto: CreateProductDto): Promise<Product> {
    const shop = await this.shopRepo.findById(shopId);
    if (!shop) throw new NotFoundError('Shop');
    if (!shop.isOwnedBy(ownerId)) throw new ForbiddenError('You do not own this shop');

    let slug = slugify(dto.name);
    if (await this.productRepo.existsBySlugAndShopId(slug, shopId)) {
      const suffix = Math.random().toString(36).slice(2, 6);
      slug = generateUniqueSlug(dto.name, suffix);
    }

    const product = Product.create({
      shopId,
      name: dto.name,
      slug,
      price: dto.price,
      compareAtPrice: dto.compareAtPrice,
      description: dto.description,
      sku: dto.sku,
      quantity: dto.quantity,
      trackInventory: dto.trackInventory,
      categoryId: dto.categoryId,
      tags: dto.tags,
    });

    if (dto.images && dto.images.length > 0) {
      product.setImages(dto.images);
    }

    await this.productRepo.save(product);
    await cacheDelPattern(`${CACHE_PREFIX.PRODUCT}shop:${shopId}:*`);

    return product;
  }
}
