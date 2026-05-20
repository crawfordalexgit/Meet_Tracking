import fs from 'fs';
import { getServiceSupabase } from '../../lib/supabase';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  console.log(">>> PDF API HEARTBEAT: STARTING HANDLER");
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const formidableMod = require('formidable');
    console.log(">>> PDF API: Formidable keys:", Object.keys(formidableMod));
    
    // Defensive check for formidable v2 vs v3
    let form;
    if (typeof formidableMod === 'function') {
      form = formidableMod({});
    } else if (formidableMod.formidable) {
      form = formidableMod.formidable({});
    } else if (formidableMod.default) {
      form = formidableMod.default({});
    } else if (formidableMod.IncomingForm) {
      form = new formidableMod.IncomingForm();
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
      return res.status(400).json({ error: 'No file uploaded' });
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
    // Trigger PB Reconciler in the background
    fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/reconcile-pbs`, { method: 'POST' }).catch(console.error);
    return res.status(200).json({ text: cleanText });

  } catch (error) {
    console.error(">>> PDF API ERROR:", error);
    return res.status(500).json({ error: error.message || 'Failed to parse PDF' });
  }
}
