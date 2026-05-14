const fs = require('fs');
const path = require('path');

// Path to the captured content
const contentPath = 'C:\\Users\\alex\\.gemini\\antigravity\\brain\\9f07aadd-efd5-4973-a62b-7e0729e1ce8c\\.system_generated\\steps\\1435\\content.md';

function parseExemptions(text) {
  const exemptions = [];
  const lines = text.split('\n');
  
  // We are looking for lines like "Monday 4 May", "Saturday 1 August up to and including Friday 14 August"
  // And the subsequent lines for reason/squads.
  
  let currentEntry = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Look for date patterns: Day Date Month (e.g., Monday 4 May)
    // Or Date Month (e.g., 24 May)
    const dateRegex = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?\s*(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)(\s+\d{4})?/i;
    const rangeRegex = /^(Saturday|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday)\s+(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+up to and including\s+(Saturday|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday)\s+(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)(\s+\d{4})?/i;

    if (rangeRegex.test(line)) {
      const match = line.match(rangeRegex);
      currentEntry = {
        name: 'Shutdown',
        start_day: match[2],
        start_month: match[3],
        end_day: match[6],
        end_month: match[7],
        year: match[8] || '2025', // Default to 2025
        type: 'credit',
        squads: []
      };
      exemptions.push(currentEntry);
    } else if (dateRegex.test(line)) {
      const match = line.match(dateRegex);
      currentEntry = {
        name: 'Cancellation',
        day: match[2],
        month: match[3],
        year: match[4] || '2025',
        type: 'credit',
        squads: []
      };
      exemptions.push(currentEntry);
    } else if (currentEntry) {
      // Check for "NO TRAINING" or "CANCELLED"
      if (line.toUpperCase().includes('NO TRAINING') || line.toUpperCase().includes('CANCELLED')) {
        currentEntry.name = line.substring(0, 50); // Use part of the reason as name
      }
      
      // Check for squads
      // Simple heuristic: if line contains squad keywords
      const squadKeywords = ['Bronze', 'Silver', 'Gold', 'Masters', 'NAR', 'Age Development', 'Technical Development', 'LTS', 'Club 2'];
      squadKeywords.forEach(s => {
        if (line.toLowerCase().includes(s.toLowerCase())) {
          if (!currentEntry.squads.includes(s)) currentEntry.squads.push(s);
        }
      });
      
      // If we see a very long gap or another date, we'll reset currentEntry in the next loop
    }
  }
  
  return exemptions;
}

const text = fs.readFileSync(contentPath, 'utf8');
const results = parseExemptions(text);
console.log(JSON.stringify(results, null, 2));
