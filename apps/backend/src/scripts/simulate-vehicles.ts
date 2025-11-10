import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function createDataSource() {
  return new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT || '5432'),
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
}

function randomOffset(scale = 0.005) {
  return (Math.random() - 0.5) * scale;
}

async function run() {
  const ds = await createDataSource();
  await ds.initialize();
  console.log('Simulator: connected to DB');

  // Get some sample stops to base positions
  const stops = await ds.query('SELECT id, lat, lng FROM bus_stops LIMIT 50');
  if (stops.length === 0) {
    console.error('No stops found to simulate. Run seed first.');
    await ds.destroy();
    process.exit(1);
  }

  // Create a small fleet of mock vehicles based on stops
  const fleet: Array<{ vehicle_id: string; route_id?: number; baseLat: number; baseLng: number }> = [];
  for (let i = 0; i < Math.min(10, stops.length); i++) {
    const s = stops[i];
    fleet.push({ vehicle_id: `sim-${i + 1}`, route_id: null, baseLat: parseFloat(s.lat), baseLng: parseFloat(s.lng) });
  }

  console.log(`Simulator: created fleet of ${fleet.length} vehicles`);

  // Insert/update positions periodically
  const intervalMs = 5000;
  const timer = setInterval(async () => {
    for (const v of fleet) {
      const lat = v.baseLat + randomOffset(0.01);
      const lng = v.baseLng + randomOffset(0.01);
      const heading = Math.floor(Math.random() * 360);
      const speed = Math.round(10 + Math.random() * 40);

      await ds.query(
        `INSERT INTO vehicle_positions (vehicle_id, route_id, latitude, longitude, heading, speed)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [v.vehicle_id, v.route_id, lat, lng, heading, speed]
      );
    }
    process.stdout.write('.');
  }, intervalMs);

  // Stop on SIGINT
  process.on('SIGINT', async () => {
    clearInterval(timer);
    await ds.destroy();
    console.log('\nSimulator stopped.');
    process.exit(0);
  });
}

run().catch((err) => {
  console.error('Simulator error', err);
  process.exit(1);
});
