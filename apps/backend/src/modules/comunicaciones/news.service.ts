import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class NewsService {
  constructor(
    @InjectDataSource()
    private dataSource: DataSource,
  ) {}

  async findAll(filters?: { category?: string; featured?: boolean; search?: string }) {
    let query = 'SELECT * FROM news WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.category) {
      query += ` AND category = $${paramIndex}`;
      params.push(filters.category);
      paramIndex++;
    }

    if (filters?.featured !== undefined) {
      query += ` AND featured = $${paramIndex}`;
      params.push(filters.featured);
      paramIndex++;
    }

    if (filters?.search) {
      query += ` AND (title ILIKE $${paramIndex} OR summary ILIKE $${paramIndex} OR content ILIKE $${paramIndex})`;
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    query += ' ORDER BY published_at DESC';

    return this.dataSource.query(query, params);
  }

  async getFeatured(limit: number = 2) {
    return this.dataSource.query(
      'SELECT * FROM news WHERE featured = true ORDER BY published_at DESC LIMIT $1',
      [limit]
    );
  }

  async findOne(id: number) {
    const result = await this.dataSource.query('SELECT * FROM news WHERE id = $1', [id]);
    return result[0] || null;
  }

  async incrementViews(id: number) {
    await this.dataSource.query('UPDATE news SET views = views + 1 WHERE id = $1', [id]);
  }

  // ========== MÉTODOS ADMIN ==========

  async create(data: any, userId: number, userEmail: string, ipAddress: string) {
    const result = await this.dataSource.query(
      `INSERT INTO news (
        title, summary, content, category, author, author_image, image, gallery, tags, featured
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        data.title,
        data.summary,
        data.content,
        data.category,
        data.author,
        data.author_image,
        data.image,
        data.gallery || [],
        data.tags || [],
        data.featured || false,
      ],
    );

    const news = result[0];

    await this.dataSource.query(
      `INSERT INTO audit_log (user_id, user_email, action, entity_type, entity_id, changes, ip_address)
       VALUES ($1, $2, 'create', 'news', $3, $4, $5)`,
      [userId, userEmail, news.id, JSON.stringify({ new: news }), ipAddress],
    );

    return news;
  }

  async update(id: number, data: any, userId: number, userEmail: string, ipAddress: string) {
    const oldNews = await this.findOne(id);
    
    if (!oldNews) {
      return null;
    }

    const result = await this.dataSource.query(
      `UPDATE news SET
        title = COALESCE($1, title),
        summary = COALESCE($2, summary),
        content = COALESCE($3, content),
        category = COALESCE($4, category),
        author = COALESCE($5, author),
        author_image = COALESCE($6, author_image),
        image = COALESCE($7, image),
        gallery = COALESCE($8, gallery),
        tags = COALESCE($9, tags),
        featured = COALESCE($10, featured),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $11
      RETURNING *`,
      [
        data.title, data.summary, data.content, data.category, data.author,
        data.author_image, data.image, data.gallery, data.tags, data.featured,
        id,
      ],
    );

    const updatedNews = result[0];

    await this.dataSource.query(
      `INSERT INTO audit_log (user_id, user_email, action, entity_type, entity_id, changes, ip_address)
       VALUES ($1, $2, 'update', 'news', $3, $4, $5)`,
      [userId, userEmail, id, JSON.stringify({ old: oldNews, new: updatedNews }), ipAddress],
    );

    return updatedNews;
  }

  async delete(id: number, userId: number, userEmail: string, ipAddress: string) {
    const news = await this.findOne(id);
    
    if (!news) {
      return null;
    }

    await this.dataSource.query('DELETE FROM news WHERE id = $1', [id]);

    await this.dataSource.query(
      `INSERT INTO audit_log (user_id, user_email, action, entity_type, entity_id, changes, ip_address)
       VALUES ($1, $2, 'delete', 'news', $3, $4, $5)`,
      [userId, userEmail, id, JSON.stringify({ deleted: news }), ipAddress],
    );

    return { message: 'Noticia eliminada correctamente', deleted: news };
  }
}
