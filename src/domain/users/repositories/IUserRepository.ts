import { User } from '../entities/User';

export interface IUserRepository {
  save(user: User): Promise<void>;
  update(user: User): Promise<void>;
  findById(id: string): Promise<User | null>;
  findByPhone(phone: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  existsByPhone(phone: string): Promise<boolean>;
}
