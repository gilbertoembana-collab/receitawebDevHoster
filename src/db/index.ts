import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
import dotenv from 'dotenv';
import { resolvePostgresSsl } from './postgres-ssl.js';
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
    const configuredPoolMax = process.env.DB_POOL_MAX;
    const poolMax = configuredPoolMax === undefined ? 5 : Number(configuredPoolMax);
    if (!Number.isInteger(poolMax) || poolMax < 1 || poolMax > 20) {
      throw new Error('DB_POOL_MAX must be an integer between 1 and 20.');
    }
    const { mode: sslMode, required: isSslRequired } = resolvePostgresSsl(
      parsedUrl.hostname,
      parsedUrl.searchParams.get('sslmode'),
      process.env.NODE_ENV,
    );
    parsedUrl.searchParams.set('sslmode', sslMode);
    global._postgresPool = new Pool({
      connectionString: parsedUrl.toString(),
      max: poolMax,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000,
      ssl: isSslRequired ? { rejectUnauthorized: true } : undefined,
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
