export interface DbQueryResult<T = any> {
  rows: T[];
  rowCount: number;
  fields?: string[];
}

export interface DbTableOperations<T = any> {
  findById: (id: string | number) => Promise<T | null>;
  findOne: (filter: Partial<T>) => Promise<T | null>;
  findMany: (filter?: Partial<T>) => Promise<T[]>;
  create: (data: Partial<T>) => Promise<T>;
  update: (id: string | number, data: Partial<T>) => Promise<T>;
  delete: (id: string | number) => Promise<boolean>;
  assertStatus: (status: string, id?: string | number) => Promise<void>;
  count: (filter?: Partial<T>) => Promise<number>;
  clear: () => Promise<void>;
}
