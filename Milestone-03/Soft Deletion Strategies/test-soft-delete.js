
const assert = require('node:assert/strict');
const http = require('node:http');
const Module = require('node:module');

const queries = [];

const fakePool = {
  on() {},

  query(text, params = []) {
    queries.push({ text, params });

    // Simulate missing or already-deleted records.
    if (String(params[0]) === '404') {
      return Promise.resolve({ rows: [], rowCount: 0 });
    }

    // Simulate deleted-record retrieval.
    if (text.includes('IS NOT NULL')) {
      return Promise.resolve({
        rows: [{ id: 99, deleted_at: '2026-01-01T00:00:00Z' }],
        rowCount: 1,
      });
    }

    // Simulate successful soft-delete operations.
    if (text.includes('UPDATE') || text.includes('WITH deleted_')) {
      return Promise.resolve({
        rows: [{ id: 1 }],
        rowCount: 1,
      });
    }

    // Simulate successful inserts.
    if (text.includes('INSERT')) {
      return Promise.resolve({
        rows: [{ id: 1, deleted_at: null }],
        rowCount: 1,
      });
    }

    return Promise.resolve({
      rows: [{ id: 1, deleted_at: null }],
      rowCount: 1,
    });
  },
};

// Replace PostgreSQL with a mocked pool.
const originalLoad = Module._load;

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'pg') {
    return {
      Pool: function Pool() {
        return fakePool;
      },
    };
  }

  return originalLoad.call(this, request, parent, isMain);
};

let app;

try {
  app = require('./app');
} finally {
  Module._load = originalLoad;
}

// Send HTTP requests to the application.
function request(server, method, path, data) {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : '';

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: server.address().port,
        method,
        path,
        headers: body
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(body),
            }
          : {},
      },
      (res) => {
        let responseBody = '';

        res.on('data', (chunk) => {
          responseBody += chunk;
        });

        res.on('end', () => {
          try {
            resolve({
              status: res.statusCode,
              body: responseBody ? JSON.parse(responseBody) : null,
            });
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    req.on('error', reject);

    if (body) req.write(body);

    req.end();
  });
}

(async () => {
  const server = app.listen(0);

  try {
    await new Promise((resolve) => server.once('listening', resolve));

    // 1. Retrieve active users.
    let response = await request(server, 'GET', '/users');
    assert.equal(response.status, 200);
    assert.match(queries.at(-1).text, /deleted_at IS NULL/);

    // 2. Retrieve deleted users.
    response = await request(server, 'GET', '/users/admin/deleted');
    assert.equal(response.status, 200);
    assert.equal(response.body[0].id, 99);
    assert.match(queries.at(-1).text, /deleted_at IS NOT NULL/);

    // 3. Retrieve deleted accounts.
    response = await request(server, 'GET', '/accounts/admin/deleted');
    assert.equal(response.status, 200);
    assert.match(queries.at(-1).text, /deleted_at IS NOT NULL/);

    // 4. Retrieve deleted transactions.
    response = await request(server, 'GET', '/transactions/admin/deleted');
    assert.equal(response.status, 200);
    assert.match(queries.at(-1).text, /deleted_at IS NOT NULL/);

    // 5. Retrieve accounts belonging to active users.
    response = await request(server, 'GET', '/accounts/user/1');
    assert.equal(response.status, 200);
    assert.match(queries.at(-1).text, /u\.deleted_at IS NULL/);
    assert.match(queries.at(-1).text, /a\.deleted_at IS NULL/);

    // 6. Retrieve transactions belonging to active accounts and users.
    response = await request(server, 'GET', '/transactions/account/1');
    assert.equal(response.status, 200);
    assert.match(queries.at(-1).text, /t\.deleted_at IS NULL/);
    assert.match(queries.at(-1).text, /a\.deleted_at IS NULL/);
    assert.match(queries.at(-1).text, /u\.deleted_at IS NULL/);

    // 7. Create a user.
    response = await request(server, 'POST', '/users', {
      name: 'Test User',
      email: 'test@example.com',
    });
    assert.equal(response.status, 201);

    // 8. Create an account for an active user.
    response = await request(server, 'POST', '/accounts', {
      user_id: 1,
      account_type: 'Savings',
      balance: 100,
    });
    assert.equal(response.status, 201);
    assert.match(queries.at(-1).text, /users/);
    assert.match(queries.at(-1).text, /deleted_at IS NULL/);

    // 9. Create a transaction for an active account.
    response = await request(server, 'POST', '/transactions', {
      account_id: 1,
      amount: 100,
      type: 'credit',
      description: 'Test transaction',
    });
    assert.equal(response.status, 201);
    assert.match(queries.at(-1).text, /JOIN users/);
    assert.match(queries.at(-1).text, /deleted_at IS NULL/);

    // 10. Reject account creation for a missing/deleted user.
    response = await request(server, 'POST', '/accounts', {
      user_id: '404',
      account_type: 'Savings',
      balance: 100,
    });
    assert.equal(response.status, 404);

    // 11. Reject transaction creation for a missing/deleted account.
    response = await request(server, 'POST', '/transactions', {
      account_id: '404',
      amount: 100,
      type: 'credit',
    });
    assert.equal(response.status, 404);

    // 12. Soft-delete an account and its active transactions.
    response = await request(server, 'DELETE', '/accounts/7');
    assert.equal(response.status, 200);
    assert.match(queries.at(-1).text, /UPDATE accounts/);
    assert.match(queries.at(-1).text, /UPDATE transactions/);

    // 13. Soft-delete a transaction.
    response = await request(server, 'DELETE', '/transactions/8');
    assert.equal(response.status, 200);
    assert.match(queries.at(-1).text, /UPDATE transactions/);
    assert.match(queries.at(-1).text, /deleted_at IS NULL/);

    // 14. Soft-delete a user and its active related records.
    response = await request(server, 'DELETE', '/users/9');
    assert.equal(response.status, 200);
    assert.match(queries.at(-1).text, /UPDATE users/);
    assert.match(queries.at(-1).text, /UPDATE accounts/);
    assert.match(queries.at(-1).text, /UPDATE transactions/);

    // 15. Reject deletion of a missing or already-deleted user.
    response = await request(server, 'DELETE', '/users/404');
    assert.equal(response.status, 404);

    // 16. Reject deletion of a missing or already-deleted account.
    response = await request(server, 'DELETE', '/accounts/404');
    assert.equal(response.status, 404);

    // 17. Reject deletion of a missing or already-deleted transaction.
    response = await request(server, 'DELETE', '/transactions/404');
    assert.equal(response.status, 404);

    console.log('All 17 soft-delete endpoint tests passed!');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
})();
