import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL ?? 'https://acfjkjogsrqsctiymsxr.supabase.co';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_dc9cGMHhmSPRlYxx0ALerQ_SV_mRa8F';

export const supabase = createClient(url, anonKey);
