export type DatabaseValue = string | number | boolean | null | Date | Uint8Array;

export type DatabaseResult<T extends object = Record<string, unknown>> = {
  rows: T[];
  rowCount: number;
};

export interface DatabaseTransaction {
  query<T extends object = Record<string, unknown>>(
    sql: string,
    values?: DatabaseValue[],
  ): Promise<DatabaseResult<T>>;
  first<T extends object = Record<string, unknown>>(
    sql: string,
    values?: DatabaseValue[],
  ): Promise<T | null>;
  execute<T extends object = Record<string, unknown>>(
    sql: string,
    values?: DatabaseValue[],
  ): Promise<DatabaseResult<T>>;
}

export interface Database extends DatabaseTransaction {
  transaction<T>(operation: (transaction: DatabaseTransaction) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
