export type PaginationParams = {
  page: number;
  limit: number;
};

export type PaginatedResult<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

// Utility type — removes undefined from union
export type NonNullable<T> = T extends null | undefined ? never : T;

// Makes all properties optional recursively
export type DeepPartial<T> = T extends object
  ? { [P in keyof T]?: DeepPartial<T[P]> }
  : T;
