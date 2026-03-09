

## The Platform Admin Sidebar Tab Already Exists — Your Users Just Need Admin Access

The sidebar already has a "Platform Admin" nav item under a collapsible "Platform" section. It only renders when the logged-in user passes the `is_platform_admin()` check — which queries the `platform_admins` table. That table is currently **empty**, so no one can see it.

### What needs to happen

Insert your two selected accounts into the `platform_admins` table:

| email | user_id |
|---|---|
| jeanyves_teo@yahoo.com | `87600c90-a94b-4cd1-be80-dc7a24357c74` |
| j.teo@tribeholding.com | `78cfec4f-2cad-4162-b6fe-43ec24e2dfdd` |

This is a single data insert — no code or schema changes required. Once inserted, the "Platform" section with the "Platform Admin" link will appear at the bottom of the sidebar for these users.

