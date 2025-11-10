import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function runVehiclePositionsMigration() {
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

    const sqlPath = path.join(__dirname, 'create-vehicle-positions.sql');
    console.log(`📄 Leyendo: ${sqlPath}`);
    const sql = fs.readFileSync(sqlPath, 'utf-8');

    console.log('🚀 Ejecutando SQL para crear tabla vehicle_positions...\n');
    await dataSource.query(sql);

    console.log('✅ Tabla vehicle_positions creada exitosamente!');
    console.log('\n📊 Verificando estructura...');

    const checkTable = await dataSource.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'vehicle_positions'
      ORDER BY ordinal_position;
    `);

    console.log('\nColumnas de vehicle_positions:');
    checkTable.forEach((c: any) => console.log(`  - ${c.column_name}: ${c.data_type}`));

    console.log('\n🎉 Migración completada!');
  } catch (error) {
    console.error('❌ Error ejecutando migración:', error);
    throw error;
  } finally {
    await dataSource.destroy();
    console.log('\n🔌 Conexión cerrada');
  }
}

runVehiclePositionsMigration()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
