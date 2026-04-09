import { Order, OrderStatus } from '../entities/Order';
import { PaginatedResult, PaginationParams } from '../../../shared/types';

export interface OrderFilters {
  status?: OrderStatus;
  customerId?: string;
  paymentStatus?: string;
  fromDate?: Date;
  toDate?: Date;
}

export interface IOrderRepository {
  save(order: Order): Promise<void>;
  update(order: Order): Promise<void>;
  findById(id: string): Promise<Order | null>;
  findByOrderNumber(orderNumber: string): Promise<Order | null>;
  findByIdAndShopId(id: string, shopId: string): Promise<Order | null>;
  findByShopId(
    shopId: string,
    params: PaginationParams,
    filters?: OrderFilters
  ): Promise<PaginatedResult<Order>>;
  findByCustomerId(
    customerId: string,
    params: PaginationParams
  ): Promise<PaginatedResult<Order>>;
  findByPaymentReference(reference: string): Promise<Order | null>;
  getNextOrderNumber(shopId: string): Promise<string>;
}
