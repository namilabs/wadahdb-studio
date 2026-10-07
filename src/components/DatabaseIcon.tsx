import { Database, Feather, Fish, Layers3, Leaf, Search, Server } from 'lucide-react'

export const databaseTypes = [
  { id: 'postgres', name: 'PostgreSQL', port: 5432, available: false },
  { id: 'mysql', name: 'MySQL', port: 3306, available: true },
  { id: 'mariadb', name: 'MariaDB', port: 3306, available: true },
  { id: 'sqlite', name: 'SQLite', port: 0, available: false },
  { id: 'sqlserver', name: 'SQL Server', port: 1433, available: false },
  { id: 'redis', name: 'Redis', port: 6379, available: false },
  { id: 'mongodb', name: 'MongoDB', port: 27017, available: false },
  { id: 'elasticsearch', name: 'Elastic', port: 9200, available: false },
]

export default function DatabaseIcon({ engine, size = 34 }: { engine: string; size?: number }) {
  const Icon = engine === 'mysql' || engine === 'mariadb' ? Fish
    : engine === 'sqlite' ? Feather : engine === 'redis' ? Layers3
      : engine === 'mongodb' ? Leaf : engine === 'elasticsearch' ? Search
        : engine === 'sqlserver' ? Server : Database
  return <span className={`database-icon engine-${engine}`} aria-hidden="true"><Icon size={size} strokeWidth={engine === 'redis' ? 2.8 : 1.7} /></span>
}
