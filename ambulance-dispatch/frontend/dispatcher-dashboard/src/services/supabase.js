import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://djyephboyfoglucmcopn.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqeWVwaGJveWZvZ2x1Y21jb3BuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4ODg2OTYsImV4cCI6MjEwMjQ2NDY5Nn0.5SL4QSdQ0LPCw4wCsiy2JxTlxtxpYhGq21tghdaNOuE';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 20,
    },
  },
});

export default supabase;
