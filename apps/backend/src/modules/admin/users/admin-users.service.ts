import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AdminUsersService {
  constructor(
    @InjectDataSource()
    private dataSource: DataSource,
  ) {}

  async findAll() {
    return this.dataSource.query(
      `SELECT id, email, name, role, department, active, created_at, last_login 
       FROM admin_users 
       ORDER BY created_at DESC`
    );
  }

  async findOne(id: number) {
    const result = await this.dataSource.query(
      `SELECT id, email, name, role, department, active, created_at, last_login 
       FROM admin_users 
       WHERE id = $1`,
      [id]
    );
    
    if (result.length === 0) {
      throw new NotFoundException('Usuario no encontrado');
    }
    
    return result[0];
  }

  async create(data: any, currentUserId: number, currentUserEmail: string, ipAddress: string) {
    // Verificar si el email ya existe
    const existing = await this.dataSource.query(
      'SELECT id FROM admin_users WHERE email = $1',
      [data.email]
    );
    
    if (existing.length > 0) {
      throw new ConflictException('El email ya está registrado');
    }

    // Hash de la contraseña
    const hashedPassword = await bcrypt.hash(data.password, 10);

    // Crear usuario
    const result = await this.dataSource.query(
      `INSERT INTO admin_users (email, password_hash, name, role, department, active)
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING id, email, name, role, department, active, created_at`,
      [
        data.email,
        hashedPassword,
        data.name,
        data.role || 'editor',
        data.department || null,
        data.active !== undefined ? data.active : true
      ]
    );

    const newUser = result[0];

    // Registrar en audit log
    await this.dataSource.query(
      `INSERT INTO audit_log (user_id, user_email, action, entity_type, entity_id, changes, ip_address)
       VALUES ($1, $2, 'create', 'admin_users', $3, $4, $5)`,
      [currentUserId, currentUserEmail, newUser.id, JSON.stringify({ new: newUser }), ipAddress]
    );

    return newUser;
  }

  async update(id: number, data: any, currentUserId: number, currentUserEmail: string, ipAddress: string) {
    // Verificar que el usuario existe
    const existing = await this.dataSource.query(
      'SELECT id FROM admin_users WHERE id = $1',
      [id]
    );
    
    if (existing.length === 0) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Si se está actualizando el email, verificar que no esté en uso
    if (data.email) {
      const emailInUse = await this.dataSource.query(
        'SELECT id FROM admin_users WHERE email = $1 AND id != $2',
        [data.email, id]
      );
      
      if (emailInUse.length > 0) {
        throw new ConflictException('El email ya está en uso por otro usuario');
      }
    }

    // Construir query de actualización
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.email !== undefined) {
      updates.push(`email = $${paramIndex++}`);
      values.push(data.email);
    }
    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }
    if (data.role !== undefined) {
      updates.push(`role = $${paramIndex++}`);
      values.push(data.role);
    }
    if (data.department !== undefined) {
      updates.push(`department = $${paramIndex++}`);
      values.push(data.department);
    }
    if (data.active !== undefined) {
      updates.push(`active = $${paramIndex++}`);
      values.push(data.active);
    }

    if (updates.length === 0) {
      return this.findOne(id);
    }

    values.push(id);
    const result = await this.dataSource.query(
      `UPDATE admin_users SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING id, email, name, role, department, active, created_at, last_login`,
      values
    );

    const updatedUser = result[0];

    // Registrar en audit log
    await this.dataSource.query(
      `INSERT INTO audit_log (user_id, user_email, action, entity_type, entity_id, changes, ip_address)
       VALUES ($1, $2, 'update', 'admin_users', $3, $4, $5)`,
      [currentUserId, currentUserEmail, id, JSON.stringify({ new: updatedUser }), ipAddress]
    );

    return updatedUser;
  }

  async changePassword(id: number, newPassword: string, currentUserId: number, currentUserEmail: string, ipAddress: string) {
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.dataSource.query(
      'UPDATE admin_users SET password_hash = $1 WHERE id = $2',
      [hashedPassword, id]
    );

    // Registrar en audit log
    await this.dataSource.query(
      `INSERT INTO audit_log (user_id, user_email, action, entity_type, entity_id, changes, ip_address)
       VALUES ($1, $2, 'update', 'admin_users', $3, $4, $5)`,
      [currentUserId, currentUserEmail, id, JSON.stringify({ action: 'password_change' }), ipAddress]
    );

    return { message: 'Contraseña actualizada exitosamente' };
  }

  async remove(id: number, currentUserId: number, currentUserEmail: string, ipAddress: string) {
    // No permitir que un usuario se elimine a sí mismo
    if (id === currentUserId) {
      throw new ConflictException('No puedes eliminar tu propia cuenta');
    }

    const user = await this.dataSource.query(
      'SELECT * FROM admin_users WHERE id = $1',
      [id]
    );
    
    if (user.length === 0) {
      throw new NotFoundException('Usuario no encontrado');
    }

    await this.dataSource.query('DELETE FROM admin_users WHERE id = $1', [id]);

    // Registrar en audit log
    await this.dataSource.query(
      `INSERT INTO audit_log (user_id, user_email, action, entity_type, entity_id, changes, ip_address)
       VALUES ($1, $2, 'delete', 'admin_users', $3, $4, $5)`,
      [currentUserId, currentUserEmail, id, JSON.stringify({ deleted: user[0] }), ipAddress]
    );

    return { message: 'Usuario eliminado exitosamente' };
  }
}
