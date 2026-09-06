import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class PlacesService {
  constructor(
    @InjectDataSource()
    private dataSource: DataSource,
  ) {}

  async findAll(category?: string, search?: string) {
    let query = 'SELECT * FROM places WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (category) {
      query += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (search) {
      query += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex} OR address ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ' ORDER BY name ASC';

    return this.dataSource.query(query, params);
  }

  async findOne(id: number) {
    const result = await this.dataSource.query('SELECT * FROM places WHERE id = $1', [id]);
    return result[0] || null;
  }

  // ========== MÉTODOS ADMIN ==========

  async create(data: any, userId: number, userEmail: string, ipAddress: string) {
    // Extract coordinates if provided as an object
    const lat = data.coordinates?.lat || data.lat;
    const lng = data.coordinates?.lng || data.lng;

    const result = await this.dataSource.query(
      `INSERT INTO places (
        name, description, lat, lng, address, phone, email, website,
        category, images, schedule, price_range, facilities, activities, tips, contact
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *`,
      [
        data.name,
        data.description,
        lat,
        lng,
        data.address,
        data.phone,
        data.email,
        data.website,
        data.category,
        JSON.stringify(data.images || []),
        JSON.stringify(data.schedule || {}),
        data.price_range,
        data.facilities || [],
        data.activities || [],
        data.tips || [],
        JSON.stringify(data.contact || {}),
      ],
    );

    const place = result[0];

    // Audit log
    await this.dataSource.query(
      `INSERT INTO audit_log (user_id, user_email, action, entity_type, entity_id, changes, ip_address)
       VALUES ($1, $2, 'create', 'places', $3, $4, $5)`,
      [userId, userEmail, place.id, JSON.stringify({ new: place }), ipAddress],
    );

    return place;
  }

  async update(id: number, data: any, userId: number, userEmail: string, ipAddress: string) {
    // Get old data for audit
    const oldPlace = await this.findOne(id);
    
    if (!oldPlace) {
      return null;
    }

    // Extract coordinates if provided as an object
    const lat = data.coordinates?.lat || data.lat;
    const lng = data.coordinates?.lng || data.lng;

    const result = await this.dataSource.query(
      `UPDATE places SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        lat = COALESCE($3, lat),
        lng = COALESCE($4, lng),
        address = COALESCE($5, address),
        phone = COALESCE($6, phone),
        email = COALESCE($7, email),
        website = COALESCE($8, website),
        category = COALESCE($9, category),
        images = COALESCE($10, images),
        schedule = COALESCE($11, schedule),
        price_range = COALESCE($12, price_range),
        facilities = COALESCE($13, facilities),
        activities = COALESCE($14, activities),
        tips = COALESCE($15, tips),
        contact = COALESCE($16, contact),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $17
      RETURNING *`,
      [
        data.name,
        data.description,
        lat,
        lng,
        data.address,
        data.phone,
        data.email,
        data.website,
        data.category,
        data.images ? JSON.stringify(data.images) : null,
        data.schedule ? JSON.stringify(data.schedule) : null,
        data.price_range,
        data.facilities,
        data.activities,
        data.tips,
        data.contact ? JSON.stringify(data.contact) : null,
        id,
      ],
    );

    const updatedPlace = result[0];

    // Audit log
    await this.dataSource.query(
      `INSERT INTO audit_log (user_id, user_email, action, entity_type, entity_id, changes, ip_address)
       VALUES ($1, $2, 'update', 'places', $3, $4, $5)`,
      [userId, userEmail, id, JSON.stringify({ old: oldPlace, new: updatedPlace }), ipAddress],
    );

    return updatedPlace;
  }

  async delete(id: number, userId: number, userEmail: string, ipAddress: string) {
    const place = await this.findOne(id);
    
    if (!place) {
      return null;
    }

    await this.dataSource.query('DELETE FROM places WHERE id = $1', [id]);

    // Audit log
    await this.dataSource.query(
      `INSERT INTO audit_log (user_id, user_email, action, entity_type, entity_id, changes, ip_address)
       VALUES ($1, $2, 'delete', 'places', $3, $4, $5)`,
      [userId, userEmail, id, JSON.stringify({ deleted: place }), ipAddress],
    );

    return { message: 'Lugar eliminado correctamente', deleted: place };
  }
}
