/**
 * World Aquatics (WA) Points Utility
 * Formula: Points = 1000 * (BaseTime / SwimmerTime)^3
 */

const BASE_TIMES_2024 = {
  LCM: {
    M: {
      '50 Free': 20.91, '100 Free': 46.86, '200 Free': 102.00, '400 Free': 219.44, '800 Free': 452.12, '1500 Free': 871.02,
      '50 Back': 23.55, '100 Back': 51.60, '200 Back': 111.92,
      '50 Breast': 25.95, '100 Breast': 56.88, '200 Breast': 125.48,
      '50 Fly': 22.27, '100 Fly': 49.45, '200 Fly': 110.34,
      '200 IM': 114.00, '400 IM': 242.50
    },
    F: {
      '50 Free': 23.61, '100 Free': 51.71, '200 Free': 112.85, '400 Free': 235.38, '800 Free': 484.79, '1500 Free': 920.48,
      '50 Back': 26.86, '100 Back': 57.12, '200 Back': 123.14,
      '50 Breast': 29.16, '100 Breast': 64.13, '200 Breast': 137.55,
      '50 Fly': 24.43, '100 Fly': 55.48, '200 Fly': 121.81,
      '200 IM': 126.12, '400 IM': 265.87
    }
  },
  SCM: {
    M: {
      '50 Free': 20.16, '100 Free': 44.84, '200 Free': 99.37, '400 Free': 212.25, '800 Free': 440.46, '1500 Free': 846.88,
      '50 Back': 22.11, '100 Back': 48.33, '200 Back': 105.63,
      '50 Breast': 24.95, '100 Breast': 55.28, '200 Breast': 120.16,
      '50 Fly': 21.75, '100 Fly': 47.78, '200 Fly': 106.85,
      '100 IM': 49.28, '200 IM': 109.63, '400 IM': 234.81
    },
    F: {
      '50 Free': 22.93, '100 Free': 50.25, '200 Free': 110.31, '400 Free': 231.30, '800 Free': 477.42, '1500 Free': 908.24,
      '50 Back': 25.25, '100 Back': 54.89, '200 Back': 118.94,
      '50 Breast': 28.37, '100 Breast': 62.36, '200 Breast': 134.57,
      '50 Fly': 24.38, '100 Fly': 54.05, '200 Fly': 119.61,
      '100 IM': 56.51, '200 IM': 121.86, '400 IM': 258.94
    }
  }
};

/**
 * Converts a time string (M:SS.hh or SS.hh) to total seconds.
 */
export function timeToSeconds(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const parts = timeStr.trim().split(':');
  if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return parseFloat(parts[0]);
}

/**
 * Calculates WA points for a given performance.
 */
export function calculateWAPoints(time, event, gender, course) {
  const baseTable = BASE_TIMES_2024[course]?.[gender];
  if (!baseTable) return 0;
  
  // Normalize event name to match table keys (e.g. "100m Freestyle" -> "100 Free")
  let normalizedEvent = event.toLowerCase()
    .replace(/m\s+/i, ' ')
    .replace(/freestyle/i, 'Free')
    .replace(/breaststroke/i, 'Breast')
    .replace(/backstroke/i, 'Back')
    .replace(/butterfly|fly/i, 'Fly')
    .replace(/individual medley/i, 'IM')
    .replace(/\s+/g, ' ')
    .trim();

  // Convert to Title Case for key matching (e.g. "100 free" -> "100 Free")
  normalizedEvent = normalizedEvent.split(' ').map(word => {
    if (word.toUpperCase() === 'IM') return 'IM';
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(' ');

  const baseTime = baseTable[normalizedEvent];
  if (!baseTime) {
    // console.log(`WA Points: No base time for [${normalizedEvent}] (Original: ${event})`);
    return 0;
  }
  
  const seconds = typeof time === 'string' ? timeToSeconds(time) : time;
  if (!seconds || seconds <= 0) return 0;
  
  const points = 1000 * Math.pow(baseTime / seconds, 3);
  return Math.floor(points);
}

export { BASE_TIMES_2024 };
