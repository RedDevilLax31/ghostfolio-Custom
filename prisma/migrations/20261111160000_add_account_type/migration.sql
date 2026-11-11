CREATE TYPE "AccountType" AS ENUM ('ROTH', 'TAXABLE', 'TRADITIONAL');

ALTER TABLE "Account"
ADD COLUMN "accountType" "AccountType";
