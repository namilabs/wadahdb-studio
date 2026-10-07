// Wails preserves the existing typed frontend contract.
const methodNames: Record<string, string> = {
 test_connection:'TestConnection', list_engines:'ListEngines', list_profiles:'ListProfiles', save_profile:'SaveProfile', delete_profile:'DeleteProfile',
 connect_profile:'ConnectProfile', disconnect_profile:'DisconnectProfile', execute_query:'ExecuteQuery',
 begin_transaction:'BeginTransaction', finish_transaction:'FinishTransaction', cancel_query:'CancelQuery',
 select_database:'SelectDatabase', list_databases:'ListDatabases', list_objects:'ListObjects',
 list_columns:'ListColumns', load_table_page:'LoadTablePage', update_table_cell:'UpdateTableCell',
 backup_database:'BackupDatabase', inspect_restore:'InspectRestore', restore_database:'RestoreDatabase',
 preview_csv:'PreviewCsv', import_csv:'ImportCsv', import_sql:'ImportSql', export_query:'ExportQuery',
}
declare global { interface Window { go: { main: { App: Record<string, (...args: unknown[]) => Promise<unknown>> } } } }
function invoke<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
 const fn = window.go?.main?.App?.[methodNames[name]]
 if (!fn) return Promise.reject(new Error('Run the desktop app with Wails to use database features.'))
 return fn(...Object.values(args)) as Promise<T>
}

export interface EngineDescriptor {
  id: string
  name: string
  kind: string
  defaultPort: number
  capabilities: {
    sql: boolean
    transactions: boolean
    schema: boolean
    tables: boolean
    backup: boolean
    transfer: boolean
  }
}

export type Engine = 'mysql' | 'mariadb'

export interface SshConfig {
  host: string
  port: number
  username: string
  identityFile: string | null
}

export interface ConnectionProfile {
  id: string
  name: string
  engine: Engine
  host: string
  port: number
  username: string
  defaultDatabase: string | null
  tls: boolean
  ssh: SshConfig | null
  hasSavedPassword: boolean
}

export interface QueryResult {
  columns: string[]
  rows: unknown[][]
  affectedRows: number
  elapsedMs: number
  truncated: boolean
}

export interface SchemaItem {
  name: string
  kind: string
  table?: string | null
}

export interface RestoreInspection {
  sourceDatabase: string
  objects: string[]
  targetObjects: string[]
  conflicts: string[]
}

export interface CsvPreview {
  headers: string[]
  rows: string[][]
}

export interface TablePage {
  columns: string[]
  rows: unknown[][]
  primaryKeys: string[]
  page: number
  hasMore: boolean
}

export const api = {
  testConnection: (profile: ConnectionProfile, password: string | null) => invoke<string>('test_connection', { input: { profile, password, forgetPassword: false } }),
  engines: () => invoke<EngineDescriptor[]>('list_engines'),
  profiles: () => invoke<ConnectionProfile[]>('list_profiles'),
  saveProfile: (profile: ConnectionProfile, password: string, forgetPassword = false) =>
    invoke<ConnectionProfile>('save_profile', {
      input: { profile, password: password || null, forgetPassword },
    }),
  deleteProfile: (id: string) => invoke<void>('delete_profile', { id }),
  connect: (id: string, temporaryPassword: string | null) =>
    invoke<string>('connect_profile', { id, temporaryPassword }),
  disconnect: (id: string) => invoke<void>('disconnect_profile', { id }),
  query: (id: string, sql: string, confirmed = false) =>
    invoke<QueryResult>('execute_query', { id, sql, confirmed }),
  beginTransaction: (id: string) => invoke<void>('begin_transaction', { id }),
  finishTransaction: (id: string, commit: boolean) => invoke<void>('finish_transaction', { id, commit }),
  cancelQuery: (id: string) => invoke<void>('cancel_query', { id }),
  selectDatabase: (id: string, database: string) => invoke<void>('select_database', { id, database }),
  databases: (id: string) => invoke<SchemaItem[]>('list_databases', { id }),
  objects: (id: string, database: string) => invoke<SchemaItem[]>('list_objects', { id, database }),
  columns: (id: string, database: string, table: string) => invoke<string[]>('list_columns', { id, database, table }),
  tablePage: (id: string, database: string, table: string, page: number, filter: string, sortBy: string | null, sortDesc: boolean) =>
    invoke<TablePage>('load_table_page', { id, database, table, page, filter: filter || null, sortBy, sortDesc }),
  updateCell: (id: string, database: string, table: string, column: string, keys: unknown[], value: string | null) =>
    invoke<number>('update_table_cell', { id, database, table, column, keys, value }),
  backup: (id: string, engine: Engine, database: string, selectedTables: string[] | null, path: string) =>
    invoke<number>('backup_database', { id, engine, database, selectedTables, path }),
  inspectRestore: (id: string, target: string, path: string) =>
    invoke<RestoreInspection>('inspect_restore', { id, target, path }),
  restore: (id: string, target: string, path: string, overwrite: boolean) =>
    invoke<number>('restore_database', { id, target, path, overwrite }),
  previewCsv: (path: string) => invoke<CsvPreview>('preview_csv', { path }),
  importCsv: (id: string, database: string, table: string, path: string, columns: string[]) =>
    invoke<number>('import_csv', { id, database, table, path, columns }),
  importSql: (id: string, database: string, path: string) =>
    invoke<number>('import_sql', { id, database, path }),
  exportQuery: (id: string, sql: string, path: string, format: 'csv' | 'json') =>
    invoke<number>('export_query', { id, sql, path, format }),
}

export function errorMessage(error: unknown): string {
  return typeof error === 'string' ? error : error instanceof Error ? error.message : String(error)
}
