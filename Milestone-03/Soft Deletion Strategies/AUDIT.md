$audit = @'
# Soft Deletion Audit

## 1. Scope and findings

This audit examines the original hard-delete behaviour and the risks of permanently deleting financial records.

The original DELETE operations on users, accounts and transactions could permanently remove records. This created risks of losing financial history and breaking relationships between related records.

The refactor replaces physical deletion with a `deleted_at` timestamp. Records are retained and excluded from normal API responses.

## 2. Source-code verification and line references

The following references identify the implemented controls:

| File | Lines | Finding |
|---|---:|---|
| routes/users.js | 9, 21 | Normal user queries exclude deleted users |
| routes/users.js | 54-56 | Deleted users can be audited |
| routes/users.js | 69-85 | User, account and transaction soft deletion |
| routes/accounts.js | 9, 25-26 | Active account filtering |
| routes/accounts.js | 40-42 | Deleted account audit route |
| routes/accounts.js | 79-88 | Account and transaction soft deletion |
| routes/transactions.js | 9, 22-28 | Active transaction and parent filtering |
| routes/transactions.js | 42-44 | Deleted transaction audit route |
| routes/transactions.js | 83-85 | Transaction soft deletion |
| schema.sql | 12, 27, 43 | deleted_at columns |
| schema.sql | 15-17, 30-32, 46-48 | Partial indexes |
| schema.sql | 23, 38 | Foreign-key deletion restrictions |

## 3. Deleted transaction audit query

The following query explicitly retrieves deleted transactions:

```sql
SELECT id, account_id, amount, type, description, created_at, deleted_at
FROM transactions
WHERE deleted_at IS NOT NULL
ORDER BY deleted_at DESC;