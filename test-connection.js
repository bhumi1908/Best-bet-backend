/**
 * Simple script to test PostgreSQL connection
 * Run: node test-connection.js
 */

require('dotenv').config();
const { Pool } = require('pg');

// Construct DATABASE_URL if not set
let connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || '5432';
  const user = process.env.DB_USER || 'postgres';
  const password = process.env.DB_PASSWORD || '';
  const database = process.env.DB_NAME || 'best_bet_db';
  
  const encodedPassword = encodeURIComponent(password);
  connectionString = `postgresql://${user}:${encodedPassword}@${host}:${port}/${database}?schema=public`;
}

console.log('🔌 Testing PostgreSQL connection...');
console.log('Host:', process.env.DB_HOST || 'localhost');
console.log('Port:', process.env.DB_PORT || '5432');
console.log('User:', process.env.DB_USER || 'postgres');
console.log('Database:', process.env.DB_NAME || 'best_bet_db');
console.log('Password set:', !!process.env.DB_PASSWORD);
console.log('');

const pool = new Pool({
  connectionString,
  connectionTimeoutMillis: 5000,
});

pool.connect()
  .then((client) => {
    console.log('✅ Connection successful!');
    return client.query('SELECT NOW() as server_time, version() as pg_version')
      .then((res) => {
        console.log('📅 Server time:', res.rows[0].server_time);
        console.log('🐘 PostgreSQL version:', res.rows[0].pg_version.split(',')[0]);
        client.release();
        process.exit(0);
      });
  })
  .catch((err) => {
    console.error('❌ Connection failed!');
    console.error('Error code:', err.code);
    console.error('Error message:', err.message);
    console.error('');
    
    if (err.code === 'ECONNREFUSED') {
      console.error('🔧 PostgreSQL is not running or not accessible at the specified host/port.');
      console.error('   - Check if PostgreSQL service is running');
      console.error('   - Verify DB_HOST and DB_PORT in .env file');
    } else if (err.code === '3D000') {
      console.error('🔧 Database does not exist!');
      console.error('   - Create the database in pgAdmin first');
    } else if (err.code === '28P01') {
      console.error('🔧 Authentication failed!');
      console.error('   - Check your DB_PASSWORD in .env file');
    }
    
    process.exit(1);
  });

