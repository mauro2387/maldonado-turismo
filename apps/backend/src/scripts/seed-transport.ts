import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Cargar variables de entorno
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function runSeed() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT || '5432'),
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log('🔌 Conectando a la base de datos...');
    await dataSource.initialize();
    console.log('✅ Conexión establecida\n');

    // Leer el archivo SQL
    const sqlPath = path.join(__dirname, 'seed-transport-data.sql');
    console.log(`📄 Leyendo: ${sqlPath}`);
    const sql = fs.readFileSync(sqlPath, 'utf-8');

    console.log('🚀 Ejecutando seed SQL...\n');
    
    // Ejecutar el SQL completo
    await dataSource.query(sql);

    console.log('\n✅ Seed completado exitosamente!');
    console.log('\n📊 Verificando datos insertados...\n');

    // Verificar rutas
    const routes = await dataSource.query('SELECT COUNT(*) as count FROM bus_routes');
    console.log(`🚌 Rutas insertadas: ${routes[0].count}`);

    // Verificar paradas
    const stops = await dataSource.query('SELECT COUNT(*) as count FROM bus_stops');
    console.log(`🏁 Paradas insertadas: ${stops[0].count}`);

    // Verificar alertas
    const alerts = await dataSource.query('SELECT COUNT(*) as count FROM transport_alerts');
    console.log(`⚠️  Alertas insertadas: ${alerts[0].count}`);

    console.log('\n🎉 Base de datos lista para transporte!');
    
  } catch (error) {
    console.error('❌ Error ejecutando seed:', error);
    throw error;
  } finally {
    await dataSource.destroy();
    console.log('\n🔌 Conexión cerrada');
  }
}

runSeed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
