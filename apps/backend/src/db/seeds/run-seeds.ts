const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runSeeds() {
  const client = new Client({
    host: process.env.DATABASE_HOST || 'localhost',
    port: process.env.DATABASE_PORT || 5432,
    database: process.env.DATABASE_NAME || 'maldonado_turismo',
    user: process.env.DATABASE_USER || 'maldonado_user',
    password: process.env.DATABASE_PASSWORD || 'dev_password_123',
  });

  try {
    console.log('🔌 Conectando a la base de datos...');
    await client.connect();
    console.log('✅ Conexión establecida\n');

    // Leer archivo SQL
    const sqlFile = path.join(__dirname, 'data.sql');
    console.log('📄 Leyendo archivo de seeds...');
    const sql = fs.readFileSync(sqlFile, 'utf8');

    console.log('🌱 Ejecutando seeds...\n');
    const result = await client.query(sql);

    // Mostrar estadísticas finales si están disponibles
    if (result.rows && result.rows.length > 0) {
      console.log('\n📊 Estadísticas:');
      const stats = result.rows[0];
      console.log(`   Lugares:  ${stats.lugares || 0}`);
      console.log(`   Eventos:  ${stats.eventos || 0}`);
      console.log(`   Noticias: ${stats.noticias || 0}`);
      console.log(`   Rutas:    ${stats.rutas || 0}`);
      console.log(`   Paradas:  ${stats.paradas || 0}`);
      console.log(`   Alertas:  ${stats.alertas || 0}`);
    }

    console.log('\n✨ Seeds ejecutados exitosamente!');
  } catch (error) {
    console.error('❌ Error ejecutando seeds:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 Asegúrate de que PostgreSQL esté corriendo');
      console.error('   Comando: docker-compose up -d postgres');
    }
    process.exit(1);
  } finally {
    await client.end();
  }
}

runSeeds();
