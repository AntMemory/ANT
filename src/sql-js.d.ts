declare module "sql.js" {
  export type SqlValue = string | number | Uint8Array | null;
  export type ParamsObject = Record<string, SqlValue>;

  export type Statement = {
    bind(params: ParamsObject): boolean;
    free(): boolean;
    getAsObject(): Record<string, SqlValue>;
    run(params?: ParamsObject): void;
    step(): boolean;
  };

  export type Database = {
    close(): void;
    export(): Uint8Array;
    prepare(sql: string): Statement;
    run(sql: string): void;
  };

  export type SqlJsStatic = {
    Database: new (data?: Buffer | Uint8Array) => Database;
  };

  export default function initSqlJs(config?: {
    locateFile?: (file: string) => string;
  }): Promise<SqlJsStatic>;
}
