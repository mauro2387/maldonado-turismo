const { Pool } = require('pg');
require('dotenv').config({ path: './apps/backend/.env' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.query(`
  SELECT column_name, data_type 
  FROM information_schema.columns 
  WHERE table_name = 'news' 
  ORDER BY ordinal_position
`).then(r => {
  console.log('Columnas de tabla news:');
  r.rows.forEach(c => console.log(`  - ${c.column_name}: ${c.data_type}`));
  process.exit(0);
}).catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
