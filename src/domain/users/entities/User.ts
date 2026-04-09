import { v4 as uuidv4 } from 'uuid';

export type UserRole = 'customer' | 'shop_owner' | 'admin';

export interface UserProps {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  role: UserRole;
  isPhoneVerified: boolean;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * User aggregate root.
 * Phone is the primary identifier — email is optional (Ghana is phone-first).
 * Role drives authorization rules across the system.
 */
export class User {
  private props: UserProps;

  private constructor(props: UserProps) {
    this.props = props;
  }

  static create(params: {
    phone: string;
    name?: string;
    email?: string;
    role?: UserRole;
  }): User {
    const now = new Date();
    return new User({
      id: uuidv4(),
      phone: params.phone,
      name: params.name ?? null,
      email: params.email ?? null,
      role: params.role ?? 'customer',
      isPhoneVerified: false,
      isActive: true,
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: UserProps): User {
    return new User(props);
  }

  get id(): string { return this.props.id; }
  get phone(): string { return this.props.phone; }
  get name(): string | null { return this.props.name; }
  get email(): string | null { return this.props.email; }
  get role(): UserRole { return this.props.role; }
  get isPhoneVerified(): boolean { return this.props.isPhoneVerified; }
  get isActive(): boolean { return this.props.isActive; }
  get lastLoginAt(): Date | null { return this.props.lastLoginAt; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  verifyPhone(): void {
    this.props.isPhoneVerified = true;
    this.props.updatedAt = new Date();
  }

  recordLogin(): void {
    this.props.lastLoginAt = new Date();
    this.props.updatedAt = new Date();
  }

  updateProfile(params: { name?: string; email?: string }): void {
    if (params.name !== undefined) this.props.name = params.name;
    if (params.email !== undefined) this.props.email = params.email;
    this.props.updatedAt = new Date();
  }

  promoteToShopOwner(): void {
    this.props.role = 'shop_owner';
    this.props.updatedAt = new Date();
  }

  deactivate(): void {
    this.props.isActive = false;
    this.props.updatedAt = new Date();
  }

  isShopOwner(): boolean {
    return this.props.role === 'shop_owner' || this.props.role === 'admin';
  }

  toJSON(): UserProps {
    return { ...this.props };
  }
}
