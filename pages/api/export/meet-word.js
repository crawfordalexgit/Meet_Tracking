import { getServiceSupabase } from '../../../lib/supabase';
import { requireAuth } from '../../../lib/api-auth';
import { normalizeEvent, timeToSeconds } from '../../../lib/analytics-utils';
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, PageBreak, LevelFormat
} from 'docx';

function getPreferredName(swimmer) {
  if (!swimmer) return 'Unknown';
  const fn = swimmer.full_name || '';
  if (fn.includes(',')) {
    const [last, rest] = fn.split(',').map(s => s.trim());
    return `${swimmer.known_as || rest.split(' ')[0]} ${last}`.trim();
  }
  const parts = fn.split(' ');
  return `${swimmer.known_as || parts[0] || ''} ${parts[parts.length - 1] || ''}`.trim();
}

// Detect medal for a result row from rank or medalists list
function detectMedal(r, medalSource) {
  if (r.rank >= 1 && r.rank <= 3 && r.round?.toLowerCase() === 'final') {
    return r.rank === 1 ? 'GOLD' : r.rank === 2 ? 'SILVER' : 'BRONZE';
  }
  const rEventNorm = normalizeEvent(r.event);
  const found = (medalSource || []).find(m => {
    if (normalizeEvent(m.event) !== rEventNorm) return false;
    if (m.swimmer_id && r.swimmer_id) return m.swimmer_id === r.swimmer_id;
    const mName = (m.swimmer_name || '').toLowerCase().trim();
    const rName = getPreferredName(r.swimmers).toLowerCase().trim();
    return mName === rName;
  });
  return found ? (found.medal_type || '').toUpperCase() : null;
}

// Replicate frontend augmented PB logic using swimmer_pbs table
function computeActivePb(r, pbsMap, meetCourse, meetName) {
  if (r.is_pb) return true;
  const rEventNorm = normalizeEvent(r.event);
  const rCourse = r.course ? (r.course.startsWith('L') ? 'L' : 'S') : meetCourse;
  const resultSeconds = timeToSeconds(r.time);
  const rMeetName = (meetName || '').toLowerCase();
  const swimmerEventPbs = (pbsMap[r.swimmer_id] || []).filter(pb => normalizeEvent(pb.event) === rEventNorm);
  const coursePb = swimmerEventPbs.find(pb => (pb.course?.startsWith('L') ? 'L' : 'S') === rCourse);
  if (coursePb) {
    const pbGala = (coursePb.gala || '').toLowerCase();
    const isSameMeet = (coursePb.date === r.date) || (pbGala && rMeetName && (pbGala.includes(rMeetName) || rMeetName.includes(pbGala)));
    if (isSameMeet) return true;
    if (resultSeconds > 0 && resultSeconds <= coursePb.time_seconds) return true;
  } else if (resultSeconds > 0) {
    return true; // no record for this event+course yet → it's a first-time PB
  }
  return false;
}

function shortEvent(event) {
  if (!event) return '';
  return event
    .replace(/event\s*\d+\s*/i, '')
    .replace(/(boys?|girls?|mens?|womens?|open)\s*/gi, '')
    .replace(/\d+\s*[-–]\s*\d+\s*/g, '')
    .replace(/\s*(long|short)\s*course\s*/gi, '')
    .replace(/\s*(lc|sc)\s*/gi, ' ')
    .replace(/\s*meters?\s*/gi, 'm ')
    .replace(/butterfly/gi, 'Fly')
    .replace(/backstroke/gi, 'Back')
    .replace(/breaststroke/gi, 'Breast')
    .replace(/freestyle/gi, 'Free')
    .replace(/individual\s*medley/gi, 'IM')
    .replace(/(\d+)\s+m\b/g, '$1m')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripEmojis(str) {
  if (!str) return '';
  return str.replace(/[\u{1F000}-\u{1FFFF}]/gu, '').replace(/[\u{2600}-\u{27BF}]/gu, '').replace(/\s+/g, ' ').trim();
}

// Parse inline **bold** markdown into TextRun array
function parseInline(text, baseOpts = {}) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map(part => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return new TextRun({ ...baseOpts, text: part.slice(2, -2), bold: true });
    }
    return new TextRun({ ...baseOpts, text: part });
  });
}

const NAVY  = '1e3a5f';
const BLUE  = '0ea5e9';
const WHITE = 'ffffff';
const GREY  = 'eff6ff';  // blue-50 — visible alternating stripe
const GREEN = 'dcfce7';  // green-100 — vivid PB highlight
const DARK  = '0f172a';
const MID   = '475569';
const DIM   = '94a3b8';
const WMARK = 'a8c4d8';

// A4 with 2cm margins — content width 9638 DXA
const CW = 9638;

const thin    = { style: BorderStyle.SINGLE, size: 1, color: 'e2e8f0' };
const borders = { top: thin, bottom: thin, left: thin, right: thin };

function hCell(text, w) {
  return new TableCell({
    borders,
    width: { size: w, type: WidthType.DXA },
    shading: { fill: NAVY, type: ShadingType.CLEAR },
    margins: { top: 100, bottom: 100, left: 120, right: 120 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text, bold: true, color: WHITE, size: 16, font: 'Arial' })]
    })]
  });
}

function dCell(text, w, { fill = WHITE, center = false, bold = false, size = 20, color = DARK } = {}) {
  return new TableCell({
    borders,
    width: { size: w, type: WidthType.DXA },
    shading: { fill, type: ShadingType.CLEAR },
    margins: { top: 100, bottom: 100, left: 120, right: 120 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: center ? AlignmentType.CENTER : AlignmentType.LEFT,
      children: [new TextRun({ text: String(text ?? ''), bold, size, color, font: 'Arial' })]
    })]
  });
}

// Native Word podium graphic — 3 columns, Silver|Gold|Bronze with stepped top padding
function medalPodiumTable(podiums, cw) {
  const gW = Math.floor(cw * 0.40);
  const sW = Math.floor(cw * 0.30);
  const bW = cw - gW - sW;

  const thickTop = (color) => ({ style: BorderStyle.THICK, size: 14, color });

  function podiumCell(count, label, position, fill, accent, numSize, topPad, colW) {
    return new TableCell({
      borders: { top: thickTop(accent), bottom: thin, left: thin, right: thin },
      width: { size: colW, type: WidthType.DXA },
      shading: { fill, type: ShadingType.CLEAR },
      margins: { top: topPad, bottom: 220, left: 160, right: 160 },
      verticalAlign: VerticalAlign.CENTER,
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 40 },
          children: [new TextRun({ text: String(count || 0), bold: true, size: numSize, color: accent, font: 'Arial' })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 60 },
          children: [new TextRun({ text: label, bold: true, size: 18, color: accent, font: 'Arial', characterSpacing: 120 })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 0 },
          children: [new TextRun({ text: position, size: 16, color: MID, font: 'Arial' })]
        }),
      ]
    });
  }

  return new Table({
    width: { size: cw, type: WidthType.DXA },
    columnWidths: [sW, gW, bW],
    rows: [new TableRow({ children: [
      podiumCell(podiums.silver || 0, 'SILVER', '2nd Place', 'f8fafc', '64748b', 60, 300, sW),
      podiumCell(podiums.gold   || 0, 'GOLD',   '1st Place', 'fefce8', 'ca8a04', 80, 100, gW),
      podiumCell(podiums.bronze || 0, 'BRONZE', '3rd Place', 'fff7ed', '9a3412', 52, 380, bW),
    ]})]
  });
}

const MEDAL_COLOR = { GOLD: 'b45309', SILVER: '475569', BRONZE: '9a3412' };
const MEDAL_FILL  = { GOLD: 'fef3c7', SILVER: 'e2e8f0', BRONZE: 'ffedd5' };

function badgeCell(isPb, medal, w, rowFill) {
  // Row fill already applied by caller — badge cell matches it
  const runs = [];
  if (isPb) {
    runs.push(new TextRun({ text: 'PB', bold: true, size: 22, color: '15803d', font: 'Arial' }));
  }
  if (medal) {
    if (runs.length) runs.push(new TextRun({ text: '  ', size: 20, font: 'Arial' }));
    runs.push(new TextRun({ text: medal, bold: true, size: 22, color: MEDAL_COLOR[medal] || DARK, font: 'Arial' }));
  }
  if (!runs.length) {
    runs.push(new TextRun({ text: '—', size: 16, color: DIM, font: 'Arial' }));
  }

  return new TableCell({
    borders,
    width: { size: w, type: WidthType.DXA },
    shading: { fill: rowFill, type: ShadingType.CLEAR },
    margins: { top: 100, bottom: 100, left: 80, right: 80 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: runs })]
  });
}

function sectionHeading(text) {
  return new Paragraph({
    spacing: { before: 360, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BLUE, space: 4 } },
    children: [new TextRun({ text, bold: true, size: 22, color: NAVY, font: 'Arial' })]
  });
}

// Narrative paragraph with 1.8× line spacing to match the webpage
function narrativePara(text) {
  return new Paragraph({
    spacing: { before: 0, after: 180, line: 432, lineRule: 'auto' },
    children: parseInline(stripEmojis(text).trim(), { size: 20, color: '1e293b', font: 'Arial' })
  });
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  if (!await requireAuth(req, res)) return;

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Meet ID required' });

  const supabase = getServiceSupabase();

  const [meetRes, resultsRes, reportRes] = await Promise.all([
    supabase.from('meets').select('*, children:meets(id, name), staff_text').eq('id', id).single(),
    supabase.from('results')
      .select('*, swimmers(id, full_name, known_as, squads(name))')
      .eq('meet_id', id)
      .order('event'),
    supabase.from('ai_reports')
      .select('content')
      .eq('meet_id', id)
      .eq('type', 'meet_audit')
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  const meet = meetRes.data;
  if (!meet) return res.status(404).json({ error: 'Meet not found' });

  const results = resultsRes.data || [];
  const insight = reportRes.data?.[0]?.content || null;

  // Fetch swimmer PBs to compute active_is_pb (same logic as webpage augmentedResults)
  const swimmerIds = [...new Set(results.map(r => r.swimmer_id).filter(Boolean))];
  let pbsMap = {};
  if (swimmerIds.length) {
    const { data: pbsData } = await supabase.from('swimmer_pbs').select('*').in('swimmer_id', swimmerIds);
    (pbsData || []).forEach(pb => {
      (pbsMap[pb.swimmer_id] = pbsMap[pb.swimmer_id] || []).push(pb);
    });
  }
  const meetCourse = meet.course?.startsWith('L') ? 'L' : 'S';
  const augmentedResults = results.map(r => ({
    ...r,
    active_is_pb: computeActivePb(r, pbsMap, meetCourse, meet.name)
  }));

  // Stats — use active_is_pb (same as webpage); fall back to insight.stats.totalPBs if available
  const uniqueSwimmers = new Set(augmentedResults.map(r => r.swimmer_id)).size;
  const activePbResults = augmentedResults.filter(r => r.active_is_pb);
  const pbCount        = insight?.stats?.totalPBs ?? activePbResults.length;
  const peakPts        = augmentedResults.length ? Math.max(...augmentedResults.map(r => r.wa_pts || 0)) : 0;

  const podiums = insight?.individual_medal_counts?.total > 0
    ? insight.individual_medal_counts
    : { gold: 0, silver: 0, bronze: 0, total: 0 };

  // Squad grouping
  const squadMap = {};
  augmentedResults.forEach(r => {
    const sq = r.swimmers?.squads?.name || 'Unassigned';
    (squadMap[sq] = squadMap[sq] || []).push(r);
  });

  const meetDate   = meet.date ? new Date(meet.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const courseLabel = meet.course === 'L' ? 'Long Course (50m)' : meet.course === 'S' ? 'Short Course (25m)' : (meet.course || '');

  // ─── BUILD CONTENT ────────────────────────────────────
  const children = [];

  // ── Title block ───────────────────────────────────────
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 60 },
      children: [new TextRun({ text: 'TONBRIDGE SWIMMING CLUB', size: 18, bold: true, color: MID, font: 'Arial', characterSpacing: 200 })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 100 },
      children: [new TextRun({ text: meet.name, bold: true, size: 56, color: NAVY, font: 'Arial' })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 480 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BLUE, space: 8 } },
      children: [
        new TextRun({ text: meetDate, size: 21, color: MID, font: 'Arial' }),
        ...(courseLabel ? [
          new TextRun({ text: '   ·   ', size: 21, color: DIM, font: 'Arial' }),
          new TextRun({ text: courseLabel, size: 21, color: MID, font: 'Arial' }),
        ] : []),
        ...(meet.level ? [
          new TextRun({ text: '   ·   ', size: 21, color: DIM, font: 'Arial' }),
          new TextRun({ text: meet.level, size: 21, color: MID, font: 'Arial' }),
        ] : []),
      ]
    })
  );

  // ── Stats bar (4 columns — Team / Races / PBs / Peak WA) ─
  const c4 = Math.floor(CW / 4);
  const c4r = CW - c4 * 3;
  children.push(
    new Paragraph({ spacing: { before: 0, after: 80 }, children: [new TextRun({ text: 'MEET SUMMARY', size: 15, bold: true, color: DIM, font: 'Arial', characterSpacing: 150 })] }),
    new Table({
      width: { size: CW, type: WidthType.DXA },
      columnWidths: [c4, c4, c4, c4r],
      rows: [
        new TableRow({ children: [hCell('TEAM MEMBERS', c4), hCell('TOTAL RACES', c4), hCell('NEW BEST TIMES', c4), hCell('PEAK WA POINTS', c4r)] }),
        new TableRow({ children: [
          dCell(uniqueSwimmers, c4, { center: true, bold: true, size: 40 }),
          dCell(augmentedResults.length, c4, { center: true, bold: true, size: 40 }),
          dCell(pbCount, c4, { center: true, bold: true, size: 40 }),
          dCell(peakPts, c4r, { center: true, bold: true, size: 40 }),
        ]})
      ]
    }),
    new Paragraph({ spacing: { before: 0, after: 300 }, children: [] })
  );

  // ── Coaching & Management team ─────────────────────────────
  // Structured staff entries (type:'staff') take priority over AI-generated support_team
  let structuredStaff = [];
  try {
    const raw = meet.staff_text;
    if (raw?.startsWith('[')) {
      structuredStaff = JSON.parse(raw)
        .filter(n => n.type === 'staff')
        .map(n => ({ name: n.name, role: n.role || '', thanks: '' }));
    }
  } catch (e) {}
  const supportTeam = structuredStaff.length > 0 ? structuredStaff : (insight?.support_team || []);
  if (supportTeam.length > 0) {
    // Group by role, same as the app's compact display
    const grouped = {};
    supportTeam.forEach(s => {
      const role = stripEmojis(s.role || 'Team').trim() || 'Team';
      (grouped[role] = grouped[role] || []).push(stripEmojis(s.name || '').trim());
    });
    children.push(
      sectionHeading('Gala Support & Volunteers'),
      new Paragraph({
        spacing: { before: 0, after: 80 },
        children: [new TextRun({ text: 'Without you, none of this happens.', bold: true, size: 26, color: NAVY, font: 'Arial' })]
      }),
      new Paragraph({
        spacing: { before: 0, after: 200 },
        children: [new TextRun({ text: 'Every race, every result — made possible by the people below. Thank you.', size: 18, color: MID, font: 'Arial', italics: true })]
      }),
      ...Object.entries(grouped).map(([role, names]) =>
        new Paragraph({
          spacing: { before: 0, after: 100 },
          children: [
            new TextRun({ text: role.toUpperCase() + '\t', bold: true, size: 18, color: BLUE, font: 'Arial', characterSpacing: 80 }),
            new TextRun({ text: names.join(', '), size: 20, color: DARK, font: 'Arial' }),
          ]
        })
      ),
      new Paragraph({ spacing: { before: 0, after: 280 }, children: [] })
    );
  }

  // ── Medals podium section ──────────────────────────────
  if (podiums.total > 0) {
    children.push(
      sectionHeading('Medal Haul'),
      medalPodiumTable(podiums, CW),
      new Paragraph({ spacing: { before: 0, after: 240 }, children: [] })
    );
  }

  // ── AI Narrative ──────────────────────────────────────
  if (insight?.summary) {
    children.push(sectionHeading('Race Day Report'));
    stripEmojis(insight.summary).split('\n\n').filter(Boolean).forEach(para => {
      children.push(narrativePara(para));
    });
  }

  // ── Success highlights ────────────────────────────────
  if (insight?.successes?.length > 0) {
    children.push(sectionHeading('Standout Performances'));
    insight.successes.forEach(s => {
      children.push(new Paragraph({
        numbering: { reference: 'bullets', level: 0 },
        spacing: { before: 0, after: 100, line: 360, lineRule: 'auto' },
        children: parseInline(stripEmojis(s), { size: 20, color: '1e293b', font: 'Arial' })
      }));
    });
    children.push(new Paragraph({ spacing: { before: 0, after: 160 }, children: [] }));
  }

  // ── Moments of Brilliance ─────────────────────────────
  if (insight?.standout_performers?.length > 0) {
    children.push(sectionHeading('Moments of Brilliance'));
    insight.standout_performers.forEach(p => {
      children.push(
        new Paragraph({
          spacing: { before: 140, after: 40 },
          children: [
            new TextRun({ text: stripEmojis(p.name || ''), bold: true, size: 22, color: NAVY, font: 'Arial' }),
            ...(p.squad ? [new TextRun({ text: `  ·  ${p.squad}`, size: 18, color: DIM, font: 'Arial' })] : []),
          ]
        }),
        new Paragraph({
          spacing: { before: 0, after: 120, line: 360, lineRule: 'auto' },
          children: [new TextRun({ text: `"${stripEmojis(p.insight || '')}"`, size: 20, italics: true, color: MID, font: 'Arial' })]
        })
      );
    });
    children.push(new Paragraph({ spacing: { before: 0, after: 160 }, children: [] }));
  }

  // ── Strategic Focus ───────────────────────────────────
  if (insight?.gaps?.length > 0) {
    children.push(sectionHeading('Strategic Focus'));
    insight.gaps.forEach(g => {
      children.push(new Paragraph({
        numbering: { reference: 'bullets', level: 0 },
        spacing: { before: 0, after: 100, line: 360, lineRule: 'auto' },
        children: parseInline(stripEmojis(g), { size: 20, color: '1e293b', font: 'Arial' })
      }));
    });
    children.push(new Paragraph({ spacing: { before: 0, after: 160 }, children: [] }));
  }

  // ── Squad summary (same page, before individual deep-dive) ─
  if (Object.keys(squadMap).length > 1) {
    const sw = [Math.floor(CW * 0.4), Math.floor(CW * 0.2), Math.floor(CW * 0.2)];
    sw.push(CW - sw.reduce((a, b) => a + b, 0));
    children.push(
      sectionHeading('Squad by Squad'),
      new Table({
        width: { size: CW, type: WidthType.DXA },
        columnWidths: sw,
        rows: [
          new TableRow({ tableHeader: true, children: [hCell('SQUAD', sw[0]), hCell('SWIMMERS', sw[1]), hCell('RACES', sw[2]), hCell('PBs', sw[3])] }),
          ...Object.entries(squadMap)
            .sort((a, b) => b[1].length - a[1].length)
            .map(([name, rs], i) => {
              const fill = i % 2 === 0 ? WHITE : GREY;
              return new TableRow({ children: [
                dCell(name, sw[0], { fill }),
                dCell(new Set(rs.map(r => r.swimmer_id)).size, sw[1], { fill, center: true }),
                dCell(rs.length, sw[2], { fill, center: true }),
                dCell(rs.filter(r => r.active_is_pb).length, sw[3], { fill, center: true }),
              ]});
            })
        ]
      }),
      new Paragraph({ spacing: { before: 0, after: 160 }, children: [] })
    );
  }

  // ── Individual results (new page) ─────────────────────
  children.push(
    new Paragraph({ children: [new PageBreak()] }),
    sectionHeading('Every Race, Every Swimmer')
  );

  // 5 columns — drop squad (covered in squad breakdown page)
  const rw = [
    Math.floor(CW * 0.28),  // SWIMMER
    Math.floor(CW * 0.20),  // EVENT
    Math.floor(CW * 0.15),  // TIME
    Math.floor(CW * 0.12),  // WA PTS
  ];
  rw.push(CW - rw.reduce((a, b) => a + b, 0)); // STATUS

  const medalSource = insight?.detected_medalists || insight?.medalists || [];

  const sortedAugmented = [...augmentedResults].sort((a, b) =>
    getPreferredName(a.swimmers).localeCompare(getPreferredName(b.swimmers))
  );

  children.push(new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: rw,
    rows: [
      new TableRow({ tableHeader: true, children: [
        hCell('SWIMMER', rw[0]), hCell('EVENT', rw[1]), hCell('TIME', rw[2]),
        hCell('WA PTS', rw[3]), hCell('STATUS', rw[4])
      ]}),
      ...sortedAugmented.map((r, i) => {
        const isPb  = r.active_is_pb;
        const medal = detectMedal(r, medalSource);
        const fill  = medal ? MEDAL_FILL[medal]
                    : isPb  ? GREEN
                    : (i % 2 === 0 ? WHITE : GREY);
        return new TableRow({ children: [
          dCell(getPreferredName(r.swimmers), rw[0], { fill, bold: true, size: 22 }),
          dCell(shortEvent(r.event), rw[1], { fill }),
          dCell(r.time || '', rw[2], { fill, center: true, bold: true, size: 22 }),
          dCell(r.wa_pts ?? '—', rw[3], { fill, center: true, color: MID }),
          badgeCell(isPb, medal, rw[4], fill),
        ]});
      })
    ]
  }));


  // ─── ASSEMBLE ─────────────────────────────────────────
  const doc = new Document({
    numbering: {
      config: [{
        reference: 'bullets',
        levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }]
      }]
    },
    styles: {
      default: { document: { run: { font: 'Arial', size: 20, color: DARK } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 56, bold: true, font: 'Arial', color: NAVY },
          paragraph: { spacing: { before: 0, after: 120 }, outlineLevel: 0 } }
      ]
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },     // A4
          margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 }  // 2cm
        }
      },
      headers: {
        default: new Header({
          children: [
            // Watermark-style club branding
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 0, after: 60 },
              children: [new TextRun({
                text: 'TONBRIDGE SWIMMING CLUB',
                size: 28, bold: true, color: WMARK, font: 'Arial', characterSpacing: 300
              })]
            }),
            // Divider + meet name right-aligned
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: 'e2e8f0', space: 4 } },
              children: [new TextRun({ text: meet.name, size: 15, color: DIM, font: 'Arial' })]
            })
          ]
        })
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            border: { top: { style: BorderStyle.SINGLE, size: 2, color: 'e2e8f0', space: 4 } },
            children: [
              new TextRun({ text: 'CoachesEye  ·  Tonbridge Swimming Club  ·  Page ', size: 15, color: DIM, font: 'Arial' }),
              new TextRun({ children: [PageNumber.CURRENT], size: 15, color: DIM, font: 'Arial' }),
              new TextRun({ text: ' of ', size: 15, color: DIM, font: 'Arial' }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 15, color: DIM, font: 'Arial' }),
            ]
          })]
        })
      },
      children
    }]
  });

  const buffer = await Packer.toBuffer(doc);
  const safeName = (meet.name || 'Meet').replace(/[^a-z0-9]/gi, '_').substring(0, 50);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}_Report.docx"`);
  res.send(buffer);
}
