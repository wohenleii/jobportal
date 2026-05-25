/**
 * Database setup script — runs schema.sql and seed.sql
 * Usage: node backend/scripts/setup-db.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../backend/.env') });
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function setup() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'defaultdb',
    ssl: { rejectUnauthorized: false },
    multipleStatements: true,
  });

  console.log('✅ Connected to MySQL');

  const schemaPath = path.join(__dirname, '../../database/schema.sql');
  const seedPath = path.join(__dirname, '../../database/seed.sql');

  console.log('📦 Running schema.sql...');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  await conn.query(schema);
  console.log('✅ Schema applied');

  console.log('🌱 Running seed.sql...');
  const seed = fs.readFileSync(seedPath, 'utf8');
  await conn.query(seed);
  console.log('✅ Seed data inserted');

  await conn.end();
  console.log('\n🎉 Database setup complete!');
  console.log('   Admin login:    admin@jobportal.com / admin123');
  console.log('   Employer login: employer@techcorp.com / employer123');
}

setup().catch(err => {
  console.error('❌ Setup failed:', err.message);
  process.exit(1);
});
