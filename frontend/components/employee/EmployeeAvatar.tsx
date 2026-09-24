'use client';

import { useEffect, useState } from 'react';
import { protectedMediaUrl } from '@/lib/api';
import { cn } from '@/lib/utils';

export function EmployeeAvatar({ name, photoUrl, size = 'md', className }: { name: string; photoUrl?: string | null; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const [failed, setFailed] = useState(false);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?';
  const sizes = { sm: 'size-10 text-xs', md: 'size-14 text-sm', lg: 'size-24 text-xl' };

  useEffect(() => {
    setFailed(false);
  }, [photoUrl]);

  if (photoUrl && !failed) return <img src={protectedMediaUrl(photoUrl)} alt={`Foto profil ${name}`} onError={() => setFailed(true)} className={cn('shrink-0 rounded-full border-2 border-white/80 object-cover shadow-sm', sizes[size], className)} />;
  return <span role="img" aria-label={`Foto profil ${name} belum tersedia`} className={cn('grid shrink-0 place-items-center rounded-full border-2 border-white/80 bg-brand/10 font-bold text-brand shadow-sm', sizes[size], className)}>{initials}</span>;
}
