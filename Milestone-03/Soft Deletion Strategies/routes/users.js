const express = require('express');
const router = express.Router();
const db = require('../db');

// GET all active users
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM users WHERE deleted_at IS NULL ORDER BY id'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Database execution error' });
  }
});

// GET one active user
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL',
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Database retrieval error' });
  }
});

// CREATE a user
router.post('/', async (req, res) => {
  const { name, email } = req.body;

  try {
    const { rows } = await db.query(
      'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *',
      [name, email]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'User creation failed' });
  }
});

// GET soft-deleted users.
// This endpoint requires admin authentication before production use.
router.get('/admin/deleted', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM users WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Database retrieval error' });
  }
});

// SOFT DELETE a user and their active accounts and transactions.
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      `WITH deleted_user AS (
         UPDATE users
         SET deleted_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND deleted_at IS NULL
         RETURNING id
       ),
       deleted_accounts AS (
         UPDATE accounts AS a
         SET deleted_at = CURRENT_TIMESTAMP
         FROM deleted_user AS u
         WHERE a.user_id = u.id AND a.deleted_at IS NULL
         RETURNING a.id
       ),
       deleted_transactions AS (
         UPDATE transactions AS t
         SET deleted_at = CURRENT_TIMESTAMP
         FROM deleted_accounts AS a
         WHERE t.account_id = a.id AND t.deleted_at IS NULL
         RETURNING t.id
       )
       SELECT id FROM deleted_user`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Active user not found' });
    }

    res.json({
      message: 'User and active related records soft-deleted successfully'
    });
  } catch (err) {
    res.status(500).json({ error: 'User soft-delete failed' });
  }
});

module.exports = router;