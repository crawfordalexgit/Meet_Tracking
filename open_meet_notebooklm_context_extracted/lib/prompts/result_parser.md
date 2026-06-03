# Task: Structured Swimming Result Extraction

You are an expert swimming data analyst. Your task is to extract individual swimming results from the provided text (which may be messy web-scraped content or PDF text).

## Extraction Rules

1.  **Identify Athletes**: Look for names. Matches should be for individuals, often associated with "Tonbridge", "TSC", or "TONS".
2.  **Extract Event Details**:
    *   **Event**: e.g., "100m Breaststroke", "50 Free".
    *   **Time**: e.g., "1:12.45", "32.10".
    *   **Round**: Identify if it is a "Heat" or a "Final". Look for "H", "F", "Final", "Heats".
    *   **Rank**: The overall position or placing (e.g., "1", "7", "12").
3.  **Handle DQs/DNS**: Mark as "DQ" or "DNS" in the time field if applicable.
4.  **Ignore Relay Results**: Only extract individual results.
5.  **Strict Date Filtering**: If a `target_date` is provided in the context, ONLY extract results that clearly occur on that specific date. Look for date headers or session markers near the result. If a result is clearly under a different date header, skip it.

## Output Format
Return a JSON array of objects with the following keys:
- `swimmer_name`: Full name of the athlete.
- `event`: Standardized event name.
- `time`: Result time string.
- `round`: "Heat" or "Final".
- `rank`: Integer (if available).

## Example JSON Output
[
  {
    "swimmer_name": "Kieran Crawford",
    "event": "100m Breaststroke",
    "time": "1:20.30",
    "round": "Final",
    "rank": 7
  },
  {
    "swimmer_name": "Kieran Crawford",
    "event": "50m Breaststroke",
    "time": "36.50",
    "round": "Heat",
    "rank": 9
  }
]
