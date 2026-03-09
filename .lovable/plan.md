

## Design Fix: Snapshot Card Height Consistency

### Problem
The "View Insights / This Week" card appears smaller than the other three snapshot cards because:
- When `isLink={true}`, the value text uses `text-base` instead of `text-2xl`
- This reduces the content height, making the card visually shorter

### Solution
Ensure consistent card height by keeping the `text-2xl` sizing for all cards, only changing the color for link-style cards:

**File:** `src/pages/Home.tsx`

**Change (line 258):**
```tsx
// Before
<p className={`text-2xl font-bold ${isLink ? 'text-accent text-base' : ''}`}>

// After  
<p className={`text-2xl font-bold ${isLink ? 'text-accent' : ''}`}>
```

This removes `text-base` override while keeping the accent color styling, ensuring all four cards maintain identical heights.

