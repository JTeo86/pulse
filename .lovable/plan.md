

## Bulk Delete in Content Library

### What exists now
- `BrandLibrary.tsx` renders three tabs: Generated Images (content_assets), Reels (content_assets), and Raw Uploads (uploads table)
- Individual delete works via `useDeleteAsset` hook (deletes storage file + DB row) and `handleDeleteUpload` for legacy uploads
- `AssetCard` has no selection state -- cards are display-only with hover actions
- No bulk selection or bulk action UI exists anywhere

### Plan

**1. Add selection state to BrandLibraryPage**
- Add `selectedAssetIds: Set<string>` and `selectedUploadIds: Set<string>` state
- Add `selectionMode: boolean` state -- toggled by a "Select" button in the toolbar
- Add a "Select All" / "Deselect All" toggle per tab
- When `selectionMode` is active, show a checkbox overlay on each card (top-left corner)
- Show a sticky action bar at the bottom when items are selected: "{N} selected — Delete" with confirmation dialog

**2. Add `selected` + `onSelect` props to AssetCard**
- New props: `selected?: boolean`, `onSelect?: (asset: ContentAsset) => void`, `selectionMode?: boolean`
- When `selectionMode` is true, render a Checkbox in the top-right of the image area (always visible, not just on hover)
- Clicking the card in selection mode toggles selection instead of normal behavior

**3. Add `useBulkDeleteAssets` hook to `use-content-assets.ts`**
- Accepts an array of `ContentAsset` objects
- Deletes storage files in batch via `supabase.storage.from('venue-assets').remove([...paths])`
- Deletes DB rows via `supabase.from('content_assets').delete().in('id', [...ids])`
- Invalidates query cache on success
- Shows toast with count

**4. Bulk delete for Raw Uploads tab**
- Same selection pattern with checkboxes on upload cards
- Bulk delete: remove storage paths, then delete from `uploads` table using `.in('id', [...])`
- Update local `uploads` state

**5. Confirmation dialog**
- AlertDialog: "Delete {N} assets? This will permanently remove them and their files."
- Clear selection after successful delete

### Files to change
- `src/hooks/use-content-assets.ts` -- add `useBulkDeleteAssets` mutation
- `src/components/gallery/AssetCard.tsx` -- add selection checkbox props
- `src/pages/BrandLibrary.tsx` -- add selection state, toolbar, bulk action bar, and bulk upload delete logic

