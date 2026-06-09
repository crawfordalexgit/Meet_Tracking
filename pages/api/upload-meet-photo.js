import fs from 'fs';
import { getServiceSupabase } from '../../lib/supabase';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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

    // Validate it's an image
    const mimeType = file.mimetype || 'image/jpeg';
    if (!mimeType.startsWith('image/')) {
      return res.status(400).json({ error: 'Only image files are supported' });
    }

    const supabase = getServiceSupabase();

    // Ensure the meet-photos bucket exists (create silently if not)
    await supabase.storage.createBucket('meet-photos', { public: true }).catch(() => {});

    // Read file buffer and build storage path
    const fileBuffer = fs.readFileSync(file.filepath);
    const fileExt = (file.originalFilename?.split('.').pop() || 'jpg').toLowerCase();
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
