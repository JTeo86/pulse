
## Fix: "Failed to save" on Campaign Save

### Root Cause

The `copy_projects` table has a `CHECK` constraint (`copy_projects_module_check`) that restricts the `module` column to only these values:

```
'email', 'blog', 'ad_copy', 'sms_push'
```

When the Campaign Engine calls `handleSave()`, it inserts `module: 'campaign'` — which is rejected by the database, producing the "Failed to save" toast.

This is confirmed directly in the Postgres logs:
> `new row for relation "copy_projects" violates check constraint "copy_projects_module_check"`

---

### Fix

**1 database migration** — drop the old constraint and recreate it with `'campaign'` added to the allowed list.

```sql
ALTER TABLE public.copy_projects
  DROP CONSTRAINT copy_projects_module_check;

ALTER TABLE public.copy_projects
  ADD CONSTRAINT copy_projects_module_check
  CHECK (module IN ('email', 'blog', 'ad_copy', 'sms_push', 'campaign'));
```

No frontend code changes are needed — `CampaignEngine.tsx` is already inserting the correct value (`module: 'campaign'`) and the save/output logic is sound.

---

### Verification

After the migration, clicking "Save Campaign" in the Campaign Engine will successfully insert into `copy_projects` and `copy_outputs`, and the campaign will appear in the Recent Drafts list.
