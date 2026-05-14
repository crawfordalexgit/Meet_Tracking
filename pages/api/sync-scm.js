import { getServiceSupabase } from '../../lib/supabase';
import { fetchScmNumericIds, scmLogin, fetchSwimmerSquadJoinDate, fetchSwimmerSessions } from '../../lib/scm-scraper';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { scmApiKey, returnOnly } = req.body;
  console.log('SCM SYNC REQUEST:', { hasApiKey: !!scmApiKey, returnOnly });

  if (!scmApiKey) {
    return res.status(400).json({ error: 'Missing SCM API Key' });
  }

  try {
    let supabase = null;
    if (returnOnly === true || returnOnly === 'true') {
       console.log('SCM SYNC: Running in returnOnly mode (Bypassing DB)');
    } else {
       try {
         supabase = getServiceSupabase();
       } catch (e) {
         console.warn("Supabase initialization failed, but continuing for safety check.");
       }
    }
    
    // Helper function to fetch all paginated records with a small delay
    const fetchAllPages = async (endpoint) => {
      let allRecords = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        console.log(`SCM SYNC: Fetching ${endpoint} (Page ${page})...`);
        const response = await fetch(`https://api.swimclubmanager.co.uk/api/${endpoint}?page=${page}`, {
          headers: {
            'Authorization': scmApiKey,
            'Accept': 'application/json'
          }
        });

        if (!response.ok) {
          if (page > 1) break;
          throw new Error(`SCM API Error (${endpoint}): ${response.statusText}`);
        }

        const data = await response.json();
        let items = [];
        if (Array.isArray(data)) items = data;
        else if (data && typeof data === 'object') {
          items = data.data || data.Members || data.members || data.ClubGroups || data.clubGroups || data.groups || data.ClubSessions || data.clubSessions || data.sessions || data.Sessions || [];
        }

        if (items.length === 0) {
          hasMore = false;
        } else {
          allRecords = allRecords.concat(items);
          console.log(`SCM SYNC: Progress: ${allRecords.length} ${endpoint} items gathered.`);
          
          if (data.pagination && data.pagination.totalPages) {
            if (page >= data.pagination.totalPages) hasMore = false;
            else {
              page++;
              await new Promise(r => setTimeout(r, 100)); // Small 100ms breather
            }
          } else {
            hasMore = false;
          }
        }
      }
      return allRecords;
    };

    // 1. Fetch all members from SwimClubManager
    const membersData = await fetchAllPages('Members');
    console.log(`SCM SYNC: Fetched ${membersData.length} members from SCM.`);

    if (membersData.length === 0) {
      throw new Error('SCM API returned 0 members or unexpected format.');
    }

    // 2. Fetch all ClubGroups from SwimClubManager to map squads
    const groupsData = await fetchAllPages('ClubGroups');

    if (!Array.isArray(groupsData) || (groupsData.length > 0 && !groupsData[0].name && !groupsData[0].Name && !groupsData[0].groupName)) {
      const sampleKeys = groupsData && groupsData.length > 0 ? Object.keys(groupsData[0]).join(', ') : 'unknown';
      throw new Error(`Need ClubGroups structure. Sample keys: ${sampleKeys}`);
    }

    // Extract unique squads and map member IDs to their squad name
    const squadsMap = new Map();
    const memberIdToSquadNames = new Map();

    groupsData.forEach(group => {
      const groupName = group.Name || group.name || group.groupName;
      if (groupName) {
        squadsMap.set(groupName, groupName);
        
        // Find members in this group
        const groupMembers = group.Members || group.members || group.swimmers || [];
        groupMembers.forEach(m => {
          // m could be an ID, or an object with an ID
          const mId = typeof m === 'object' ? (m.guid || m.id || m.memberID || m.memberId) : m;
          if (mId) {
            const mIdStr = mId.toString();
            if (!memberIdToSquadNames.has(mIdStr)) memberIdToSquadNames.set(mIdStr, []);
            memberIdToSquadNames.get(mIdStr).push(groupName);
          }
        });
      }
    });

    // 3. Upsert squads to DB
    const squadsToInsert = Array.from(squadsMap.values()).map(name => ({ name }));
    const dbSquadMap = {};
    const validSquadNames = new Set();

    if (squadsToInsert.length > 0 && supabase) {
      const { error: squadError } = await supabase
        .from('squads')
        .upsert(squadsToInsert, { onConflict: 'name' });

      if (squadError) {
        console.error('Squad upsert error:', squadError);
        throw new Error(`Squad DB Error: ${squadError.message}`);
      }

      // Fetch all squads to get their IDs and is_squad status
      const { data: dbSquads, error: fetchError } = await supabase
        .from('squads')
        .select('id, name, is_squad');
        
      if (fetchError) throw fetchError;

      if (dbSquads) {
        dbSquads.forEach(s => {
          dbSquadMap[s.name] = s.id;
          if (s.is_squad) validSquadNames.add(s.name);
        });
      }
    } else if (squadsToInsert.length > 0) {
      // In returnOnly mode, we don't have DB IDs yet, so we'll return the names for the client to handle
      squadsToInsert.forEach(s => dbSquadMap[s.name] = s.name); 
      // Assume all are squads for mapping purposes if we can't check
      squadsToInsert.forEach(s => validSquadNames.add(s.name));
    }

    // 3b. Fetch and sync Sessions (for attendance mapping later)
    console.log("SCM SYNC: Attempting to fetch ClubSessions...");
    const sessionsData = await fetchAllPages('ClubSessions');
    console.log(`SCM SYNC: Fetched ${sessionsData.length} raw session records.`);

    let sessionsToUpsert = [];
    if (sessionsData.length > 0) {
      sessionsToUpsert = sessionsData.map(s => {
        const guid = s.guid || s.Guid || s.id || s.Id || s.sessionID || s.SessionID;
        const name = s.name || s.Name || s.sessionName || s.SessionName;
        
        if (!guid || !name) {
          console.warn("SCM SYNC: Skipping session with missing ID/Name:", JSON.stringify(s).substring(0, 100));
          return null;
        }

        return {
          scm_guid: guid.toString(),
          name: name.trim(),
          day_of_week: s.dayOfWeek || s.DayOfWeek || s.day || '',
          start_time: s.startTime || s.StartTime || s.start || '',
          end_time: s.endTime || s.EndTime || s.end || '',
          location: s.location || s.Location || s.venue || '',
          is_active: s.active === 'Yes' || s.Active === 'Yes' || s.isActive !== false
        };
      }).filter(Boolean);

      console.log(`SCM SYNC: Prepared ${sessionsToUpsert.length} sessions for DB.`);

      if (sessionsToUpsert.length > 0 && supabase) {
        const { error: sessionError } = await supabase
          .from('sessions')
          .upsert(sessionsToUpsert, { onConflict: 'scm_guid' });

        if (sessionError) {
          console.error('SCM SYNC: Session DB Error:', sessionError);
        } else {
          console.log(`SCM SYNC: Successfully synced ${sessionsToUpsert.length} sessions to DB.`);
        }
      }
    } else {
      console.warn("SCM SYNC: No sessions returned from ClubSessions endpoint. Check API permissions.");
    }

    // 4. Fetch existing swimmers to check for squad moves
    let existingSwimmers = [];
    if (supabase) {
      const { data } = await supabase
        .from('swimmers')
        .select('member_id, squad_id, squad_join_date');
      existingSwimmers = data || [];
    }
    
    const existingMap = new Map();
    if (existingSwimmers) {
      existingSwimmers.forEach(s => existingMap.set(s.member_id, s));
    }

    // 5. Process swimmers
    const swimmersToInsert = membersData
      .filter(m => {
        const hasId = m.membershipNumber || m.asaNumber || m.SEANumber || m.seaNumber;
        const isActive = (m.active === 'Yes' || m.Active === 'Yes' || m.isMember === true);
        return hasId && isActive;
      })
      .map(member => {
        const firstName = member.firstname || member.firstName || member.FirstName || '';
        const lastName = member.lastname || member.lastName || member.LastName || '';
        const seaNumber = member.membershipNumber || member.asaNumber || member.SEANumber || member.seaNumber;
        const memberGuidStr = member.guid ? member.guid.toString() : null;

        let primarySquadName = null;
        if (memberGuidStr && memberIdToSquadNames.has(memberGuidStr)) {
          const theirGroups = memberIdToSquadNames.get(memberGuidStr);
          primarySquadName = theirGroups.find(g => validSquadNames.has(g));
        }
        
        const squadId = primarySquadName ? dbSquadMap[primarySquadName] : null;
        const mId = seaNumber.toString();
        const existing = existingMap.get(mId);

        // Default to existing date or null if new (reliability logic will default to period start)
        let joinDate = existing ? existing.squad_join_date : null;
        
        // If squad changed, we'll mark this swimmer as needing a "join date scrape"
        // But for now, we'll keep the current date to avoid data loss until the scrape finishes
        if (existing && existing.squad_id !== squadId) {
          console.log(`MOVE DETECTED: ${firstName} ${lastName} moved to ${primarySquadName || 'Unassigned'}.`);
        }

        return {
          member_id: mId,
          full_name: `${firstName} ${lastName}`.trim(),
          squad_id: squadId,
          squad_join_date: joinDate,
          year_of_birth: member.dob ? parseInt(member.dob.substring(0, 4)) : null,
          gender: member.competitionGender || member.gender || null,
          last_synced_scm: new Date().toISOString()
        };
      });

    // Deduplicate swimmers
    const uniqueSwimmersMap = new Map();
    swimmersToInsert.forEach(s => {
      if (!uniqueSwimmersMap.has(s.member_id) || (s.squad_id && !uniqueSwimmersMap.get(s.member_id).squad_id)) {
        uniqueSwimmersMap.set(s.member_id, s);
      }
    });
    const finalSwimmersToInsert = Array.from(uniqueSwimmersMap.values());
    console.log(`SCM SYNC: ${finalSwimmersToInsert.length} swimmers passed the active filter.`);

    if (finalSwimmersToInsert.length > 0 && supabase) {
      const { error: swimmerError } = await supabase
        .from('swimmers')
        .upsert(finalSwimmersToInsert, { onConflict: 'member_id' });

      if (swimmerError) {
        console.error('Swimmer upsert error:', swimmerError);
        throw new Error(`Swimmer DB Error: ${swimmerError.message}`);
      }

      // 5. Cleanup: Delete swimmers from DB who are no longer active/present in SCM
      const activeMemberIds = finalSwimmersToInsert.map(s => s.member_id);
      if (activeMemberIds.length > 0) {
        // Fetch all current IDs to find which ones to delete
        const { data: allCurrentSwimmers } = await supabase.from('swimmers').select('member_id');
        if (allCurrentSwimmers) {
          const activeIdsSet = new Set(activeMemberIds);
          const idsToDelete = allCurrentSwimmers
            .map(s => s.member_id)
            .filter(id => !activeIdsSet.has(id));

          if (idsToDelete.length > 0) {
            console.log(`Cleaning up ${idsToDelete.length} inactive swimmers...`);
            await supabase.from('swimmers').delete().in('member_id', idsToDelete);
          }
        }
      }
    } // CLOSE if (supabase) block for swimmer upsert

    // 6. Map SCM Web Numeric IDs and verify Join Dates
    // Skip these for returnOnly mode as they are too complex for client-side batching
    if (supabase && process.env.SCM_WEB_USERNAME && process.env.SCM_WEB_PASSWORD) {
      try {
        console.log("SCM SYNC: Starting web portal tasks (Numeric IDs & Join Dates)...");
        const cookies = await scmLogin(process.env.SCM_WEB_USERNAME, process.env.SCM_WEB_PASSWORD);
        
        // A. Numeric ID Mapping
        const { data: swimmersMissingIds } = await supabase
          .from('swimmers')
          .select('member_id')
          .is('scm_numeric_id', null);

        if (swimmersMissingIds && swimmersMissingIds.length > 0) {
          console.log(`Found ${swimmersMissingIds.length} swimmers missing scm_numeric_id.`);
          const mappings = await fetchScmNumericIds(process.env.SCM_WEB_USERNAME, process.env.SCM_WEB_PASSWORD);
          
          if (mappings.length > 0) {
            for (const mapping of mappings) {
              let matchQuery = supabase.from('swimmers').update({ scm_numeric_id: mapping.numericId });
              if (mapping.memberId) matchQuery = matchQuery.eq('member_id', mapping.memberId);
              else if (mapping.fullName) matchQuery = matchQuery.eq('full_name', mapping.fullName).is('scm_numeric_id', null);
              else continue;
              await matchQuery;
            }
          }
        }

        // B. Join Date Verification (only for those who have numeric IDs now)
        const { data: swimmersToVerify } = await supabase
          .from('swimmers')
          .select('id, full_name, scm_numeric_id, squad_id, squads(name)')
          .not('scm_numeric_id', 'is', null);

        if (swimmersToVerify && swimmersToVerify.length > 0) {
          console.log(`Verifying join dates and session memberships for ${swimmersToVerify.length} swimmers...`);
          
          // Fetch all sessions to map names to IDs
          const { data: dbSessions } = await supabase.from('sessions').select('id, name');
          const sessionNameToId = {};
          if (dbSessions) dbSessions.forEach(s => sessionNameToId[s.name.trim()] = s.id);

          for (const swimmer of swimmersToVerify) {
            // A. Join Date Verification
            const squadName = swimmer.squads?.name;
            if (squadName) {
              try {
                const realDate = await fetchSwimmerSquadJoinDate(swimmer.scm_numeric_id, squadName, cookies);
                if (realDate) {
                  await supabase.from('swimmers').update({ squad_join_date: realDate }).eq('id', swimmer.id);
                }
              } catch (err) {
                console.error(`Failed to verify join date for ${swimmer.full_name}:`, err.message);
              }
            }

            // B. Session Membership Sync
            try {
              const officialSessions = await fetchSwimmerSessions(swimmer.scm_numeric_id, cookies);
              if (officialSessions && officialSessions.length > 0) {
                const memberships = officialSessions
                  .map(name => ({
                    swimmer_id: swimmer.id,
                    session_id: sessionNameToId[name]
                  }))
                  .filter(m => m.session_id); // Only those we have in our DB

                if (memberships.length > 0) {
                  // Delete old memberships and insert new ones
                  await supabase.from('session_memberships').delete().eq('swimmer_id', swimmer.id);
                  await supabase.from('session_memberships').insert(memberships);
                }
              }
            } catch (err) {
              console.error(`Failed to sync sessions for ${swimmer.full_name}:`, err.message);
            }
          }
        }
      } catch (scrapeErr) {
        console.error("SCM Portal Tasks failed (non-fatal):", scrapeErr.message);
      }
    }

    if (returnOnly === true || returnOnly === 'true') {
      return res.status(200).json({
        success: true,
        message: `Scraped ${finalSwimmersToInsert.length} members and ${squadsToInsert.length} squads from SCM. Data ready for local save.`,
        data: {
          squads: squadsToInsert,
          sessions: sessionsToUpsert,
          swimmers: finalSwimmersToInsert,
          memberships: []
        }
      });
    }

    return res.status(200).json({ 
      success: true, 
      message: `Synced ${finalSwimmersToInsert.length} swimmers, ${squadsToInsert.length} squads. Valid competitive squads found: ${validSquadNames.size}.` 
    });
  } catch (error) {
    console.error('SCM Sync Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
