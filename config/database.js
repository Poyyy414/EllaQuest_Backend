const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000
});

pool.connect()
    .then(client => {
        console.log('✅ Connected to PostgreSQL');
        client.release();
    })
    .catch(err => console.error('❌ PostgreSQL connection error', err.stack));

module.exports = pool;