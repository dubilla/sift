# Data Migrations

This directory contains data migrations that are separate from schema migrations.

## Running Data Migrations

Data migrations should be run **after** schema migrations in each deployment step.

### Step 2: Copy id to externalId

```bash
tsx db/data-migrations/002-copy-id-to-external-id.ts
```

This copies all existing `id` values to the new `externalId` column.

## Why Separate Data Migrations?

Schema migrations (managed by Drizzle) handle structural changes to the database.
Data migrations handle transforming or copying existing data.

Keeping them separate provides:
- Clear separation of concerns
- Easier testing and rollback
- Explicit control over data transformations
- No conflicts with Drizzle's migration system
