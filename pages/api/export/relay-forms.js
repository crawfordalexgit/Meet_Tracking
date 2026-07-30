/**
 * Fill the OFFICIAL Kent Relays Word forms and return them for download.
 *
 *   form: 'summary'      → Entry Summary form (the sheet emailed with the entry
 *                          file) — team counts per event, sub-totals, £12 total.
 *   form: 'declaration'  → Team Declaration form — one block per team with
 *                          swimmer names, DOB and gender (mixed events).
 *
 * Both are the real .docx templates from kentswimming.org with docxtemplater
 * tags injected into the exact cells (see lib/relays/templates/), so the output
 * is the official form filled in — not a re-creation.
 *
 * POST /api/export/relay-forms  { form, clubName, clubCode, teams: [...] }
 */

import fs from 'fs';
import path from 'path';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { requireAuth } from '../../../lib/api-auth';
import { AGE_BANDS, RELAYS, CATEGORIES, MEET } from '../../../lib/relays/kent-relays-config';

function render(templateFile, data) {
  const buf = fs.readFileSync(path.join(process.cwd(), 'lib', 'relays', 'templates', templateFile));
  const zip = new PizZip(buf);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
  doc.render(data);
  return doc.getZip().generate({ type: 'nodebuffer' });
}

// Entry-summary tag data: counts per event×category, sub-totals, grand total.
function summaryData(clubName, clubCode, teams) {
  const counts = {}; // `${g}_${band}_${relay}` → n
  for (const b of AGE_BANDS) for (const r of RELAYS) for (const c of CATEGORIES) counts[`${c.key.toLowerCase()}_${b.key}_${r.key}`] = 0;

  // A team whose keys don't match any known category/band/relay used to hit
  // `undefined++` → NaN, and the NaN propagated into the sub-totals and the fee
  // on the official Kent entry form. Unrecognised teams are now rejected loudly
  // rather than silently corrupting the form.
  const unknown = [];
  for (const t of teams) {
    const key = `${(t.catKey || '').toLowerCase()}_${t.bandKey}_${t.relayKey}`;
    if (!(key in counts)) {
      unknown.push(key);
      continue;
    }
    counts[key]++;
  }
  if (unknown.length) {
    throw new Error(`Unrecognised relay team(s): ${[...new Set(unknown)].join(', ')}. Check the category, age band and relay keys.`);
  }

  const data = { clubName: clubName || '', clubCode: clubCode || '' };
  let subM = 0, subF = 0, subX = 0;
  for (const [k, n] of Object.entries(counts)) {
    data[k] = n > 0 ? String(n) : '';
    if (k.startsWith('m_')) subM += n; else if (k.startsWith('f_')) subF += n; else subX += n;
  }
  data.sub_M = subM || '';
  data.sub_F = subF || '';
  data.sub_X = subX || '';
  data.grandTotal = String((subM + subF + subX) * MEET.feePerTeam);
  return data;
}

// Team-declaration loop data: one block per team, four swimmer rows.
function declarationData(clubName, teams) {
  const ordered = [...teams].sort((a, b) => (a.programmeNo || 999) - (b.programmeNo || 999));
  return {
    clubName: clubName || '',
    teams: ordered.map((t) => ({
      eventNo: t.programmeNo ? String(t.programmeNo) : '',
      teamName: t.teamName || t.letter,
      legs: (t.legs || []).map((l) => ({
        name: l.fullName || l.name || '',
        dob: l.yob ? String(l.yob) : '',            // only year of birth is held; club completes exact DOB
        gender: t.composition === '2M2F' ? (l.sex || '') : '',
      })),
    })),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end(); }
  const user = await requireAuth(req, res);
  if (!user) return;

  const { form = 'summary', clubName = '', clubCode = '', teams = [] } = req.body || {};

  // This output is submitted to an external body — validate the shape rather
  // than letting malformed input render blank cells or throw inside docxtemplater.
  if (!Array.isArray(teams)) {
    return res.status(400).json({ error: 'teams must be an array' });
  }
  if (teams.length > 200) {
    return res.status(400).json({ error: 'Too many teams for a single entry form' });
  }
  if (teams.some(t => !t || typeof t !== 'object')) {
    return res.status(400).json({ error: 'Every team must be an object' });
  }

  try {
    let buffer, filename;
    if (form === 'declaration') {
      buffer = render('declaration.docx', declarationData(clubName, teams));
      filename = 'Kent_Relays_2026_Team_Declaration.docx';
    } else {
      buffer = render('summary.docx', summaryData(clubName, clubCode, teams));
      filename = 'Kent_Relays_2026_Entry_Summary.docx';
    }
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (e) {
    res.status(500).json({ error: `Form generation failed: ${e.message}` });
  }
}
