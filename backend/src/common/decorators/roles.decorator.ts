import { SetMetadata } from '@nestjs/common';
import { Role } from '../enums/role.enum';

export const ROLES_KEY = 'roles';
/**
 * Restrict an endpoint to specific roles.
 * Usage: @Roles(Role.ADMIN_HR, Role.SYSTEM_ADMIN)
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
