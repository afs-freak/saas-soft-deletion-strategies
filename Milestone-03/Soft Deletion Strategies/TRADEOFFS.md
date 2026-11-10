# Soft Deletion Trade-offs and Analysis

## 1. Storage and Performance Impact

### 1.1 How does table size change as soft-deleted records accumulate?

Soft deletion updates a record instead of physically removing it. As a result, deleted rows remain in the database.

For example, if LedgerApp creates 10,000 transactions per month and 1,000 of those transactions are soft-deleted, all 10,000 rows remain stored.

After one year:

- Total records: 120,000
- Active records: 108,000
- Soft-deleted records: 12,000

This increases storage requirements over time. Database maintenance, backups, and queries may also become more expensive as the dataset grows.

### 1.2 What performance problem do partial indexes solve?

A normal index can include both active and deleted records. A partial index stores entries only for rows matching a specified condition.

Example:

```sql
CREATE INDEX idx_transactions_active_by_account
ON transactions (account_id, id)
WHERE deleted_at IS NULL;
```

This index supports queries that retrieve active transactions for a particular account.

Benefits:

- Reduces index size by excluding deleted records.
- Supports active-record filtering and account lookups.
- Reduces unnecessary index entries.
- Can improve query performance when PostgreSQL selects the partial index.

PostgreSQL does not always use an index. Its query planner considers table size, statistics, selectivity, and estimated execution cost.

### 1.3 At what data volume does performance become a concern?

There is no fixed row-count threshold.

Performance depends on:

- Total number of records.
- Percentage of soft-deleted records.
- Query frequency and complexity.
- Available memory and disk performance.
- Index design and database statistics.

For example, a table containing 1,000,000 rows with only 100,000 active records may require more storage and maintenance than a smaller table.

Partial indexes help reduce index overhead, but query plans should be checked using `EXPLAIN ANALYZE` with representative data.

## 2. Design Reasoning

### 2.1 When Soft Delete Is the Right Choice

**Financial transactions**

LedgerApp manages financial records. Retaining deleted transaction records helps with historical reporting, dispute investigation, and authorized reviews.

**User accounts**

Soft deletion allows an application to retain user ownership information and related financial history. It also provides a foundation for controlled account recovery.

**Accounts**

Keeping deleted accounts preserves their relationship with historical transactions and avoids accidental loss of financial context.

### 2.2 When Hard Delete Is Still Appropriate

**Temporary authentication data**

Expired OTPs, temporary verification codes, and obsolete session records may be permanently deleted according to the application's security and retention policies.

**Privacy and data-erasure requirements**

When permanent erasure is legally required and no valid retention obligation applies, an authorized deletion or anonymization process may be necessary.

Soft deletion must not be treated as a replacement for privacy compliance.

## 3. Compliance and Audit Scenarios

### Scenario

A regulatory body requests transaction history for a particular user over the previous three years. The user had previously attempted to delete some transactions.

### Resolution

Because LedgerApp uses soft deletion, deleted transactions remain stored with their `deleted_at` timestamps.

An authorized database query can retrieve both active and deleted transactions:

```sql
SELECT t.*
FROM transactions AS t
INNER JOIN accounts AS a ON a.id = t.account_id
WHERE a.user_id = $1
ORDER BY t.created_at;
```

This query does not filter out soft-deleted records.

However, soft deletion alone does not guarantee that records are unaltered or provide a complete audit trail. A production financial system should also implement appropriate access controls, immutable audit logging, backup policies, and retention procedures.

## 4. Limitations of the Current Implementation

1. **Storage growth:** Deleted records remain in the database and increase storage usage.
2. **Admin security:** Deleted-record endpoints require authentication and role-based authorization before production use.
3. **Audit accountability:** The current `deleted_at` field records deletion time but not the identity of the person performing the deletion.
4. **Restoration:** Restoration requires additional logic to handle related records safely.
5. **Permanent erasure:** A separate authorized purge or anonymization process may be required by applicable retention and privacy rules.
6. **Index maintenance:** Partial indexes reduce unnecessary entries but still require maintenance as active records change.

## 5. Conclusion

Soft deletion is suitable for LedgerApp because financial records often need to remain available for historical reference and authorized investigation.

It provides better protection against accidental data loss, preserves parent-child relationships, and allows normal application queries to exclude deleted records.

However, it introduces storage overhead and requires additional security, audit, retention, and maintenance policies. Partial indexes help optimize active-record queries, while hard deletion remains appropriate for data that is no longer required and is eligible for permanent removal.