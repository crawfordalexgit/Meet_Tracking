/**
 * Unified Training Volume Model (Swim England + Vorontsov + FINA)
 * Used specifically for AI gap analysis and scientific referencing.
 */
export const UNIFIED_LTAD_STAGES = [
  {
    name: 'FUNdamentals',
    minAge: 5,
    maxAge: 8,
    poolHours: { min: 2, max: 4 },
    landHours: { min: 0, max: 1 },
    focus: ['Skill acquisition', 'Fun', 'Coordination'],
    description: 'Basic movement skills, fun, water confidence.'
  },
  {
    name: 'Learn to Train',
    minAge: 8,
    maxAge: 11,
    poolHours: { min: 4, max: 6 },
    landHours: { min: 1, max: 1 },
    focus: ['Technique', 'Aerobic foundation'],
    description: 'Technique, aerobic foundation, skill acquisition.'
  },
  {
    name: 'Train to Train (Early)',
    minAge: 11,
    maxAge: 13,
    poolHours: { min: 8, max: 12 },
    landHours: { min: 1, max: 2 },
    focus: ['Stroke development', 'Discipline'],
    description: 'Matches Swim England Junior Pathway. Aerobic development focus.'
  },
  {
    name: 'Train to Train (Late)',
    minAge: 13,
    maxAge: 15,
    poolHours: { min: 12, max: 16 },
    landHours: { min: 2, max: 3 },
    focus: ['Aerobic capacity', 'Race skills'],
    description: 'Vorontsov: major aerobic development window.'
  },
  {
    name: 'Train to Compete',
    minAge: 14,
    maxAge: 17,
    poolHours: { min: 14, max: 20 },
    landHours: { min: 2, max: 4 },
    focus: ['Event specific training', 'Race skills'],
    description: 'Event specific training, race skills, volume increase.'
  },
  {
    name: 'Train to Win',
    minAge: 17,
    maxAge: 99,
    poolHours: { min: 18, max: 25 },
    landHours: { min: 3, max: 5 },
    focus: ['High performance training', 'Double sessions'],
    description: 'High performance training, double sessions, peak performance.'
  }
];

/**
 * Returns the recommended LTAD stage based on age.
 * Note: If ages overlap, it leans towards the higher development stage.
 */
export function getUnifiedLTADStage(age) {
  // Find all matching stages
  const matches = UNIFIED_LTAD_STAGES.filter(s => age >= s.minAge && age <= s.maxAge);
  if (matches.length === 0) return UNIFIED_LTAD_STAGES[UNIFIED_LTAD_STAGES.length - 1];
  
  // Return the last match (highest stage) in case of overlap
  return matches[matches.length - 1];
}
