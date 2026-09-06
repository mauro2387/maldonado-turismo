import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class EventsService {
  constructor(
    @InjectDataSource()
    private dataSource: DataSource,
  ) {}

  async findAll(filters?: {
    category?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    locality?: string;
  }) {
    // status = 'published' es la condición que separa lo que ve el turista de
    // lo que todavía está en la cola de revisión del scraper. No es un filtro
    // opcional: sin él la app muestra eventos con la fecha sin confirmar.
    let query = `SELECT 
      id, title, description, long_description, 
      start_date, start_date as date, 
      end_date, time, location, address,
      lat, lng, locality, category, price, capacity, organizer, 
      image, gallery, tags, contact, source, source_url,
      created_at, updated_at
    FROM events WHERE status = 'published'`;
    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.locality) {
      query += ` AND locality = $${paramIndex}`;
      params.push(filters.locality);
      paramIndex++;
    }

    if (filters?.category) {
      query += ` AND category = $${paramIndex}`;
      params.push(filters.category);
      paramIndex++;
    }

    if (filters?.startDate) {
      query += ` AND start_date >= $${paramIndex}`;
      params.push(filters.startDate);
      paramIndex++;
    }

    if (filters?.endDate) {
      query += ` AND start_date <= $${paramIndex}`;
      params.push(filters.endDate);
      paramIndex++;
    }

    if (filters?.search) {
      query += ` AND (title ILIKE $${paramIndex} OR description ILIKE $${paramIndex} OR location ILIKE $${paramIndex})`;
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    query += ' ORDER BY start_date ASC';

    return this.dataSource.query(query, params);
  }

  async findOne(id: number) {
    const result = await this.dataSource.query(`
      SELECT 
        id, title, description, long_description, 
        start_date, start_date as date, 
        end_date, time, location, address,
        lat, lng, locality, category, price, capacity, organizer, 
        image, gallery, tags, contact, source, source_url,
        created_at, updated_at
      FROM events WHERE id = $1 AND status = 'published'
    `, [id]);
    return result[0] || null;
  }

  // ========== MÉTODOS ADMIN ==========

  async create(data: any, userId: number, userEmail: string, ipAddress: string) {
    const result = await this.dataSource.query(
      `INSERT INTO events (
        title, description, long_description, start_date, end_date, time, location, address,
        lat, lng, category, price, capacity, organizer, image, gallery, tags, contact
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *`,
      [
        data.title,
        data.description,
        data.long_description,
        data.start_date,
        data.end_date,
        data.time,
        data.location,
        data.address,
        data.lat,
        data.lng,
        data.category,
        data.price,
        data.capacity,
        data.organizer,
        data.image,
        data.gallery || [],
        data.tags || [],
        JSON.stringify(data.contact || {}),
      ],
    );

    const event = result[0];

    await this.dataSource.query(
      `INSERT INTO audit_log (user_id, user_email, action, entity_type, entity_id, changes, ip_address)
       VALUES ($1, $2, 'create', 'events', $3, $4, $5)`,
      [userId, userEmail, event.id, JSON.stringify({ new: event }), ipAddress],
    );

    return event;
  }

  async update(id: number, data: any, userId: number, userEmail: string, ipAddress: string) {
    const oldEvent = await this.findOne(id);
    
    if (!oldEvent) {
      return null;
    }

    const result = await this.dataSource.query(
      `UPDATE events SET
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        long_description = COALESCE($3, long_description),
        start_date = COALESCE($4, start_date),
        end_date = COALESCE($5, end_date),
        time = COALESCE($6, time),
        location = COALESCE($7, location),
        address = COALESCE($8, address),
        lat = COALESCE($9, lat),
        lng = COALESCE($10, lng),
        category = COALESCE($11, category),
        price = COALESCE($12, price),
        capacity = COALESCE($13, capacity),
        organizer = COALESCE($14, organizer),
        image = COALESCE($15, image),
        gallery = COALESCE($16, gallery),
        tags = COALESCE($17, tags),
        contact = COALESCE($18, contact),
        -- Marca la fila como tocada a mano: a partir de acá la ingesta
        -- automática deja de sobrescribirla.
        edited_by_admin = true,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $19
      RETURNING *`,
      [
        data.title, data.description, data.long_description,
        data.start_date, data.end_date, data.time, data.location, data.address,
        data.lat, data.lng, data.category, data.price, data.capacity, data.organizer,
        data.image, data.gallery, data.tags,
        data.contact ? JSON.stringify(data.contact) : null,
        id,
      ],
    );

    const updatedEvent = result[0];

    await this.dataSource.query(
      `INSERT INTO audit_log (user_id, user_email, action, entity_type, entity_id, changes, ip_address)
       VALUES ($1, $2, 'update', 'events', $3, $4, $5)`,
      [userId, userEmail, id, JSON.stringify({ old: oldEvent, new: updatedEvent }), ipAddress],
    );

    return updatedEvent;
  }

  async delete(id: number, userId: number, userEmail: string, ipAddress: string) {
    const event = await this.findOne(id);
    
    if (!event) {
      return null;
    }

    await this.dataSource.query('DELETE FROM events WHERE id = $1', [id]);

    await this.dataSource.query(
      `INSERT INTO audit_log (user_id, user_email, action, entity_type, entity_id, changes, ip_address)
       VALUES ($1, $2, 'delete', 'events', $3, $4, $5)`,
      [userId, userEmail, id, JSON.stringify({ deleted: event }), ipAddress],
    );

    return { message: 'Evento eliminado correctamente', deleted: event };
  }
}
