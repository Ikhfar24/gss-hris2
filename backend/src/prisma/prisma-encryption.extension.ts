import { Prisma } from '@prisma/client';
import { encryptField, decryptField, isEncryptedField } from '../common/crypto/field-encryption';
import { PII_ENCRYPTED_FIELDS } from '../common/crypto/pii-fields';

export const encryptionExtension = Prisma.defineExtension({
  name: 'pii-encryption',
  query: {
    $allModels: {
      async $allOperations({ model, args, query, operation }) {
        if (model === 'Employee') {
          if (['create', 'update', 'upsert', 'createMany', 'updateMany'].includes(operation)) {
            encryptWriteArgs(args);
          }
          if (args && (args as any).where) {
            encryptWhereArgs((args as any).where);
          }
        }

        const result = await query(args);

        if (result) {
          decryptResult(result);
        }

        return result;
      },
    },
  },
});

export function encryptWhereArgs(where: any): void {
  if (!where || typeof where !== 'object') return;
  if (Array.isArray(where)) {
    where.forEach((item) => encryptWhereArgs(item));
    return;
  }
  for (const field of PII_ENCRYPTED_FIELDS) {
    const val = where[field];
    if (typeof val === 'string' && val.length > 0 && !isEncryptedField(val)) {
      where[field] = { in: [val, encryptField(val)] };
    } else if (val && typeof val === 'object' && Array.isArray(val.in)) {
      const expanded = new Set<string>();
      for (const item of val.in) {
        if (typeof item === 'string' && item.length > 0) {
          expanded.add(item);
          if (!isEncryptedField(item)) {
            expanded.add(encryptField(item));
          }
        }
      }
      val.in = [...expanded];
    }
  }
  if (where.OR) encryptWhereArgs(where.OR);
  if (where.AND) encryptWhereArgs(where.AND);
  if (where.NOT) encryptWhereArgs(where.NOT);
}

export function encryptWriteArgs(args: any): void {
  if (!args) return;
  const data = args.data;
  if (Array.isArray(data)) {
    data.forEach((item) => encryptWriteArgs({ data: item }));
  } else if (data && typeof data === 'object') {
    for (const field of PII_ENCRYPTED_FIELDS) {
      if (typeof data[field] === 'string' && data[field].length > 0 && !isEncryptedField(data[field])) {
        data[field] = encryptField(data[field]);
      } else if (
        typeof data[field] === 'object' &&
        data[field] !== null &&
        typeof data[field].set === 'string' &&
        data[field].set.length > 0 &&
        !isEncryptedField(data[field].set)
      ) {
        data[field].set = encryptField(data[field].set);
      }
    }
  }

  // Handle upsert's create/update separately
  if (args.create) encryptWriteArgs({ data: args.create });
  if (args.update) encryptWriteArgs({ data: args.update });
}

export function decryptResult(result: any): any {
  if (result === null || result === undefined) return result;
  if (Array.isArray(result)) {
    result.forEach((item) => decryptResult(item));
    return result;
  }
  if (typeof result === 'object') {
    for (const field of PII_ENCRYPTED_FIELDS) {
      if (typeof result[field] === 'string' && isEncryptedField(result[field])) {
        result[field] = decryptField(result[field]);
      }
    }
    // Handle nested employee in includes
    if (result.employee) decryptResult(result.employee);
    if (result.employees) decryptResult(result.employees);
  }
  return result;
}
