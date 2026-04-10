import { Request, Response } from 'express';
import { CreateShopUseCase } from '../../../application/shops/use-cases/CreateShop';
import { ShopRepository } from '../../../infrastructure/database/repositories/ShopRepository';
import { UserRepository } from '../../../infrastructure/database/repositories/UserRepository';
import { cloudinaryService } from '../../../infrastructure/storage/CloudinaryService';
import { CreateShopDto, UpdateShopDto } from '../../../application/shops/dtos/shop.dto';
import { NotFoundError, ForbiddenError, ValidationError } from '../../../shared/errors';
import { cacheGet, cacheSet, cacheDel } from '../../../infrastructure/cache/redis';
import { CACHE_PREFIX, CACHE_TTL } from '../../../shared/constants';
import { parsePagination } from '../../../shared/utils/pagination';

const shopRepo = new ShopRepository();
const userRepo = new UserRepository();
const createShopUseCase = new CreateShopUseCase(shopRepo, userRepo);

export class ShopController {
  // Public: list all active shops (storefront discovery)
  static async listPublic(req: Request, res: Response): Promise<void> {
    const pagination = parsePagination(req.query as Record<string, string>);
    const result = await shopRepo.findAllActive(pagination);
    res.status(200).json({ success: true, data: result });
  }

  static async create(req: Request, res: Response): Promise<void> {
    const dto = req.body as CreateShopDto;
    const shop = await createShopUseCase.execute(req.user!.sub, dto);

    res.status(201).json({ success: true, data: { shop: shop.toJSON() } });
  }

  static async getBySlug(req: Request, res: Response): Promise<void> {
    const { slug } = req.params;
    const cacheKey = `${CACHE_PREFIX.SHOP}${slug}`;

    const cached = await cacheGet(cacheKey);
    if (cached) {
      res.status(200).json({ success: true, data: { shop: cached } });
      return;
    }

    const shop = await shopRepo.findBySlug(slug);
    if (!shop) throw new NotFoundError('Shop');

    const shopData = shop.toJSON();
    await cacheSet(cacheKey, shopData, CACHE_TTL.SHOP);

    res.status(200).json({ success: true, data: { shop: shopData } });
  }

  static async getMyShops(req: Request, res: Response): Promise<void> {
    const shops = await shopRepo.findByOwnerId(req.user!.sub);
    res.status(200).json({
      success: true,
      data: { shops: shops.map((s) => s.toJSON()) },
    });
  }

  static async update(req: Request, res: Response): Promise<void> {
    const { shopId } = req.params;
    const dto = req.body as UpdateShopDto;

    const shop = await shopRepo.findById(shopId);
    if (!shop) throw new NotFoundError('Shop');
    if (!shop.isOwnedBy(req.user!.sub)) throw new ForbiddenError('You do not own this shop');

    shop.updateDetails(dto);
    await shopRepo.update(shop);

    await cacheDel(`${CACHE_PREFIX.SHOP}${shop.slug}`);

    res.status(200).json({ success: true, data: { shop: shop.toJSON() } });
  }

  /**
   * PATCH /shops/:shopId/logo
   * Upload a new logo to Cloudinary and save the URL + publicId on the shop.
   * If the shop already has a logo, the old Cloudinary asset is deleted first.
   */
  static async uploadLogo(req: Request, res: Response): Promise<void> {
    const { shopId } = req.params;

    const shop = await shopRepo.findById(shopId);
    if (!shop) throw new NotFoundError('Shop');
    if (!shop.isOwnedBy(req.user!.sub)) throw new ForbiddenError('You do not own this shop');

    const file = req.file;
    if (!file) {
      throw new ValidationError('No image provided', { logo: ['Logo image is required'] });
    }

    // Delete the previous logo from Cloudinary (fire-and-forget — non-blocking)
    const currentPublicId = (shop.toJSON() as { logoPublicId?: string }).logoPublicId;
    if (currentPublicId) {
      cloudinaryService.deleteImage(currentPublicId).catch(() => {});
    }

    const { url, publicId } = await cloudinaryService.uploadImage(
      file.buffer,
      `torbibi/shops/${shopId}/logo`
    );

    // Update shop record — logoPublicId stored so future uploads can delete this one
    await shopRepo.updateImages(shopId, { logoUrl: url, logoPublicId: publicId });
    await cacheDel(`${CACHE_PREFIX.SHOP}${shop.slug}`);

    res.status(200).json({
      success: true,
      data: { logoUrl: url, publicId },
    });
  }

  /**
   * PATCH /shops/:shopId/banner
   * Same as logo but for the shop banner image.
   */
  static async uploadBanner(req: Request, res: Response): Promise<void> {
    const { shopId } = req.params;

    const shop = await shopRepo.findById(shopId);
    if (!shop) throw new NotFoundError('Shop');
    if (!shop.isOwnedBy(req.user!.sub)) throw new ForbiddenError('You do not own this shop');

    const file = req.file;
    if (!file) {
      throw new ValidationError('No image provided', { banner: ['Banner image is required'] });
    }

    const currentPublicId = (shop.toJSON() as { bannerPublicId?: string }).bannerPublicId;
    if (currentPublicId) {
      cloudinaryService.deleteImage(currentPublicId).catch(() => {});
    }

    const { url, publicId } = await cloudinaryService.uploadImage(
      file.buffer,
      `torbibi/shops/${shopId}/banner`
    );

    await shopRepo.updateImages(shopId, { bannerUrl: url, bannerPublicId: publicId });
    await cacheDel(`${CACHE_PREFIX.SHOP}${shop.slug}`);

    res.status(200).json({
      success: true,
      data: { bannerUrl: url, publicId },
    });
  }
}
