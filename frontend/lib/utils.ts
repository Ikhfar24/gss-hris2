import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function isInternalPath(value: string | null): value is string {
  return !!value && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\');
}
