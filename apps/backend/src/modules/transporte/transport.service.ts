import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class TransportService {
  constructor(
    @InjectDataSource()
    private dataSource: DataSource,
  ) {}

  async getRoutes() {
    return this.dataSource.query('SELECT * FROM bus_routes ORDER BY name ASC');
  }

  /**
   * Las paradas activas.
   *
   * El filtro por `is_active` no es decorativo: las ocho paradas de relleno
   * que tenía la tabla siguen ahí, desactivadas, para que un QR viejo no
   * termine en un 404. Sin el filtro volverían al mapa y al buscador.
   */
  async getStops() {
    return this.dataSource.query(
      'SELECT * FROM bus_stops WHERE is_active ORDER BY name ASC',
    );
  }

  async getAlerts() {
    return this.dataSource.query(
      `SELECT * FROM transport_alerts 
       WHERE (end_date IS NULL OR end_date >= NOW()) 
       AND start_date <= NOW() 
       ORDER BY start_date DESC`
    );
  }

  // ========== MÉTODOS ADMIN ==========

  // ROUTES
  async createRoute(data: any, userId: number, userEmail: string, ipAddress: string) {
    const result = await this.dataSource.query(
      `INSERT INTO bus_routes (name, description, color, frequency, schedule, stops, path)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        data.name, data.description, data.color, data.frequency,
        JSON.stringify(data.schedule || {}), data.stops || [],
        JSON.stringify(data.path || []),
      ],
    );

    const route = result[0];
    await this.dataSource.query(
      `INSERT INTO audit_log (user_id, user_email, action, entity_type, entity_id, changes, ip_address)
       VALUES ($1, $2, 'create', 'bus_routes', $3, $4, $5)`,
      [userId, userEmail, route.id, JSON.stringify({ new: route }), ipAddress],
    );

    return route;
  }

  async updateRoute(id: number, data: any, userId: number, userEmail: string, ipAddress: string) {
    const result = await this.dataSource.query(
      `UPDATE bus_routes SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        color = COALESCE($3, color),
        frequency = COALESCE($4, frequency),
        schedule = COALESCE($5, schedule),
        stops = COALESCE($6, stops),
        path = COALESCE($7, path),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $8 RETURNING *`,
      [
        data.name, data.description, data.color, data.frequency,
        data.schedule ? JSON.stringify(data.schedule) : null,
        data.stops, data.path ? JSON.stringify(data.path) : null, id,
      ],
    );

    if (result.length === 0) return null;

    await this.dataSource.query(
      `INSERT INTO audit_log (user_id, user_email, action, entity_type, entity_id, changes, ip_address)
       VALUES ($1, $2, 'update', 'bus_routes', $3, $4, $5)`,
      [userId, userEmail, id, JSON.stringify({ new: result[0] }), ipAddress],
    );

    return result[0];
  }

  async deleteRoute(id: number, userId: number, userEmail: string, ipAddress: string) {
    const route = await this.dataSource.query('SELECT * FROM bus_routes WHERE id = $1', [id]);
    if (route.length === 0) return null;

    await this.dataSource.query('DELETE FROM bus_routes WHERE id = $1', [id]);
    await this.dataSource.query(
      `INSERT INTO audit_log (user_id, user_email, action, entity_type, entity_id, changes, ip_address)
       VALUES ($1, $2, 'delete', 'bus_routes', $3, $4, $5)`,
      [userId, userEmail, id, JSON.stringify({ deleted: route[0] }), ipAddress],
    );

    return { message: 'Ruta eliminada', deleted: route[0] };
  }

  // STOPS
  async createStop(data: any, userId: number, userEmail: string, ipAddress: string) {
    const result = await this.dataSource.query(
      `INSERT INTO bus_stops (name, address, lat, lng, routes, facilities, distance, next_buses)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        data.name, data.address, data.lat, data.lng, data.routes || [],
        data.facilities || [], data.distance, JSON.stringify(data.next_buses || []),
      ],
    );

    const stop = result[0];
    await this.dataSource.query(
      `INSERT INTO audit_log (user_id, user_email, action, entity_type, entity_id, changes, ip_address)
       VALUES ($1, $2, 'create', 'bus_stops', $3, $4, $5)`,
      [userId, userEmail, stop.id, JSON.stringify({ new: stop }), ipAddress],
    );

    return stop;
  }

  async updateStop(id: number, data: any, userId: number, userEmail: string, ipAddress: string) {
    const result = await this.dataSource.query(
      `UPDATE bus_stops SET
        name = COALESCE($1, name),
        address = COALESCE($2, address),
        lat = COALESCE($3, lat),
        lng = COALESCE($4, lng),
        routes = COALESCE($5, routes),
        facilities = COALESCE($6, facilities),
        distance = COALESCE($7, distance),
        next_buses = COALESCE($8, next_buses),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $9 RETURNING *`,
      [
        data.name, data.address, data.lat, data.lng, data.routes, data.facilities,
        data.distance, data.next_buses ? JSON.stringify(data.next_buses) : null, id,
      ],
    );

    if (result.length === 0) return null;

    await this.dataSource.query(
      `INSERT INTO audit_log (user_id, user_email, action, entity_type, entity_id, changes, ip_address)
       VALUES ($1, $2, 'update', 'bus_stops', $3, $4, $5)`,
      [userId, userEmail, id, JSON.stringify({ new: result[0] }), ipAddress],
    );

    return result[0];
  }

  async deleteStop(id: number, userId: number, userEmail: string, ipAddress: string) {
    const stop = await this.dataSource.query('SELECT * FROM bus_stops WHERE id = $1', [id]);
    if (stop.length === 0) return null;

    await this.dataSource.query('DELETE FROM bus_stops WHERE id = $1', [id]);
    await this.dataSource.query(
      `INSERT INTO audit_log (user_id, user_email, action, entity_type, entity_id, changes, ip_address)
       VALUES ($1, $2, 'delete', 'bus_stops', $3, $4, $5)`,
      [userId, userEmail, id, JSON.stringify({ deleted: stop[0] }), ipAddress],
    );

    return { message: 'Parada eliminada', deleted: stop[0] };
  }

  // ALERTS
  async createAlert(data: any, userId: number, userEmail: string, ipAddress: string) {
    const result = await this.dataSource.query(
      `INSERT INTO transport_alerts (title, message, type, affected_routes, start_date, end_date)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [data.title, data.message, data.type, data.affected_routes || [], data.start_date, data.end_date],
    );

    const alert = result[0];
    await this.dataSource.query(
      `INSERT INTO audit_log (user_id, user_email, action, entity_type, entity_id, changes, ip_address)
       VALUES ($1, $2, 'create', 'transport_alerts', $3, $4, $5)`,
      [userId, userEmail, alert.id, JSON.stringify({ new: alert }), ipAddress],
    );

    return alert;
  }

  async updateAlert(id: number, data: any, userId: number, userEmail: string, ipAddress: string) {
    const result = await this.dataSource.query(
      `UPDATE transport_alerts SET
        title = COALESCE($1, title),
        message = COALESCE($2, message),
        type = COALESCE($3, type),
        affected_routes = COALESCE($4, affected_routes),
        start_date = COALESCE($5, start_date),
        end_date = COALESCE($6, end_date),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $7 RETURNING *`,
      [data.title, data.message, data.type, data.affected_routes, data.start_date, data.end_date, id],
    );

    if (result.length === 0) return null;

    await this.dataSource.query(
      `INSERT INTO audit_log (user_id, user_email, action, entity_type, entity_id, changes, ip_address)
       VALUES ($1, $2, 'update', 'transport_alerts', $3, $4, $5)`,
      [userId, userEmail, id, JSON.stringify({ new: result[0] }), ipAddress],
    );

    return result[0];
  }

  async deleteAlert(id: number, userId: number, userEmail: string, ipAddress: string) {
    const alert = await this.dataSource.query('SELECT * FROM transport_alerts WHERE id = $1', [id]);
    if (alert.length === 0) return null;

    await this.dataSource.query('DELETE FROM transport_alerts WHERE id = $1', [id]);
    await this.dataSource.query(
      `INSERT INTO audit_log (user_id, user_email, action, entity_type, entity_id, changes, ip_address)
       VALUES ($1, $2, 'delete', 'transport_alerts', $3, $4, $5)`,
      [userId, userEmail, id, JSON.stringify({ deleted: alert[0] }), ipAddress],
    );

    return { message: 'Alerta eliminada', deleted: alert[0] };
  }
}
