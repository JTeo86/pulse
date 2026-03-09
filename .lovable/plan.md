

## Problem Analysis

The realism mode (`safe`, `enhanced`, `editorial`) is currently injected as a single line near the end of the prompt:
```
MODE: Minimal changes. Only improve lighting and white balance...
```

Meanwhile, the main **LIGHTING** instruction is static for all modes:
```
LIGHTING:
Soft cinematic lighting, shallow depth of field, premium professional food photography.
```

This creates conflicting signals — the static lighting block overrides the mode-specific instruction, causing the AI to produce similar outputs regardless of mode selection.

---

## Solution: Integrate Mode Into Core Prompt Sections

Refactor `buildPrompt()` to make the realism mode influence multiple sections of the prompt directly:

### 1. Dynamic LIGHTING Section
Replace the static lighting block with mode-aware instructions:

| Mode | Lighting Instruction |
|------|---------------------|
| **safe** | "Preserve original lighting characteristics. Only correct white balance and minor exposure issues. Shallow depth-of-field optional." |
| **enhanced** | "Professional soft lighting with gentle shadows. Moderate depth-of-field to separate dish from background. Natural restaurant ambiance." |
| **editorial** | "Cinematic dramatic lighting with pronounced shadows and highlights. Strong shallow depth-of-field with creamy bokeh. Magazine-quality polish." |

### 2. Dynamic BACKGROUND Section  
Add mode-specific intensity to background generation:

| Mode | Background Behavior |
|------|---------------------|
| **safe** | "Keep background minimal and neutral. Avoid dramatic changes." |
| **enhanced** | "Refine background with natural restaurant details. Subtle enhancement." |
| **editorial** | "Create a rich, cinematic restaurant scene with atmospheric depth and premium textures." |

### 3. Remove Conflicting Static Text
Remove the standalone `MODE:` line and instead embed mode context throughout the prompt naturally.

---

## Files to Change

| File | Change |
|------|--------|
| `supabase/functions/editor-generate-pro-photo/index.ts` | Refactor `buildPrompt()` to use mode-specific lighting/background/polish sections |

---

## Expected Outcome

After this change:
- **Safe mode**: Subtle touch-ups, original scene largely preserved
- **Enhanced mode**: Noticeable professional polish, refined background
- **Editorial mode**: Dramatic cinematic look with strong styling

Each mode will produce visibly different outputs when tested with the same source image.

