# LedgerApp – Financial Record Management API

LedgerApp is a REST API built with Node.js, Express, and PostgreSQL for managing users, financial accounts, and transactions.

This project implements **soft deletion** to preserve financial records, maintain parent-child relationships, and prevent accidental permanent data loss.

## 1. Features

- RESTful APIs for users, accounts, and transactions.
- PostgreSQL database integration using `pg`.
- Timestamp-based soft deletion using `deleted_at`.
- Active-record filtering in normal API queries.
- Separate endpoints for retrieving soft-deleted records.
- Parent-child deletion handling.
- Validation to prevent creating records under deleted parents.
- Partial indexes for active-record lookups.
- Automated endpoint tests using a mocked PostgreSQL pool.

## 2. Prerequisites

- Node.js v18 or later.
- PostgreSQL v14 or later.
- npm.

## 3. Installation and Setup

### Step 1: Install dependencies

```bash
npm install
```

### Step 2: Create the database

```sql
CREATE DATABASE ledgerapp;
```

### Step 3: Initialize the schema

```bash
psql -d ledgerapp -f schema.sql
```

**Important:** The supplied `schema.sql` drops and recreates the project tables. Use it only with a fresh or disposable development database. Never run it against a database containing data that must be preserved.

### Step 4: Configure environment variables

Create a `.env` file in the project root using `.env.example` as a template.

Example:

```env
DB_URL=postgresql://postgres:password@localhost:5432/ledgerapp
PORT=3000
```

Replace the username and password with your local PostgreSQL credentials.

### Step 5: Start the application

```bash
npm start
```

The API runs at:

```text
http://localhost:3000
```

## 4. API Endpoints

### Users

| Method | Endpoint | Description |
|---|---|---|
| GET | `/users` | List active users |
| GET | `/users/:id` | Retrieve one active user |
| POST | `/users` | Create a user |
| DELETE | `/users/:id` | Soft-delete a user and active related records |
| GET | `/users/admin/deleted` | List soft-deleted users |

Example user creation:

```json
{
  "name": "John Doe",
  "email": "john@example.com"
}
```

### Accounts

| Method | Endpoint | Description |
|---|---|---|
| GET | `/accounts` | List active accounts |
| GET | `/accounts/user/:userId` | List accounts belonging to an active user |
| POST | `/accounts` | Create an account for an active user |
| DELETE | `/accounts/:id` | Soft-delete an account and its active transactions |
| GET | `/accounts/admin/deleted` | List soft-deleted accounts |

Example account creation:

```json
{
  "user_id": 1,
  "account_type": "Savings",
  "balance": 1000
}
```

### Transactions

| Method | Endpoint | Description |
|---|---|---|
| GET | `/transactions` | List active transactions |
| GET | `/transactions/account/:accountId` | List transactions belonging to an active account and user |
| POST | `/transactions` | Create a transaction for an active account |
| DELETE | `/transactions/:id` | Soft-delete a transaction |
| GET | `/transactions/admin/deleted` | List soft-deleted transactions |

Example transaction creation:

```json
{
  "account_id": 1,
  "amount": 500,
  "type": "credit",
  "description": "Monthly deposit"
}
```

### Common response behaviour

- Successful creation returns HTTP `201`.
- Missing or already soft-deleted records return HTTP `404` for retrieval or deletion operations.
- Database operation failures return HTTP `500`.

## 5. Soft Deletion Strategy

Instead of physically deleting a database row, LedgerApp updates its `deleted_at` column.

Example:

```sql
UPDATE users
SET deleted_at = CURRENT_TIMESTAMP
WHERE id = 1 AND deleted_at IS NULL;
```

- `deleted_at IS NULL`: The record is active.
- `deleted_at IS NOT NULL`: The record has been soft-deleted.

### Parent-child deletion rules

- Deleting a user soft-deletes their active accounts and transactions.
- Deleting an account soft-deletes its active transactions.
- Deleting a transaction affects only that transaction.
- New accounts cannot be created for deleted users.
- New transactions cannot be created for deleted accounts or deleted users.
- Repeated deletion of an already deleted record returns HTTP `404`.

The database uses `ON DELETE RESTRICT` on parent-child foreign keys to help prevent accidental physical deletion.

## 6. Database Indexing

The implementation introduces partial indexes for active-record lookups:

| Index | Indexed columns | Condition |
|---|---|---|
| `idx_users_active` | `id` | `deleted_at IS NULL` |
| `idx_accounts_active_by_user` | `user_id, id` | `deleted_at IS NULL` |
| `idx_transactions_active_by_account` | `account_id, id` | `deleted_at IS NULL` |

These indexes exclude soft-deleted rows and can reduce index size and improve relevant active-record queries.

PostgreSQL chooses whether to use an index based on its query planner and available statistics.

## 7. Testing

Run the automated endpoint tests:

```bash
npm test
```

The test suite uses a mocked PostgreSQL pool to verify:

- Active and deleted record retrieval.
- Soft deletion of users, accounts, and transactions.
- Parent-child deletion behaviour.
- Active parent validation during record creation.
- Handling of missing or already-deleted records.
- HTTP response behaviour.

Mocked tests do not replace integration testing against a real PostgreSQL database.

## 8. Security and Production Considerations

- The `/admin/deleted` endpoints are demonstration endpoints and currently do not implement authentication or role-based authorization.
- Administrative routes must be protected before production deployment.
- Keep `.env` and database credentials out of version control.
- Soft deletion is not a substitute for immutable audit logging.
- A separate retention and permanent-purge policy may be necessary for applicable privacy and legal requirements.
- Production deployments should include appropriate database backups and monitoring.

## 9. Project Structure

```text
LedgerApp/
├── app.js
├── db.js
├── schema.sql
├── package.json
├── package-lock.json
├── .env.example
├── .gitignore
├── AUDIT.md
├── TRADEOFFS.md
├── test-soft-delete.js
└── routes/
    ├── users.js
    ├── accounts.js
    └── transactions.js
```

## 10. Technology Stack

- **Node.js** – JavaScript runtime.
- **Express.js** – REST API framework.
- **PostgreSQL** – Relational database.
- **node-postgres (`pg`)** – Database connectivity.
- **dotenv** – Environment variable management.

## 11. Conclusion

LedgerApp demonstrates how soft deletion can improve data retention in a financial application.

By combining timestamp-based deletion, active-record filtering, partial indexes, parent-child deletion rules, and automated endpoint tests, the implementation reduces the risk of accidental permanent data loss while documenting important security and operational limitations.
## Live Deployment

The LedgerApp API is deployed on Render.

**Live URL:** https://soft-deletion-strategies.onrender.com

