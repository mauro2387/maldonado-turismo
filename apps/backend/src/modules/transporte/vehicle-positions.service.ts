import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class VehiclePositionsService {
  constructor(@InjectDataSource() private dataSource: DataSource) {}

  /**
   * Return the latest position for each vehicle (one row per vehicle)
   */
  async getLatestPositions(): Promise<any[]> {
    // Use DISTINCT ON to pick latest recorded_at per vehicle_id
    const rows = await this.dataSource.query(`
      SELECT DISTINCT ON (vehicle_id) id, vehicle_id, route_id, latitude, longitude, heading, speed, recorded_at
      FROM vehicle_positions
      ORDER BY vehicle_id, recorded_at DESC
    `);
    return rows;
  }

  async insertPosition(payload: {
    vehicle_id: string;
    route_id?: number | null;
    latitude: number;
    longitude: number;
    heading?: number | null;
    speed?: number | null;
  }) {
    const result = await this.dataSource.query(
      `INSERT INTO vehicle_positions (vehicle_id, route_id, latitude, longitude, heading, speed)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [payload.vehicle_id, payload.route_id || null, payload.latitude, payload.longitude, payload.heading || null, payload.speed || null]
    );
    return result[0];
  }
}
