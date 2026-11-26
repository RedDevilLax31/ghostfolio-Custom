ALTER TABLE "User" ADD COLUMN "alias" VARCHAR(25);

CREATE UNIQUE INDEX "User_alias_lower_key" ON "User" (LOWER("alias"));
