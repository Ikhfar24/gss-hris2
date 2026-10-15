export const PII_ENCRYPTED_FIELDS = [
  'nik',
  'bankAccountNumber',
  'bpjsKesehatanNumber',
  'bpjsKetenagakerjaanNumber',
] as const;

export type PiiEncryptedField = (typeof PII_ENCRYPTED_FIELDS)[number];
