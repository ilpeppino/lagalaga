export interface DbError {
  code: string;
  message: string;
  details?: string;
}

export type DbResult<T> =
  | {
      data: T;
      error: null;
    }
  | {
      data: null;
      error: DbError;
    };
