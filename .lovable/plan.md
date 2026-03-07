
## Fix: copy_projects CHECK Constraint Still Blocking 'campaign' Saves

### What's Happening

The database constraint `copy_projects_module_check` currently only allows:

```
'email', 'blog', 'ad_copy', 'sms_push'
```

This has been verified directly in the live database right now. The migration was approved in the plan but never executed — the constraint change never landed. Every time "Save Campaign" is clicked, the insert of `module: 'campaign'` hits this constraint and is rejected.

There are no frontend code issues. `CampaignEngine.tsx` at line 202 correctly sends `module: 'campaign'`.

### Fix

One new migration file will be created:

```sql
-- Drop the old constraint
ALTER TABLE public.copy_projects
  DROP CONSTRAINT copy_projects_module_check;

-- Recreate it with 'campaign' included
ALTER TABLE public.copy_projects
  ADD CONSTRAINT copy_projects_module_check
  CHECK (module IN ('email', 'blog', 'ad_copy', 'sms_push', 'campaign'));

-- Notify PostgREST to reload its schema cache immediately
NOTIFY pgrst, 'reload schema';
```

The `NOTIFY pgrst, 'reload schema'` line is included to ensure PostgREST picks up the schema change immediately without any delay.

### No Frontend Changes Needed

The frontend code in `CampaignEngine.tsx` is already correct. `RecentDrafts.tsx` already renders campaign module entries. The `generate-copy` edge function already handles the `campaign` module path. Only the database constraint needs updating.

### What Changes

- `supabase/migrations/[timestamp]_fix_copy_projects_module_check.sql` — new migration file that drops and recreates the constraint

### Verification

After the migration runs, clicking "Save Campaign" will insert successfully into `copy_projects` with `module = 'campaign'` and the saved campaign will appear immediately in the Recent Drafts list.
