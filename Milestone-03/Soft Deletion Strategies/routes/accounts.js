const express = require('express');
const router = express.Router();
const db = require('../db');

// GET all active accounts
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM accounts WHERE deleted_at IS NULL ORDER BY id'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Database execution error' });
  }
});

// GET active accounts belonging to an active user
router.get('/user/:userId', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT a.*
       FROM accounts AS a
       INNER JOIN users AS u ON u.id = a.user_id
       WHERE a.user_id = $1
         AND a.deleted_at IS NULL
         AND u.deleted_at IS NULL
       ORDER BY a.id`,
      [req.params.userId]
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Database retrieval error' });
  }
});

// GET soft-deleted accounts.
// Add admin authentication before production use.
router.get('/admin/deleted', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM accounts WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Database retrieval error' });
  }
});

// CREATE an account only for an active user
router.post('/', async (req, res) => {
  const { user_id, account_type, balance } = req.body;

  try {
    const { rows } = await db.query(
      `INSERT INTO accounts (user_id, account_type, balance)
       SELECT id, $2, COALESCE($3, 0)
       FROM users
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [user_id, account_type, balance ?? null]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Active user not found' });
    }

    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Account creation failed' });
  }
});

// SOFT DELETE an account and its active transactions
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      `WITH deleted_account AS (
         UPDATE accounts
         SET deleted_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND deleted_at IS NULL
         RETURNING id
       ),
       deleted_transactions AS (
         UPDATE transactions AS t
         SET deleted_at = CURRENT_TIMESTAMP
         FROM deleted_account AS a
         WHERE t.account_id = a.id AND t.deleted_at IS NULL
         RETURNING t.id
       )
       SELECT id FROM deleted_account`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Active account not found' });
    }

    res.json({
      message: 'Account and active related transactions soft-deleted successfully'
    });
  } catch (err) {
    res.status(500).json({ error: 'Account soft-delete failed' });
  }
});

module.exports = router;