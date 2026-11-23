export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(503).json({ error: 'Configuration Supabase indisponible.' });
  }

  res.setHeader('Cache-Control', 'no-store, max-age=0');
  return res.status(200).json({ supabaseUrl, supabaseAnonKey });
}
