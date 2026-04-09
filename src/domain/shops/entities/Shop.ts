import { v4 as uuidv4 } from 'uuid';

export type ShopStatus = 'active' | 'inactive' | 'suspended';

export interface ShopAddress {
  region: string;
  city: string;
  area?: string;
  digitalAddress?: string; // Ghana Post GPS address
}

export interface ShopProps {
  id: string;
  ownerId: string;
  name: string;
  slug: string;           // URL identifier — must be globally unique
  description: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  phone: string;
  email: string | null;
  address: ShopAddress | null;
  status: ShopStatus;
  currency: string;       // Default: GHS (Ghana Cedis)
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Shop aggregate root — the primary multi-tenant boundary.
 * Every product, order, and customer interaction belongs to a shop.
 * The slug is the public identifier used in storefronts (e.g. /shops/my-shop).
 */
export class Shop {
  private props: ShopProps;

  private constructor(props: ShopProps) {
    this.props = props;
  }

  static create(params: {
    ownerId: string;
    name: string;
    slug: string;
    phone: string;
    description?: string;
    email?: string;
    address?: ShopAddress;
  }): Shop {
    const now = new Date();
    return new Shop({
      id: uuidv4(),
      ownerId: params.ownerId,
      name: params.name,
      slug: params.slug,
      description: params.description ?? null,
      logoUrl: null,
      bannerUrl: null,
      phone: params.phone,
      email: params.email ?? null,
      address: params.address ?? null,
      status: 'active',
      currency: 'GHS',
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: ShopProps): Shop {
    return new Shop(props);
  }

  get id(): string { return this.props.id; }
  get ownerId(): string { return this.props.ownerId; }
  get name(): string { return this.props.name; }
  get slug(): string { return this.props.slug; }
  get description(): string | null { return this.props.description; }
  get logoUrl(): string | null { return this.props.logoUrl; }
  get bannerUrl(): string | null { return this.props.bannerUrl; }
  get phone(): string { return this.props.phone; }
  get email(): string | null { return this.props.email; }
  get address(): ShopAddress | null { return this.props.address; }
  get status(): ShopStatus { return this.props.status; }
  get currency(): string { return this.props.currency; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  isActive(): boolean {
    return this.props.status === 'active';
  }

  isOwnedBy(userId: string): boolean {
    return this.props.ownerId === userId;
  }

  updateDetails(params: {
    name?: string;
    description?: string;
    email?: string;
    phone?: string;
    address?: ShopAddress;
  }): void {
    if (params.name !== undefined) this.props.name = params.name;
    if (params.description !== undefined) this.props.description = params.description;
    if (params.email !== undefined) this.props.email = params.email;
    if (params.phone !== undefined) this.props.phone = params.phone;
    if (params.address !== undefined) this.props.address = params.address;
    this.props.updatedAt = new Date();
  }

  updateMedia(params: { logoUrl?: string; bannerUrl?: string }): void {
    if (params.logoUrl !== undefined) this.props.logoUrl = params.logoUrl;
    if (params.bannerUrl !== undefined) this.props.bannerUrl = params.bannerUrl;
    this.props.updatedAt = new Date();
  }

  suspend(): void {
    this.props.status = 'suspended';
    this.props.updatedAt = new Date();
  }

  activate(): void {
    this.props.status = 'active';
    this.props.updatedAt = new Date();
  }

  toJSON(): ShopProps {
    return { ...this.props };
  }
}
