const fs = require('fs');
const path = require('path');
const { pool } = require('./index');

async function initDatabase() {
  console.log('Initializing database...');
  
  try {
    // Test connection
    await pool.query('SELECT 1');
    console.log('Database connection successful');
    
    // Read migration SQL file
    const migrationPath = path.join(__dirname, './migrations/0001_init.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Execute migration
    await pool.query(migrationSQL);
    
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    console.log('Make sure PostgreSQL is running on port 5434');
    console.log('You can start it using: docker-compose up -d');
    process.exit(1);
  } finally {
    // Close the pool to end the script
    await pool.end();
  }
}

// Run the initialization
initDatabase(); 