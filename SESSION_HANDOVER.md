# CoachesEye Intelligence Engine - Session Handover

This document summarizes the current state and the plan for refining the Intelligence Engine and fixing reporting discrepancies.

## Current Issues Identified
1. **Database Schema**: `ai_reports` is missing the `meet_id` column.
2. **Name Mismatch**: UI comparisons fail between "Day, William" and "William Day".
3. **AI Model Typo**: `gemini-3.1-flash-lite` used instead of `gemini-1.5-flash`.
4. **Medal Detection**: William Day's 100m Fly Gold Medal was missed.
5. **WA Points**: Parents need an explanation of what these points represent.

## Required Action (Supabase SQL Editor)
Run this command to fix the reporting persistence:
```sql
ALTER TABLE ai_reports ADD COLUMN IF NOT EXISTS meet_id UUID REFERENCES meets(id) ON DELETE CASCADE;
```

## Implementation Plan for New Session

### 1. AI Engine Refinement
- Update `lib/ai_engine.js` to use `gemini-1.5-flash`.
- Update `lib/prompts/meet_audit.md` to be more aggressive with "1.", "2.", "3." detection in PDFs.
- Add an instruction to include a WA points explanation in the summary.

### 2. UI Fixes in `pages/meet/[id].js`
- Implement `normalizeName` to handle "Last, First" vs "First Last" formats.
- Add a tooltip or legend explaining WA points.
- Ensure medal badges are correctly rendered in the results table.

### 3. PDF Evidence Optimization
- Adjust `pages/api/ai/gala-engine-v2.js` to prioritize "Tonbridge" lines and podium markers more effectively.

---
**Prepared for the next session!**
