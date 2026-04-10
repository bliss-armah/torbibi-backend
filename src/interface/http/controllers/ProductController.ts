import { Request, Response } from 'express';
import { CreateProductUseCase } from '../../../application/products/use-cases/CreateProduct';
import { UpdateProductUseCase } from '../../../application/products/use-cases/UpdateProduct';
import { GetShopProductsUseCase } from '../../../application/products/use-cases/GetShopProducts';
import { ProductRepository } from '../../../infrastructure/database/repositories/ProductRepository';
import { ShopRepository } from '../../../infrastructure/database/repositories/ShopRepository';
import { cloudinaryService } from '../../../infrastructure/storage/CloudinaryService';
import { CreateProductDto, UpdateProductDto } from '../../../application/products/dtos/product.dto';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../shared/errors';
import { parsePagination } from '../../../shared/utils/pagination';
import { cacheDel } from '../../../infrastructure/cache/redis';
import { CACHE_PREFIX } from '../../../shared/constants';

const productRepo = new ProductRepository();
const shopRepo = new ShopRepository();
const createProductUseCase = new CreateProductUseCase(productRepo, shopRepo);
const updateProductUseCase = new UpdateProductUseCase(productRepo, shopRepo);
const getShopProductsUseCase = new GetShopProductsUseCase(productRepo);

export class ProductController {
  // Dashboard: list all products (including drafts)
  static async listForDashboard(req: Request, res: Response): Promise<void> {
    const { shopId } = req.params;
    const shop = await shopRepo.findById(shopId);
    if (!shop) throw new NotFoundError('Shop');
    if (!shop.isOwnedBy(req.user!.sub)) throw new ForbiddenError('You do not own this shop');

    const pagination = parsePagination(req.query as Record<string, string>);
    const filters = {
      status: req.query.status as 'active' | 'draft' | 'archived' | undefined,
      search: req.query.search as string | undefined,
    };

    const result = await getShopProductsUseCase.execute(shopId, pagination, filters, false);
    res.status(200).json({ success: true, data: result });
  }

  // Storefront: list only active products (cached)
  static async listForStorefront(req: Request, res: Response): Promise<void> {
    const { shopSlug } = req.params;
    const shop = await shopRepo.findBySlug(shopSlug);
    if (!shop) throw new NotFoundError('Shop');

    const pagination = parsePagination(req.query as Record<string, string>);
    const filters = {
      categoryId: req.query.categoryId as string | undefined,
      search: req.query.search as string | undefined,
    };

    const result = await getShopProductsUseCase.execute(shop.id, pagination, filters, true);
    res.status(200).json({ success: true, data: result });
  }

  static async create(req: Request, res: Response): Promise<void> {
    const { shopId } = req.params;
    const dto = req.body as CreateProductDto;
    const product = await createProductUseCase.execute(shopId, req.user!.sub, dto);

    res.status(201).json({ success: true, data: { product: product.toJSON() } });
  }

  static async getOne(req: Request, res: Response): Promise<void> {
    const { shopId, shopSlug, productId } = req.params;

    // Dashboard route has :shopId; storefront route has :shopSlug — resolve either
    let resolvedShopId = shopId;
    if (!resolvedShopId && shopSlug) {
      const shop = await shopRepo.findBySlug(shopSlug);
      if (!shop) throw new NotFoundError('Shop');
      resolvedShopId = shop.id;
    }

    const product = await productRepo.findByIdAndShopId(productId, resolvedShopId);
    if (!product) throw new NotFoundError('Product');

    res.status(200).json({ success: true, data: { product: product.toJSON() } });
  }

  static async update(req: Request, res: Response): Promise<void> {
    const { shopId, productId } = req.params;
    const dto = req.body as UpdateProductDto;

    const before = await productRepo.findByIdAndShopId(productId, shopId);
    const oldImages = before?.images ?? [];

    const product = await updateProductUseCase.execute(productId, shopId, req.user!.sub, dto);
    if (dto.images !== undefined) {
      const newUrls = new Set(dto.images.map((img) => img.url));
      oldImages
        .filter((img) => img.publicId && !newUrls.has(img.url))
        .forEach(({ publicId }) => cloudinaryService.deleteImage(publicId!).catch(() => {}));
    }

    res.status(200).json({ success: true, data: { product: product.toJSON() } });
  }

  static async publish(req: Request, res: Response): Promise<void> {
    const { shopId, productId } = req.params;
    const { status } = req.body as { status: 'active' | 'draft' | 'archived' };

    const shop = await shopRepo.findById(shopId);
    if (!shop) throw new NotFoundError('Shop');
    if (!shop.isOwnedBy(req.user!.sub)) throw new ForbiddenError('You do not own this shop');

    const product = await productRepo.findByIdAndShopId(productId, shopId);
    if (!product) throw new NotFoundError('Product');

    if (status === 'active') product.publish();
    else if (status === 'archived') product.archive();
    else product.updateDetails({ });

    await productRepo.update(product);
    await cacheDel(`${CACHE_PREFIX.PRODUCT}${productId}`);

    res.status(200).json({ success: true, data: { product: product.toJSON() } });
  }

  static async delete(req: Request, res: Response): Promise<void> {
    const { shopId, productId } = req.params;

    const shop = await shopRepo.findById(shopId);
    if (!shop) throw new NotFoundError('Shop');
    if (!shop.isOwnedBy(req.user!.sub)) throw new ForbiddenError('You do not own this shop');

    await productRepo.delete(productId, shopId);
    await cacheDel(`${CACHE_PREFIX.PRODUCT}${productId}`);

    res.status(204).send();
  }

  /**
   * POST /products/shop/:shopId/images
   * Upload up to 5 product images to Cloudinary.
   * Returns an array of { url, publicId } objects to include in product create/update.
   *
   * Design: Images are uploaded separately from product creation so the client
   * can show previews and retry failed uploads without re-submitting the whole form.
   */
  static async uploadImages(req: Request, res: Response): Promise<void> {
    const { shopId } = req.params;

    const shop = await shopRepo.findById(shopId);
    if (!shop) throw new NotFoundError('Shop');
    if (!shop.isOwnedBy(req.user!.sub)) throw new ForbiddenError('You do not own this shop');

    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      throw new ValidationError('No images provided', { images: ['At least one image is required'] });
    }

    // Upload all files to Cloudinary concurrently
    const uploads = await Promise.all(
      files.map((file) =>
        cloudinaryService.uploadImage(file.buffer, `torbibi/products/${shopId}`)
      )
    );

    res.status(200).json({
      success: true,
      data: { images: uploads },
      message: `${uploads.length} image(s) uploaded successfully`,
    });
  }
}
