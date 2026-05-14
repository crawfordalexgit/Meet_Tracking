
/**
 * Swim England LTAD (Long Term Athlete Development) Benchmarks
 * Source: Swim England Swimmer Pathway & LTAD Framework
 */
export const LTAD_STAGES = [
  {
    name: 'FUNdamentals',
    minAge: 5,
    maxAge: 9,
    focus: 'Fundamental Movement Skills',
    minHours: 1,
    maxHours: 3,
    description: 'Focus on fun, basic aquatic literacy, and multi-sport participation.',
    technicalPriorities: ['Streamlining', 'Body Position', 'Kick Consistency']
  },
  {
    name: 'SwimSkills (Learning to Train)',
    minAge: 9,
    maxAge: 12,
    focus: 'Technical Skill Acquisition',
    minHours: 3,
    maxHours: 6,
    description: 'The most important stage for developing fine motor control. Swimmers should race all strokes and distances.',
    technicalPriorities: ['Underwater Phase', 'Turns', 'Stroke Efficiency', 'IM Versatility']
  },
  {
    name: 'Training to Train',
    minAge: 12,
    maxAge: 15,
    focus: 'Aerobic Base & Engine Building',
    minHours: 7,
    maxHours: 14,
    description: 'Major focus on building aerobic capacity. Onset of Peak Height Velocity (PHV) occurs here.',
    technicalPriorities: ['Pacing', 'Aerobic Maintenance', 'Core Strength', 'Consistency']
  },
  {
    name: 'Training to Compete',
    minAge: 15,
    maxAge: 18,
    focus: 'Performance Optimization',
    minHours: 14,
    maxHours: 20,
    description: 'Specialization begins. High-intensity training and race-specific skills are prioritized.',
    technicalPriorities: ['Race Strategy', 'Starts/Finishes', 'Lactate Tolerance']
  },
  {
    name: 'Training to Win',
    minAge: 18,
    maxAge: 99,
    focus: 'Podium Performance',
    minHours: 20,
    maxHours: 28,
    description: 'World-class performance standards. Maximizing physical and mental attributes.',
    technicalPriorities: ['Marginal Gains', 'Mental Toughness', 'Peak Performance Timing']
  }
];

export function getLTADStage(age) {
  return LTAD_STAGES.find(s => age >= s.minAge && age <= s.maxAge) || LTAD_STAGES[LTAD_STAGES.length - 1];
}

export function analyzeWorkload(age, actualHours) {
  const stage = getLTADStage(age);
  if (actualHours < stage.minHours) return 'UNDERLOAD';
  if (actualHours > stage.maxHours) return 'OVERLOAD';
  return 'OPTIMAL';
}
