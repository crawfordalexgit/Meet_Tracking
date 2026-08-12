import ExcelJS from 'exceljs';
import { requireAuth } from '../../lib/api-auth';
import { fetchAllocationData } from '../../lib/allocation-data';
import { buildAllocationReport, describeFilters, GROUP_OPTIONS } from '../../lib/session-allocations';

// Midnight Stealth palette from styles/globals.css, so the workbook reads as the
// same product as the screen. ExcelJS wants ARGB without the leading '#'.
const C = {
  bgDeep: 'FF050B10',
  bgCard: 'FF0A1921',
  bgRow: 'FF0E222C',
  bgRowAlt: 'FF0B1B24',
  cyan: 'FF0096FF',
  teal: 'FF2DD4BF',
  amber: 'FFFBBF24',
  emerald: 'FF10B981',
  rose: 'FFF43F5E',
  white: 'FFFFFFFF',
  dim: 'FF8A9BA5',
  border: 'FF1C3440'
};

const FONT = 'Aptos Narrow';

const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const thin = { style: 'thin', color: { argb: C.border } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!await requireAuth(req, res)) return;

  try {
    const options = req.body?.options || {};
    const data = await fetchAllocationData();
    const report = buildAllocationReport(data, options);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'The Coaches Eye';
    wb.created = new Date();

    buildReportSheet(wb, report, data, options);
    buildFlatSheet(wb, report, options);

    const buffer = await wb.xlsx.writeBuffer();
    const stamp = new Date().toISOString().split('T')[0];

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="session-allocations-${stamp}.xlsx"`);
    return res.status(200).send(Buffer.from(buffer));
  } catch (error) {
    console.error('Session allocations export error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

/** The presentation sheet — mirrors the on-screen report card for card. */
function buildReportSheet(wb, report, data, options) {
  const { groups, totals, showTargets } = report;
  const groupBy = options.groupBy || 'squad';
  const showSquadColumn = groupBy !== 'squad';

  const columns = [
    { header: 'Swimmer', width: 26 },
    { header: 'Age (EOY)', width: 10 },
    ...(showSquadColumn ? [{ header: 'Squad', width: 22 }] : []),
    { header: 'Sessions', width: 11 },
    { header: 'Weekly Hours', width: 14 },
    ...(showTargets ? [{ header: 'Target Sessions', width: 15 }, { header: 'Target Hours', width: 14 }] : []),
    ...(showTargets ? [{ header: 'Session Variance', width: 16 }, { header: 'Hour Variance', width: 15 }] : []),
    { header: 'Allocated Sessions', width: 62 }
  ];
  const lastCol = columns.length;

  const ws = wb.addWorksheet('Session Allocations', {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } }
  });
  ws.columns = columns.map(c => ({ width: c.width }));

  const paint = (row, argb) => {
    for (let i = 1; i <= lastCol; i++) row.getCell(i).fill = fill(argb);
  };

  // --- Masthead -------------------------------------------------------------
  const eyebrow = ws.addRow(['ON-DEMAND AUDITING SUITE']);
  ws.mergeCells(eyebrow.number, 1, eyebrow.number, lastCol);
  eyebrow.getCell(1).font = { name: FONT, size: 9, bold: true, color: { argb: C.teal } };
  eyebrow.getCell(1).alignment = { vertical: 'middle', indent: 1 };
  eyebrow.height = 22;
  paint(eyebrow, C.bgDeep);

  const title = ws.addRow(['SESSION ALLOCATIONS']);
  ws.mergeCells(title.number, 1, title.number, lastCol);
  title.getCell(1).font = { name: FONT, size: 26, bold: true, color: { argb: C.white } };
  title.getCell(1).alignment = { vertical: 'middle', indent: 1 };
  title.height = 38;
  paint(title, C.bgDeep);

  const sub = ws.addRow([`Training sessions allocated per athlete · grouped by ${(GROUP_OPTIONS.find(o => o.value === groupBy)?.label || groupBy).toLowerCase()}`]);
  ws.mergeCells(sub.number, 1, sub.number, lastCol);
  sub.getCell(1).font = { name: FONT, size: 10, color: { argb: C.dim } };
  sub.getCell(1).alignment = { vertical: 'middle', indent: 1 };
  sub.height = 20;
  paint(sub, C.bgDeep);

  const stamp = ws.addRow([`Generated ${new Date().toLocaleString('en-GB')}`]);
  ws.mergeCells(stamp.number, 1, stamp.number, lastCol);
  stamp.getCell(1).font = { name: FONT, size: 9, italic: true, color: { argb: C.dim } };
  stamp.getCell(1).alignment = { vertical: 'middle', indent: 1 };
  stamp.height = 18;
  paint(stamp, C.bgDeep);

  // Cyan rule under the masthead, echoing the accent bar in the page hero
  const rule = ws.addRow([]);
  rule.height = 3;
  paint(rule, C.cyan);

  ws.addRow([]).height = 8;

  // --- Headline metric tiles ------------------------------------------------
  const tiles = [
    ['Athletes In Scope', totals.swimmers, null],
    ['Total Allocations', totals.allocations, null],
    ['Avg Sessions / Athlete', Number(totals.avgSessions.toFixed(1)), null],
    ['Weekly Athlete Hours', Number(totals.hours.toFixed(1)), null],
    ['Meeting Session Target', totals.meetingPct === null ? '—' : totals.meetingPct / 100,
      totals.meetingPct === null ? C.dim : totals.meetingPct < 75 ? C.amber : C.emerald]
  ];

  const tileLabelRow = ws.addRow([]);
  const tileValueRow = ws.addRow([]);
  tileLabelRow.height = 18;
  tileValueRow.height = 26;

  // Tiles span the sheet evenly; with few columns some tiles share a column.
  const span = Math.max(1, Math.floor(lastCol / tiles.length));
  tiles.forEach((t, i) => {
    const start = i * span + 1;
    const end = i === tiles.length - 1 ? lastCol : Math.min(lastCol, start + span - 1);
    if (start > lastCol) return;

    ws.mergeCells(tileLabelRow.number, start, tileLabelRow.number, end);
    const lc = tileLabelRow.getCell(start);
    lc.value = t[0].toUpperCase();
    lc.font = { name: FONT, size: 8, bold: true, color: { argb: C.dim } };
    lc.alignment = { vertical: 'middle', indent: 1 };

    ws.mergeCells(tileValueRow.number, start, tileValueRow.number, end);
    const vc = tileValueRow.getCell(start);
    vc.value = t[1];
    vc.font = { name: FONT, size: 16, bold: true, color: { argb: t[2] || C.white } };
    vc.alignment = { vertical: 'middle', indent: 1 };
    if (t[0] === 'Meeting Session Target' && typeof t[1] === 'number') vc.numFmt = '0%';
  });
  paint(tileLabelRow, C.bgCard);
  paint(tileValueRow, C.bgCard);

  ws.addRow([]).height = 10;

  // --- Filter summary -------------------------------------------------------
  const filterHead = ws.addRow(['REPORT PARAMETERS']);
  ws.mergeCells(filterHead.number, 1, filterHead.number, lastCol);
  filterHead.getCell(1).font = { name: FONT, size: 9, bold: true, color: { argb: C.cyan } };
  filterHead.getCell(1).alignment = { vertical: 'middle', indent: 1 };
  filterHead.height = 20;
  paint(filterHead, C.bgCard);

  describeFilters(data, options).forEach(([k, v]) => {
    const r = ws.addRow([k, v]);
    r.getCell(1).font = { name: FONT, size: 9, bold: true, color: { argb: C.dim } };
    r.getCell(1).alignment = { indent: 1 };
    r.getCell(2).font = { name: FONT, size: 9, color: { argb: C.white } };
    if (lastCol > 2) ws.mergeCells(r.number, 2, r.number, lastCol);
    paint(r, C.bgCard);
    r.height = 15;
  });

  if (!showTargets) {
    const warn = ws.addRow([`Weekly targets are omitted: each row covers only part of an athlete's week when grouping by ${(GROUP_OPTIONS.find(o => o.value === groupBy)?.label || groupBy).toLowerCase()}.`]);
    ws.mergeCells(warn.number, 1, warn.number, lastCol);
    warn.getCell(1).font = { name: FONT, size: 9, italic: true, color: { argb: C.amber } };
    warn.getCell(1).alignment = { vertical: 'middle', indent: 1 };
    warn.height = 18;
    paint(warn, C.bgCard);
  }

  ws.addRow([]).height = 12;

  // --- Group blocks ---------------------------------------------------------
  groups.forEach(group => {
    const gh = ws.addRow([group.label.toUpperCase()]);
    ws.mergeCells(gh.number, 1, gh.number, Math.max(1, lastCol - 3));
    gh.getCell(1).font = { name: FONT, size: 12, bold: true, color: { argb: C.white } };
    gh.getCell(1).alignment = { vertical: 'middle', indent: 1 };

    const statCell = ws.getCell(gh.number, Math.max(2, lastCol - 2));
    statCell.value = `${group.totalSwimmers} athletes  ·  ${group.totalSessions} allocations  ·  ${group.totalHours.toFixed(1)}h/week`
      + (showTargets && group.scoredCount ? `  ·  ${group.onTargetCount}/${group.scoredCount} on target` : '');
    statCell.font = { name: FONT, size: 9, bold: true, color: { argb: C.teal } };
    statCell.alignment = { vertical: 'middle', horizontal: 'right' };
    if (lastCol > 3) ws.mergeCells(gh.number, Math.max(2, lastCol - 2), gh.number, lastCol);
    gh.height = 24;
    paint(gh, C.bgCard);

    const hdr = ws.addRow(columns.map(c => c.header.toUpperCase()));
    hdr.height = 20;
    hdr.eachCell((cell, col) => {
      if (col > lastCol) return;
      cell.font = { name: FONT, size: 8, bold: true, color: { argb: C.dim } };
      cell.fill = fill(C.bgDeep);
      cell.alignment = { vertical: 'middle', horizontal: col === 1 ? 'left' : 'center', indent: col === 1 ? 1 : 0 };
      cell.border = { bottom: { style: 'thin', color: { argb: C.cyan } } };
    });

    group.entries.forEach((e, idx) => {
      const values = [
        e.swimmer.preferred_name + (e.swimmer.is_exempt ? '  (exempt)' : ''),
        e.swimmer.age_end_of_year ?? null,
        ...(showSquadColumn ? [e.swimmer.squad_name] : []),
        e.count,
        e.hours,
        ...(showTargets ? [e.targetSessions || null, e.targetHours || null] : []),
        ...(showTargets ? [e.sessionVariance, e.hourVariance] : []),
        e.sessions.map(s => `${s.day.slice(0, 3)} ${s.name} (${s.durationHours}h)`).join('  ·  ')
      ];
      const row = ws.addRow(values);
      row.height = 17;
      const band = idx % 2 === 0 ? C.bgRow : C.bgRowAlt;

      row.eachCell((cell, col) => {
        if (col > lastCol) return;
        cell.fill = fill(band);
        cell.font = { name: FONT, size: 9, color: { argb: C.white } };
        cell.alignment = { vertical: 'middle', horizontal: col === 1 || col === lastCol ? 'left' : 'center', indent: col === 1 ? 1 : 0 };
        cell.border = { bottom: thin };
      });

      // Walks the columns in the same order they are built above; keep the two
      // in step if a column is added.
      let c = 1;
      row.getCell(c).font = { name: FONT, size: 9, bold: true, color: { argb: e.swimmer.is_exempt ? C.amber : C.white } };
      c++;
      row.getCell(c).font = { name: FONT, size: 9, color: { argb: C.dim } }; // age at end of year
      c++;
      if (showSquadColumn) { row.getCell(c).font = { name: FONT, size: 9, color: { argb: C.dim } }; c++; }

      // Sessions allocated — red when zero, cyan otherwise, matching the screen
      row.getCell(c).font = { name: FONT, size: 10, bold: true, color: { argb: e.count === 0 ? C.rose : C.cyan } };
      c++;
      row.getCell(c).numFmt = '0.0"h"';
      c++;

      if (showTargets) {
        row.getCell(c).font = { name: FONT, size: 9, color: { argb: C.dim } };
        c++;
        row.getCell(c).numFmt = '0.0"h"';
        row.getCell(c).font = { name: FONT, size: 9, color: { argb: C.dim } };
        c++;

        const sv = row.getCell(c);
        sv.numFmt = '+0;-0;0';
        sv.font = { name: FONT, size: 9, bold: true, color: { argb: e.sessionVariance === null ? C.dim : e.sessionVariance >= 0 ? C.emerald : C.rose } };
        c++;
        const hv = row.getCell(c);
        hv.numFmt = '+0.0"h";-0.0"h";0"h"';
        hv.font = { name: FONT, size: 9, color: { argb: e.hourVariance === null ? C.dim : e.hourVariance >= 0 ? C.emerald : C.rose } };
        c++;
      }

      const sessCell = row.getCell(lastCol);
      if (e.sessions.length === 0) {
        sessCell.value = 'No sessions allocated';
        sessCell.font = { name: FONT, size: 9, italic: true, color: { argb: C.rose } };
      } else {
        sessCell.font = { name: FONT, size: 8, color: { argb: C.dim } };
      }
    });

    ws.addRow([]).height = 10;
  });

  // Every cell that carries no explicit fill still needs the deep background so
  // the sheet reads as one dark surface rather than a card floating on white.
  const usedRows = ws.rowCount;
  for (let r = 1; r <= usedRows + 30; r++) {
    const row = ws.getRow(r);
    for (let col = 1; col <= lastCol; col++) {
      const cell = row.getCell(col);
      if (!cell.fill) cell.fill = fill(C.bgDeep);
    }
    if (r > usedRows) row.height = 15;
  }

  // Freeze under the masthead so group headers stay readable while scrolling
  ws.views = [{ state: 'frozen', ySplit: 5, showGridLines: false }];
}

/** A plain, filterable sheet for anyone who wants to pivot the numbers. */
function buildFlatSheet(wb, report, options) {
  const ws = wb.addWorksheet('Data', { views: [{ state: 'frozen', ySplit: 1 }] });
  const showSquadColumn = true;

  ws.columns = [
    { header: 'Group', key: 'group', width: 26 },
    { header: 'Swimmer', key: 'swimmer', width: 26 },
    { header: 'Age (EOY)', key: 'age', width: 10 },
    ...(showSquadColumn ? [{ header: 'Squad', key: 'squad', width: 22 }] : []),
    { header: 'Sessions Allocated', key: 'count', width: 17 },
    { header: 'Weekly Hours', key: 'hours', width: 14 },
    { header: 'Target Sessions', key: 'tSessions', width: 15 },
    { header: 'Target Hours', key: 'tHours', width: 14 },
    { header: 'Session Variance', key: 'sVar', width: 16 },
    { header: 'Hour Variance', key: 'hVar', width: 15 },
    { header: 'Exempt', key: 'exempt', width: 9 },
    { header: 'Allocated Sessions', key: 'sessions', width: 70 }
  ];

  const head = ws.getRow(1);
  head.height = 22;
  head.eachCell(cell => {
    cell.font = { name: FONT, size: 9, bold: true, color: { argb: C.white } };
    cell.fill = fill(C.bgCard);
    cell.alignment = { vertical: 'middle' };
    cell.border = { bottom: { style: 'medium', color: { argb: C.cyan } } };
  });

  report.groups.forEach(group => {
    group.entries.forEach(e => {
      ws.addRow({
        group: group.label,
        swimmer: e.swimmer.preferred_name,
        age: e.swimmer.age_end_of_year ?? null,
        squad: e.swimmer.squad_name,
        count: e.count,
        hours: e.hours,
        tSessions: e.targetSessions || null,
        tHours: e.targetHours || null,
        sVar: e.sessionVariance,
        hVar: e.hourVariance,
        exempt: e.swimmer.is_exempt ? 'Yes' : 'No',
        sessions: e.sessions.map(s => `${s.day} ${s.name} (${s.durationHours}h)`).join(' | ')
      });
    });
  });

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };

  // Conditional colour on the variance columns so the flat sheet still reads at
  // a glance, without hard-coding a fill on every row. Resolved from the column
  // keys rather than fixed letters, so inserting a column cannot silently move
  // the formatting onto the wrong data.
  const columnLetter = (key) => {
    const idx = ws.columns.findIndex(c => c.key === key);
    return idx === -1 ? null : String.fromCharCode(65 + idx);
  };

  [columnLetter('sVar'), columnLetter('hVar')].filter(Boolean).forEach(col => {
    ws.addConditionalFormatting({
      ref: `${col}2:${col}${ws.rowCount}`,
      rules: [
        { type: 'cellIs', operator: 'lessThan', formulae: [0], priority: 1, style: { font: { color: { argb: 'FF9C0006' } }, fill: fill('FFFFC7CE') } },
        { type: 'cellIs', operator: 'greaterThanOrEqual', formulae: [0], priority: 2, style: { font: { color: { argb: 'FF006100' } }, fill: fill('FFC6EFCE') } }
      ]
    });
  });
}
