import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { normalizeSqlDump } from '../src/db/restore-sql.js';

async function withSqlFiles(contents, run) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'receita360-restore-test-'));
  const source = path.join(directory, 'source.sql');
  const destination = path.join(directory, 'normalized.sql');
  try {
    await fs.writeFile(source, contents);
    await run(source, destination);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

test('SQL normalization removes duplicate public schema creation and keeps pg_dump commands', async () => {
  await withSqlFiles(
    '-- PostgreSQL database dump\nCREATE SCHEMA public;\n\\restrict test-token\nCREATE TABLE public.sample (id text);\nCOPY public.sample (id) FROM stdin;\nCOMMIT;\n\\! data value\n\\.\n\\unrestrict test-token\n',
    async (source, destination) => {
      await normalizeSqlDump(source, destination);
      const normalized = await fs.readFile(destination, 'utf8');
      assert.match(normalized, /^-- CREATE SCHEMA public;$/m);
      assert.match(normalized, /CREATE TABLE public\.sample/);
      assert.match(normalized, /^\\restrict test-token$/m);
      assert.match(normalized, /^COMMIT;$/m);
      assert.match(normalized, /^\\! data value$/m);
    },
  );
});

test('SQL normalization rejects psql commands that could execute outside the database', async () => {
  await withSqlFiles('SELECT 1;\n\\! touch /tmp/untrusted\n', async (source, destination) => {
    await assert.rejects(normalizeSqlDump(source, destination), /comando psql não permitido/);
  });
});

test('SQL normalization rejects transaction controls that could commit a partial restore', async () => {
  await withSqlFiles('CREATE TABLE public.sample (id integer);\nCOMMIT;\n', async (source, destination) => {
    await assert.rejects(normalizeSqlDump(source, destination), /comandos de transação incompatíveis/);
  });
});

test('SQL normalization rejects empty and binary uploads', async () => {
  await withSqlFiles('-- comments only\n', async (source, destination) => {
    await assert.rejects(normalizeSqlDump(source, destination), /não contém comandos SQL/);
  });
  await withSqlFiles('SELECT 1;\n\0', async (source, destination) => {
    await assert.rejects(normalizeSqlDump(source, destination), /dump SQL de texto válido/);
  });
});
