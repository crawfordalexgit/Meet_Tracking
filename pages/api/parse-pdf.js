import fs from 'fs';
import { getServiceSupabase } from '../../lib/supabase';
import { requireAuth } from '../../lib/api-auth';
import { isUuid } from '../../lib/validate';
import { reconcilePbs } from '../../lib/reconcile-pbs';

export const config = {
  api: {
    bodyParser: false,
  },
};

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB — a long meet results PDF
const ALLOWED_EXTENSIONS = /\.(pdf|txt|md)$/i;
const ALLOWED_MIMETYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/octet-stream', // some browsers send this for .md
]);

// formidable's `filter` runs per part, before the bytes are written to disk.
const uploadFilter = ({ originalFilename, mimetype }) => {
  if (!originalFilename || !ALLOWED_EXTENSIONS.test(originalFilename)) return false;
  return !mimetype || ALLOWED_MIMETYPES.has(mimetype);
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!await requireAuth(req, res)) return;

  let uploadedPath = null;
  try {
    const formidableMod = require('formidable');
    console.log(">>> PDF API: Formidable keys:", Object.keys(formidableMod));
    
    // Bound the upload: without these, the whole body is written to disk and
    // then read into memory with readFileSync — trivial memory exhaustion.
    const formOptions = {
      maxFiles: 1,
      maxFileSize: MAX_UPLOAD_BYTES,
      maxTotalFileSize: MAX_UPLOAD_BYTES,
      filter: uploadFilter,
    };

    // Defensive check for formidable v2 vs v3
    let form;
    if (typeof formidableMod === 'function') {
      form = formidableMod(formOptions);
    } else if (formidableMod.formidable) {
      form = formidableMod.formidable(formOptions);
    } else if (formidableMod.default) {
      form = formidableMod.default(formOptions);
    } else if (formidableMod.IncomingForm) {
      form = new formidableMod.IncomingForm(formOptions);
    } else {
      throw new Error("Could not find formidable constructor");
    }

    const pdfJsExtractPromise = require('pdf.js-extract');
    console.log(">>> PDF API: PDFExtract loading...");
    const PDFExtract = await pdfJsExtractPromise;
    console.log(">>> PDF API: PDFExtract loaded, type:", typeof PDFExtract);
    
    let pdfExtract;
    if (typeof PDFExtract === 'function') {
      pdfExtract = new PDFExtract();
    } else if (PDFExtract.PDFExtract && typeof PDFExtract.PDFExtract === 'function') {
      pdfExtract = new PDFExtract.PDFExtract();
    } else {
      throw new Error("Could not find PDFExtract constructor in resolved promise");
    }

    console.log(">>> PDF API: Parsing form...");
    const [fields, files] = await form.parse(req);
    const file = files.file?.[0];
    const meetId = fields.meetId?.[0]; 
    const uploadType = fields.type?.[0] || 'results'; // 'results' or 'staff'

    if (!file) {
      console.error(">>> PDF API: No file found in request");
      return res.status(400).json({ error: 'No file uploaded, or the file type is not supported (.pdf, .txt, .md)' });
    }
    uploadedPath = file.filepath;

    if (meetId && !isUuid(meetId)) {
      return res.status(400).json({ error: 'Invalid meetId: expected a UUID' });
    }

    console.log(`>>> PDF API: Extracting from ${file.filepath} (Meet: ${meetId || 'None'}). Type: ${uploadType}`);
    
    let cleanText = "";
    
    // Support for .txt, .md, and other plain text files
    if (file.mimetype === 'text/plain' || file.originalFilename.endsWith('.txt') || file.originalFilename.endsWith('.md')) {
      console.log(">>> PDF API: Detected text/markdown file. Reading directly.");
      cleanText = fs.readFileSync(file.filepath, 'utf8');
    } else {
      // PDF extraction logic
      const data = await pdfExtract.extract(file.filepath, {});
      
      // Improved line-by-line extraction to preserve table-like structures
      cleanText = data.pages
        .map(page => {
          const lines = {};
          page.content.forEach(item => {
            const y = Math.round(item.y / 5) * 5;
            if (!lines[y]) lines[y] = [];
            lines[y].push(item);
          });
          
          return Object.keys(lines)
            .sort((a, b) => a - b)
            .map(y => {
              return lines[y]
                .sort((a, b) => a.x - b.x)
                .map(item => item.str)
                .join(' ');
            })
            .join('\n');
        })
        .join('\n--- PAGE BREAK ---\n');
    }

    // Persist to database if meetId is provided (using service role to bypass RLS)
    if (meetId) {
      try {
        const supabase = getServiceSupabase();
        const updateData = uploadType === 'staff' ? { staff_text: cleanText } : { pdf_text: cleanText };
        const { error: dbError } = await supabase
          .from('meets')
          .update(updateData)
          .eq('id', meetId);
        
        if (dbError) {
          console.error(">>> PDF API: Database update error:", dbError);
        } else {
          console.log(">>> PDF API: Persisted text to meet", meetId);
        }
      } catch (dbErr) {
        console.error(">>> PDF API: Database persistence failed:", dbErr);
      }
    }

    console.log(`>>> PDF API: Success! Extracted ${cleanText.length} chars.`);

    // Reconcile PBs in-process. This used to POST to /api/reconcile-pbs with no
    // Authorization header, so it always 401'd and PBs were never reconciled
    // after an upload — the rejection was only console.error'd.
    if (meetId) {
      try {
        await reconcilePbs(getServiceSupabase());
      } catch (pbErr) {
        console.error(">>> PDF API: PB reconciliation failed:", pbErr.message);
      }
    }

    return res.status(200).json({ text: cleanText });

  } catch (error) {
    console.error(">>> PDF API ERROR:", error);
    if (error.code === 'ETOOBIG' || /maxFileSize|maxTotalFileSize/i.test(error.message || '')) {
      return res.status(413).json({ error: `File too large. Maximum is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.` });
    }
    return res.status(500).json({ error: error.message || 'Failed to parse PDF' });
  } finally {
    // formidable writes to /tmp; without this the warm instance's writable
    // quota fills up over time.
    if (uploadedPath) {
      try { fs.unlinkSync(uploadedPath); } catch { /* already gone */ }
    }
  }
}
