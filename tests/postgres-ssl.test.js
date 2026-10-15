import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePostgresSsl } from '../src/db/postgres-ssl.js';

test('local development database disables SSL even when DATABASE_URL requires it', () => {
  assert.deepEqual(
    resolvePostgresSsl('localhost', 'require', 'development'),
    { mode: 'disable', required: false },
  );
});

test('remote production database keeps SSL enabled', () => {
  assert.deepEqual(
    resolvePostgresSsl('db.example.com', null, 'production'),
    { mode: 'require', required: true },
  );
});

test('explicit SSL mode remains configured for non-local databases', () => {
  assert.deepEqual(
    resolvePostgresSsl('db.example.com', 'verify-full', 'development'),
    { mode: 'verify-full', required: false },
  );
});
