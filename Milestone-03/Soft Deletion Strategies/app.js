const express = require('express');
require('dotenv').config();

const usersRoute = require('./routes/users');
const accountsRoute = require('./routes/accounts');
const transactionsRoute = require('./routes/transactions');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware configuration
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes
app.use('/users', usersRoute);
app.use('/accounts', accountsRoute);
app.use('/transactions', transactionsRoute);

// Health check
app.get('/', (req, res) => {
  res.json({ message: 'LedgerApp API is running' });
});

// Start only when executed directly, not when imported by tests.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;