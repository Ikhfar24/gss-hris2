import { sessionSchema, type Session, ROLES, type Role } from './schemas';

export { ROLES, type Role, type Session };
export type SessionEmployee = NonNullable<Session['employee']>;

export function isSession(value: unknown): value is Session {
  return sessionSchema.safeParse(value).success;
}
