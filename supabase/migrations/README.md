# Supabase Migrations — Edvora

This directory contains SQL migration files for the Edvora database schema.

## Migration files

| File | Description |
|------|-------------|
| `00001_create_tables.sql` | All application tables, indexes, and updated_at triggers |
| `00002_enable_rls.sql` | Enables Row Level Security on all tables |
| `00003_rls_policies.sql` | RLS helper functions and all access policies |
| `00004_seed_teacher.sql` | Seeds the single teacher profile (run once after creating Auth user) |

## How to apply migrations

### Option A — Supabase Dashboard (recommended for setup)

1. Go to your Supabase project → **SQL Editor**
2. Paste the content of each migration file **in order** (00001 → 00002 → 00003 → 00004)
3. Run each one and confirm it completes without errors

### Option B — Supabase CLI (for local development)

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link your project
supabase link --project-ref <your-project-ref>

# Push migrations
supabase db push
```

## How to create a new migration

1. Create a new file: `000XX_description.sql`
2. Number it sequentially after the last migration
3. Write only additive/safe changes
4. Test in development before applying to production

## Important notes

- **Never edit applied migrations.** Create a new migration to fix mistakes.
- **Migrations are applied in filename order.** The `000XX_` prefix ensures correct ordering.
- **RLS is active on all tables.** The service role key (used in Server Actions) bypasses RLS. Never expose it in client code.
- **The teacher account must be created manually** via the Supabase Auth dashboard before running `00004_seed_teacher.sql`. See that file for instructions.

## Regenerating TypeScript types

After schema changes, regenerate `types/database.ts`:

```bash
npx supabase gen types typescript --project-id <your-project-ref> --schema public > types/database.ts
```
