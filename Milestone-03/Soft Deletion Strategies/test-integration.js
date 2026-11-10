require('dotenv').config({ path: '.env.local' });

const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

let server;
let transactionStarted = false;

async function request(base, method, route, body, expectedStatus) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const data = await response.json();

  assert.equal(
    response.status,
    expectedStatus,
    `${method} ${route}: expected ${expectedStatus}, received ${response.status}. Response: ${JSON.stringify(data)}`
  );

  return data;
}

function containsId(rows, id) {
  return rows.some(row => row.id === id);
}

async function run() {
  try {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is missing from .env.local');
    }

    await client.connect();

    // Keep all temporary tables and API queries in one transaction.
    await client.query('BEGIN');
    transactionStarted = true;

    await client.query(`
      CREATE TEMP TABLE users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMPTZ DEFAULT NULL
      );

      CREATE TEMP TABLE accounts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        account_type VARCHAR(50) NOT NULL,
        balance DECIMAL(15, 2) DEFAULT 0.00,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMPTZ DEFAULT NULL
      );

      CREATE TEMP TABLE transactions (
        id SERIAL PRIMARY KEY,
        account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
        amount DECIMAL(15, 2) NOT NULL,
        type VARCHAR(50) NOT NULL,
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMPTZ DEFAULT NULL
      );

      CREATE INDEX idx_users_active
        ON users (id) WHERE deleted_at IS NULL;

      CREATE INDEX idx_accounts_active_by_user
        ON accounts (user_id, id) WHERE deleted_at IS NULL;

      CREATE INDEX idx_transactions_active_by_account
        ON transactions (account_id, id) WHERE deleted_at IS NULL;
    `);

    // Inject the real PostgreSQL client into the existing route modules.
    const originalLoad = Module._load;
    const testDb = {
      query: (sql, params) => client.query(sql, params)
    };

    let app;

    try {
      Module._load = function (requestName, parent, isMain) {
        if (
          requestName === '../db' &&
          parent &&
          parent.filename.includes(`${path.sep}routes${path.sep}`)
        ) {
          return testDb;
        }

        return originalLoad.call(this, requestName, parent, isMain);
      };

      app = require('./app');
    } finally {
      Module._load = originalLoad;
    }

    server = app.listen(0);
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });

    const base = `http://127.0.0.1:${server.address().port}`;

    // 1. Create a user, account, and transaction.
    const user1 = await request(base, 'POST', '/users', {
      name: 'Integration User One',
      email: 'integration-one@example.test'
    }, 201);

    const account1 = await request(base, 'POST', '/accounts', {
      user_id: user1.id,
      account_type: 'Savings',
      balance: 5000
    }, 201);

    const transaction1 = await request(base, 'POST', '/transactions', {
      account_id: account1.id,
      amount: 250,
      type: 'debit',
      description: 'Individual deletion test'
    }, 201);

    assert.ok(containsId(
      await request(base, 'GET', '/users', undefined, 200),
      user1.id
    ));

    assert.ok(containsId(
      await request(base, 'GET', `/accounts/user/${user1.id}`, undefined, 200),
      account1.id
    ));

    assert.ok(containsId(
      await request(base, 'GET', `/transactions/account/${account1.id}`, undefined, 200),
      transaction1.id
    ));

    console.log('PASS: Create and retrieve active records');

    // 2. Soft-delete an individual transaction.
    await request(base, 'DELETE', `/transactions/${transaction1.id}`, undefined, 200);

    assert.equal(
      containsId(await request(base, 'GET', '/transactions', undefined, 200), transaction1.id),
      false
    );

    assert.ok(containsId(
      await request(base, 'GET', '/transactions/admin/deleted', undefined, 200),
      transaction1.id
    ));

    console.log('PASS: Transaction soft deletion and admin visibility');

    // 3. Soft-delete an account and its active transaction.
    const account2 = await request(base, 'POST', '/accounts', {
      user_id: user1.id,
      account_type: 'Current',
      balance: 3000
    }, 201);

    const transaction2 = await request(base, 'POST', '/transactions', {
      account_id: account2.id,
      amount: 100,
      type: 'credit',
      description: 'Account cascade test'
    }, 201);

    await request(base, 'DELETE', `/accounts/${account2.id}`, undefined, 200);

    assert.equal(
      containsId(await request(base, 'GET', '/accounts', undefined, 200), account2.id),
      false
    );

    assert.equal(
      containsId(await request(base, 'GET', '/transactions', undefined, 200), transaction2.id),
      false
    );

    assert.ok(containsId(
      await request(base, 'GET', '/accounts/admin/deleted', undefined, 200),
      account2.id
    ));

    assert.ok(containsId(
      await request(base, 'GET', '/transactions/admin/deleted', undefined, 200),
      transaction2.id
    ));

    console.log('PASS: Account cascade soft deletion');

    // 4. Soft-delete a user and all its active related records.
    const user2 = await request(base, 'POST', '/users', {
      name: 'Integration User Two',
      email: 'integration-two@example.test'
    }, 201);

    const account3 = await request(base, 'POST', '/accounts', {
      user_id: user2.id,
      account_type: 'Savings',
      balance: 7000
    }, 201);

    const transaction3 = await request(base, 'POST', '/transactions', {
      account_id: account3.id,
      amount: 500,
      type: 'debit',
      description: 'User cascade test'
    }, 201);

    await request(base, 'DELETE', `/users/${user2.id}`, undefined, 200);

    assert.equal(
      containsId(await request(base, 'GET', '/users', undefined, 200), user2.id),
      false
    );

    assert.equal(
      containsId(await request(base, 'GET', `/accounts/user/${user2.id}`, undefined, 200), account3.id),
      false
    );

    assert.equal(
      containsId(await request(base, 'GET', `/transactions/account/${account3.id}`, undefined, 200), transaction3.id),
      false
    );

    assert.ok(containsId(
      await request(base, 'GET', '/users/admin/deleted', undefined, 200),
      user2.id
    ));

    assert.ok(containsId(
      await request(base, 'GET', '/accounts/admin/deleted', undefined, 200),
      account3.id
    ));

    assert.ok(containsId(
      await request(base, 'GET', '/transactions/admin/deleted', undefined, 200),
      transaction3.id
    ));

    console.log('PASS: User cascade soft deletion');

    // 5. Verify repeated deletion returns 404.
    await request(base, 'DELETE', `/users/${user2.id}`, undefined, 404);

    console.log('PASS: Repeated deletion returns 404');
    console.log('\nAll real PostgreSQL integration tests passed.');
  } finally {
    if (server && server.listening) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }

    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
        console.log('Temporary test data rolled back.');
      } catch (error) {
        console.error('Rollback warning:', error.message);
      }
    }

    await client.end();
  }
}

run().catch(error => {
  console.error('\nIntegration test failed:', error);
  process.exitCode = 1;
});
