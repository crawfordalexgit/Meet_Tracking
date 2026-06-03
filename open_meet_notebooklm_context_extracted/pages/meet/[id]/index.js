import { useRouter } from 'next/router';
import { useEffect, useState, useMemo } from 'react';
import Layout from '../../../components/Layout';
import PremiumOrb from '../../../components/PremiumOrb';
import { supabase } from '../../../lib/supabase';
import Link from 'next/link';
import Head from 'next/head';
import { normalizeName, normalizeEvent, getCategoryBenchmark, timeToSeconds, getPreferredName } from '../../../lib/analytics-utils';

export default function MeetReport({ session }) {
  const router = useRouter();
  const { id } = router.query;
  
  const [loading, setLoading] = useState(true);
  const [meet, setMeet] = useState(null);
  const [results, setResults] = useState([]);
  const [pbs, setPbs] = useState([]);
  const [insight, setInsight] = useState(null);
  const [generatingInsight, setGeneratingInsight] = useState(false);
  
  const [parsingPdf, setParsingPdf] = useState(false);
  const [pdfText, setPdfText] = useState(null);
  const [staffText, setStaffText] = useState(null);
  const [staffNotes, setStaffNotes] = useState([]); // Array of { id, text, date }
  const [newNote, setNewNote] = useState("");
  const [parsingStaff, setParsingStaff] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null); // 'success' | 'error'
  const [errorMessage, setErrorMessage] = useState("");
  const [showManualStaff, setShowManualStaff] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [correction, setCorrection] = useState("");
  const [applyingCorrection, setApplyingCorrection] = useState(false);
  const [squadBaselines, setSquadBaselines] = useState({});
  const [activeIngestionTab, setActiveIngestionTab] = useState('results');
  const [resultsUrl, setResultsUrl] = useState('');
  const [scrapingUrl, setScrapingUrl] = useState(false);
  const [showIngestion, setShowIngestion] = useState(false);
  const [scrapingProgress, setScrapingProgress] = useState(0);
  const [scrapingStatus, setScrapingStatus] = useState('');
  
  useEffect(() => {
    if (id && session) {
      fetchMeetData();
    }
  }, [id, session]);

  const fetchMeetData = async () => {
    setLoading(true);
    try {
      const { data: meetData } = await supabase.from('meets').select('*, children:meets(id, name, pdf_text, staff_text)').eq('id', id).single();
      setMeet(meetData);
      
      // Load existing PDF evidence and staff context
      let combinedPdf = meetData?.pdf_text || "";
      let combinedStaff = meetData?.staff_text || "";
      
      // Aggregate from children if any
      if (meetData?.children?.length > 0) {
        meetData.children.forEach(child => {
          if (child.pdf_text) combinedPdf += `\n--- SOURCE: ${child.name} ---\n${child.pdf_text}`;
          if (child.staff_text) combinedStaff += `\n--- SOURCE: ${child.name} ---\n${child.staff_text}`;
        });
      }

      setPdfText(combinedPdf || null);
      setStaffText(combinedStaff || "");
      
      // Try to parse notes from staffText
      try {
        if (combinedStaff.startsWith('[') && combinedStaff.endsWith(']')) {
          setStaffNotes(JSON.parse(combinedStaff));
        } else if (combinedStaff.trim()) {
          // Legacy support: convert single block to first note
          setStaffNotes([{ id: Date.now(), text: combinedStaff, date: new Date().toISOString() }]);
        } else {
          setStaffNotes([]);
        }
      } catch (e) {
        setStaffNotes([{ id: Date.now(), text: combinedStaff, date: new Date().toISOString() }]);
      }

      if (combinedPdf) setUploadStatus('success');

      if (meetData?.results_url) {
        setResultsUrl(meetData.results_url);
      }

      // Fetch results for this meet and all children
      const meetIds = [id, ...(meetData?.children?.map(c => c.id) || [])];
      
      const { data: resultsData } = await supabase
        .from('results')
        .select('*, swimmers(id, full_name, known_as, squad_id, year_of_birth, gender, squads(name)), meets(name)')
        .in('meet_id', meetIds);
      setResults(resultsData || []);

      const swimmerIds = [...new Set((resultsData || []).map(r => r.swimmer_id))];
      if (swimmerIds.length > 0) {
        const { data: pbsData } = await supabase.from('swimmer_pbs').select('*').in('swimmer_id', swimmerIds);
        setPbs(pbsData || []);
      }

      const { data: existingInsight } = await supabase
        .from('ai_reports')
        .select('*')
        .eq('meet_id', id)
        .eq('type', 'meet_audit')
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (existingInsight?.length > 0) {
        setInsight(existingInsight[0].content);
      }
    } catch (error) {
      console.error('Error fetching meet report:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (results.length > 0) {
      fetchSquadBaselines();
    }
  }, [results]);

  const fetchSquadBaselines = async () => {
    const squadIds = [...new Set(results.map(r => r.swimmers?.squad_id).filter(Boolean))];
    if (squadIds.length === 0) return;

    try {
      const currentYear = new Date().getFullYear();
      
      const { data: baselineData } = await supabase
        .from('results')
        .select('wa_pts, swimmers(squad_id), meets!inner(date)')
        .in('swimmers.squad_id', squadIds)
        .gte('meets.date', `${currentYear}-01-01`);

      if (baselineData) {
        const baselines = {};
        baselineData.forEach(r => {
          const sId = r.swimmers?.squad_id;
          if (!baselines[sId]) baselines[sId] = { total: 0, count: 0 };
          baselines[sId].total += (r.wa_pts || 0);
          baselines[sId].count++;
        });

        const computed = {};
        Object.entries(baselines).forEach(([sId, b]) => {
          computed[sId] = Math.round(b.total / b.count);
        });
        setSquadBaselines(computed);
      }
    } catch (err) {
      console.error("Error fetching squad baselines:", err);
    }
  };

  const handlePdfUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setParsingPdf(true);
    setUploadStatus(null);
    setErrorMessage("");
    const formData = new FormData();
    formData.append('file', file);
    formData.append('meetId', id); // Pass meetId to the server for persistence

    try {
      const res = await fetch('/api/parse-pdf', {
        method: 'POST',
        body: formData
      });

      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const data = await res.json();
        if (data.text) {
          setPdfText(data.text);
          setUploadStatus('success');
          console.log("PDF evidence received and saved by server.");
        } else {
          setUploadStatus('error');
          setErrorMessage(data.error || "Could not extract data");
        }
      } else {
        const text = await res.text();
        console.error("Non-JSON Server Response:", text);
        setUploadStatus('error');
        setErrorMessage("Server error (Check console)");
      }
    } catch (err) {
      console.error("PDF Upload Error:", err);
      setUploadStatus('error');
      setErrorMessage("Network error or connection lost");
    } finally {
      setParsingPdf(false);
    }
  };

  const handleUrlScrape = async () => {
    if (!resultsUrl) return;
    setScrapingUrl(true);
    setScrapingProgress(0);
    setScrapingStatus('Connecting...');
    setErrorMessage("");

    try {
      const response = await fetch('/api/ai/scrape-gala-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: resultsUrl, meetId: id })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.trim().startsWith('data: ')) {
            try {
              const data = JSON.parse(line.trim().replace('data: ', ''));
              setScrapingProgress(data.progress || 0);
              setScrapingStatus(data.detail || data.status);
              
              if (data.status === 'Complete' || data.status === 'success') {
                if (data.text) setPdfText(data.text);
                setUploadStatus('success');
                fetchMeetData(); // Refresh results table immediately
              }
              if (data.status === 'Error') {
                setErrorMessage(data.detail);
                setUploadStatus('error');
              }
            } catch (e) {
              console.error("Error parsing SSE chunk:", e);
            }
          }
        }
      }
    } catch (err) {
      setErrorMessage(err.message);
      setUploadStatus('error');
    } finally {
      setScrapingUrl(false);
    }
  };

  const removePdf = async () => {
    setPdfText(null);
    setUploadStatus(null);
    // Also clear from database
    await supabase.from('meets').update({ pdf_text: null }).eq('id', id);
  };

  const handleExport = () => {
    setIsExporting(true);
    setTimeout(() => {
      window.print();
      setIsExporting(false);
    }, 500);
  };

  const handleStaffUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setParsingStaff(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('meetId', meet.id);
    formData.append('type', 'staff');
    
    try {
      const res = await fetch('/api/parse-pdf', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.text && data.text.trim().length > 10) {
        setStaffText(data.text);
        setUploadStatus('success');
      } else {
        setStaffText("");
        setShowManualStaff(true);
        setErrorMessage("Warning: The file uploaded contains very little text. Please check the names manually below.");
        setUploadStatus('error');
      }
    } catch (err) {
      console.error("Staff upload error:", err);
      setErrorMessage("Failed to process staff file.");
    } finally {
      setParsingStaff(false);
    }
  };

  const removeStaff = () => {
    setStaffText(null);
    setShowManualStaff(false);
  };

  const handleManualStaffChange = (e) => setStaffText(e.target.value);
  const toggleManualStaff = () => setShowManualStaff(!showManualStaff);

  const generateMeetInsight = async (userCorrection = null) => {
    if (userCorrection) setApplyingCorrection(true);
    else setGeneratingInsight(true);
    
    try {
      const meetStats = {
        totalSwimmers: new Set(augmentedResults.map(r => r.swimmer_id)).size,
        totalRaces: augmentedResults.length,
        totalPBs: augmentedResults.filter(r => r.active_is_pb).length,
        avgPts: Math.round(augmentedResults.reduce((a,b) => a + (b.wa_pts || 0), 0) / (augmentedResults.length || 1))
      };

      const res = await fetch('/api/ai/gala-engine-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          meet, 
          stats: meetStats, 
          results: augmentedResults.map(r => ({
            ...r,
            is_pb: r.active_is_pb
          })), 
          pdfText,
          staffText: JSON.stringify(staffNotes),
          correction: userCorrection,
          system_prompt: {
            "summary": "MANDATORY: 4 substantial, narrative paragraphs. Paragraph 1: Atmosphere/Club presence. Paragraph 2: Elite achievements (Medals/Finals). Paragraph 3: Development & Resilience (PBs/Near Misses). Paragraph 4: Strategic takeaway. Integrate specific names and stats directly into the narrative. Be descriptive and celebratory.",
            "successes": [
              "MANDATORY: List all medalists (Gold/Silver/Bronze) with their events.",
              "MANDATORY: List all Finalists with their events.",
              "MANDATORY: If 'bubble_analysis' contains data, YOU MUST include it here (e.g., 'Kieran Crawford narrowly missed the 50m Breaststroke final by just 0.12s!').",
              "List of other significant PBs or achievements."
            ]
          }
        })
      });
      const data = await res.json();
      if (data.error) {
        setErrorMessage(data.error);
        setUploadStatus('error');
        // If it's a quota error, we still want to show the error state in the main area
        setInsight(data);
      } else {
        setInsight(data);
        setUploadStatus('success');
        if (userCorrection) setCorrection("");
      }
    } catch (err) {
      console.error("Insight Generation Error:", err);
      setErrorMessage("Failed to generate report.");
      setUploadStatus('error');
      setInsight({ error: "Failed to connect to the intelligence engine." });
    } finally {
      setGeneratingInsight(false);
      setApplyingCorrection(false);
    }
  };

  const augmentedResults = useMemo(() => {
    const meetCourse = meet?.course?.startsWith('L') ? 'L' : 'S';
    
    return results.map(r => {
      // 1. Normalize identifiers
      const rEvent = normalizeEvent(r.event);
      const rCourse = r.course ? (r.course.startsWith('L') ? 'L' : 'S') : meetCourse;
      const resultSeconds = timeToSeconds(r.time);
      const rMeetName = r.meets?.name?.toLowerCase() || '';

      // 2. Find all historical PBs for this swimmer and event
      const swimmerEventPbs = pbs.filter(pb => 
        pb.swimmer_id === r.swimmer_id && 
        normalizeEvent(pb.event) === rEvent
      );
      
      // 3. Match by course
      const coursePb = swimmerEventPbs.find(pb => {
        const pbCourse = pb.course?.startsWith('L') ? 'L' : 'S';
        return pbCourse === rCourse;
      });
      
      let isPb = r.is_pb;

      // 4. Multi-layered validation
      if (!isPb) {
        if (coursePb) {
          const pbGala = coursePb.gala?.toLowerCase() || '';
          // Tie-break: Check if the PB record already points to this specific meet or date
          const isSameMeet = (coursePb.date === r.date) || (pbGala && rMeetName && (pbGala.includes(rMeetName) || rMeetName.includes(pbGala)));
          
          if (isSameMeet) {
            isPb = true;
          } else if (resultSeconds > 0 && resultSeconds <= coursePb.time_seconds) {
            // Standard comparison (allow equal PBs)
            isPb = true;
          }
        } else if (resultSeconds > 0) {
          // If no record exists for this event+course combination, it's a PB for this context
          isPb = true;
        }
      }
      
      return { ...r, active_is_pb: isPb };
    });
  }, [results, pbs, meet]);

  const stats = useMemo(() => {
    const uniqueSwimmers = new Set(augmentedResults.map(r => r.swimmer_id)).size;
    const pbResults = augmentedResults.filter(r => r.active_is_pb);
    const totalPts = augmentedResults.reduce((a, b) => a + (b.wa_pts || 0), 0);
    
    const squadMap = {};
    augmentedResults.forEach(r => {
      const sName = r.swimmers?.squads?.name || 'Unassigned';
      if (!squadMap[sName]) squadMap[sName] = { swimmers: new Set(), pbs: 0, pts: 0, count: 0, peak: 0 };
      squadMap[sName].swimmers.add(r.swimmer_id);
      squadMap[sName].count++;
      squadMap[sName].pts += (r.wa_pts || 0);
      if (r.wa_pts > squadMap[sName].peak) squadMap[sName].peak = r.wa_pts;
      if (r.active_is_pb) {
        // Only count one PB per swimmer/event per meet
        const pbKey = `${r.swimmer_id}-${normalizeEvent(r.event)}`;
        if (!squadMap[sName].seenPbs) squadMap[sName].seenPbs = new Set();
        if (!squadMap[sName].seenPbs.has(pbKey)) {
          squadMap[sName].seenPbs.add(pbKey);
          squadMap[sName].pbs++;
        }
      }
    });

    const dedupedPbs = (() => {
      const seen = new Set();
      return augmentedResults.filter(r => {
        if (!r.active_is_pb) return false;
        const key = `${r.swimmer_id}-${normalizeEvent(r.event)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    })();

    return {
      uniqueSwimmers,
      totalRaces: augmentedResults.length,
      totalPBs: dedupedPbs.length,
      pbRate: Math.round((dedupedPbs.length / (augmentedResults.length || 1)) * 100),
      avgPts: Math.round(totalPts / (augmentedResults.length || 1)),
      peakPts: augmentedResults.length ? Math.max(...augmentedResults.map(r => r.wa_pts || 0)) : 0,
      squadStats: Object.entries(squadMap).map(([name, s]) => ({
        name,
        swimmers: s.swimmers.size,
        pbs: s.pbs,
        avgPts: Math.round(s.pts / s.count),
        peakPts: s.peak,
        pbRate: Math.round((s.pbs / s.count) * 100),
        seasonAvg: squadBaselines[augmentedResults.find(r => (r.swimmers?.squads?.name || 'Unassigned') === name)?.swimmers?.squad_id] || 0
      })).sort((a,b) => b.pbs - a.pbs),
      podiums: (insight?.medalists?.length > 0) ? (() => {
        const seen = new Set();
        const deduped = insight.medalists.filter(m => {
          const key = `${normalizeName(m.swimmer_name)}-${normalizeEvent(m.event)}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        const gold = deduped.filter(m => {
          const t = m.medal_type?.toLowerCase() || "";
          return t.includes('gold') || t.includes('1st') || t.includes('first') || t === '1';
        }).length;
        const silver = deduped.filter(m => {
          const t = m.medal_type?.toLowerCase() || "";
          return t.includes('silver') || t.includes('2nd') || t.includes('second') || t === '2';
        }).length;
        const bronze = deduped.filter(m => {
          const t = m.medal_type?.toLowerCase() || "";
          return t.includes('bronze') || t.includes('3rd') || t.includes('third') || t === '3';
        }).length;

        return { gold, silver, bronze, total: deduped.length };
      })() : (augmentedResults.some(r => r.rank >= 1 && r.rank <= 3)) ? (() => {
        // Fallback: Deduplicate by swimmer/event, prioritizing Finals
        const podiumResults = augmentedResults.filter(r => r.rank >= 1 && r.rank <= 3);
        const seen = new Map();
        
        podiumResults.forEach(r => {
          const key = `${r.swimmer_id}-${normalizeEvent(r.event)}`;
          const existing = seen.get(key);
          const isFinal = r.round?.toLowerCase() === 'final';
          
          if (!existing || isFinal) {
            seen.set(key, r);
          }
        });

        const deduped = Array.from(seen.values());
        return {
          gold: deduped.filter(r => r.rank === 1).length,
          silver: deduped.filter(r => r.rank === 2).length,
          bronze: deduped.filter(r => r.rank === 3).length,
          total: deduped.length
        };
      })() : null
    };
  }, [augmentedResults, pbs, meet, squadBaselines, insight]);

  if (loading) return <Layout session={session}><div className="flex flex-col items-center justify-center h-screen gap-6"><div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-cyan-400"></div><div style={{ fontSize: '0.75rem', fontWeight: 950, letterSpacing: '0.2em', opacity: 0.8 }}>SYNTHESIZING GALA DATA...</div></div></Layout>;
  if (!meet) return <Layout session={session}><div className="p-20 text-center">Meet not found.</div></Layout>;

  return (
    <Layout session={session}>
      <Head>
        <title>{meet.name} | Post-Meet Audit</title>
        <style>{`
          @media print {
            @page { size: portrait; margin: 0 !important; }
            html, body { margin: 0 !important; padding: 0 !important; width: 100% !important; height: auto !important; background: #050b10 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            .no-print, button, nav, .profile-header, footer { display: none !important; }
            .print-only { display: block !important; }
            .roster-cover-page { 
              display: flex !important; 
              height: 100vh !important; 
              flex-direction: column; 
              justify-content: center; 
              align-items: center; 
              text-align: center; 
              page-break-after: always; 
              background: #050b10; 
              color: white !important;
              margin: 0 !important;
              padding: 0 !important;
              overflow: hidden !important;
            }
            main, .layout-container { padding: 0 !important; margin: 0 !important; min-height: auto !important; position: static !important; }
            body::after {
              content: "TONBRIDGE SWIMMING CLUB | EST. 1911 | COACHESEYE PERFORMANCE DNA";
              position: fixed;
              bottom: 10mm;
              left: 0;
              width: 100%;
              text-align: center;
              font-size: 0.5rem;
              font-weight: 950;
              opacity: 0.3;
              letter-spacing: 0.2em;
            }
            .glass-card { border: 1px solid rgba(255,255,255,0.1) !important; background: rgba(10,10,20,0.8) !important; color: white !important; page-break-inside: avoid; margin-bottom: 0.8rem !important; }
            .stats-table-glass th { color: rgba(255,255,255,0.8) !important; }
            .stats-table-glass td { color: white !important; border-bottom: 1px solid rgba(255,255,255,0.05) !important; }
            .print-grid-4 { display: grid !important; grid-template-columns: repeat(4, 1fr) !important; gap: 0.5rem !important; margin-bottom: 1rem !important; }
            .mb-16 { margin-bottom: 1.5rem !important; }
            h1, h2, h3, .section-title, .print-heading { page-break-after: avoid !important; break-after: avoid !important; }
            .glass-card { break-inside: avoid !important; page-break-inside: avoid !important; }
            .print-hide, .no-print, .print-hide *, .no-print * { display: none !important; }
          }
          .print-only { display: none; }
        `}</style>
      </Head>

      {/* PRINT COVER PAGE */}
      <div className="print-only roster-cover-page">
        <img src="/coacheseye-logo.png" alt="CoachesEye" style={{ height: '160px', marginBottom: '4rem' }} />
        <div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--accent-cyan)', letterSpacing: '0.6em', marginBottom: '3rem', textTransform: 'uppercase' }}>Tonbridge Swimming Club Gala Report</div>
        <h1 style={{ fontSize: '5rem', fontWeight: 900, margin: '0 2rem', lineHeight: 1.1, letterSpacing: '-0.04em', textTransform: 'uppercase' }}>{meet.name}</h1>
        <div style={{ height: '12px', width: '160px', background: 'var(--accent-cyan)', margin: '5rem 0' }}></div>
        <div style={{ fontSize: '1.8rem', fontWeight: 700, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Performance Date: {new Date(meet.date).toLocaleDateString('en-GB')}</div>
      </div>

      <div className="flex justify-between items-end mb-16 no-print">
        <div>
          <div className="flex items-center gap-4 mb-4">
             <Link href="/meets" style={{ fontSize: '0.6rem', fontWeight: 950, letterSpacing: '0.1em', opacity: 0.6, textTransform: 'uppercase', textDecoration: 'none', color: 'white' }}>← MEET REGISTRY</Link>
             <div style={{ width: 4, height: 16, background: 'var(--accent-cyan)' }}></div>
             <span style={{ fontSize: '0.6rem', fontWeight: 950, letterSpacing: '0.2em', opacity: 0.8 }}>OFFICIAL TACTICAL REPORT</span>
          </div>
          <h1 style={{ fontSize: '3.5rem', fontWeight: 950, margin: 0, letterSpacing: '-0.04em', lineHeight: 1 }}>{meet.name.split(' ').map((word, i) => i === meet.name.split(' ').length - 1 ? <span key={i} style={{ color: 'var(--accent-cyan)' }}>{word}</span> : word + ' ')}</h1>
          <div className="flex gap-4 mt-4">
            <button className="btn-premium-intel" onClick={handleExport} style={{ background: 'var(--accent-cyan)', color: '#000', fontSize: '0.65rem' }}>Export PDF Showcase</button>
            <p style={{ fontSize: '1rem', opacity: 0.9, alignSelf: 'center', margin: 0 }}>
              {new Date(meet.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} • {meet.license} • {meet.course} Course Analysis
            </p>
            {meet.children?.length > 0 && (
              <div style={{ background: 'rgba(6, 182, 212, 0.1)', padding: '4px 12px', borderRadius: '8px', fontSize: '0.7rem', fontWeight: 900, color: 'var(--accent-cyan)', border: '1px solid rgba(6, 182, 212, 0.2)', marginLeft: '1rem' }}>
                CONSOLIDATED REPORT: {meet.children.length + 1} SESSIONS
              </div>
            )}
            {meet.parent_id && (
              <Link href={`/meet/${meet.parent_id}`} style={{ background: 'rgba(245, 158, 11, 0.1)', padding: '4px 12px', borderRadius: '8px', fontSize: '0.7rem', fontWeight: 900, color: 'var(--accent-amber)', border: '1px solid rgba(245, 158, 11, 0.2)', marginLeft: '1rem', textDecoration: 'none' }}>
                VIEW MASTER REPORT
              </Link>
            )}
          </div>
        </div>

        <div className="flex gap-10">
           <PremiumOrb value={stats.pbRate} label="PERSONAL BESTS" size={100} />
           <PremiumOrb value={stats.avgPts} label="PERFORMANCE RATING" size={100} unit="" color="cyan" />
        </div>
      </div>

      <div className="flex justify-between items-center mb-10 print-only" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem' }}>
        <div style={{ fontSize: '1.2rem', fontWeight: 950, color: 'white', letterSpacing: '0.1em' }}>TONBRIDGE SWIMMING CLUB</div>
        <div style={{ fontSize: '0.6rem', fontWeight: 950, color: 'var(--accent-cyan)', opacity: 0.8 }}>GALA PERFORMANCE SHOWCASE • {meet.name.toUpperCase()}</div>
      </div>

      <div className="section-title mb-6 print-only" style={{ fontSize: '1.2rem', color: 'white', opacity: 1 }}>Gala Achievement Summary</div>
      
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(5, 1fr)', 
        gap: '1.5rem', 
        marginBottom: '3rem' 
      }}>
        {/* Card 1: Team Members */}
        <div className="glass-card" style={{ padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <div className="flex items-center gap-3">
            <div style={{ fontSize: '1rem' }}>🏊</div>
            <div style={{ fontSize: '0.5rem', fontWeight: 950, opacity: 0.8, letterSpacing: '0.1em' }}>TEAM MEMBERS</div>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 950, color: 'white' }}>{stats.uniqueSwimmers}</div>
        </div>

        {/* Card 2: Total Races */}
        <div className="glass-card" style={{ padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <div className="flex items-center gap-3">
            <div style={{ fontSize: '1rem' }}>⏱</div>
            <div style={{ fontSize: '0.5rem', fontWeight: 950, opacity: 0.8, letterSpacing: '0.1em' }}>TOTAL RACES</div>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 950, color: 'white' }}>{stats.totalRaces}</div>
        </div>

        {/* Card 3: PODIUM (MIDDLE) */}
        <div className="glass-card podium-card-enhanced" style={{ 
          padding: '1.2rem', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '0.4rem',
          position: 'relative',
          overflow: 'hidden',
          border: '1px solid rgba(251, 191, 36, 0.5)',
          background: 'rgba(13, 17, 23, 0.98)',
          minHeight: '170px'
        }}>
          <div style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url('/podium.png')`,
            backgroundSize: '110%',
            backgroundPosition: 'center 75%',
            opacity: 1,
            zIndex: 0,
            filter: 'brightness(1.4) contrast(1.2) drop-shadow(0 0 15px rgba(251, 191, 36, 0.2))'
          }}></div>
          
          <div style={{ position: 'relative', zIndex: 10, pointerEvents: 'none' }}>
            {/* Top-left corner left empty for cleaner aesthetic */}
          </div>

          {stats.podiums?.total > 0 && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 5 }}>
              {/* Gold - 1st (Center) */}
              <div style={{ 
                position: 'absolute', 
                top: '42%', 
                left: '50%', 
                transform: 'translate(-50%, -50%)',
                textAlign: 'center'
              }}>
                <div style={{ 
                  fontSize: '3.8rem', 
                  fontWeight: 950, 
                  color: '#fbbf24', 
                  textShadow: '0 0 40px rgba(251, 191, 36, 0.8), 0 5px 15px rgba(0,0,0,0.8)', 
                  lineHeight: 0.8 
                }}>{stats.podiums.gold}</div>
                <div style={{ fontSize: '0.55rem', fontWeight: 950, color: '#fbbf24', letterSpacing: '0.25em', marginTop: '16px', opacity: 0.9 }}>GOLD</div>
              </div>

              {/* Silver - 2nd (Left) */}
              <div style={{ 
                position: 'absolute', 
                top: '58%', 
                left: '21%', 
                transform: 'translate(-50%, -50%)',
                textAlign: 'center'
              }}>
                <div style={{ 
                  fontSize: '2.5rem', 
                  fontWeight: 950, 
                  color: '#f8fafc', 
                  textShadow: '0 0 30px rgba(248, 250, 252, 0.6), 0 5px 10px rgba(0,0,0,0.5)', 
                  lineHeight: 0.8 
                }}>{stats.podiums.silver}</div>
                <div style={{ fontSize: '0.45rem', fontWeight: 950, color: '#f8fafc', letterSpacing: '0.2em', marginTop: '12px', opacity: 0.8 }}>SILVER</div>
              </div>

              {/* Bronze - 3rd (Right) */}
              <div style={{ 
                position: 'absolute', 
                top: '64%', 
                left: '79%', 
                transform: 'translate(-50%, -50%)',
                textAlign: 'center'
              }}>
                <div style={{ 
                  fontSize: '2.4rem', 
                  fontWeight: 950, 
                  color: '#fb923c', 
                  textShadow: '0 0 30px rgba(251, 146, 60, 0.6), 0 5px 10px rgba(0,0,0,0.5)', 
                  lineHeight: 0.8 
                }}>{stats.podiums.bronze}</div>
                <div style={{ fontSize: '0.45rem', fontWeight: 950, color: '#fb923c', letterSpacing: '0.2em', marginTop: '12px', opacity: 0.8 }}>BRONZE</div>
              </div>
            </div>
          )}

          {!stats.podiums?.total && (
            <div style={{ 
              position: 'absolute', 
              inset: 0, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              padding: '2rem',
              textAlign: 'center',
              fontSize: '0.6rem', 
              opacity: 0.5, 
              fontWeight: 800, 
              zIndex: 1,
              lineHeight: 1.5
            }}>
              NO MEDALS DETECTED.<br/>
              UPLOAD A RESULTS PDF OR<br/>
              SCRAPE GALA URL TO EXTRACT PODIUMS.
            </div>
          )}
        </div>

        {/* Card 4: New Best Times */}
        <div className="glass-card" style={{ padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <div className="flex items-center gap-3">
            <div style={{ fontSize: '1rem' }}>★</div>
            <div style={{ fontSize: '0.5rem', fontWeight: 950, opacity: 0.8, letterSpacing: '0.1em' }}>NEW BEST TIMES</div>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 950, color: 'white' }}>{stats.totalPBs}</div>
        </div>

        {/* Card 5: Peak Performance */}
        <div className="glass-card" style={{ padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <div className="flex items-center gap-3">
            <div style={{ fontSize: '1rem' }}>🏆</div>
            <div style={{ fontSize: '0.5rem', fontWeight: 950, opacity: 0.8, letterSpacing: '0.1em' }}>PEAK PERFORMANCE</div>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 950, color: 'white' }}>{stats.peakPts}</div>
          <div style={{ fontSize: '0.6rem', opacity: 0.5, lineHeight: 1.3 }}>WA Points achieved.</div>
        </div>
      </div>

      {/* WA POINTS LEGEND (For Parents) */}
      <div className="glass-card mb-12 no-print" style={{ padding: '1.5rem', borderLeft: '4px solid var(--accent-amber)', background: 'rgba(255, 234, 0, 0.03)' }}>
        <div style={{ fontSize: '0.65rem', fontWeight: 950, color: 'var(--accent-amber)', letterSpacing: '0.1em', marginBottom: 8 }}>PARENT INTEL: UNDERSTANDING WA POINTS</div>
        <p style={{ fontSize: '0.85rem', opacity: 0.8, lineHeight: 1.5, margin: 0 }}>
              World Aquatics (WA) Points allow us to compare performances across different strokes and distances. 
              <b>Note:</b> Standards vary by age; younger groups will naturally have lower point targets than the 500-600pt benchmarks seen at elite levels. 
              Unlike "times", points show how fast a swim was relative to the current World Record (1000pts). 
              Refer to the <b>Pathway</b> column in the results table below to see specific targets for your swimmer's age and event.
        </p>
      </div>
      
      {/* SQUAD PERFORMANCE SUMMARY */}
      <div className="glass-card mb-12" style={{ padding: '2rem', pageBreakInside: 'avoid' }}>
        <div className="print-only" style={{ fontSize: '1rem', fontWeight: 900, marginBottom: '1rem', color: 'white' }}>Squad Performance Summary</div>
        <div style={{ fontSize: '0.65rem', fontWeight: 950, opacity: 0.8, textTransform: 'uppercase', marginBottom: 24 }}>Squad Success & Performance Highlights</div>
        <div className="space-y-6">
          {stats.squadStats.map((ss, i) => (
            <div key={i} style={{ pageBreakInside: 'avoid' }}>
               <div className="flex justify-between items-end mb-2">
                <div style={{ fontSize: '0.9rem', fontWeight: 950 }}>{ss.name}</div>
                <div style={{ fontSize: '0.7rem', fontWeight: 900, display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <div style={{ opacity: 0.8 }}>Meet: <span style={{ color: 'white' }}>{ss.avgPts}</span></div>
                  {ss.seasonAvg > 0 && (
                    <div style={{ opacity: 0.8 }}>Season: <span style={{ color: 'white' }}>{ss.seasonAvg}</span></div>
                  )}
                  {ss.seasonAvg > 0 && (
                    <div style={{ 
                      color: ss.avgPts >= ss.seasonAvg ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                      background: ss.avgPts >= ss.seasonAvg ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '0.6rem'
                    }}>
                      {ss.avgPts >= ss.seasonAvg ? '+' : ''}{ss.avgPts - ss.seasonAvg} pts
                    </div>
                  )}
                  <div style={{ opacity: 0.5 }}>• Best: {ss.peakPts}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                 <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${ss.pbRate}%`, background: ss.pbRate > 70 ? 'var(--accent-emerald)' : ss.pbRate > 40 ? 'var(--accent-cyan)' : 'var(--accent-amber)', borderRadius: 3 }}></div>
                 </div>
                 <div style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--accent-cyan)', minWidth: 40 }}>{ss.pbRate}% PB</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16">
        <div style={{ gridColumn: '1 / -1' }}>
          {generatingInsight ? (
            <div className="glass-card flex flex-col items-center justify-center p-12 gap-4">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-cyan-400"></div>
              <div style={{ fontSize: '0.65rem', fontWeight: 950, letterSpacing: '0.1em' }}>GENERATING RACE REPORT...</div>
            </div>
          ) : insight ? (
            <div className="glass-card" style={{ padding: '3rem', borderLeft: '4px solid var(--accent-cyan)' }}>
              {insight.error ? (
                <div style={{ padding: '2rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚠️</div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 950, marginBottom: '0.5rem', color: 'var(--accent-amber)' }}>Analysis Interrupted</h3>
                  <p style={{ opacity: 0.8, fontSize: '0.9rem', marginBottom: '2rem' }}>{insight.error}</p>
                  <button className="btn-premium-intel" onClick={() => generateMeetInsight()} style={{ margin: '0 auto', background: 'var(--accent-cyan)', color: '#000' }}>Retry Analysis</button>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-start mb-10">
                    <div>
                      <div style={{ fontSize: '0.65rem', fontWeight: 950, color: 'var(--accent-cyan)', letterSpacing: '0.2em', textTransform: 'uppercase' }}>CoachesEye Premium Community Report</div>
                      <h3 style={{ fontSize: '2.5rem', fontWeight: 950, margin: '12px 0 0', letterSpacing: '-0.02em' }}>{meet.name} Report</h3>
                    </div>
                    <div className="flex gap-3">
                      <button className="period-btn no-print" onClick={() => setShowIngestion(!showIngestion)} style={{ fontSize: '0.6rem', opacity: 0.5 }}>
                        {showIngestion ? 'HIDE SOURCE DATA' : 'MANAGE SOURCE DATA'}
                      </button>
                      <button className="period-btn no-print" onClick={() => generateMeetInsight()} style={{ fontSize: '0.6rem', opacity: 0.5 }}>REFRESH REPORT</button>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    {insight.summary.split('\n\n').map((para, i) => (
                      <p key={i} style={{ fontSize: '1.1rem', lineHeight: '1.8', color: 'rgba(255,255,255,0.9)', fontWeight: 500 }}>
                        {para}
                      </p>
                    ))}
                  </div>



                  <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                    <div className="md:col-span-1">
                      <div style={{ fontSize: '0.65rem', fontWeight: 950, color: 'var(--accent-emerald)', textTransform: 'uppercase', marginBottom: '1.5rem', letterSpacing: '0.15em' }}>Success Highlights</div>
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        {insight.successes?.map((s, i) => <li key={i} style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.85)', marginBottom: 16, lineHeight: 1.5, display: 'flex', gap: 12 }}><span style={{ color: '#10b981', marginTop: 4 }}>●</span> {s}</li>)}
                      </ul>
                    </div>
                    
                    <div className="md:col-span-1">
                      <div style={{ fontSize: '0.75rem', fontWeight: 950, color: 'var(--accent-cyan)', textTransform: 'uppercase', marginBottom: '1.5rem', letterSpacing: '0.15em' }}>Moments of Brilliance</div>
                      {insight.standout_performers?.map((performer, idx) => (
                        <div key={idx} className="group relative overflow-hidden rounded-xl bg-slate-900/40 border border-slate-800/50 p-6 transition-all hover:bg-slate-900/60 hover:border-blue-500/30 hover:shadow-[0_0_20px_rgba(59,130,246,0.1)] mb-4">
                          <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-blue-500/5 blur-3xl transition-all group-hover:bg-blue-500/10" />
                          <div className="flex flex-col gap-3">
                            <div className="flex items-start justify-between">
                              <div>
                                <h4 className="text-lg font-bold tracking-tight text-white mb-0.5 uppercase">
                                  {performer.name}
                                </h4>
                                <span className="text-[9px] font-black tracking-widest text-blue-400 uppercase bg-blue-400/10 px-2 py-0.5 rounded">
                                  {performer.squad}
                                </span>
                              </div>
                              <div className="h-8 w-8 rounded-full bg-slate-800/50 flex items-center justify-center border border-slate-700/50">
                                <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                              </div>
                            </div>
                            <p className="text-slate-300 leading-relaxed text-sm font-medium italic">
                              "{performer.insight}"
                            </p>
                          </div>
                        </div>
                      ))}
                      {(!insight.standout_performers || insight.standout_performers.length === 0) && <li style={{ fontSize: '0.8rem', opacity: 0.5, fontStyle: 'italic' }}>Multiple athletes showed exceptional promise across the board.</li>}
                    </div>

                    <div className="md:col-span-1">
                      <div style={{ fontSize: '0.65rem', fontWeight: 950, color: 'var(--accent-amber)', textTransform: 'uppercase', marginBottom: '1.5rem', letterSpacing: '0.15em' }}>Strategic Focus</div>
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        {insight.gaps?.map((g, i) => <li key={i} style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.85)', marginBottom: 16, lineHeight: 1.5, display: 'flex', gap: 12 }}><span style={{ color: '#f59e0b', marginTop: 4 }}>●</span> {g}</li>)}
                      </ul>
                    </div>
                  </div>

                  {insight.support_team && insight.support_team.length > 0 && (
                    <div style={{ marginTop: '4rem', paddingTop: '3rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontSize: '0.65rem', fontWeight: 950, color: 'var(--accent-cyan)', textTransform: 'uppercase', marginBottom: '2rem', letterSpacing: '0.2em', textAlign: 'center' }}>Gala Support & Volunteers</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {insight.support_team.map((s, i) => (
                          <div key={i} style={{ background: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', pageBreakInside: 'avoid' }}>
                            <div style={{ fontWeight: 950, fontSize: '0.9rem', marginBottom: '4px' }}>{s.name}</div>
                            <div style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--accent-cyan)', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.05em' }}>{s.role}</div>
                            <div style={{ fontSize: '0.8rem', opacity: 0.7, fontStyle: 'italic', lineHeight: 1.4 }}>"{s.thanks}"</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {insight.recruitment_shoutout && (
                    <div style={{ marginTop: '4rem', background: 'linear-gradient(135deg, rgba(6,182,212,0.1), rgba(16,185,129,0.1))', padding: '2.5rem', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center', pageBreakInside: 'avoid' }}>
                      <div style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>🏊‍♂️ JOIN THE ENGINE ROOM!</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 500, lineHeight: 1.6, maxWidth: '800px', margin: '0 auto' }}>
                        {insight.recruitment_shoutout}
                      </div>
                    </div>
                  )}

                  <div className="print-hide" style={{ marginTop: '4rem', padding: '2rem', background: 'rgba(255,255,255,0.03)', borderRadius: '16px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 950, color: 'var(--accent-cyan)', textTransform: 'uppercase', marginBottom: '1rem', letterSpacing: '0.1em' }}>Refine Intelligence Report</div>
                    <div className="flex gap-4">
                      <input 
                        type="text" 
                        placeholder="e.g. 'Actually, Arlo got a Gold medal in the 100m Free' or 'Don't mention the relay teams'"
                        style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', padding: '12px', fontSize: '0.9rem' }}
                        value={correction}
                        onChange={(e) => setCorrection(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && correction && generateMeetInsight(correction)}
                      />
                      <button 
                        className="btn-premium-intel" 
                        style={{ background: 'var(--accent-cyan)', color: 'black', whiteSpace: 'nowrap' }}
                        disabled={applyingCorrection || !correction}
                        onClick={() => generateMeetInsight(correction)}
                      >
                        {applyingCorrection ? "APPLYING..." : "APPLY CORRECTION"}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : null}

          {/* Ingestion Center - Always available to refine data */}
          {(!insight || showIngestion) && !generatingInsight && (
            <div className="glass-card p-12 no-print" style={{ borderLeft: '4px solid var(--accent-cyan)' }}>
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h3 style={{ fontSize: '1.8rem', fontWeight: 950, marginBottom: 8, letterSpacing: '-0.02em' }}>Gala Intelligence Center</h3>
                  <p style={{ opacity: 0.6, fontSize: '0.85rem' }}>Ingest data from multiple sources to feed the CoachesEye Brain.</p>
                </div>
                <button 
                  className="btn-premium-intel" 
                  onClick={() => generateMeetInsight()} 
                  style={{ background: 'var(--accent-cyan)', color: '#000', padding: '12px 30px' }}
                  disabled={!pdfText && !staffText && results.length === 0}
                >
                  🧬 Generate Intelligence Report
                </button>
              </div>

              {/* Tab Navigation */}
              <div className="flex gap-2 mb-8 p-1 bg-white/5 rounded-xl self-start" style={{ width: 'fit-content' }}>
                {[
                  { id: 'results', label: '📄 RESULTS FILE', icon: '📎' },
                  { id: 'url', label: '🌐 LIVE RESULTS URL', icon: '🔗' },
                  { id: 'staff', label: '✍️ COACH NOTES', icon: '📝' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveIngestionTab(tab.id)}
                    className={`period-btn ${activeIngestionTab === tab.id ? 'active' : ''}`}
                    style={{ 
                      fontSize: '0.65rem', 
                      padding: '8px 16px',
                      background: activeIngestionTab === tab.id ? 'rgba(255,255,255,0.1)' : 'transparent',
                      borderColor: activeIngestionTab === tab.id ? 'var(--accent-cyan)' : 'transparent'
                    }}
                  >
                    <span style={{ marginRight: 6 }}>{tab.icon}</span> {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div style={{ minHeight: '180px' }}>
                {activeIngestionTab === 'results' && (
                  <div className="animate-fade-in">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', alignItems: 'center', padding: '2rem', border: '2px dashed rgba(255,255,255,0.05)', borderRadius: '24px' }}>
                      <div style={{ fontSize: '2.5rem', opacity: 0.2 }}>📄</div>
                      <div style={{ textAlign: 'center' }}>
                        <h4 style={{ fontSize: '1rem', fontWeight: 900, marginBottom: 4 }}>Attach Official Results</h4>
                        <p style={{ fontSize: '0.75rem', opacity: 0.5, marginBottom: '1.5rem' }}>Supports PDF, TXT, or MD formats from any gala results site.</p>
                        
                        <div className="flex items-center gap-3 justify-center">
                          <label className="btn-premium-intel" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}>
                            {parsingPdf ? "PARSING FILE..." : (pdfText ? "✓ RESULTS ATTACHED" : "UPLOAD FILE")}
                            <input type="file" hidden accept=".pdf,.txt,.md" onChange={handlePdfUpload} />
                          </label>
                          {pdfText && (
                            <button onClick={removePdf} className="period-btn" style={{ borderColor: 'var(--accent-rose)', color: 'var(--accent-rose)' }}>REMOVE</button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeIngestionTab === 'url' && (
                  <div className="animate-fade-in">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '2rem', border: '2px dashed rgba(255,255,255,0.05)', borderRadius: '24px' }}>
                      <h4 style={{ fontSize: '1rem', fontWeight: 900, marginBottom: 4 }}>Live Results Scraper</h4>
                      <p style={{ fontSize: '0.75rem', opacity: 0.5, marginBottom: '0.5rem' }}>Point the brain at a live results page (Counties, Regionals, etc.) to extract heats, finals, and placings.</p>
                      
                      <div className="flex gap-4">
                        <input 
                          type="url" 
                          placeholder="https://www.southeastswimming.org/results/..."
                          className="flex-1"
                          style={{ 
                            background: 'rgba(255,255,255,0.08)', 
                            border: '1px solid rgba(255,255,255,0.15)', 
                            padding: '12px 20px', 
                            borderRadius: '12px',
                            color: 'white',
                            outline: 'none',
                            fontSize: '0.9rem'
                          }}
                          value={resultsUrl}
                          onChange={(e) => setResultsUrl(e.target.value)}
                        />
                        <button 
                          className="btn-premium-intel" 
                          style={{ background: 'var(--accent-cyan)', color: 'black' }}
                          onClick={handleUrlScrape}
                          disabled={scrapingUrl || !resultsUrl}
                        >
                          {scrapingUrl ? "SCRAPING..." : "SCRAPE LIVE DATA"}
                        </button>
                      </div>

                      {scrapingUrl && (
                        <div className="mt-4">
                          <div className="flex justify-between items-center mb-2">
                            <span style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--accent-cyan)', textTransform: 'uppercase' }}>
                              {scrapingStatus}
                            </span>
                            <span style={{ fontSize: '0.65rem', opacity: 0.5 }}>{scrapingProgress}%</span>
                          </div>
                          <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', overflow: 'hidden' }}>
                            <div style={{ 
                              width: `${scrapingProgress}%`, 
                              height: '100%', 
                              background: 'var(--accent-cyan)', 
                              boxShadow: '0 0 10px var(--accent-cyan)',
                              transition: 'width 0.5s ease-out' 
                            }}></div>
                          </div>
                        </div>
                      )}

                      {uploadStatus === 'success' && !scrapingUrl && (
                        <div style={{ fontSize: '0.65rem', color: 'var(--accent-emerald)', fontWeight: 900 }} className="flex items-center gap-2">
                          <span style={{ fontSize: '1rem' }}>✓</span> INTELLIGENCE CAPTURED SUCCESSFULLY. THE BRAIN IS NOW UPDATED.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeIngestionTab === 'staff' && (
                  <div className="animate-fade-in">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                      <div>
                        <h4 style={{ fontSize: '1rem', fontWeight: 900, marginBottom: 4 }}>Coach's Log & Context</h4>
                        <p style={{ fontSize: '0.75rem', opacity: 0.5 }}>Add technical notes, squad feedback, or atmospheric details for the AI to include in the report.</p>
                      </div>

                      {/* Add New Note */}
                      <div className="flex gap-4">
                        <textarea 
                          className="flex-1"
                          style={{ 
                            height: '100px', 
                            background: 'rgba(255,255,255,0.05)', 
                            border: '1px solid rgba(255,255,255,0.1)',
                            padding: '1rem', 
                            borderRadius: '16px', 
                            fontSize: '0.9rem', 
                            color: 'white',
                            outline: 'none',
                            resize: 'none'
                          }}
                          placeholder="Type a new note here... (e.g. 'Session 3: Kieran's underwater transitions were elite today')"
                          value={newNote}
                          onChange={(e) => setNewNote(e.target.value)}
                        />
                        <button 
                          className="btn-premium-intel" 
                          style={{ background: 'var(--accent-emerald)', color: 'black', height: 'fit-content' }}
                          onClick={async () => {
                            if (!newNote.trim()) return;
                            const updated = [{ id: Date.now(), text: newNote, date: new Date().toISOString() }, ...staffNotes];
                            setStaffNotes(updated);
                            setNewNote("");
                            
                            // Auto-save to DB
                            const { error } = await supabase.from('meets').update({ staff_text: JSON.stringify(updated) }).eq('id', id);
                            if (!error) {
                              setUploadStatus('success');
                              setTimeout(() => setUploadStatus(null), 3000);
                            }
                          }}
                        >
                          ADD NOTE
                        </button>
                      </div>

                      {/* Notes List */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {staffNotes.map(note => (
                          <div key={note.id} style={{ 
                            background: 'rgba(255,255,255,0.03)', 
                            border: '1px solid rgba(255,255,255,0.05)', 
                            padding: '1rem', 
                            borderRadius: '12px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'start',
                            gap: '1rem'
                          }}>
                            <div style={{ flex: 1 }}>
                              <p style={{ fontSize: '0.9rem', lineHeight: 1.5, color: 'rgba(255,255,255,0.9)' }}>{note.text}</p>
                              <span style={{ fontSize: '0.65rem', opacity: 0.3, marginTop: '0.5rem', display: 'block' }}>
                                {new Date(note.date).toLocaleString()}
                              </span>
                            </div>
                            <button 
                              style={{ 
                                background: 'rgba(244, 63, 94, 0.1)', 
                                color: 'var(--accent-rose)', 
                                border: 'none', 
                                padding: '4px 10px', 
                                borderRadius: '6px', 
                                fontSize: '0.6rem', 
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                              onClick={async () => {
                                const updated = staffNotes.filter(n => n.id !== note.id);
                                setStaffNotes(updated);
                                await supabase.from('meets').update({ staff_text: JSON.stringify(updated) }).eq('id', id);
                              }}
                            >
                              DELETE
                            </button>
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-between items-center border-t border-white/5 pt-4">
                        <div className="flex items-center gap-4">
                          {uploadStatus === 'success' && <span style={{ fontSize: '0.6rem', color: 'var(--accent-emerald)', fontWeight: 900 }}>✓ SYNCED TO BRAIN</span>}
                        </div>
                        <label className="period-btn" style={{ cursor: 'pointer', fontSize: '0.6rem' }}>
                          BULK UPLOAD (.TXT)
                          <input type="file" hidden accept=".txt,.md" onChange={handleStaffUpload} />
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {uploadStatus === 'error' && (
                <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(244, 63, 94, 0.1)', border: '1px solid var(--accent-rose)', borderRadius: '12px', color: 'var(--accent-rose)', fontSize: '0.8rem', fontWeight: 700 }}>
                  ⚠ ERROR: {errorMessage}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {insight && insight.historical_comparisons && insight.historical_comparisons.length > 0 && (
        <div className="glass-card mb-12" style={{ padding: '2.5rem', background: 'rgba(6, 182, 212, 0.02)', border: '1px solid rgba(6, 182, 212, 0.15)', boxShadow: '0 8px 32px 0 rgba(0, 212, 255, 0.03)', pageBreakInside: 'avoid' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.5rem' }}>
            <span style={{ fontSize: '1.2rem' }}>🧬</span>
            <div style={{ fontSize: '0.75rem', fontWeight: 950, color: 'var(--accent-cyan)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
              Gala Progression & Historical Growth Audit (Last 2 Years)
            </div>
          </div>
          
          <div className="table-container" style={{ overflowX: 'auto', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <th style={{ padding: '12px 16px', color: 'var(--accent-cyan)', fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase' }}>Gala / Season</th>
                  <th style={{ padding: '12px 16px', color: 'var(--accent-cyan)', fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase' }}>Squad Size</th>
                  <th style={{ padding: '12px 16px', color: 'var(--accent-cyan)', fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase' }}>Total Entries</th>
                  <th style={{ padding: '12px 16px', color: 'var(--accent-cyan)', fontSize: '0.65rem', fontWeight: 950, textTransform: 'uppercase', textAlign: 'right' }}>Avg WA Points</th>
                </tr>
              </thead>
              <tbody>
                {/* Current Gala Row */}
                <tr style={{ borderBottom: '1px solid rgba(6, 182, 212, 0.15)', background: 'rgba(6, 182, 212, 0.05)' }}>
                  <td style={{ padding: '16px', fontWeight: 800 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ color: 'var(--accent-cyan)', fontSize: '0.7rem', fontWeight: 900, padding: '2px 6px', background: 'rgba(6,182,212,0.1)', borderRadius: '4px' }}>CURRENT</span>
                      <span>{meet.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '16px', fontWeight: 700 }}>{new Set(results.map(r => r.swimmer_id)).size} swimmers</td>
                  <td style={{ padding: '16px', opacity: 0.8 }}>{results.length} races</td>
                  <td style={{ padding: '16px', textAlign: 'right', fontWeight: 950, color: 'var(--accent-cyan)' }}>
                    {Math.round(results.reduce((a, b) => a + (b.wa_pts || 0), 0) / (results.length || 1))} pts
                  </td>
                </tr>
                
                {/* Historical Rows */}
                {insight.historical_comparisons.map((hist, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', background: 'rgba(0,0,0,0.15)' }} className="hover:bg-cyan-950/20 transition-colors">
                    <td style={{ padding: '16px', fontWeight: 750 }}>
                      <Link href={`/meet/${hist.meet_id}`} legacyBehavior>
                        <a style={{ color: 'var(--accent-cyan)', textDecoration: 'none' }} className="hover:underline cursor-pointer">
                          {hist.name}
                        </a>
                      </Link>
                    </td>
                    <td style={{ padding: '16px', opacity: 0.75 }}>{hist.total_swimmers} swimmers</td>
                    <td style={{ padding: '16px', opacity: 0.6 }}>{hist.total_races} races</td>
                    <td style={{ padding: '16px', textAlign: 'right', fontWeight: 800, opacity: 0.9 }}>
                      {hist.avg_wa_pts} pts
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="section-title mb-8">Gala Results & Achievements</div>
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden', marginBottom: 100 }}>
        <table className="stats-table-glass w-full">
          <thead>
            <tr>
              <th style={{ padding: '1.5rem' }}>ATHLETE</th>
              {meet?.children?.length > 0 && <th>SESSION</th>}
              <th>SQUAD</th>
              <th>EVENT</th>
              <th style={{ textAlign: 'center' }}>TIME</th>
              <th style={{ background: 'rgba(255,255,255,0.05)', padding: '1.2rem', textAlign: 'left', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.5 }}>WA Pts</th>
              <th style={{ background: 'rgba(255,255,255,0.05)', padding: '1.2rem', textAlign: 'left', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.5 }}>Pathway</th>
              <th style={{ textAlign: 'right', paddingRight: '1.5rem' }}>STATUS</th>
            </tr>
          </thead>
          <tbody>
            {augmentedResults.sort((a,b) => getPreferredName(a.swimmers).localeCompare(getPreferredName(b.swimmers))).map((r, i) => {
              const isPb = r.active_is_pb;

              return (
                <tr key={r.id} style={{ borderTop: '1px solid rgba(255,255,255,0.03)' }}>
                  <td style={{ padding: '1.2rem 1.5rem', fontWeight: 900 }}>{getPreferredName(r.swimmers)}</td>
                  {meet?.children?.length > 0 && (
                    <td style={{ fontSize: '0.65rem', fontWeight: 700, opacity: 0.7 }}>
                      {r.meets?.name?.replace('Kent County Championships 2026', 'Session')}
                    </td>
                  )}
                  <td style={{ fontSize: '0.75rem', fontWeight: 800, opacity: 0.8 }}>{r.swimmers.squads?.name}</td>
                  <td style={{ fontSize: '0.8rem', fontWeight: 500 }}>{r.event}</td>
                  <td style={{ textAlign: 'center', fontWeight: 950, fontSize: '1rem' }}>{r.time}</td>
                      <td style={{ padding: '1.2rem', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                          <span style={{ fontWeight: 800, fontSize: '0.9rem', color: (r.wa_pts >= getCategoryBenchmark(r.swimmers?.year_of_birth ? (new Date(meet?.date || new Date()).getFullYear() - r.swimmers.year_of_birth) : 17, r.swimmers?.gender, r.event, 'COUNTY')) ? 'var(--accent-cyan)' : 'white' }}>
                            {r.wa_pts || '—'}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '1.2rem', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                          <div style={{ fontSize: '0.65rem', opacity: 0.5, display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                            <span>COUNTY</span>
                            <span style={{ color: r.wa_pts >= getCategoryBenchmark(r.swimmers?.year_of_birth ? (new Date(meet?.date || new Date()).getFullYear() - r.swimmers.year_of_birth) : 17, r.swimmers?.gender, r.event, 'COUNTY') ? 'var(--accent-cyan)' : 'white', fontWeight: 700 }}>
                              {getCategoryBenchmark(r.swimmers?.year_of_birth ? (new Date(meet?.date || new Date()).getFullYear() - r.swimmers.year_of_birth) : 17, r.swimmers?.gender, r.event, 'COUNTY')}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.65rem', opacity: 0.5, display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                            <span>REGIONAL</span>
                            <span style={{ color: r.wa_pts >= getCategoryBenchmark(r.swimmers?.year_of_birth ? (new Date(meet?.date || new Date()).getFullYear() - r.swimmers.year_of_birth) : 17, r.swimmers?.gender, r.event, 'REGIONAL') ? 'var(--accent-cyan)' : 'white', fontWeight: 700 }}>
                              {getCategoryBenchmark(r.swimmers?.year_of_birth ? (new Date(meet?.date || new Date()).getFullYear() - r.swimmers.year_of_birth) : 17, r.swimmers?.gender, r.event, 'REGIONAL')}
                            </span>
                          </div>
                        </div>
                      </td>
                  <td style={{ textAlign: 'right', paddingRight: '1.5rem' }}>
                    {isPb && (
                      <span style={{ 
                        fontSize: '0.6rem', 
                        fontWeight: 950, 
                        color: 'var(--accent-emerald)', 
                        background: 'rgba(16,185,129,0.1)', 
                        padding: '4px 10px', 
                        borderRadius: '4px',
                        border: '1px solid rgba(16,185,129,0.2)',
                        marginRight: '8px'
                      }}>★ PB</span>
                    )}
                    {/* Medal Badge */}
                    {(() => {
                      const medal = insight?.medalists?.find(m => 
                        normalizeName(m.swimmer_name) === normalizeName(r.swimmers?.full_name) && 
                        normalizeEvent(m.event) === normalizeEvent(r.event)
                      );
                      
                      const hasFinal = augmentedResults.some(other => 
                        other.swimmer_id === r.swimmer_id && 
                        normalizeEvent(other.event) === normalizeEvent(r.event) && 
                        other.round?.toLowerCase() === 'final'
                      );

                      const isLegitRank = (r.rank >= 1 && r.rank <= 3) && 
                                          ((r.round?.toLowerCase() === 'final') || !hasFinal);

                      const displayMedal = isLegitRank ? 
                        (r.rank === 1 ? 'GOLD' : r.rank === 2 ? 'SILVER' : 'BRONZE') : 
                        (medal && ((r.round?.toLowerCase() === 'final') || !hasFinal) ? medal.medal_type?.toUpperCase() : null);
                      
                      if (displayMedal) {
                        return (
                          <span style={{ 
                            fontSize: '0.6rem', 
                            fontWeight: 950, 
                            color: displayMedal === 'GOLD' ? '#fbbf24' : displayMedal === 'SILVER' ? '#38bdf8' : '#fb923c',
                            background: 'rgba(255,255,255,0.05)', 
                            padding: '4px 10px', 
                            borderRadius: '4px',
                            border: `1px solid ${displayMedal === 'GOLD' ? '#fbbf24' : displayMedal === 'SILVER' ? '#38bdf8' : '#fb923c'}`
                          }}>
                            {displayMedal}
                          </span>
                        );
                      }
                      return null;
                    })()}
                    {!isPb && !insight?.medalists?.some(m => normalizeName(m.swimmer_name).includes(normalizeName(r.swimmers.full_name)) && r.event.toLowerCase().includes(m.event.toLowerCase().replace('fly', 'butterfly'))) && (
                      <span style={{ fontSize: '0.6rem', fontWeight: 900, opacity: 0.5 }}>COMPLETED</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <style jsx>{`
        .glass-card {
          background: rgba(13, 17, 23, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 20px;
          backdrop-filter: blur(12px);
        }
        .section-title {
          font-size: 0.75rem;
          font-weight: 950;
          letter-spacing: 0.2em;
          opacity: 0.8;
          text-transform: uppercase;
        }
        .period-btn {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          color: white;
          padding: 6px 12px;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 900;
          transition: all 0.3s ease;
        }
        .period-btn:hover {
          background: rgba(255,255,255,0.1);
        }
        .btn-premium-intel {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 24px;
          border-radius: 12px;
          border: none;
          font-weight: 950;
          cursor: pointer;
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          font-size: 0.75rem;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }
        .btn-premium-intel:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 20px rgba(0,0,0,0.3);
        }
        .btn-premium-intel:disabled {
          background: rgba(255,255,255,0.05) !important;
          color: rgba(255,255,255,0.2) !important;
          border: 1px solid rgba(255,255,255,0.1) !important;
          cursor: not-allowed;
          filter: grayscale(1);
          transform: none !important;
          box-shadow: none !important;
        }
        .podium-dot {
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 0.6rem;
          font-weight: 900;
          border: 1px solid transparent;
        }
        .podium-dot.gold { background: rgba(251, 191, 36, 0.2); color: #fbbf24; border-color: rgba(251, 191, 36, 0.3); }
        .podium-dot.silver { background: rgba(226, 232, 240, 0.2); color: #e2e8f0; border-color: rgba(226, 232, 240, 0.3); }
        .podium-dot.bronze { background: rgba(217, 119, 6, 0.2); color: #d97706; border-color: rgba(217, 119, 6, 0.3); }
        
        .podium-card-enhanced::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(to top, rgba(13, 17, 23, 0.4), transparent);
          pointer-events: none;
          z-index: 1;
        }
      `}</style>
    </Layout>
  );
}

export async function getServerSideProps(context) {
  return {
    props: {
      meetId: context.params.id,
    },
  };
}
