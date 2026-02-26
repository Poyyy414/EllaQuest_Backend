const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ellaquest',
  password: 'your_postgres_password',
  port: 5432
});

(async () => {
  try {
    const res = await pool.query('SELECT * FROM users LIMIT 1');
    console.log('Connected! Rows:', res.rows);
  } catch (err) {
    console.error('DB Error:', err.message);
  } finally {
    pool.end();
  }
})();