-- AlterTable
ALTER TABLE "company_settings" ALTER COLUMN "companyName" SET DEFAULT 'GSS';

-- AlterTable
ALTER TABLE "company_settings" ALTER COLUMN "appName" SET DEFAULT 'GSS';

-- AlterTable
ALTER TABLE "company_settings" ALTER COLUMN "primaryColor" SET DEFAULT '#0F3151';

UPDATE "company_settings" SET "primaryColor" = '#0F3151'
WHERE "primaryColor" = '#0F172A' AND "companyName" = 'Papaiz.corp' AND "appName" = 'Papaiz HR';

UPDATE "company_settings" SET "companyName" = 'GSS' WHERE "companyName" = 'Papaiz.corp';

UPDATE "company_settings" SET "appName" = 'GSS' WHERE "appName" = 'Papaiz HR';
