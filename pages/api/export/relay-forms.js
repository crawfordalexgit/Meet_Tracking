/**
 * Generate the Kent Relays entry paperwork as a single Word document:
 *   1. Entry Summary — teams per event and the £12/team fee total (cond 2.1/2.2)
 *   2. Team Declaration — names, year of birth and a blank DOB column per team
 *      (cond 3.14.1). The club only holds year of birth (GDPR), so the exact
 *      day/month is left for the secretary to complete.
 *
 * POST /api/export/relay-forms  { clubName, teams: [...] }  → .docx download
 */

import { requireAuth } from '../../../lib/api-auth';
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, HeadingLevel,
} from 'docx';
import { MEET } from '../../../lib/relays/kent-relays-config';

function cell(text, { bold = false, width, align } = {}) {
  return new TableCell({
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    children: [new Paragraph({
      alignment: align,
      children: [new TextRun({ text: String(text ?? ''), bold, size: 20 })],
    })],
  });
}

function headerRow(labels, widths) {
  return new TableRow({
    tableHeader: true,
    children: labels.map((l, i) => cell(l, { bold: true, width: widths?.[i] })),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end(); }
  const user = await requireAuth(req, res);
  if (!user) return;

  const { clubName = 'Club', teams = [] } = req.body || {};
  const ordered = [...teams].sort((a, b) => (a.programmeNo || 999) - (b.programmeNo || 999));

  const children = [];

  children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: MEET.name })] }));
  children.push(new Paragraph({ children: [new TextRun({ text: `${clubName}  ·  ${MEET.venue}  ·  ${MEET.date}  ·  ${MEET.courseLabel}`, italics: true, size: 20 })] }));
  children.push(new Paragraph({ children: [new TextRun({ text: `Entries close ${MEET.closes}. Age taken as at ${MEET.ageAsAt}.`, size: 18, color: '666666' })] }));
  children.push(new Paragraph({ text: '' }));

  // 1. Entry Summary
  children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: 'Entry summary' })] }));
  const byEvent = new Map();
  for (const t of ordered) {
    if (!byEvent.has(t.eventKey)) byEvent.set(t.eventKey, { label: t.label, programmeNo: t.programmeNo, count: 0 });
    byEvent.get(t.eventKey).count += 1;
  }
  const summaryRows = [headerRow(['Event no.', 'Event', 'Teams', 'Fee (£)'], [12, 58, 15, 15])];
  let totalTeams = 0;
  for (const ev of [...byEvent.values()].sort((a, b) => (a.programmeNo || 999) - (b.programmeNo || 999))) {
    totalTeams += ev.count;
    summaryRows.push(new TableRow({ children: [
      cell(ev.programmeNo || '—', { align: AlignmentType.CENTER }),
      cell(ev.label),
      cell(ev.count, { align: AlignmentType.CENTER }),
      cell((ev.count * MEET.feePerTeam).toFixed(0), { align: AlignmentType.CENTER }),
    ] }));
  }
  summaryRows.push(new TableRow({ children: [
    cell('', {}), cell('Total', { bold: true }),
    cell(totalTeams, { bold: true, align: AlignmentType.CENTER }),
    cell((totalTeams * MEET.feePerTeam).toFixed(0), { bold: true, align: AlignmentType.CENTER }),
  ] }));
  children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: summaryRows }));
  children.push(new Paragraph({ children: [new TextRun({ text: `Payment reference: ${MEET.code === 'KT26' ? 'CLUBCODE-Relays26' : ''}`, size: 18, color: '666666' })] }));
  children.push(new Paragraph({ text: '' }));

  // 2. Team Declaration
  children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: 'Team declaration' })] }));
  children.push(new Paragraph({ children: [new TextRun({ text: 'DOB column left blank for the club to complete — only year of birth is held on file.', size: 18, color: '666666' })] }));
  if (ordered.some((t) => (t.legs || []).some((l) => l.converted))) {
    children.push(new Paragraph({ children: [new TextRun({ text: '* 50m time estimated from a long-course PB (no short-course time on record) — verify before entry.', size: 18, color: '996600' })] }));
  }
  children.push(new Paragraph({ text: '' }));

  for (const t of ordered) {
    const title = `${t.programmeNo ? `[${t.programmeNo}] ` : ''}${t.label} — Team ${t.letter}   (entry time ${t.entryTime || '—'})`;
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text: title })] }));
    const rows = [headerRow(['Leg', 'Swimmer', 'Year', 'Date of birth', '50m time'], [12, 40, 12, 22, 14])];
    for (const l of t.legs) {
      rows.push(new TableRow({ children: [
        cell(l.stroke), cell(l.fullName || l.name),
        cell(l.yob || '', { align: AlignmentType.CENTER }),
        cell('', {}), cell((l.time || '') + (l.converted ? ' *' : ''), { align: AlignmentType.CENTER }),
      ] }));
    }
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }));
    children.push(new Paragraph({ text: '' }));
  }

  const doc = new Document({ sections: [{ children }] });
  const buffer = await Packer.toBuffer(doc);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="Kent_Relays_2026_Entry_${clubName.replace(/[^a-z0-9]/gi, '_')}.docx"`);
  res.send(buffer);
}
