async function debugSCM() {
    const apiKey = process.argv[2];
    if (!apiKey) {
        console.log("Please provide your SCM API Key.");
        return;
    }

    console.log("Searching for Kieran Crawford and 'AGE DEVELOPMENT' (Paging through members)...");

    try {
        // 1. Find Kieran's GUID (with pagination)
        let kieran = null;
        let page = 1;
        let hasMore = true;

        while (!kieran && hasMore) {
            const membersRes = await fetch(`https://api.swimclubmanager.co.uk/api/Members?page=${page}&pageSize=100`, {
                headers: { 'Authorization': apiKey, 'Accept': 'application/json' }
            });
            const membersData = await membersRes.json();
            const allMembers = membersData.members || [];
            
            if (allMembers.length === 0) {
                hasMore = false;
                break;
            }

            kieran = allMembers.find(m => 
                (m.firstname + " " + m.lastname).toLowerCase().includes("kieran crawford")
            );

            if (!kieran) {
                if (membersData.pagination && page >= membersData.pagination.totalPages) {
                    hasMore = false;
                } else {
                    page++;
                }
            }
        }

        if (!kieran) {
            console.log("Could not find Kieran Crawford in any member records.");
            return;
        }
        console.log(`Found Kieran on page ${page}! GUID: ${kieran.guid}`);

        // 2. Get the Group
        const groupRes = await fetch('https://api.swimclubmanager.co.uk/api/ClubGroups?page=1&pageSize=100', {
            headers: { 'Authorization': apiKey, 'Accept': 'application/json' }
        });
        const groupData = await groupRes.json();
        const groups = groupData.groups || [];
        const targetGroup = groups.find(g => (g.groupName || "").toUpperCase() === "AGE DEVELOPMENT");

        if (!targetGroup) {
            console.log("Could not find 'AGE DEVELOPMENT' group.");
            return;
        }

        // 3. Find Kieran in the group
        const groupMembers = targetGroup.members || [];
        const attendanceRecord = groupMembers.find(m => m.guid === kieran.guid);

        console.log("\n--- KIERAN CRAWFORD ATTENDANCE ---");
        console.log(`Squad: AGE DEVELOPMENT`);
        if (attendanceRecord) {
            console.log(`Last Attended: ${attendanceRecord.lastAttended}`);
            console.log(`Raw Record: ${JSON.stringify(attendanceRecord)}`);
        } else {
            console.log("Kieran is NOT listed as a member of this group.");
        }
        console.log("\n--- END ---");

    } catch (err) {
        console.error("Error:", err.message);
    }
}

debugSCM();
