import { createClient } from '@supabase/supabase-js';

const rawUrl = import.meta.env.VITE_SUPABASE_URL || 'https://viumtrijqnprgsnvflgo.supabase.co';
// Clean URL: remove trailing slashes and /rest/v1 if present
const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_D6wbd62iNLK_e2s43XQAlA_P3JWZCM1';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
