import { getServiceSupabase } from '../../lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { scmApiKey } = req.body;
  if (!scmApiKey) {
    return res.status(400).json({ error: 'Missing SCM API Key' });
  }

  try {
    const supabase = getServiceSupabase();
    
    // Helper function to fetch all paginated records
    const fetchAllPages = async (endpoint) => {
      let allRecords = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await fetch(`https://api.swimclubmanager.co.uk/api/${endpoint}?page=${page}`, {
          headers: {
            'Authorization': scmApiKey,
            'Accept': 'application/json'
          }
        });

        if (!response.ok) {
          if (page > 1) break; // Reached end of pagination silently
          throw new Error(`SCM API Error (${endpoint}): ${response.statusText}`);
        }

        const data = await response.json();
        
        // Extract array
        let items = [];
        if (Array.isArray(data)) items = data;
        else if (data && typeof data === 'object') {
          items = data.data || data.Members || data.members || data.ClubGroups || data.clubGroups || data.groups || [];
        }

        if (items.length === 0) {
          hasMore = false;
        } else {
          allRecords = allRecords.concat(items);
          // Check pagination object if it exists
          if (data.pagination && data.pagination.totalPages) {
            if (page >= data.pagination.totalPages) hasMore = false;
            else page++;
          } else {
            // No pagination data, assume single page
            hasMore = false;
          }
        }
      }
      return allRecords;
    };

    // 1. Fetch all members from SwimClubManager
    const membersData = await fetchAllPages('Members');

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

    if (squadsToInsert.length > 0) {
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
    }

    // 4. Upsert swimmers
    const swimmersToInsert = membersData
      .filter(m => m.asaNumber || m.SEANumber || m.seaNumber) // Swim England ID
      .map(member => {
        const firstName = member.firstname || member.firstName || member.FirstName || '';
        const lastName = member.lastname || member.lastName || member.LastName || '';
        const seaNumber = member.asaNumber || member.SEANumber || member.seaNumber;
        const memberGuidStr = member.guid ? member.guid.toString() : null;

        // Find primary squad: check all groups they belong to and pick the first one marked as a valid squad
        let primarySquadName = null;
        if (memberGuidStr && memberIdToSquadNames.has(memberGuidStr)) {
          const theirGroups = memberIdToSquadNames.get(memberGuidStr);
          primarySquadName = theirGroups.find(g => validSquadNames.has(g));
        }
        
        const squadId = primarySquadName ? dbSquadMap[primarySquadName] : null;

        return {
          member_id: seaNumber.toString(),
          full_name: `${firstName} ${lastName}`.trim(),
          squad_id: squadId,
          last_synced_scm: new Date().toISOString()
        };
      });

    // Deduplicate swimmers by member_id (SCM might have duplicate accounts or siblings sharing an ID)
    const uniqueSwimmersMap = new Map();
    swimmersToInsert.forEach(s => {
      // Keep the one with a squad assigned if there's a duplicate
      if (!uniqueSwimmersMap.has(s.member_id) || (s.squad_id && !uniqueSwimmersMap.get(s.member_id).squad_id)) {
        uniqueSwimmersMap.set(s.member_id, s);
      }
    });
    const finalSwimmersToInsert = Array.from(uniqueSwimmersMap.values());

    if (finalSwimmersToInsert.length === 0 && membersData.length > 0) {
      throw new Error(`Found ${membersData.length} records, but none had a recognizable SEANumber. Sample record keys: ${Object.keys(membersData[0]).join(', ')}`);
    }

    if (finalSwimmersToInsert.length > 0) {
      const { error: swimmerError } = await supabase
        .from('swimmers')
        .upsert(finalSwimmersToInsert, { onConflict: 'member_id' });

      if (swimmerError) {
        console.error('Swimmer upsert error:', swimmerError);
        throw new Error(`Swimmer DB Error: ${swimmerError.message}`);
      }
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
