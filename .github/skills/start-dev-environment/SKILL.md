---
name: start-dev-environment
description: 'Start the Ghostfolio local development environment with minimal effort and checks. Use when asked to start, launch, run, or prepare the development environment, API, client, PostgreSQL, or Redis.'
argument-hint: 'Optional: specify a client language or whether to start the API, client, or both'
---

# Start the Development Environment

Start the local Ghostfolio development environment using the shortest working path. Prefer action over diagnostics and avoid unnecessary setup or verification.

## Procedure

1. If `node_modules` does not exist, run `npm install`. If it exists, do not reinstall dependencies.
2. Ensure `.env.dev` exists and contains the local configuration. Development npm scripts load this file directly; do not copy it to or overwrite `.env`.
3. Start PostgreSQL and Redis:

   ```bash
   docker compose -f docker/docker-compose.dev.yml up -d
   ```

4. On first setup, or if startup reports an uninitialized database, run:

   ```bash
   npm run database:setup
   ```

   Otherwise skip database setup.

5. Start the API and client in separate terminals:

   ```bash
   npm run start:server
   npm run start:client
   ```

6. When both processes are running, report the development URL: `https://localhost:4200/en`.

## Minimal-Check Rules

- Reuse existing running Docker services and terminals when possible.
- Do not run tests, linting, builds, migrations, health checks, or dependency reinstalls unless startup fails, the user requests them, or the requested change requires them.
- Do not overwrite `.env` or modify environment values automatically.
- Report actionable startup errors only. If a command fails because a prerequisite is missing, address that prerequisite and retry once.

## Variations

- For a server-only request, run only `npm run start:server`.
- For a client-only request, run only `npm run start:client`.
- The default client URL is `https://localhost:4200/en`. Follow the user's requested language if one is specified.
