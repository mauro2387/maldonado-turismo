-- Create vehicle_positions table for realtime vehicle tracking (safe to run multiple times)
DROP TABLE IF EXISTS vehicle_positions CASCADE;

CREATE TABLE vehicle_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id varchar(100) NOT NULL,
  route_id integer NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  heading double precision NULL,
  speed double precision NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_positions_vehicle_id ON vehicle_positions(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_positions_route_id ON vehicle_positions(route_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_positions_recorded_at ON vehicle_positions(recorded_at);
