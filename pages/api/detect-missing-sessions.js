import { getServiceSupabase } from '../../lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = getServiceSupabase();

    // 1. Fetch all active sessions to map out the expected day_of_week schedule
    const { data: sessions, error: sessionsError } = await supabase
      .from('sessions')
      .select('name, day_of_week')
      .eq('is_active', true);

    if (sessionsError) throw sessionsError;

    const daysOfWeekNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const activeDays = new Set();

    sessions.forEach(s => {
      const dbDay = (s.day_of_week || '').toLowerCase().trim();
      if (dbDay && daysOfWeekNames.includes(dbDay)) {
        activeDays.add(dbDay);
      }
      
      const nameLower = (s.name || '').toLowerCase();
      daysOfWeekNames.forEach(dn => {
        if (nameLower.includes(dn)) {
          activeDays.add(dn);
        }
      });
    });

    // 2. Fetch all date values from training_attendance for the last 365 days
    const oneYearAgo = new Date();
    oneYearAgo.setDate(oneYearAgo.getDate() - 365);
    const oneYearAgoStr = `${oneYearAgo.getFullYear()}-${String(oneYearAgo.getMonth() + 1).padStart(2, '0')}-${String(oneYearAgo.getDate()).padStart(2, '0')}`;

    const attendanceDatesSet = new Set();
    let hasMore = true;
    let page = 0;
    const pageSize = 1000;

    while (hasMore) {
      const { data: records, error: attendanceError } = await supabase
        .from('training_attendance')
        .select('date')
        .gte('date', oneYearAgoStr)
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (attendanceError) throw attendanceError;

      if (!records || records.length === 0) {
        hasMore = false;
      } else {
        records.forEach(r => {
          if (r.date) attendanceDatesSet.add(r.date);
        });
        if (records.length < pageSize) {
          hasMore = false;
        } else {
          page++;
        }
      }
    }

    // 3. Fetch all existing club_exemptions to avoid creating duplicates
    const { data: exemptions, error: exemptionsError } = await supabase
      .from('club_exemptions')
      .select('start_date, end_date');

    if (exemptionsError) throw exemptionsError;

    // Define standard UK bank holidays for the 2025 and 2026 seasons
    const ukBankHolidays = new Set([
      // 2025
      '2025-01-01', '2025-04-18', '2025-04-21', '2025-05-05', '2025-05-26', '2025-08-25', '2025-12-25', '2025-12-26',
      // 2026
      '2026-01-01', '2026-04-03', '2026-04-06', '2026-05-04', '2026-05-25', '2026-08-31', '2026-12-25', '2026-12-28'
    ]);

    const isDateExempted = (dateStr) => {
      if (ukBankHolidays.has(dateStr)) return true;
      return exemptions.some(ex => {
        return dateStr >= ex.start_date && dateStr <= ex.end_date;
      });
    };

    // 4. Generate list of dates for past 365 days (up to yesterday)
    const missingDates = [];

    for (let i = 365; i >= 1; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      
      const dayOfWeekIndex = d.getDay();
      const dayName = daysOfWeekNames[dayOfWeekIndex];

      // If active sessions are scheduled for this day of week, but zero attendance was recorded
      if (activeDays.has(dayName)) {
        if (!attendanceDatesSet.has(dateStr)) {
          missingDates.push(dateStr);
        }
      }
    }

    // 5. Filter out any missing days that already fall within existing club_exemptions
    const filteredMissingDates = missingDates.filter(dateStr => !isDateExempted(dateStr));

    // 6. Batch insert the newly identified missing days into club_exemptions
    let insertedCount = 0;
    const insertedDates = [...filteredMissingDates];

    if (filteredMissingDates.length > 0) {
      const payload = filteredMissingDates.map(dateStr => ({
        name: 'Auto-Detected Cancellation',
        start_date: dateStr,
        end_date: dateStr,
        type: 'credit'
      }));

      const { data: insertedData, error: insertError } = await supabase
        .from('club_exemptions')
        .insert(payload)
        .select();

      if (insertError) throw insertError;
      insertedCount = insertedData ? insertedData.length : payload.length;
    }

    return res.status(200).json({
      success: true,
      count: insertedCount,
      dates: insertedDates
    });

  } catch (error) {
    console.error('Detect Missing Sessions API Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
