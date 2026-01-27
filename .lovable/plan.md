
# Fix: Enable Opening Saved Drafts in Copywriter

## Problem Summary
Drafts in the Copywriter module are displayed in the "Recent Drafts" section but cannot be clicked to view their generated content. The implementation is missing:
1. A click handler on draft items
2. The ability to fetch saved `copy_outputs` from the database
3. The capability for `CopyWizard` to load an existing project

---

## Implementation Plan

### Step 1: Update RecentDrafts Component
**File:** `src/components/copywriter/RecentDrafts.tsx`

Add an `onSelectProject` callback prop and make each draft item clickable:

- Add a new prop: `onSelectProject: (project: CopyProject) => void`
- Add a cursor pointer and click handler to each draft item
- The click will pass the selected project back to the parent

---

### Step 2: Update Copywriter Page to Handle Draft Selection
**File:** `src/pages/Copywriter.tsx`

Add state to track a selected existing project and pass it to the wizard:

- Add state: `selectedProject` to hold the clicked draft
- Pass `onSelectProject` handler to `RecentDrafts`
- Pass `selectedProject` to `CopywriterModule` for loading

---

### Step 3: Update CopywriterModule to Support Opening Existing Projects
**File:** `src/components/copywriter/CopywriterModule.tsx`

Modify to accept an existing project and open the wizard pre-populated:

- Add prop: `existingProject?: CopyProject`
- When `existingProject` changes, auto-open the wizard for that module
- Pass the project to `CopyWizard`

---

### Step 4: Extend CopyWizard to Load Existing Outputs
**File:** `src/components/copywriter/CopyWizard.tsx`

This is the key change - enable loading saved drafts:

- Add optional prop: `existingProject?: CopyProject`
- When provided:
  - Pre-populate goal, inputs (key message, CTA, tone, etc.)
  - Fetch `copy_outputs` from database where `project_id = existingProject.id`
  - Start at Step 3 (Review & Refine) with variations loaded
- Add loading state while fetching outputs
- If no outputs exist, show empty state with option to regenerate

---

### Step 5: Create Data Fetching Logic
**File:** `src/components/copywriter/CopyWizard.tsx`

Add a `useEffect` to load existing outputs:

```text
When existingProject is provided:
  1. Set form state from existingProject.inputs
  2. Set selectedGoal from existingProject.goal
  3. Fetch copy_outputs WHERE project_id = existingProject.id ORDER BY version
  4. Map outputs to variations array
  5. Jump to step 3
```

---

## Technical Details

### Interface Updates

**CopyProject interface** (already exists in RecentDrafts):
```
interface CopyProject {
  id: string;
  module: string;
  goal: string;
  inputs: Record<string, any>;
  created_at: string;
}
```

**CopyWizardProps** (to be extended):
```
interface CopyWizardProps {
  module: CopyModule;
  onClose: () => void;
  onProjectSaved: () => void;
  existingProject?: CopyProject;  // NEW
}
```

### Database Query for Loading Outputs
```
SELECT id, version, title, content, created_at
FROM copy_outputs
WHERE project_id = :projectId
ORDER BY version ASC
```

---

## Component Flow Diagram

```text
User clicks draft in RecentDrafts
        |
        v
RecentDrafts calls onSelectProject(project)
        |
        v
Copywriter page sets selectedProject state
        |
        v
CopywriterModule receives existingProject prop
        |
        v
CopyWizard opens with existingProject
        |
        v
CopyWizard fetches copy_outputs from database
        |
        v
User sees Step 3 with saved variations
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/copywriter/RecentDrafts.tsx` | Add `onSelectProject` prop and click handlers |
| `src/pages/Copywriter.tsx` | Add selected project state and handler |
| `src/components/copywriter/CopywriterModule.tsx` | Accept and forward existing project |
| `src/components/copywriter/CopyWizard.tsx` | Load existing project data and outputs |

---

## Edge Cases Handled

1. **Draft with no saved outputs**: Show message "No saved outputs found. Regenerate?"
2. **Loading state**: Show spinner while fetching outputs
3. **Error handling**: Toast notification if fetching fails
4. **Closing modal**: Clear selected project state

---

## What Stays Unchanged

- Database schema (copy_projects, copy_outputs)
- Edge functions (generate-copy, refine-copy)
- Save functionality
- Module cards for creating new copy
- Delete functionality in RecentDrafts
