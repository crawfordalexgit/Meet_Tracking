import fs from 'fs';
import { getServiceSupabase } from '../../lib/supabase';
import { requireAuth } from '../../lib/api-auth';

export const config = {
  api: {
    bodyParser: false,
  },
};

const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!await requireAuth(req, res)) return;

  try {
    // Resolve formidable across v2/v3
    const formidableMod = require('formidable');
    let form;
    if (typeof formidableMod === 'function') form = formidableMod({});
    else if (formidableMod.formidable) form = formidableMod.formidable({});
    else if (formidableMod.default) form = formidableMod.default({});
    else if (formidableMod.IncomingForm) form = new formidableMod.IncomingForm();
    else throw new Error('Could not find formidable constructor');

    const [fields, files] = await form.parse(req);
    const file = files.file?.[0];
    const meetId = fields.meetId?.[0];

    if (!file) return res.status(400).json({ error: 'No file provided' });
    if (!meetId) return res.status(400).json({ error: 'No meetId provided' });

    if (!UUID_RE.test(meetId)) {
      return res.status(400).json({ error: 'Invalid meetId' });
    }

    const mimeType = file.mimetype || '';
    const fileExt = (file.originalFilename?.split('.').pop() || '').toLowerCase();

    if (!mimeType.startsWith('image/') || mimeType === 'image/svg+xml') {
      return res.status(400).json({ error: 'Only raster image files are supported' });
    }
    if (!ALLOWED_EXTENSIONS.has(fileExt)) {
      return res.status(400).json({ error: 'File extension not allowed' });
    }

    const supabase = getServiceSupabase();

    // Ensure the meet-photos bucket exists (create silently if not)
    await supabase.storage.createBucket('meet-photos', { public: true }).catch(() => {});

    // Read file buffer and build storage path
    const fileBuffer = fs.readFileSync(file.filepath);
    const storagePath = `${meetId}/gala-photo.${fileExt}`;

    // Upload (upsert so re-uploads replace the previous photo)
    const { error: uploadError } = await supabase.storage
      .from('meet-photos')
      .upload(storagePath, fileBuffer, { contentType: mimeType, upsert: true });

    if (uploadError) throw uploadError;

    // Get the public URL
    const { data: { publicUrl } } = supabase.storage
      .from('meet-photos')
      .getPublicUrl(storagePath);

    // Persist to the meets table
    const { error: dbError } = await supabase
      .from('meets')
      .update({ photo_url: publicUrl })
      .eq('id', meetId);

    if (dbError) {
      // Column may not exist yet — return URL anyway so the UI can still display it
      console.warn('>>> PHOTO UPLOAD: Could not save photo_url to DB:', dbError.message);
      console.warn('>>> Run this SQL in Supabase: ALTER TABLE public.meets ADD COLUMN IF NOT EXISTS photo_url TEXT;');
    }

    return res.status(200).json({ url: publicUrl });

  } catch (error) {
    console.error('>>> PHOTO UPLOAD ERROR:', error);
    return res.status(500).json({ error: error.message || 'Upload failed' });
  }
}
