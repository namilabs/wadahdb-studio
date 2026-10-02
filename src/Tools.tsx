import { useMemo, useState } from 'react'
import { CircleAlert, Plus, Trash2, X } from 'lucide-react'

interface ColumnDraft { name: string; type: string; nullable: boolean; primary: boolean }
type Action = 'createDatabase' | 'dropDatabase' | 'createTable' | 'addColumn' | 'modifyColumn' | 'dropColumn' | 'createIndex' | 'dropIndex' | 'processes' | 'listUsers' | 'showGrants' | 'createUser' | 'dropUser' | 'grant' | 'revoke'

const options: { value: Action; label: string; group: string }[] = [
  { value: 'createDatabase', label: 'Create database', group: 'Database' },
  { value: 'dropDatabase', label: 'Drop database', group: 'Database' },
  { value: 'createTable', label: 'Create table', group: 'Schema' },
  { value: 'addColumn', label: 'Add column', group: 'Schema' },
  { value: 'modifyColumn', label: 'Modify column', group: 'Schema' },
  { value: 'dropColumn', label: 'Drop column', group: 'Schema' },
  { value: 'createIndex', label: 'Create index', group: 'Schema' },
  { value: 'dropIndex', label: 'Drop index', group: 'Schema' },
  { value: 'processes', label: 'Active processes', group: 'Administration' },
  { value: 'listUsers', label: 'List users', group: 'Administration' },
  { value: 'showGrants', label: 'Show user grants', group: 'Administration' },
  { value: 'createUser', label: 'Create user', group: 'Administration' },
  { value: 'dropUser', label: 'Drop user', group: 'Administration' },
  { value: 'grant', label: 'Grant privileges', group: 'Administration' },
  { value: 'revoke', label: 'Revoke privileges', group: 'Administration' },
]

const types = ['INT', 'BIGINT', 'VARCHAR(255)', 'TEXT', 'DATETIME', 'DECIMAL(18,2)', 'BOOLEAN', 'JSON', 'BLOB']
const quoteIdent = (value: string) => `\`${value.replaceAll('`', '``')}\``
const quoteString = (value: string) => `'${value.replaceAll('\\', '\\\\').replaceAll("'", "''")}'`
const qualified = (database: string, table: string) => `${quoteIdent(database)}.${quoteIdent(table)}`

function generate(action: Action, values: Record<string, string>, columns: ColumnDraft[]): string {
  const database = values.database.trim()
  const table = values.table.trim()
  const name = values.name.trim()
  const user = `${quoteString(values.user.trim())}@${quoteString(values.host.trim() || '%')}`
  switch (action) {
    case 'createDatabase': return name ? `CREATE DATABASE ${quoteIdent(name)};` : ''
    case 'dropDatabase': return name ? `DROP DATABASE ${quoteIdent(name)};` : ''
    case 'createTable': {
      if (!database || !table || columns.some(column => !column.name.trim()) || columns.length === 0) return ''
      const parts = columns.map(column => `  ${quoteIdent(column.name.trim())} ${column.type}${column.nullable ? ' NULL' : ' NOT NULL'}`)
      const keys = columns.filter(column => column.primary).map(column => quoteIdent(column.name.trim()))
      if (keys.length) parts.push(`  PRIMARY KEY (${keys.join(', ')})`)
      return `CREATE TABLE ${qualified(database, table)} (\n${parts.join(',\n')}\n);`
    }
    case 'addColumn': return database && table && name ? `ALTER TABLE ${qualified(database, table)} ADD COLUMN ${quoteIdent(name)} ${values.type}${values.nullable === 'true' ? ' NULL' : ' NOT NULL'};` : ''
    case 'modifyColumn': return database && table && name ? `ALTER TABLE ${qualified(database, table)} MODIFY COLUMN ${quoteIdent(name)} ${values.type}${values.nullable === 'true' ? ' NULL' : ' NOT NULL'};` : ''
    case 'dropColumn': return database && table && name ? `ALTER TABLE ${qualified(database, table)} DROP COLUMN ${quoteIdent(name)};` : ''
    case 'createIndex': {
      const fields = values.fields.split(',').map(field => field.trim()).filter(Boolean)
      return database && table && name && fields.length ? `CREATE ${values.unique === 'true' ? 'UNIQUE ' : ''}INDEX ${quoteIdent(name)} ON ${qualified(database, table)} (${fields.map(quoteIdent).join(', ')});` : ''
    }
    case 'dropIndex': return database && table && name ? `DROP INDEX ${quoteIdent(name)} ON ${qualified(database, table)};` : ''
    case 'processes': return 'SHOW FULL PROCESSLIST;'
    case 'listUsers': return 'SELECT User, Host FROM mysql.user ORDER BY User, Host;'
    case 'showGrants': return values.user.trim() ? `SHOW GRANTS FOR ${user};` : 'SHOW GRANTS FOR CURRENT_USER();'
    case 'createUser': return values.user.trim() && values.password ? `CREATE USER ${user} IDENTIFIED BY ${quoteString(values.password)};` : ''
    case 'dropUser': return values.user.trim() ? `DROP USER ${user};` : ''
    case 'grant':
    case 'revoke': {
      const privileges = values.privileges.split(',').map(value => value.trim().toUpperCase()).filter(Boolean)
      if (!database || !values.user.trim() || !privileges.length || privileges.some(value => !/^[A-Z ]+$/.test(value))) return ''
      return action === 'grant'
        ? `GRANT ${privileges.join(', ')} ON ${quoteIdent(database)}.* TO ${user};`
        : `REVOKE ${privileges.join(', ')} ON ${quoteIdent(database)}.* FROM ${user};`
    }
  }
}

export default function Tools({ databases, initialDatabase, onClose, onOpenSql }: {
  databases: string[]
  initialDatabase: string
  onClose: () => void
  onOpenSql: (sql: string) => void
}) {
  const [action, setAction] = useState<Action>('createTable')
  const [values, setValues] = useState<Record<string, string>>({ database: initialDatabase || databases[0] || '', table: '', name: '', type: 'VARCHAR(255)', nullable: 'true', fields: '', unique: 'false', user: '', host: '%', password: '', privileges: 'SELECT' })
  const [columns, setColumns] = useState<ColumnDraft[]>([{ name: 'id', type: 'BIGINT', nullable: false, primary: true }])
  const sql = useMemo(() => generate(action, values, columns), [action, values, columns])
  const set = (key: string, value: string) => setValues(current => ({ ...current, [key]: value }))
  const usesDatabase = !['processes', 'listUsers', 'showGrants', 'createUser', 'dropUser'].includes(action)
  const usesTable = ['createTable', 'addColumn', 'modifyColumn', 'dropColumn', 'createIndex', 'dropIndex'].includes(action)
  const usesName = ['createDatabase', 'dropDatabase', 'addColumn', 'modifyColumn', 'dropColumn', 'createIndex', 'dropIndex'].includes(action)
  const usesUser = ['showGrants', 'createUser', 'dropUser', 'grant', 'revoke'].includes(action)

  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal tools-modal" onMouseDown={event => event.stopPropagation()}>
    <header className="modal-header"><div><span className="eyebrow">SCHEMA & ADMINISTRATION</span><h2>SQL tools</h2></div><button className="icon-button" onClick={onClose}><X size={18} /></button></header>
    <div className="action-body">
      <label>Action<select value={action} onChange={event => setAction(event.target.value as Action)}>{['Database', 'Schema', 'Administration'].map(group => <optgroup key={group} label={group}>{options.filter(option => option.group === group).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</optgroup>)}</select></label>
      {usesDatabase && action !== 'createDatabase' && action !== 'dropDatabase' && <label>Database<select value={values.database} onChange={event => set('database', event.target.value)}>{databases.map(name => <option key={name}>{name}</option>)}</select></label>}
      {usesTable && <label>Table name<input value={values.table} onChange={event => set('table', event.target.value)} placeholder="my_table" /></label>}
      {usesName && <label>{action.includes('Database') ? 'Database name' : action.includes('Index') ? 'Index name' : 'Column name'}<input value={values.name} onChange={event => set('name', event.target.value)} /></label>}
      {action === 'createTable' && <div className="columns-editor"><div><strong>Columns</strong><button className="secondary" onClick={() => setColumns(current => [...current, { name: '', type: 'VARCHAR(255)', nullable: true, primary: false }])}><Plus size={13} /> Add column</button></div>{columns.map((column, index) => <div className="column-row" key={index}><input placeholder="name" value={column.name} onChange={event => setColumns(current => current.map((item, position) => position === index ? { ...item, name: event.target.value } : item))} /><select value={column.type} onChange={event => setColumns(current => current.map((item, position) => position === index ? { ...item, type: event.target.value } : item))}>{types.map(type => <option key={type}>{type}</option>)}</select><label><input type="checkbox" checked={column.nullable} onChange={event => setColumns(current => current.map((item, position) => position === index ? { ...item, nullable: event.target.checked } : item))} />NULL</label><label><input type="checkbox" checked={column.primary} onChange={event => setColumns(current => current.map((item, position) => position === index ? { ...item, primary: event.target.checked } : item))} />PK</label><button className="icon-button" onClick={() => setColumns(current => current.filter((_, position) => position !== index))}><Trash2 size={13} /></button></div>)}</div>}
      {action === 'addColumn' && <><label>Type<select value={values.type} onChange={event => set('type', event.target.value)}>{types.map(type => <option key={type}>{type}</option>)}</select></label><label className="check"><input type="checkbox" checked={values.nullable === 'true'} onChange={event => set('nullable', String(event.target.checked))} /> Nullable</label></>}
      {action === 'modifyColumn' && <><label>New type<select value={values.type} onChange={event => set('type', event.target.value)}>{types.map(type => <option key={type}>{type}</option>)}</select></label><label className="check"><input type="checkbox" checked={values.nullable === 'true'} onChange={event => set('nullable', String(event.target.checked))} /> Nullable</label></>}
      {action === 'createIndex' && <><label>Columns, comma separated<input value={values.fields} onChange={event => set('fields', event.target.value)} placeholder="email, created_at" /></label><label className="check"><input type="checkbox" checked={values.unique === 'true'} onChange={event => set('unique', String(event.target.checked))} /> Unique index</label></>}
      {usesUser && <div className="two-fields"><label>User<input value={values.user} onChange={event => set('user', event.target.value)} /></label><label>Host<input value={values.host} onChange={event => set('host', event.target.value)} /></label></div>}
      {action === 'createUser' && <label>Password<input type="password" value={values.password} onChange={event => set('password', event.target.value)} /></label>}
      {(action === 'grant' || action === 'revoke') && <label>Privileges, comma separated<input value={values.privileges} onChange={event => set('privileges', event.target.value)} placeholder="SELECT, INSERT" /></label>}
      <div className="sql-preview"><strong>SQL preview</strong><pre>{action === 'createUser' ? sql.replace(/IDENTIFIED BY .+;/, 'IDENTIFIED BY ••••;') : sql || 'Complete the fields to generate SQL.'}</pre></div>
      {action === 'createUser' && <p className="helper"><CircleAlert size={13} /> The password will be visible in the SQL editor. Close the tab after running it.</p>}
    </div><footer className="modal-footer"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!sql} onClick={() => { onOpenSql(sql); onClose() }}>Open SQL in editor</button></footer>
  </section></div>
}
