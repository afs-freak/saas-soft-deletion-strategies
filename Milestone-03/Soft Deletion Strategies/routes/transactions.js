const express = require('express');
const router = express.Router();
const db = require('../db');

// GET all active transactions
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM transactions WHERE deleted_at IS NULL ORDER BY id'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Database retrieval error' });
  }
});

// GET active transactions for an active account and user
router.get('/account/:accountId', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT t.*
       FROM transactions AS t
       INNER JOIN accounts AS a ON a.id = t.account_id
       INNER JOIN users AS u ON u.id = a.user_id
       WHERE t.account_id = $1
         AND t.deleted_at IS NULL
         AND a.deleted_at IS NULL
         AND u.deleted_at IS NULL
       ORDER BY t.id`,
      [req.params.accountId]
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Database retrieval error' });
  }
});

// GET soft-deleted transactions.
// Add admin authentication before production use.
router.get('/admin/deleted', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM transactions WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Database retrieval error' });
  }
});

// CREATE a transaction only for an active account and user
router.post('/', async (req, res) => {
  const { account_id, amount, type, description } = req.body;

  try {
    const { rows } = await db.query(
      `INSERT INTO transactions (account_id, amount, type, description)
       SELECT a.id, $2, $3, $4
       FROM accounts AS a
       INNER JOIN users AS u ON u.id = a.user_id
       WHERE a.id = $1
         AND a.deleted_at IS NULL
         AND u.deleted_at IS NULL
       RETURNING *`,
      [account_id, amount, type, description ?? null]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Active account not found' });
    }

    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Transaction creation failed' });
  }
});

// SOFT DELETE a transaction
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE transactions
       SET deleted_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Active transaction not found' });
    }

    res.json({ message: 'Transaction soft-deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Transaction soft-delete failed' });
  }
});

module.exports = router;