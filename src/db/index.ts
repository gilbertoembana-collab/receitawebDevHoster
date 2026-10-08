import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
import dotenv from 'dotenv';
const { Pool } = pkg;
import * as schema from './schema.ts';

dotenv.config();

declare global {
  var _postgresPool: InstanceType<typeof Pool> | undefined;
}

// Helper to validate connection string URLs safely
function isValidDbUrl(str?: string): boolean {
  if (!str) return false;
  try {
    const trimmed = str.trim();
    if (!trimmed.startsWith('postgres://') && !trimmed.startsWith('postgresql://')) return false;
    const u = new URL(trimmed);
    return Boolean(u.hostname || u.pathname);
  } catch {
    return false;
  }
}

// Função de criação ou recuperação do Pool de Conexão com o PostgreSQL
export const createPool = () => {
  if (!global._postgresPool) {
    const dbUrl = process.env.DATABASE_URL?.trim();
    if (!isValidDbUrl(dbUrl)) {
      throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');
    }

    const parsedUrl = new URL(dbUrl);
    const isSsl = parsedUrl.searchParams.get('sslmode') === 'require' || parsedUrl.hostname.includes('supabase');
    global._postgresPool = new Pool({
      connectionString: dbUrl,
      max: 15,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      ssl: isSsl ? { rejectUnauthorized: false } : false,
    });

    // Prevent unhandled pool-level errors from crashing the application
    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }

  return global._postgresPool;
};

// Create a pool instance.
const pool = createPool();

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception thrown:', err);
});

// Initialize Drizzle with the pool and schema.
export const db = drizzle(pool, { schema });
