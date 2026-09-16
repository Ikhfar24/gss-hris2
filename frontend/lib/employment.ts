const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  TENAGA_ARSIPARIS: 'Tenaga Arsiparis',
  TENAGA_BORONGAN: 'Tenaga Borongan',
  STAFF_OFFICE: 'Staff Kantor',
};

export function employmentTypeLabel(value: unknown) {
  const type = String(value ?? '-');
  return EMPLOYMENT_TYPE_LABELS[type] ?? type.replaceAll('_', ' ');
}
