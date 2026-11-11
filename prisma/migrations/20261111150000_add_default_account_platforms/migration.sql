INSERT INTO "Platform" ("id", "name", "url")
VALUES
  ('platform-vanguard', 'Vanguard', 'https://investor.vanguard.com'),
  ('platform-fidelity', 'Fidelity', 'https://www.fidelity.com'),
  ('platform-jnj-401k', 'JNJ 401K', 'https://www.jnj.com'),
  ('platform-robinhood', 'Robinhood', 'https://robinhood.com'),
  ('platform-equiniti', 'Equiniti', 'https://www.equiniti.com')
ON CONFLICT ("url") DO UPDATE
SET "name" = EXCLUDED."name";
