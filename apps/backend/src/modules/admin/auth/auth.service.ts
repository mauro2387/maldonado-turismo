import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

export interface AdminUser {
  id: number;
  email: string;
  name: string;
  role: string;
  department: string;
  active: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectDataSource()
    private dataSource: DataSource,
    private jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string): Promise<AdminUser | null> {
    const result = await this.dataSource.query(
      'SELECT * FROM admin_users WHERE email = $1 AND active = true',
      [email],
    );

    const user = result[0];
    if (!user) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return null;
    }

    // No devolver el password_hash
    const { password_hash, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async login(user: AdminUser, ipAddress: string) {
    const payload = { 
      sub: user.id, 
      email: user.email, 
      role: user.role,
      department: user.department
    };

    // Actualizar last_login
    await this.dataSource.query(
      'UPDATE admin_users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id],
    );

    // Registrar en audit_log
    await this.dataSource.query(
      `INSERT INTO audit_log (user_id, user_email, action, entity_type, entity_id, ip_address, created_at)
       VALUES ($1, $2, 'login', 'admin_users', $3, $4, CURRENT_TIMESTAMP)`,
      [user.id, user.email, user.id, ipAddress],
    );

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        department: user.department,
      },
    };
  }

  async logout(userId: number, email: string, ipAddress: string) {
    // Registrar en audit_log
    await this.dataSource.query(
      `INSERT INTO audit_log (user_id, user_email, action, entity_type, entity_id, ip_address, created_at)
       VALUES ($1, $2, 'logout', 'admin_users', $3, $4, CURRENT_TIMESTAMP)`,
      [userId, email, userId, ipAddress],
    );

    return { message: 'Logout successful' };
  }

  async getProfile(userId: number): Promise<AdminUser | null> {
    const result = await this.dataSource.query(
      'SELECT id, email, name, role, department, active FROM admin_users WHERE id = $1',
      [userId],
    );

    return result[0] || null;
  }

  async getAuditLog(action?: string, entityType?: string, limit: number = 100) {
    let query = `
      SELECT 
        a.id,
        a.user_id,
        a.user_email,
        a.action,
        a.entity_type,
        a.entity_id,
        a.changes,
        a.ip_address,
        a.created_at
      FROM audit_log a
      WHERE 1=1
    `;
    
    const params: any[] = [];
    let paramIndex = 1;

    if (action) {
      query += ` AND a.action = $${paramIndex}`;
      params.push(action);
      paramIndex++;
    }

    if (entityType) {
      query += ` AND a.entity_type = $${paramIndex}`;
      params.push(entityType);
      paramIndex++;
    }

    query += ` ORDER BY a.created_at DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await this.dataSource.query(query, params);
    return result;
  }
}
