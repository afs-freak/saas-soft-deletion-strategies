# Soft Deletion – Pre-Refactor Audit

## 1. Purpose

This audit examines the original hard-delete operations in LedgerApp, identifies their data-loss risks, and documents the improvements introduced through soft deletion.

The objective is to preserve financial records while preventing deleted users, accounts, and transactions from appearing in normal application queries.

## 2. Original Hard-Delete Operations

The original implementation permanently deleted database records through the following SQL statements.

### A. Users

- **File:** `routes/users.js`
- **Original SQL:**
  ```sql
  DELETE FROM users WHERE id = $1;
  ```
- **Risk:** Permanently removes user information and ownership context. Depending on foreign-key cascade behaviour, associated accounts and transactions may also be deleted.

### B. Accounts

- **File:** `routes/accounts.js`
- **Original SQL:**
  ```sql
  DELETE FROM accounts WHERE id = $1;
  ```
- **Risk:** Permanently removes account information and can affect access to historical financial records.

### C. Transactions

- **File:** `routes/transactions.js`
- **Original SQL:**
  ```sql
  DELETE FROM transactions WHERE id = $1;
  ```
- **Risk:** Permanently removes financial transaction history, making historical reviews, disputes, and reporting difficult.

## 3. Changes Introduced

The original hard-delete operations have been replaced with timestamp-based soft deletion.

- Added nullable `deleted_at` columns to all three tables.
- Records are marked deleted using `deleted_at = CURRENT_TIMESTAMP`.
- Normal retrieval endpoints return only records where `deleted_at IS NULL`.
- Separate `/admin/deleted` endpoints retrieve deleted records.
- Deleting a user also soft-deletes their active accounts and transactions.
- Deleting an account also soft-deletes its active transactions.
- New accounts cannot be created for deleted users.
- New transactions cannot be created for deleted accounts or deleted users.
- Foreign keys use `ON DELETE RESTRICT` to prevent accidental physical deletion of parent records.

## 4. Data Protection Comparison

| Area | Original behaviour | Updated behaviour |
|---|---|---|
| User deletion | Permanent deletion | Timestamp-based deletion |
| Account deletion | Permanent deletion | Timestamp-based deletion |
| Transaction deletion | Permanent deletion | Timestamp-based deletion |
| Related records | Could be lost through cascading | Soft-deleted together |
| Active retrieval | No deletion filter | Excludes deleted records |
| Parent validation | Not consistently enforced | Checks active parent records |
| Physical parent deletion | Could trigger cascading | Restricted by foreign keys |

## 5. Database Indexing

Partial indexes are introduced to improve retrieval of active records:

- `idx_users_active` on active user IDs.
- `idx_accounts_active_by_user` on active accounts using `(user_id, id)`.
- `idx_transactions_active_by_account` on active transactions using `(account_id, id)`.

These indexes support the application's active-record queries and parent-child lookups.

## 6. Remaining Risks and Limitations

1. **Admin authorization:** The `/admin/deleted` endpoints are demonstration endpoints. They currently lack authentication and role-based authorization. They must be protected before production use.
2. **Permanent erasure:** Soft deletion does not physically erase data. A separate authorized retention and purge process is necessary where permanent erasure is legally required.
3. **Audit history:** The `deleted_at` timestamp records when deletion occurred, but not who performed it. It is not a complete immutable audit log.
4. **Database setup:** The supplied `schema.sql` drops and recreates the development tables. Run it only against a fresh or disposable development database. Never run it against a database containing data that must be preserved.
5. **Concurrency:** Production deployments should use suitable transaction and concurrency controls for complex deletion, restoration, and retention workflows.
6. **Restoration:** Restoring a parent record requires careful handling of its related records. The current implementation does not provide restoration endpoints.

## 7. Verification

The automated tests are intended to cover:

- Active and deleted record retrieval.
- Soft deletion of users, accounts, and transactions.
- Related-record deletion.
- Validation of active parent records during creation.
- Handling of missing or already-deleted records.

The automated tests use a mocked PostgreSQL pool. Real PostgreSQL integration testing is still required before production deployment.

## 8. Conclusion

Replacing hard deletion with soft deletion improves data retention and protects financial history from accidental removal.

The implementation introduces timestamp-based deletion, active-record filtering, parent-child deletion handling, and safer foreign-key restrictions. These changes provide a stronger foundation for managing financial records while documenting the remaining security and operational limitations.