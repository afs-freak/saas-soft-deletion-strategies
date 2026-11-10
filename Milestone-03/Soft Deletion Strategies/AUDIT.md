# Soft Deletion Audit

## 1. Scope and Findings

This audit examines the original hard-delete risks and verifies the soft-deletion implementation for users, accounts, and transactions in LedgerApp.

The implementation uses a `deleted_at` timestamp instead of physically removing records. Normal API queries exclude deleted records, while separate administrative endpoints expose deleted records for audit purposes.

## 2. Source-Code Verification and Line References

The following references were checked against the current source files.

| File | Lines | Finding |
|---|---:|---|
| routes/users.js | 9, 21 | Normal user queries filter active users |
| routes/users.js | 53-56 | Retrieves soft-deleted users |
| routes/users.js | 65-89 | Soft-deletes a user and active related accounts and transactions |
| routes/accounts.js | 9, 21-27 | Filters active accounts and active parent users |
| routes/accounts.js | 39-42 | Retrieves soft-deleted accounts |
| routes/accounts.js | 75-92 | Soft-deletes an account and its active transactions |
| routes/transactions.js | 9, 21-29 | Filters active transactions and active parent records |
| routes/transactions.js | 41-44 | Retrieves soft-deleted transactions |
| routes/transactions.js | 80-87 | Soft-deletes a transaction |
| schema.sql | 7-13, 21-28, 36-44 | Defines tables and `deleted_at` columns |
| schema.sql | 15-17, 30-32, 46-48 | Defines partial indexes for active records |
| schema.sql | 23, 38 | Uses `ON DELETE RESTRICT` foreign keys |

## 3. Deleted-Transaction Audit Query

The following query explicitly filters for deleted transactions and retrieves their deletion timestamps.

```sql
SELECT
    id,
    account_id,
    amount,
    type,
    description,
    created_at,
    deleted_at
FROM transactions
WHERE deleted_at IS NOT NULL
ORDER BY deleted_at DESC;
```

The `deleted_at IS NOT NULL` condition ensures that active transactions are excluded from this audit result.

## 4. Exclusions and Limitations

The following areas are outside the scope of this implementation audit:

- Authentication and role-based authorization for administrative endpoints were not implemented or verified. The `/admin/deleted` routes are demonstration endpoints and must be protected before production use.
- Permanent deletion and automated data-retention or purge jobs were not implemented or tested.
- Backup restoration and disaster-recovery procedures were not tested.
- Performance thresholds are engineering review estimates, not measured database benchmarks.
- Automated endpoint tests use a mocked PostgreSQL pool. They verify endpoint behaviour but do not establish real-database integration coverage.
- The audit does not claim compliance with any specific financial, privacy, or regulatory standard.

## 5. Verification Evidence

- Source-code line references were checked against the route and schema files.
- The automated mocked endpoint test suite completed with 17 passing tests.
- The schema was successfully applied to the Neon PostgreSQL development database.
- The API was deployed on Render and its base endpoint returned a successful response.
- Full live-database integration testing of all deletion and retrieval workflows remains a recommended follow-up.

## 6. Conclusion

The implementation demonstrates timestamp-based soft deletion, active-record filtering, parent-child deletion handling, administrative retrieval of deleted records, partial indexes, and foreign-key restrictions.

These controls reduce the risk of accidental permanent data loss while preserving historical records. Authentication, integration testing, retention policies, and production monitoring remain necessary before production use.
