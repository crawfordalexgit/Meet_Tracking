const BASE_TIMES_2024 = {
  SCM: {
    M: {
      '50 Free': 20.16, '100 Free': 44.84, '200 Free': 99.37, '400 Free': 212.25, '800 Free': 440.46, '1500 Free': 846.88,
      '50 Back': 22.11, '100 Back': 48.33, '200 Back': 105.63,
      '50 Breast': 24.95, '100 Breast': 55.28, '200 Breast': 120.16,
      '50 Fly': 21.75, '100 Fly': 47.78, '200 Fly': 106.85,
      '100 IM': 49.28, '200 IM': 109.63, '400 IM': 234.81
    }
  }
};

function timeToSeconds(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.trim().split(':');
  if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return parseFloat(parts[0]);
}

function calculateWAPoints(time, event, gender) {
  const baseTable = BASE_TIMES_2024.SCM?.[gender];
  const baseTime = baseTable[event];
  if (!baseTime) return 0;
  const seconds = timeToSeconds(time);
  if (!seconds) return 0;
  return Math.floor(1000 * Math.pow(baseTime / seconds, 3));
}

const missingCountyMale = {
  '800 Free': { 11: '11:40.0', 12: '11:10.0', 13: '10:45.0', 14: '10:20.0', 15: '10:05.0', 16: '10:05.0', 17: '9:50.0' },
  '1500 Free': { 11: '21:49.3', 12: '21:30.7', 13: '20:13.1', 14: '18:55.2', 15: '18:09.7', 16: '18:09.7', 17: '17:50.1' },
  '200 Back': { 11: '3:02.0', 12: '2:50.0', 13: '2:42.0', 14: '2:35.0', 15: '2:28.0', 16: '2:28.0', 17: '2:28.0' },
  '200 Breast': { 11: '3:35.0', 12: '3:18.0', 13: '3:05.0', 14: '2:56.0', 15: '2:50.0', 16: '2:50.0', 17: '2:50.0' },
  '100 Fly': { 11: '1:30.0', 12: '1:22.0', 13: '1:16.0', 14: '1:10.0', 15: '1:08.0', 16: '1:08.0', 17: '1:08.0' },
  '200 Fly': { 11: '3:20.0', 12: '3:00.0', 13: '2:50.0', 14: '2:40.0', 15: '2:32.0', 16: '2:32.0', 17: '2:32.0' },
  '400 IM': { 11: '6:20.0', 12: '5:55.0', 13: '5:45.0', 14: '5:30.0', 15: '5:20.0', 16: '5:20.0', 17: '5:20.0' }
};

const result = {};
for (const event in missingCountyMale) {
  result[event] = { ages: {} };
  for (const age in missingCountyMale[event]) {
    const time = missingCountyMale[event][age];
    const pts = calculateWAPoints(time, event, 'M');
    result[event].ages[age] = { pts, time };
  }
}

console.log(JSON.stringify(result, null, 2));
