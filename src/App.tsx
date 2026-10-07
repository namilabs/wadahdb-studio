import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type * as Monaco from 'monaco-editor'
import { open, save } from './dialogs'
import { copyText } from './clipboard'
import { useTheme, type ThemePreference } from './theme'
import {
  Archive, ChevronDown, ChevronRight, CircleAlert, CircleCheck, Database, Download, FileCode2,
  FolderInput, LoaderCircle, Play, Plus, RefreshCw, Save, Square, Table2, Upload,
  Settings2,
  Trash2, Unplug, X, BookOpen, Braces, Clock3, Crown, Folder, Keyboard, Search,
  Settings, PanelRightClose, PanelRightOpen, TableProperties, WandSparkles, ArrowRight, LockKeyhole,
} from 'lucide-react'
import { api, errorMessage, type ConnectionProfile, type CsvPreview, type QueryResult, type RestoreInspection, type SchemaItem } from './api'
import Tools from './Tools'
import Connections from './components/Connections'
import DatabaseIcon from './components/DatabaseIcon'
import ContextMenu, { type ContextMenuAction } from './components/ContextMenu'
import logo from './assets/logo.png'
import splash from './assets/splash.png'

interface Tab {
  id: string
  title: string
  sql: string
  result: QueryResult | null
  table: { database: string; name: string; page: number; hasMore: boolean; primaryKeys: string[]; filter: string; sortBy: string | null; sortDesc: boolean } | null
}

interface SavedQuery { id: string; name: string; sql: string }
interface HistoryEntry { id: string; sql: string; when: string }

function storedList<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]') as T[] }
  catch { return [] }
}

const newTab = (index: number): Tab => ({
  id: crypto.randomUUID(), title: `Query ${index}`, sql: 'SELECT VERSION();', result: null, table: null,
})

function quoteIdentifier(value: string) { return `\`${value.replaceAll('`', '``')}\`` }

function BackupDialog({ profile, databases, onClose, onDone }: {
  profile: ConnectionProfile
  databases: SchemaItem[]
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [database, setDatabase] = useState(profile.defaultDatabase ?? databases[0]?.name ?? '')
  const [tables, setTables] = useState<string[]>([])
  const [selected, setSelected] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!database) return
    api.objects(profile.id, database)
      .then(items => setTables(items.filter(item => item.kind === 'table').map(item => item.name)))
      .catch(cause => setError(errorMessage(cause)))
  }, [profile.id, database])

  async function run() {
    if (!database) return
    const path = await save({ title: 'Save SQL backup', defaultPath: `${database}.sql`, filters: [{ name: 'SQL backup', extensions: ['sql'] }] })
    if (!path) return
    setBusy(true)
    setError('')
    try {
      const count = await api.backup(profile.id, profile.engine, database, selected, path)
      onDone(`Backup completed: ${count} objects saved to ${path}`)
    } catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }

  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal action-modal" onMouseDown={e => e.stopPropagation()}>
    <header className="modal-header"><div><span className="eyebrow">BACKUP DATABASE</span><h2>Create SQL backup</h2></div><button className="icon-button" onClick={onClose}><X size={18} /></button></header>
    <div className="action-body"><label>Source database<select value={database} onChange={e => { setDatabase(e.target.value); setSelected(null) }}>{databases.map(item => <option key={item.name}>{item.name}</option>)}</select></label>
      <div className="segmented"><button className={selected === null ? 'chosen' : ''} onClick={() => setSelected(null)}>Whole database</button><button className={selected !== null ? 'chosen' : ''} onClick={() => setSelected([])}>Selected tables</button></div>
      {selected === null ? <p className="helper">Includes tables, rows, views, triggers, routines, and events.</p> : <div className="table-checks">{tables.map(table => <label key={table}><input type="checkbox" checked={selected.includes(table)} onChange={e => setSelected(current => e.target.checked ? [...(current ?? []), table] : (current ?? []).filter(name => name !== table))} />{table}</label>)}</div>}
      {error && <p className="form-error"><CircleAlert size={16} />{error}</p>}
    </div><footer className="modal-footer"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" onClick={run} disabled={busy || !database || (selected !== null && selected.length === 0)}>{busy ? 'Backing up…' : 'Create backup'}</button></footer>
  </section></div>
}

function RestoreDialog({ profile, onClose, onDone }: {
  profile: ConnectionProfile
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [path, setPath] = useState('')
  const [target, setTarget] = useState(profile.defaultDatabase ?? '')
  const [inspection, setInspection] = useState<RestoreInspection | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function chooseFile() {
    const picked = await open({ title: 'Choose SQL backup', multiple: false, filters: [{ name: 'SQL backup', extensions: ['sql'] }] })
    if (typeof picked === 'string') { setPath(picked); setInspection(null); setError('') }
  }

  async function inspect() {
    setBusy(true)
    setError('')
    try { setInspection(await api.inspectRestore(profile.id, target, path)) }
    catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }

  async function restore() {
    if (!inspection) return
    const overwrite = inspection.targetObjects.length > 0
    if (overwrite && !window.confirm(`The target contains ${inspection.targetObjects.length} objects. Matching objects from the backup will be replaced; other target objects will remain. Continue?`)) return
    setBusy(true)
    setError('')
    try {
      const count = await api.restore(profile.id, target, path, overwrite)
      onDone(`Restore completed: ${count} objects in ${target}`)
    } catch (cause) { setError(errorMessage(cause)); setInspection(null) }
    finally { setBusy(false) }
  }

  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal action-modal" onMouseDown={e => e.stopPropagation()}>
    <header className="modal-header"><div><span className="eyebrow">RESTORE DATABASE</span><h2>Restore SQL backup</h2></div><button className="icon-button" onClick={onClose}><X size={18} /></button></header>
    <div className="action-body"><label>Backup file<div className="file-picker"><input readOnly value={path} placeholder="Choose a .sql backup" /><button className="secondary" onClick={chooseFile}>Browse</button></div></label>
      <label>Target database<input value={target} onChange={e => { setTarget(e.target.value); setInspection(null) }} placeholder="Can be different from source" /></label>
      {inspection && <div className="inspection"><strong>Source: {inspection.sourceDatabase}</strong><span>{inspection.objects.length} objects in backup</span>{inspection.targetObjects.length ? <p className={inspection.conflicts.length ? 'conflict' : 'clean'}>Target has {inspection.targetObjects.length} objects{inspection.conflicts.length ? `; ${inspection.conflicts.length} will be replaced: ${inspection.conflicts.join(', ')}` : '; no matching names will be replaced.'}</p> : <p className="clean">Target is empty; no conflicts found.</p>}</div>}
      {error && <p className="form-error"><CircleAlert size={16} />{error}</p>}
    </div><footer className="modal-footer"><button className="secondary" onClick={onClose}>Cancel</button>{inspection ? <button className="primary" disabled={busy} onClick={restore}>{busy ? 'Restoring…' : inspection.targetObjects.length ? 'Confirm restore' : 'Restore to empty target'}</button> : <button className="primary" disabled={busy || !path || !target} onClick={inspect}>{busy ? 'Inspecting…' : 'Inspect backup'}</button>}</footer>
  </section></div>
}

function ImportDialog({ profile, databases, onClose, onDone }: {
  profile: ConnectionProfile
  databases: SchemaItem[]
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [format, setFormat] = useState<'csv' | 'sql'>('csv')
  const [database, setDatabase] = useState(profile.defaultDatabase ?? databases[0]?.name ?? '')
  const [tables, setTables] = useState<string[]>([])
  const [table, setTable] = useState('')
  const [columns, setColumns] = useState<string[]>([])
  const [mapping, setMapping] = useState<string[]>([])
  const [path, setPath] = useState('')
  const [preview, setPreview] = useState<CsvPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!database) return
    api.objects(profile.id, database).then(items => {
      const names = items.filter(item => item.kind === 'table').map(item => item.name)
      setTables(names)
      setTable(current => names.includes(current) ? current : names[0] ?? '')
    }).catch(cause => setError(errorMessage(cause)))
  }, [profile.id, database])

  useEffect(() => {
    if (!database || !table) return
    api.columns(profile.id, database, table).then(setColumns).catch(cause => setError(errorMessage(cause)))
  }, [profile.id, database, table])

  useEffect(() => {
    if (preview && columns.length) setMapping(preview.headers.map((header, index) => columns.includes(header) ? header : columns[index] ?? ''))
  }, [preview, columns])

  async function chooseFile() {
    const picked = await open({ title: `Choose ${format.toUpperCase()} file`, multiple: false, filters: [{ name: format.toUpperCase(), extensions: [format] }] })
    if (typeof picked !== 'string') return
    setPath(picked)
    setError('')
    if (format === 'csv') {
      try { setPreview(await api.previewCsv(picked)) }
      catch (cause) { setError(errorMessage(cause)) }
    }
  }

  async function run() {
    setBusy(true)
    setError('')
    try {
      if (format === 'csv') {
        if (new Set(mapping).size !== mapping.length || mapping.some(column => !column)) throw new Error('Map each CSV column to a different table column')
        const count = await api.importCsv(profile.id, database, table, path, mapping)
        onDone(`Imported ${count} CSV rows into ${database}.${table}`)
      } else {
        if (!window.confirm(`Run SQL from ${path} against ${database}? The file may change data and schema.`)) return
        const count = await api.importSql(profile.id, database, path)
        onDone(`Executed ${count} SQL statements in ${database}`)
      }
    } catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }

  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal action-modal" onMouseDown={e => e.stopPropagation()}>
    <header className="modal-header"><div><span className="eyebrow">IMPORT DATA</span><h2>Import file</h2></div><button className="icon-button" onClick={onClose}><X size={18} /></button></header>
    <div className="action-body"><div className="segmented"><button className={format === 'csv' ? 'chosen' : ''} onClick={() => { setFormat('csv'); setPath(''); setPreview(null) }}>CSV data</button><button className={format === 'sql' ? 'chosen' : ''} onClick={() => { setFormat('sql'); setPath(''); setPreview(null) }}>SQL script</button></div>
      <label>Database<select value={database} onChange={e => setDatabase(e.target.value)}>{databases.map(item => <option key={item.name}>{item.name}</option>)}</select></label>
      {format === 'csv' && <label>Target table<select value={table} onChange={e => setTable(e.target.value)}>{tables.map(name => <option key={name}>{name}</option>)}</select></label>}
      <label>File<div className="file-picker"><input readOnly value={path} placeholder={`Choose a .${format} file`} /><button className="secondary" onClick={chooseFile}>Browse</button></div></label>
      {preview && format === 'csv' && <div className="csv-preview"><strong>Column mapping</strong>{preview.headers.map((header, index) => <div key={`${header}:${index}`}><span>{header}</span><span>→</span><select value={mapping[index] ?? ''} onChange={e => setMapping(current => current.map((column, columnIndex) => columnIndex === index ? e.target.value : column))}><option value="">Select column</option>{columns.map(column => <option key={column}>{column}</option>)}</select></div>)}<small>Preview: {preview.rows.length} sample rows</small></div>}
      {error && <p className="form-error"><CircleAlert size={16} />{error}</p>}
    </div><footer className="modal-footer"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={busy || !database || !path || (format === 'csv' && (!table || !preview))} onClick={run}>{busy ? 'Importing…' : 'Import'}</button></footer>
  </section></div>
}

function ExportDialog({ profile, sql, onClose, onDone }: {
  profile: ConnectionProfile
  sql: string
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [format, setFormat] = useState<'csv' | 'json'>('csv')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function run() {
    const path = await save({ title: 'Export query results', defaultPath: `query-result.${format}`, filters: [{ name: format.toUpperCase(), extensions: [format] }] })
    if (!path) return
    setBusy(true)
    setError('')
    try {
      const count = await api.exportQuery(profile.id, sql, path, format)
      onDone(`Exported ${count} rows to ${path}`)
    } catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal action-modal" onMouseDown={e => e.stopPropagation()}>
    <header className="modal-header"><div><span className="eyebrow">EXPORT DATA</span><h2>Export query results</h2></div><button className="icon-button" onClick={onClose}><X size={18} /></button></header>
    <div className="action-body"><p className="helper">Exports all rows from one read-only query, not just the visible preview.</p><div className="segmented"><button className={format === 'csv' ? 'chosen' : ''} onClick={() => setFormat('csv')}>CSV</button><button className={format === 'json' ? 'chosen' : ''} onClick={() => setFormat('json')}>JSON</button></div>{error && <p className="form-error"><CircleAlert size={16} />{error}</p>}</div>
    <footer className="modal-footer"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={busy} onClick={run}>{busy ? 'Exporting…' : 'Export'}</button></footer>
  </section></div>
}

export default function App() {
  const { preference: theme, setPreference: setTheme, resolved: resolvedTheme } = useTheme()
  const [view, setView] = useState<'connections' | 'query' | 'explorer' | 'snippets' | 'history' | 'settings'>('connections')
  const [starting, setStarting] = useState(true)
  const [showDetails, setShowDetails] = useState(true)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [resultView, setResultView] = useState<'results' | 'messages'>('results')
  const [objectSearch, setObjectSearch] = useState('')
  const [selectedObject, setSelectedObject] = useState<{ database: string; object: SchemaItem } | null>(null)
  const [contextTarget, setContextTarget] = useState<{ x: number; y: number; database: string; object?: SchemaItem } | null>(null)
  const closeContextMenu = useCallback(() => setContextTarget(null), [])
  useEffect(() => {
    const suppressNativeMenu = (event: MouseEvent) => event.preventDefault()
    document.addEventListener('contextmenu', suppressNativeMenu, true)
    return () => document.removeEventListener('contextmenu', suppressNativeMenu, true)
  }, [])
  const [objectColumns, setObjectColumns] = useState<string[]>([])
  const [detailsView, setDetailsView] = useState<'info' | 'columns' | 'preview'>('info')
  const [fontSize, setFontSize] = useState(() => { const size = Number(localStorage.getItem('wadahdb:editor-font-size') ?? 13); return [12, 13, 14, 15, 16, 18].includes(size) ? size : 13 })
  const [wordWrap, setWordWrap] = useState(() => localStorage.getItem('wadahdb:word-wrap') === 'true')
  const [profiles, setProfiles] = useState<ConnectionProfile[]>([])
  const [editing, setEditing] = useState<ConnectionProfile | null>(null)
  const [connectedId, setConnectedId] = useState<string | null>(null)
  const [serverVersion, setServerVersion] = useState('')
  const [databases, setDatabases] = useState<SchemaItem[]>([])
  const [expandedDb, setExpandedDb] = useState<string | null>(null)
  const [selectedDatabase, setSelectedDatabase] = useState<string | null>(null)
  const [objects, setObjects] = useState<SchemaItem[]>([])
  const [completionColumns, setCompletionColumns] = useState<string[]>([])
  const [tabs, setTabs] = useState<Tab[]>([newTab(1)])
  const [activeTabId, setActiveTabId] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [transaction, setTransaction] = useState(false)
  const [gridFilter, setGridFilter] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>(() => storedList<SavedQuery>('gui-sql:saved-queries'))
  const [history, setHistory] = useState<HistoryEntry[]>(() => storedList<HistoryEntry>('gui-sql:history'))
  const [action, setAction] = useState<'backup' | 'restore' | 'import' | 'export' | 'tools' | null>(null)
  const completionProvider = useRef<Monaco.IDisposable | null>(null)
  useEffect(() => { closeContextMenu() }, [view, connectedId, action, showShortcuts, closeContextMenu])
  useEffect(() => {
    if (!action && !showShortcuts) return
    const previous = document.activeElement as HTMLElement | null
    const modal = document.querySelector<HTMLElement>('.modal')
    const focusable = () => Array.from(modal?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? [])
    focusable()[0]?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setAction(null); setShowShortcuts(false) }
      if (event.key === 'Tab') {
        const items = focusable(); const first = items[0]; const last = items[items.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); previous?.focus() }
  }, [action, showShortcuts])
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const runRef = useRef<() => void>(() => {})
  const completionRef = useRef<string[]>([])

  useEffect(() => {
    setActiveTabId(current => current || tabs[0].id)
    let active = true
    const minimum = new Promise(resolve => window.setTimeout(resolve, 800))
    Promise.all([api.profiles().then(items => { if (active) setProfiles(items) }).catch(cause => { if (active) setError(errorMessage(cause)) }), minimum])
      .finally(() => { if (active) setStarting(false) })
    return () => { active = false }
  }, [])

  useEffect(() => { localStorage.setItem('gui-sql:saved-queries', JSON.stringify(savedQueries)) }, [savedQueries])
  useEffect(() => { localStorage.setItem('gui-sql:history', JSON.stringify(history)) }, [history])

  const activeTab = tabs.find(tab => tab.id === activeTabId) ?? tabs[0]
  useEffect(() => { if (activeTab.table) setSelectedObject({ database: activeTab.table.database, object: { name: activeTab.table.name, kind: 'table' } }) }, [activeTab.id])
  useEffect(() => { setGridFilter(activeTab.table?.filter ?? '') }, [activeTab.id, activeTab.table?.filter])
  const activeProfile = profiles.find(profile => profile.id === connectedId)
  completionRef.current = [...databases.map(item => item.name), ...objects.map(item => item.name), ...completionColumns]

  async function connect(profile: ConnectionProfile, suppliedPassword?: string) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const temporaryPassword = suppliedPassword !== undefined ? suppliedPassword : profile.hasSavedPassword ? null : window.prompt(`Password for ${profile.username}@${profile.host}`)
      if (temporaryPassword === null && !profile.hasSavedPassword) return
      const version = await api.connect(profile.id, temporaryPassword)
      setConnectedId(profile.id)
      setTransaction(false)
      setServerVersion(version)
      setDatabases(await api.databases(profile.id))
      setExpandedDb(null)
      setSelectedDatabase(profile.defaultDatabase)
      setObjects([])
      setSelectedObject(null)
      setObjectColumns([])
      setView('explorer')
      setMessage(`Connected to ${profile.name}`)
    } catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }

  async function disconnect() {
    if (connectedId) await api.disconnect(connectedId).catch(cause => setError(errorMessage(cause)))
    setConnectedId(null)
    setTransaction(false)
    setDatabases([])
    setObjects([])
    setExpandedDb(null)
    setSelectedDatabase(null)
    setServerVersion('')
    setSelectedObject(null)
    setObjectColumns([])
  }

  async function toggleDatabase(name: string) {
    if (!connectedId) return
    if (expandedDb === name) { setExpandedDb(null); return }
    try {
      await api.selectDatabase(connectedId, name)
      setSelectedDatabase(name)
      setExpandedDb(name)
      setObjects(await api.objects(connectedId, name))
    }
    catch (cause) { setError(errorMessage(cause)) }
  }

  async function refreshDatabase(name: string) {
    if (!connectedId) return
    try {
      await api.selectDatabase(connectedId, name)
      setSelectedDatabase(name)
      setExpandedDb(name)
      setObjects(await api.objects(connectedId, name))
    } catch (cause) { setError(errorMessage(cause)) }
  }

  function explorerMenu(database: string, object?: SchemaItem) {
    const show = (element: HTMLElement, x: number, y: number) => {
      element.focus()
      setContextTarget({ database, object, x, y })
    }
    return {
      onContextMenu: (event: ReactMouseEvent<HTMLButtonElement>) => {
        event.preventDefault()
        show(event.currentTarget, event.clientX, event.clientY)
      },
      onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => {
        if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return
        event.preventDefault()
        const bounds = event.currentTarget.getBoundingClientRect()
        show(event.currentTarget, bounds.left, bounds.bottom)
      },
    }
  }

  useEffect(() => {
    let active = true
    if (connectedId && selectedObject && ['table', 'view'].includes(selectedObject.object.kind)) {
      api.columns(connectedId, selectedObject.database, selectedObject.object.name)
        .then(columns => { if (active) setObjectColumns(columns) })
        .catch(cause => { if (active) setError(errorMessage(cause)) })
    }
    return () => { active = false }
  }, [connectedId, selectedObject])

  useEffect(() => { localStorage.setItem('wadahdb:editor-font-size', String(fontSize)) }, [fontSize])
  useEffect(() => { localStorage.setItem('wadahdb:word-wrap', String(wordWrap)) }, [wordWrap])

  function updateSql(sql: string) {
    setTabs(current => current.map(tab => tab.id === activeTab.id ? { ...tab, sql, table: sql === tab.sql ? tab.table : null } : tab))
  }

  function addTab(sql = 'SELECT *\nFROM ;') {
    setView('query')
    setResultView('results')
    const next = { ...newTab(tabs.length + 1), sql }
    setTabs(current => [...current, next])
    setActiveTabId(next.id)
  }

  function inspectObject(database: string, object: SchemaItem) {
    setSelectedObject({ database, object })
    setObjectColumns([])
    setDetailsView('info')
    setView('explorer')
    if (object.kind === 'table') { void openTable(database, object.name); return }
    if (object.kind === 'index' && object.table) {
      addTab(`SHOW INDEX FROM ${quoteIdentifier(database)}.${quoteIdentifier(object.table)};`)
      return
    }
    addTab(`SHOW CREATE ${object.kind.toUpperCase()} ${quoteIdentifier(database)}.${quoteIdentifier(object.name)};`)
  }

  async function openTable(database: string, name: string, page = 0, tabId?: string, filter = '', sortBy: string | null = null, sortDesc = false) {
    if (!connectedId) return
    setView('explorer')
    setResultView('results')
    setBusy(true)
    setError('')
    try {
      const data = await api.tablePage(connectedId, database, name, page, filter, sortBy, sortDesc)
      setCompletionColumns(data.columns)
      const sql = `SELECT * FROM \`${database.replaceAll('`', '``')}\`.\`${name.replaceAll('`', '``')}\` LIMIT 100 OFFSET ${page * 100};`
      const result: QueryResult = { columns: data.columns, rows: data.rows, affectedRows: 0, elapsedMs: 0, truncated: data.hasMore }
      const table = { database, name, page, hasMore: data.hasMore, primaryKeys: data.primaryKeys, filter, sortBy, sortDesc }
      if (tabId) setTabs(current => current.map(tab => tab.id === tabId ? { ...tab, sql, result, table } : tab))
      else {
        const tab: Tab = { id: crypto.randomUUID(), title: name, sql, result, table }
        setTabs(current => [...current, tab])
        setActiveTabId(tab.id)
      }
    } catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }

  function closeTab(id: string) {
    setTabs(current => {
      if (current.length === 1) { const next = newTab(1); setActiveTabId(next.id); return [next] }
      const next = current.filter(tab => tab.id !== id)
      if (activeTabId === id) setActiveTabId(next[0].id)
      return next
    })
  }

  async function run(confirmed = false, overrideSql?: string) {
    if (!connectedId) { setError('Connect to a server first'); return }
    const selection = editorRef.current?.getModel()?.getValueInRange(editorRef.current.getSelection()!) ?? ''
    const sql = overrideSql ?? (selection.trim() || activeTab.sql)
    setResultView('results')
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await api.query(connectedId, sql, confirmed)
      setTabs(current => current.map(tab => tab.id === activeTab.id ? { ...tab, result, table: null } : tab))
      setMessage(`Completed in ${result.elapsedMs} ms`)
      if (!/IDENTIFIED\s+BY/i.test(sql)) setHistory(current => [{ id: crypto.randomUUID(), sql, when: new Date().toLocaleString() }, ...current].slice(0, 50))
    } catch (cause) {
      const message = errorMessage(cause)
      if (message.startsWith('CONFIRM_REQUIRED:') && window.confirm(message.slice('CONFIRM_REQUIRED:'.length))) {
        await run(true, sql)
      } else if (!message.startsWith('CONFIRM_REQUIRED:')) setError(message)
    } finally { setBusy(false) }
  }

  useEffect(() => () => { completionProvider.current?.dispose() }, [])

  runRef.current = () => { if (!busy) void run() }
  const onEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current())
    completionProvider.current?.dispose()
    completionProvider.current = monaco.languages.registerCompletionItemProvider('sql', {
      provideCompletionItems(model: Monaco.editor.ITextModel, position: Monaco.Position) {
        const word = model.getWordUntilPosition(position)
        const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
        return { suggestions: [...new Set(completionRef.current)].map(label => ({
          label, insertText: `\`${label.replaceAll('`', '``')}\``, kind: monaco.languages.CompletionItemKind.Field, range,
        })) }
      },
    })
  }

  async function deleteProfile(profile: ConnectionProfile) {
    if (!window.confirm(`Delete connection “${profile.name}”?`)) return
    try {
      if (connectedId === profile.id) await disconnect()
      await api.deleteProfile(profile.id)
      setProfiles(current => current.filter(item => item.id !== profile.id))
    } catch (cause) { setError(errorMessage(cause)) }
  }

  async function editCell(row: unknown[], columnIndex: number) {
    if (!connectedId || !activeTab.table || !activeTab.result) return
    const { database, name, primaryKeys, page } = activeTab.table
    const column = activeTab.result.columns[columnIndex]
    if (!primaryKeys.length || primaryKeys.includes(column)) return
    const keys = primaryKeys.map(key => row[activeTab.result!.columns.indexOf(key)])
    if (keys.some(value => value === undefined || value === null)) { setError('Cannot edit a row without its complete primary key'); return }
    const previous = row[columnIndex]
    const entered = window.prompt(`New value for ${column} (type <NULL> to set NULL)`, previous === null ? '<NULL>' : String(previous))
    if (entered === null) return
    try {
      const changed = await api.updateCell(connectedId, database, name, column, keys, entered === '<NULL>' ? null : entered)
      if (changed !== 1) throw new Error('Row was not updated; it may have changed or disappeared')
      await openTable(database, name, page, activeTab.id, activeTab.table.filter, activeTab.table.sortBy, activeTab.table.sortDesc)
      setMessage(`Updated ${name}.${column}`)
    } catch (cause) { setError(errorMessage(cause)) }
  }

  async function changeTransaction(commit?: boolean) {
    if (!connectedId) return
    setError('')
    try {
      if (transaction) {
        await api.finishTransaction(connectedId, !!commit)
        setTransaction(false)
        setMessage(commit ? 'Transaction committed' : 'Transaction rolled back')
      } else {
        await api.beginTransaction(connectedId)
        setTransaction(true)
        setMessage('Transaction started')
      }
    } catch (cause) { setError(errorMessage(cause)) }
  }

  function saveQuery() {
    if (/IDENTIFIED\s+BY|PASSWORD\s*=/i.test(activeTab.sql)) {
      setError('Queries containing password credentials cannot be saved.')
      return
    }
    const name = window.prompt('Name for this query', activeTab.title)
    if (!name?.trim()) return
    setSavedQueries(current => [{ id: crypto.randomUUID(), name: name.trim(), sql: activeTab.sql }, ...current])
    setMessage(`Saved query “${name.trim()}”`)
  }

  const isWorkbench = view === 'query' || view === 'explorer'
  const navigate = (next: typeof view) => { setView(next); setError(''); setMessage('') }
  const viewNames = { connections: 'Connections', query: 'Query', explorer: 'Explorer', snippets: 'Snippets', history: 'History', settings: 'Settings' }
  const navItems = [
    { id: 'connections' as const, label: 'Connections', icon: Database },
    { id: 'query' as const, label: 'Query', icon: Play },
    { id: 'explorer' as const, label: 'Explorer', icon: Folder },
    { id: 'snippets' as const, label: 'Snippets', icon: Braces },
    { id: 'history' as const, label: 'History', icon: Clock3 },
  ]
  async function saveConnection(profile: ConnectionProfile, password: string, remember: boolean, openWorkspace: boolean) {
    setError('')
    const saved = await api.saveProfile(profile, remember ? password : '', !remember)
    setProfiles(current => [...current.filter(item => item.id !== saved.id), saved])
    setEditing(saved)
    if (openWorkspace) await connect(saved, password || (saved.hasSavedPassword ? undefined : ''))
    return saved
  }

  const contextActions: ContextMenuAction[] = []
  if (contextTarget) {
    const { database, object } = contextTarget
    const qualifiedName = object ? `${quoteIdentifier(database)}.${quoteIdentifier(object.name)}` : quoteIdentifier(database)
    if (object) {
      if (['table', 'view'].includes(object.kind)) {
        contextActions.push({ label: 'Browse data', disabled: busy, run: () => { setSelectedObject({ database, object }); setObjectColumns([]); setShowDetails(true); void openTable(database, object.name) } })
        contextActions.push({ label: 'Generate SELECT query', run: () => addTab(`SELECT *\nFROM ${qualifiedName}\nLIMIT 100;`) })
      }
      contextActions.push({ label: 'Show definition', run: () => addTab(object.kind === 'index' && object.table ? `SHOW INDEX FROM ${quoteIdentifier(database)}.${quoteIdentifier(object.table)};` : `SHOW CREATE ${object.kind.toUpperCase()} ${qualifiedName};`) })
    } else {
      contextActions.push({ label: 'Use database', disabled: busy, run: () => void refreshDatabase(database) })
      contextActions.push({ label: 'New query', run: () => addTab(`USE ${qualifiedName};\n\n`) })
    }
    contextActions.push({ label: 'Copy name', run: () => { copyText(object?.name ?? database).catch(cause => setError(errorMessage(cause))) } })
    contextActions.push({ label: 'Refresh objects', disabled: busy, run: () => void refreshDatabase(database) })
  }

  return <div className="app-shell">
    {contextTarget && <ContextMenu x={contextTarget.x} y={contextTarget.y} title={contextTarget.object?.name ?? contextTarget.database} actions={contextActions} onClose={closeContextMenu} />}
    {starting && <div className="splash-screen" role="status" aria-label="Starting WadahDB Studio">{resolvedTheme === 'dark' ? <div className="splash-brand"><img src={logo} alt="" /><div><strong>WadahDB<span>Studio</span></strong><p>A better way to explore your data.</p></div></div> : <img src={splash} alt="WadahDB Studio — A better way to explore your data." />}<div><LoaderCircle size={18} className="spin" /> Opening your workspace…</div></div>}
    <header className="app-header" inert={!!action || showShortcuts}>
      <button className="brand" onClick={() => navigate('connections')} aria-label="WadahDB Studio home"><img src={logo} alt="" /><strong>WadahDB<span>Studio</span></strong></button>
      <div className="header-context">{isWorkbench && activeProfile ? <><DatabaseIcon engine={activeProfile.engine} size={26} /><strong>{activeProfile.name}</strong><span className="header-status"><i className="online-dot" />Connected</span></> : <><Database size={21} /><strong>{viewNames[view]}</strong></>}</div>
      <div className="header-actions"><span className="free-badge"><Crown size={16} /> All features free</span><button className="header-docs" onClick={() => setShowShortcuts(true)}><BookOpen size={18} /> Guide</button><button onClick={() => setShowShortcuts(true)}><Keyboard size={18} /><span>Shortcuts</span></button><button onClick={() => navigate('settings')}><Settings size={18} /><span>Settings</span></button></div>
    </header>
    <aside className="sidebar" inert={!!action || showShortcuts}>
      <nav aria-label="Main navigation">{navItems.map(item => <button key={item.id} className={view === item.id ? 'nav-item active' : 'nav-item'} aria-current={view === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}><item.icon size={22} /><span>{item.label}</span></button>)}<div className="nav-divider" /><button className="nav-item" disabled={!connectedId || transaction} title={!connectedId ? 'Connect to a database to import data' : 'Import data'} onClick={() => setAction('import')}><Upload size={22} /><span>Data Import</span></button><button className="nav-item" disabled={!connectedId || transaction} title={!connectedId ? 'Connect to a database to export data' : 'Export data'} onClick={() => setAction('export')}><Download size={22} /><span>Data Export</span></button><button className={`nav-item ${view === 'settings' ? 'active' : ''}`} onClick={() => navigate('settings')}><Settings size={22} /><span>Settings</span></button></nav>
      <div className="sidebar-free"><div><Crown size={22} /><strong>All features free</strong></div><p>WadahDB Studio is free and open source. Your databases, your device, your control.</p><span><LockKeyhole size={13} /> No account required</span></div>
    </aside>
    <main inert={!!action || showShortcuts} className={`workspace ${isWorkbench ? 'workbench-page' : ''}`}>
      {!isWorkbench && message && <div className="workspace-notice" role="status"><CircleCheck size={17} /><span>{message}</span><button className="icon-button" aria-label="Dismiss message" onClick={() => setMessage('')}><X size={14} /></button></div>}
      {view === 'connections' && <Connections profiles={profiles} selected={editing} connectedId={connectedId} busy={busy} error={error} onClearError={() => setError('')} onSelect={profile => { setEditing(profile); setError('') }} onSave={saveConnection} onConnect={profile => connectedId === profile.id ? navigate('explorer') : void connect(profile)} onDelete={profile => void deleteProfile(profile)} onNavigate={navigate} onImport={() => setAction('import')} onExport={() => setAction('export')} />}
      {isWorkbench && <div className={`workbench-layout ${showDetails ? '' : 'without-details'}`}>
        <aside className="explorer-panel panel"><div className="explorer-heading"><h2>Database Explorer</h2><button className="icon-button" title="Refresh databases" aria-label="Refresh databases" disabled={!connectedId} onClick={() => connectedId && api.databases(connectedId).then(setDatabases).catch(cause => setError(errorMessage(cause)))}><RefreshCw size={16} /></button></div><div className="search-field"><Search size={16} /><input aria-label="Search database objects" placeholder="Search tables, schemas…" value={objectSearch} onChange={e => setObjectSearch(e.target.value)} /></div>
          {activeProfile ? <div className="explorer-connection"><DatabaseIcon engine={activeProfile.engine} size={27} /><strong>{activeProfile.name}</strong><i className="online-dot" /></div> : <div className="explorer-empty"><Database size={30} /><p>Connect to a database to explore your data.</p><button className="secondary" onClick={() => navigate('connections')}>Connections <ArrowRight size={14} /></button></div>}
          <div className="schema-list">{databases.filter(database => !objectSearch || database.name.toLowerCase().includes(objectSearch.toLowerCase()) || database.name === expandedDb).map(database => <div key={database.name}>
            <button {...explorerMenu(database.name)} className={`schema-db ${expandedDb === database.name ? 'expanded' : ''}`} onClick={() => toggleDatabase(database.name)}>{expandedDb === database.name ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<Database size={17} /><span>{database.name}</span></button>
            {expandedDb === database.name && <div className="schema-groups">{['table', 'view', 'function', 'procedure', 'trigger', 'event', 'index'].map(kind => {
              const items = objects.filter(object => object.kind === kind && (!objectSearch || object.name.toLowerCase().includes(objectSearch.toLowerCase())))
              if (!items.length) return null
              return <details key={kind} open={kind === 'table' || !!objectSearch}><summary><ChevronRight size={14} />{kind === 'table' || kind === 'view' ? <Table2 size={17} /> : <Braces size={17} />}<span>{kind.charAt(0).toUpperCase() + kind.slice(1)}s ({items.length})</span></summary><div className="object-list">{items.map(object => <button {...explorerMenu(database.name, object)} className={selectedObject?.object.name === object.name && selectedObject.object.kind === object.kind ? 'selected' : ''} key={`${object.table ?? ''}:${object.name}`} onClick={() => inspectObject(database.name, object)}><Table2 size={15} /><span>{object.table ? `${object.table}.` : ''}{object.name}</span></button>)}</div></details>
            })}{objects.length === 0 && <p className="empty-side">No objects in this database.</p>}</div>}
          </div>)}</div>
          <button className="secondary explorer-new-query" onClick={() => addTab('')}><Plus size={18} /> New query</button>
          {activeProfile && <div className="explorer-footer"><span>{activeProfile.engine === 'mysql' ? 'MySQL' : 'MariaDB'} · {serverVersion}</span><button className="icon-button" aria-label="Disconnect" title="Disconnect" onClick={() => void disconnect()}><Unplug size={16} /></button></div>}
        </aside>
        <div className="query-workspace">
      <div className="editor-tabs">{tabs.map(tab => <div className={`editor-tab ${tab.id === activeTab.id ? 'active' : ''}`} key={tab.id}><button onClick={() => setActiveTabId(tab.id)}><FileCode2 size={15} />{tab.title}</button><button className="tab-close" onClick={() => closeTab(tab.id)} aria-label={`Close ${tab.title}`}><X size={13} /></button></div>)}<button className="new-tab" title="New query tab" onClick={() => addTab('')}><Plus size={16} /></button></div>
      <div className="query-toolbar"><div className="query-actions"><button className="primary run-button" onClick={() => void run()} disabled={busy || !connectedId}>{busy ? <LoaderCircle size={15} className="spin" /> : <Play size={15} fill="currentColor" />} Run</button><button className="secondary" disabled={!connectedId || busy} onClick={() => void run(false, `EXPLAIN ${activeTab.sql.trim().replace(/;$/, '')}`)}><Clock3 size={15} /> Explain</button><button className="icon-button" onClick={saveQuery} title="Save snippet" aria-label="Save snippet"><Save size={17} /></button>{busy && <button className="secondary cancel-button" onClick={() => connectedId && api.cancelQuery(connectedId).catch(cause => setError(errorMessage(cause)))}><Square size={12} fill="currentColor" /> Cancel</button>}</div><div className="toolbar-right">{transaction ? <><button className="ghost-action" onClick={() => void changeTransaction(true)}>Commit</button><button className="ghost-action" onClick={() => void changeTransaction(false)}>Rollback</button></> : <button className="ghost-action" disabled={!connectedId || busy} onClick={() => void changeTransaction()}>Begin tx</button>}<span className="query-engine"><DatabaseIcon engine={activeProfile?.engine ?? 'mysql'} size={16} />{activeProfile ? activeProfile.engine === 'mysql' ? 'MySQL' : 'MariaDB' : 'SQL'}{selectedDatabase && <small> / {selectedDatabase}</small>}</span><button className="icon-button" aria-label={showDetails ? 'Hide table information' : 'Show table information'} title="Toggle table information" onClick={() => setShowDetails(!showDetails)}>{showDetails ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}</button></div></div>
      <div className="editor-area"><Editor height="100%" language="sql" theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'} value={activeTab.sql} onChange={value => updateSql(value ?? '')} onMount={onEditorMount} options={{ minimap: { enabled: false }, fontSize, lineHeight: 23, padding: { top: 20 }, scrollBeyondLastLine: false, automaticLayout: true, wordWrap: wordWrap ? 'on' : 'off', fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace' }} /></div>
      <section className="results">
        <div className="results-header">
          <div>
            <div className="result-tabs" role="tablist" aria-label="Query output"><button role="tab" aria-selected={resultView === 'results'} className={resultView === 'results' ? 'active' : ''} onClick={() => setResultView('results')}>Results {activeTab.result ? `(${activeTab.result.rows.length})` : ''}</button><button role="tab" aria-selected={resultView === 'messages'} className={resultView === 'messages' ? 'active' : ''} onClick={() => setResultView('messages')}>Messages</button></div>
            {activeTab.result && <span>{activeTab.result.rows.length} rows {activeTab.table ? `· page ${activeTab.table.page + 1}` : activeTab.result.truncated ? '(first 1,000)' : ''} · {activeTab.result.elapsedMs} ms</span>}
            {activeTab.table && <div className="pager">
              <button disabled={busy || activeTab.table.page === 0} onClick={() => openTable(activeTab.table!.database, activeTab.table!.name, activeTab.table!.page - 1, activeTab.id, activeTab.table!.filter, activeTab.table!.sortBy, activeTab.table!.sortDesc)}>Previous</button>
              <button disabled={busy || !activeTab.table.hasMore} onClick={() => openTable(activeTab.table!.database, activeTab.table!.name, activeTab.table!.page + 1, activeTab.id, activeTab.table!.filter, activeTab.table!.sortBy, activeTab.table!.sortDesc)}>Next</button>
            </div>}
          </div>
          <div className="result-state"><button className="secondary" disabled={!connectedId || transaction} onClick={() => setAction('export')}><Download size={15} /> Export</button>{error ? <span className="state-error"><CircleAlert size={15} /> Error</span> : message ? <span className="state-ok"><CircleCheck size={15} /> Success</span> : 'Ready'}</div>
        </div>
        {resultView === 'results' && activeTab.table && <div className="grid-controls">
          <input aria-label="Filter table rows" placeholder="Filter rows across all columns…" value={gridFilter} onChange={event => setGridFilter(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') openTable(activeTab.table!.database, activeTab.table!.name, 0, activeTab.id, gridFilter, activeTab.table!.sortBy, activeTab.table!.sortDesc) }} />
          <button className="secondary" disabled={busy} onClick={() => openTable(activeTab.table!.database, activeTab.table!.name, 0, activeTab.id, gridFilter, activeTab.table!.sortBy, activeTab.table!.sortDesc)}>Filter rows</button>
          {activeTab.table.filter && <button className="ghost-action" disabled={busy} onClick={() => { setGridFilter(''); openTable(activeTab.table!.database, activeTab.table!.name, 0, activeTab.id, '', activeTab.table!.sortBy, activeTab.table!.sortDesc) }}>Clear</button>}
        </div>}
        {error && <div className="error-banner"><CircleAlert size={17} />{error}</div>}
        {message && !error && <div className="success-banner">{message}</div>}
        {resultView === 'messages' ? <div className="messages-panel">{error || message || 'No messages yet. Run a query to see its status here.'}</div> : activeTab.result?.columns.length ? <div className="table-wrap"><table><thead><tr><th className="row-num">#</th>{activeTab.result.columns.map((column, index) => <th key={`${column}:${index}`}>{activeTab.table ? <button className="sort-header" title={`Sort by ${column}`} onClick={() => openTable(activeTab.table!.database, activeTab.table!.name, 0, activeTab.id, activeTab.table!.filter, column, activeTab.table!.sortBy === column ? !activeTab.table!.sortDesc : false)}>{column}{activeTab.table.sortBy === column ? (activeTab.table.sortDesc ? ' ↓' : ' ↑') : ''}</button> : column}</th>)}</tr></thead><tbody>{activeTab.result.rows.map((row, rowIndex) => <tr key={rowIndex}><td className="row-num">{activeTab.table ? activeTab.table.page * 100 + rowIndex + 1 : rowIndex + 1}</td>{row.map((value, index) => <td key={index} className={activeTab.table?.primaryKeys.length && !activeTab.table.primaryKeys.includes(activeTab.result!.columns[index]) ? 'editable-cell' : ''} title={activeTab.table ? 'Double-click to edit when table has a primary key' : value === null ? 'NULL' : String(value)} onDoubleClick={() => editCell(row, index)}>{value === null ? <em>NULL</em> : String(value)}</td>)}</tr>)}</tbody></table></div> : <div className="results-empty">{activeTab.result ? `${activeTab.result.affectedRows} rows affected` : 'Run a query to see results here.'}</div>}
      </section>
      <footer className="statusbar"><span>{activeTab.result ? `${activeTab.result.rows.length} rows${activeTab.result.truncated ? ' (preview)' : ''} · ${activeTab.result.elapsedMs} ms` : 'Ready to explore your data'}{transaction && <b className="tx-badge">Transaction active</b>}</span><span>Ctrl + Enter to run</span></footer>
        </div>
        {showDetails && <aside className="table-info panel"><div className="info-tabs"><button className={detailsView === 'info' ? 'active' : ''} onClick={() => setDetailsView('info')}>Table Info</button><button className={detailsView === 'columns' ? 'active' : ''} onClick={() => setDetailsView('columns')}>Columns</button><button className={detailsView === 'preview' ? 'active' : ''} onClick={() => setDetailsView('preview')}>Preview</button></div>
          {selectedObject ? <><div className="table-info-title"><span className="table-info-icon"><TableProperties size={24} /></span><div><h3>{selectedObject.object.name}</h3><small>{selectedObject.database}.{selectedObject.object.name}</small></div></div>
            <p className="table-description">{selectedObject.object.kind.charAt(0).toUpperCase() + selectedObject.object.kind.slice(1)} in {selectedObject.database}</p>
            {detailsView === 'preview' ? <div className="info-preview"><p>Open this table to browse its rows in the results grid.</p><button className="secondary" disabled={!['table', 'view'].includes(selectedObject.object.kind)} onClick={() => void openTable(selectedObject.database, selectedObject.object.name)}><Table2 size={16} /> Browse data</button></div> : <><div className="table-metrics"><div><strong>{objectColumns.length || '—'}</strong><small>Columns</small></div><div><strong>{selectedObject.object.kind}</strong><small>Object type</small></div></div><div className="info-section-heading"><h3>Columns</h3><span>{objectColumns.length}</span></div><div className="info-columns">{objectColumns.map(column => <div key={column}><span>{column}</span><small>Column</small></div>)}{objectColumns.length === 0 && <p>No column details available.</p>}</div></>}
            <div className="quick-actions"><h3>Quick actions</h3><div><button className="secondary" disabled={!['table', 'view'].includes(selectedObject.object.kind)} onClick={() => void openTable(selectedObject.database, selectedObject.object.name)}><Table2 size={18} /> Browse data</button><button className="secondary" disabled={!['table', 'view'].includes(selectedObject.object.kind)} onClick={() => addTab(`SELECT *\nFROM ${quoteIdentifier(selectedObject.database)}.${quoteIdentifier(selectedObject.object.name)}\nLIMIT 100;`)}><WandSparkles size={18} /> Generate query</button></div></div>
          </> : <div className="info-empty"><TableProperties size={38} /><h3>Your schema, at a glance</h3><p>Select a table in the explorer to see its columns and quick actions.</p></div>}
          <div className="info-workspace-actions"><button className="secondary" disabled={!connectedId || transaction} onClick={() => setAction('tools')}><Settings2 size={16} /> SQL tools</button><button className="secondary" disabled={!connectedId || transaction} onClick={() => setAction('backup')}><Archive size={16} /> Backup</button><button className="secondary" disabled={!connectedId || transaction} onClick={() => setAction('restore')}><FolderInput size={16} /> Restore</button></div>
        </aside>}
      </div>}
      {(view === 'snippets' || view === 'history') && <section className="library-page panel"><div className="section-heading"><div><h1>{view === 'snippets' ? 'Saved snippets' : 'Query history'}</h1><p>{view === 'snippets' ? 'Your favorite SQL, ready when you need it.' : 'Pick up where you left off.'}</p></div><button className="primary" onClick={() => addTab('')}><Plus size={17} /> New query</button></div><div className="library-list">{(view === 'snippets' ? savedQueries : history).map(item => <article key={item.id}><FileCode2 size={22} /><div><h3>{'name' in item ? item.name : item.when}</h3><pre>{item.sql}</pre></div><button className="secondary" onClick={() => addTab(item.sql)}>Open <ArrowRight size={14} /></button>{view === 'snippets' && <button className="icon-button" aria-label="Delete snippet" onClick={() => setSavedQueries(current => current.filter(query => query.id !== item.id))}><Trash2 size={16} /></button>}</article>)}{(view === 'snippets' ? savedQueries : history).length === 0 && <div className="connection-empty"><Braces size={38} /><h3>{view === 'snippets' ? 'Keep useful queries close' : 'A fresh start'}</h3><p>{view === 'snippets' ? 'Save a query from the editor to build your snippet library.' : 'Queries you run will appear here automatically.'}</p><button className="secondary" onClick={() => navigate('query')}>Open query editor <ArrowRight size={15} /></button></div>}</div></section>}
      {view === 'settings' && <section className="settings-page panel"><div className="section-heading"><div><h1>Settings</h1><p>Make your workspace feel like yours.</p></div></div><div className="settings-section"><h3>Appearance</h3><label>Theme<select className="theme-select" value={theme} onChange={e => setTheme(e.target.value as ThemePreference)}><option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option></select></label><p>System follows your desktop’s color preference.</p></div><div className="settings-section"><h3>SQL editor</h3><label>Font size<select value={fontSize} onChange={e => setFontSize(Number(e.target.value))}>{[12, 13, 14, 15, 16, 18].map(size => <option key={size} value={size}>{size} px</option>)}</select></label><label>Wrap long lines<input type="checkbox" checked={wordWrap} onChange={e => setWordWrap(e.target.checked)} /></label><label>Show table information<input type="checkbox" checked={showDetails} onChange={e => setShowDetails(e.target.checked)} /></label></div><div className="settings-section"><h3>About WadahDB Studio</h3><p>A better way to explore your data.</p><p>Free and open source · Apache-2.0 · MySQL & MariaDB</p><small>Connection passwords are stored only in your system keyring when you choose to save them.</small></div></section>}
    </main>
    {showShortcuts && <div className="modal-backdrop" onMouseDown={() => setShowShortcuts(false)}><section className="modal shortcuts-modal" role="dialog" aria-modal="true" aria-label="Workspace guide" onMouseDown={e => e.stopPropagation()}><header className="modal-header"><h2>Workspace guide</h2><button className="icon-button" aria-label="Close guide" onClick={() => setShowShortcuts(false)}><X size={18} /></button></header><div className="action-body"><div className="shortcut-row"><span>Run selected SQL or the current query</span><kbd>Ctrl + Enter</kbd></div><div className="shortcut-row"><span>Find in the SQL editor</span><kbd>Ctrl + F</kbd></div><div className="shortcut-row"><span>SQL completion</span><kbd>Ctrl + Space</kbd></div><p>Create a connection, open a database in Explorer, and select a table to browse its data. Double-click a non-key cell to edit it when the table has a primary key.</p><p>Use Explain to inspect a query plan. Backup, restore, import, and export are available after connecting.</p></div></section></div>}

    {action === 'backup' && activeProfile && <BackupDialog profile={activeProfile} databases={databases} onClose={() => setAction(null)} onDone={result => { setMessage(result); setAction(null) }} />}
    {action === 'restore' && activeProfile && <RestoreDialog profile={activeProfile} onClose={() => setAction(null)} onDone={result => { setMessage(result); setAction(null); api.databases(activeProfile.id).then(setDatabases).catch(cause => setError(errorMessage(cause))) }} />}
    {action === 'import' && activeProfile && <ImportDialog profile={activeProfile} databases={databases} onClose={() => setAction(null)} onDone={result => { setMessage(result); setAction(null) }} />}
    {action === 'export' && activeProfile && <ExportDialog profile={activeProfile} sql={activeTab.table ? `SELECT * FROM \`${activeTab.table.database.replaceAll('`', '``')}\`.\`${activeTab.table.name.replaceAll('`', '``')}\`` : activeTab.sql} onClose={() => setAction(null)} onDone={result => { setMessage(result); setAction(null) }} />}
    {action === 'tools' && activeProfile && <Tools databases={databases.map(item => item.name)} initialDatabase={expandedDb ?? activeProfile.defaultDatabase ?? ''} onClose={() => setAction(null)} onOpenSql={addTab} />}
  </div>
}
