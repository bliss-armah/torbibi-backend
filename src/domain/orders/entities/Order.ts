import { v4 as uuidv4 } from 'uuid';

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export interface OrderItem {
  productId: string;
  productName: string;  // Snapshot at time of order — product names can change
  productSlug: string;
  quantity: number;
  unitPrice: number;    // In pesewas
  totalPrice: number;   // unitPrice * quantity
}

export interface ShippingAddress {
  recipientName: string;
  phone: string;
  region: string;
  city: string;
  area?: string;
  digitalAddress?: string;
  notes?: string;
}

export interface DeliveryInfo {
  driverPhone?: string;
  vehicleNumber?: string;
  notes?: string;
}

export interface OrderProps {
  id: string;
  orderNumber: string;  // Human-readable (e.g. TRB-00001)
  shopId: string;
  customerId: string;
  customerPhone: string;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentReference: string | null;
  shippingAddress: ShippingAddress;
  notes: string | null;
  cancelReason: string | null;
  deliveryInfo: DeliveryInfo | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Order aggregate root.
 * Stores item snapshots — not references — so historical orders remain accurate
 * even when products are later edited or deleted.
 * orderNumber is human-readable for customer support and SMS notifications.
 */
export class Order {
  private props: OrderProps;

  private constructor(props: OrderProps) {
    this.props = props;
  }

  static create(params: {
    shopId: string;
    customerId: string;
    customerPhone: string;
    items: OrderItem[];
    deliveryFee: number;
    shippingAddress: ShippingAddress;
    orderNumber: string;
    notes?: string;
  }): Order {
    const subtotal = params.items.reduce((sum, item) => sum + item.totalPrice, 0);
    const total = subtotal + params.deliveryFee;
    const now = new Date();

    return new Order({
      id: uuidv4(),
      orderNumber: params.orderNumber,
      shopId: params.shopId,
      customerId: params.customerId,
      customerPhone: params.customerPhone,
      items: params.items,
      subtotal,
      deliveryFee: params.deliveryFee,
      total,
      status: 'pending',
      paymentStatus: 'pending',
      paymentReference: null,
      shippingAddress: params.shippingAddress,
      notes: params.notes ?? null,
      cancelReason: null,
      deliveryInfo: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: OrderProps): Order {
    return new Order(props);
  }

  get id(): string { return this.props.id; }
  get orderNumber(): string { return this.props.orderNumber; }
  get shopId(): string { return this.props.shopId; }
  get customerId(): string { return this.props.customerId; }
  get customerPhone(): string { return this.props.customerPhone; }
  get items(): OrderItem[] { return [...this.props.items]; }
  get subtotal(): number { return this.props.subtotal; }
  get deliveryFee(): number { return this.props.deliveryFee; }
  get total(): number { return this.props.total; }
  get status(): OrderStatus { return this.props.status; }
  get paymentStatus(): PaymentStatus { return this.props.paymentStatus; }
  get paymentReference(): string | null { return this.props.paymentReference; }
  get shippingAddress(): ShippingAddress { return { ...this.props.shippingAddress }; }
  get notes(): string | null { return this.props.notes; }
  get cancelReason(): string | null { return this.props.cancelReason; }
  get deliveryInfo(): DeliveryInfo | null { return this.props.deliveryInfo; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  canBeCancelled(): boolean {
    return ['pending', 'confirmed'].includes(this.props.status);
  }

  markPaymentReceived(reference: string): void {
    this.props.paymentReference = reference;
    this.props.paymentStatus = 'paid';
    this.props.status = 'confirmed';
    this.props.updatedAt = new Date();
  }

  markPaymentFailed(): void {
    this.props.paymentStatus = 'failed';
    this.props.updatedAt = new Date();
  }

  confirm(): void {
    this.props.status = 'confirmed';
    this.props.updatedAt = new Date();
  }

  startProcessing(): void {
    this.props.status = 'processing';
    this.props.updatedAt = new Date();
  }

  setDeliveryInfo(info: DeliveryInfo): void {
    this.props.deliveryInfo = info;
    this.props.updatedAt = new Date();
  }

  markShipped(): void {
    this.props.status = 'shipped';
    this.props.updatedAt = new Date();
  }

  markDelivered(): void {
    this.props.status = 'delivered';
    this.props.updatedAt = new Date();
  }

  cancel(reason: string): void {
    if (!this.canBeCancelled()) {
      throw new Error(`Order cannot be cancelled in status: ${this.props.status}`);
    }
    this.props.status = 'cancelled';
    this.props.cancelReason = reason;
    this.props.updatedAt = new Date();
  }

  toJSON(): OrderProps {
    return { ...this.props, items: [...this.props.items] };
  }
}
