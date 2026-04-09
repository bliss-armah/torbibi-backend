import { IProductRepository } from '../../../domain/products/repositories/IProductRepository';
import { IShopRepository } from '../../../domain/shops/repositories/IShopRepository';
import { Product } from '../../../domain/products/entities/Product';
import { UpdateProductDto } from '../dtos/product.dto';
import { ForbiddenError, NotFoundError } from '../../../shared/errors';
import { cacheDel, cacheDelPattern } from '../../../infrastructure/cache/redis';
import { CACHE_PREFIX } from '../../../shared/constants';

export class UpdateProductUseCase {
  constructor(
    private readonly productRepo: IProductRepository,
    private readonly shopRepo: IShopRepository
  ) {}

  async execute(productId: string, shopId: string, ownerId: string, dto: UpdateProductDto): Promise<Product> {
    const shop = await this.shopRepo.findById(shopId);
    if (!shop) throw new NotFoundError('Shop');
    if (!shop.isOwnedBy(ownerId)) throw new ForbiddenError('You do not own this shop');

    const product = await this.productRepo.findByIdAndShopId(productId, shopId);
    if (!product) throw new NotFoundError('Product');

    product.updateDetails({
      name: dto.name,
      description: dto.description,
      price: dto.price,
      compareAtPrice: dto.compareAtPrice,
      sku: dto.sku,
      quantity: dto.quantity,
      trackInventory: dto.trackInventory,
      categoryId: dto.categoryId,
      tags: dto.tags,
    });

    await this.productRepo.update(product);

    // Bust both the individual product cache and the shop's product list cache
    await Promise.all([
      cacheDel(`${CACHE_PREFIX.PRODUCT}${productId}`),
      cacheDelPattern(`${CACHE_PREFIX.PRODUCT}shop:${shopId}:*`),
    ]);

    return product;
  }
}
