import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';

async function runMigration() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: 'db.yqfxvhvjjnllrpsqrqod.supabase.co',
    port: 5432,
    username: 'postgres',
    password: 'Y@.gfNRF9fL%gtG',
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });

  try {
    await dataSource.initialize();
    console.log('✅ Conexión establecida con Supabase');

    const sqlPath = path.join(__dirname, '..', '..', 'migrations', '2025-11-09-transport-module-complete.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('📝 Ejecutando migración del módulo de transporte...');
    
    // Dividir por bloques y ejecutar uno por uno
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    let executed = 0;
    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await dataSource.query(statement);
          executed++;
          if (executed % 10 === 0) {
            console.log(`  ✓ ${executed}/${statements.length} sentencias ejecutadas`);
          }
        } catch (error: any) {
          // Ignorar errores de "ya existe" o "CREATE EXTENSION"
          if (error.code !== '42710' && error.code !== '42P07' && !error.message.includes('already exists')) {
            console.warn(`  ⚠️ Error en sentencia: ${error.message.substring(0, 100)}`);
          }
        }
      }
    }
    
    console.log(`✅ ${executed} sentencias ejecutadas`);

    console.log('✅ Migración ejecutada exitosamente');
    console.log('\n📊 Verificando tablas creadas:');

    const tables = await dataSource.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name LIKE 'bus_%' 
        OR table_name IN ('route_geometries', 'route_stops', 'service_calendars', 'stop_times', 'transport_alerts', 'qr_codes', 'qr_scans', 'vehicle_positions', 'transport_analytics')
      ORDER BY table_name;
    `);

    console.log('Tablas creadas:');
    tables.forEach(t => console.log(`  - ${t.table_name}`));

    console.log('\n📊 Verificando datos seed:');
    const routes = await dataSource.query('SELECT code, name FROM bus_routes;');
    const stops = await dataSource.query('SELECT code, name FROM bus_stops;');
    const calendars = await dataSource.query('SELECT service_id, description FROM service_calendars;');

    console.log(`\n✅ Rutas: ${routes.length}`);
    routes.forEach(r => console.log(`  - ${r.code}: ${r.name}`));

    console.log(`\n✅ Paradas: ${stops.length}`);
    stops.forEach(s => console.log(`  - ${s.code}: ${s.name}`));

    console.log(`\n✅ Calendarios: ${calendars.length}`);
    calendars.forEach(c => console.log(`  - ${c.service_id}: ${c.description}`));

    await dataSource.destroy();
    console.log('\n✅ Todo completado exitosamente');

  } catch (error) {
    console.error('❌ Error ejecutando migración:', error);
    await dataSource.destroy();
    process.exit(1);
  }
}

runMigration();
