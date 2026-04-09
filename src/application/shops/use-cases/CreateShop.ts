import { IShopRepository } from '../../../domain/shops/repositories/IShopRepository';
import { IUserRepository } from '../../../domain/users/repositories/IUserRepository';
import { Shop } from '../../../domain/shops/entities/Shop';
import { CreateShopDto } from '../dtos/shop.dto';
import { ConflictError, NotFoundError } from '../../../shared/errors';
import { slugify, generateUniqueSlug } from '../../../shared/utils/slug';
import { cacheDelPattern } from '../../../infrastructure/cache/redis';
import { CACHE_PREFIX } from '../../../shared/constants';

export class CreateShopUseCase {
  constructor(
    private readonly shopRepo: IShopRepository,
    private readonly userRepo: IUserRepository
  ) {}

  async execute(ownerId: string, dto: CreateShopDto): Promise<Shop> {
    const user = await this.userRepo.findById(ownerId);
    if (!user) throw new NotFoundError('User');

    // Generate a unique slug — append random suffix if base slug is taken
    let slug = slugify(dto.name);
    if (await this.shopRepo.existsBySlug(slug)) {
      const suffix = Math.random().toString(36).slice(2, 6);
      slug = generateUniqueSlug(dto.name, suffix);
    }

    // Still conflicts after suffix (extremely rare): error out
    if (await this.shopRepo.existsBySlug(slug)) {
      throw new ConflictError('Shop name is too similar to an existing shop. Please choose a different name.');
    }

    const shop = Shop.create({
      ownerId,
      name: dto.name,
      slug,
      phone: dto.phone,
      description: dto.description,
      email: dto.email,
      address: dto.address,
    });

    await this.shopRepo.save(shop);

    // Promote user to shop_owner if they weren't already
    if (!user.isShopOwner()) {
      user.promoteToShopOwner();
      await this.userRepo.update(user);
    }

    // Bust any cached shop lists
    await cacheDelPattern(`${CACHE_PREFIX.SHOP}list:*`);

    return shop;
  }
}
