import { v4 as uuidv4 } from 'uuid';

export type ProductStatus = 'active' | 'draft' | 'archived';

export interface ProductImage {
  url: string;
  alt: string;
  isPrimary: boolean;
}

export interface ProductProps {
  id: string;
  shopId: string;             // Multi-tenant isolation key
  name: string;
  slug: string;
  description: string | null;
  price: number;              // In lowest currency unit (pesewas for GHS)
  compareAtPrice: number | null; // Original price for sale display
  sku: string | null;
  quantity: number;
  trackInventory: boolean;
  images: ProductImage[];
  categoryId: string | null;
  tags: string[];
  status: ProductStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Product aggregate root.
 * Price is stored in pesewas (1 GHS = 100 pesewas) to avoid floating-point issues.
 * inventory tracking is opt-in — small shops often don't track stock.
 */
export class Product {
  private props: ProductProps;

  private constructor(props: ProductProps) {
    this.props = props;
  }

  static create(params: {
    shopId: string;
    name: string;
    slug: string;
    price: number;
    quantity?: number;
    description?: string;
    sku?: string;
    categoryId?: string;
    tags?: string[];
    trackInventory?: boolean;
    compareAtPrice?: number;
  }): Product {
    const now = new Date();
    return new Product({
      id: uuidv4(),
      shopId: params.shopId,
      name: params.name,
      slug: params.slug,
      description: params.description ?? null,
      price: params.price,
      compareAtPrice: params.compareAtPrice ?? null,
      sku: params.sku ?? null,
      quantity: params.quantity ?? 0,
      trackInventory: params.trackInventory ?? false,
      images: [],
      categoryId: params.categoryId ?? null,
      tags: params.tags ?? [],
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: ProductProps): Product {
    return new Product(props);
  }

  get id(): string { return this.props.id; }
  get shopId(): string { return this.props.shopId; }
  get name(): string { return this.props.name; }
  get slug(): string { return this.props.slug; }
  get description(): string | null { return this.props.description; }
  get price(): number { return this.props.price; }
  get compareAtPrice(): number | null { return this.props.compareAtPrice; }
  get sku(): string | null { return this.props.sku; }
  get quantity(): number { return this.props.quantity; }
  get trackInventory(): boolean { return this.props.trackInventory; }
  get images(): ProductImage[] { return [...this.props.images]; }
  get categoryId(): string | null { return this.props.categoryId; }
  get tags(): string[] { return [...this.props.tags]; }
  get status(): ProductStatus { return this.props.status; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  isAvailable(): boolean {
    if (this.props.status !== 'active') return false;
    if (this.props.trackInventory) return this.props.quantity > 0;
    return true;
  }

  belongsToShop(shopId: string): boolean {
    return this.props.shopId === shopId;
  }

  /**
   * Reserves stock for an order. Throws if insufficient inventory.
   */
  reserveStock(quantity: number): void {
    if (!this.props.trackInventory) return;
    if (this.props.quantity < quantity) {
      throw new Error(`Insufficient stock. Available: ${this.props.quantity}, Requested: ${quantity}`);
    }
    this.props.quantity -= quantity;
    this.props.updatedAt = new Date();
  }

  restoreStock(quantity: number): void {
    if (!this.props.trackInventory) return;
    this.props.quantity += quantity;
    this.props.updatedAt = new Date();
  }

  publish(): void {
    this.props.status = 'active';
    this.props.updatedAt = new Date();
  }

  archive(): void {
    this.props.status = 'archived';
    this.props.updatedAt = new Date();
  }

  updateDetails(params: {
    name?: string;
    description?: string;
    price?: number;
    compareAtPrice?: number | null;
    sku?: string;
    quantity?: number;
    trackInventory?: boolean;
    categoryId?: string | null;
    tags?: string[];
  }): void {
    if (params.name !== undefined) this.props.name = params.name;
    if (params.description !== undefined) this.props.description = params.description;
    if (params.price !== undefined) this.props.price = params.price;
    if (params.compareAtPrice !== undefined) this.props.compareAtPrice = params.compareAtPrice;
    if (params.sku !== undefined) this.props.sku = params.sku;
    if (params.quantity !== undefined) this.props.quantity = params.quantity;
    if (params.trackInventory !== undefined) this.props.trackInventory = params.trackInventory;
    if (params.categoryId !== undefined) this.props.categoryId = params.categoryId;
    if (params.tags !== undefined) this.props.tags = params.tags;
    this.props.updatedAt = new Date();
  }

  setImages(images: ProductImage[]): void {
    this.props.images = images;
    this.props.updatedAt = new Date();
  }

  toJSON(): ProductProps {
    return { ...this.props, images: [...this.props.images], tags: [...this.props.tags] };
  }
}
