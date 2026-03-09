
## Problem

The download buttons for different aspect ratios (1:1, 4:5, 9:16) all download the **same image**. Looking at the edge function:

```typescript
const finalImageVariants = {
  square_1_1: finalUrl,
  portrait_4_5: finalUrl,
  vertical_9_16: finalUrl,
};
```

All three variants point to the identical URL — no actual cropping happens.

---

## Solution: Client-Side Canvas Cropping

Implement canvas-based cropping on download click. When user clicks a ratio button:
1. Load the image into a canvas
2. Crop to the selected aspect ratio (center crop)
3. Trigger download of the cropped version

This approach is:
- Instant (no server round-trip)
- Free (no additional API credits)
- Works offline

---

## Implementation

### File: `src/pages/Editor.tsx`

**1. Add crop utility function:**
```typescript
async function cropAndDownload(
  imageUrl: string, 
  aspectRatio: number, 
  filename: string
): Promise<void> {
  // Load image, calculate center crop, render to canvas, download blob
}
```

**2. Update download buttons:**
Replace the `<a>` anchor tags with `<button>` elements that call `cropAndDownload()` with the appropriate ratio:
- 1:1 → ratio `1`
- 4:5 → ratio `0.8`  
- 9:16 → ratio `0.5625`

---

## Expected Result

Each download button produces a differently-cropped image:
- **Square (1:1)**: Center-cropped square
- **Portrait (4:5)**: Taller crop for Instagram feed
- **Vertical (9:16)**: Full-height crop for Stories/Reels
