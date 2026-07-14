import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  try {
    const { data, error } = await supabase.rpc('recompute_order_status_atomic', {
      p_order_id: 'dummy_order_id'
    });
    console.log('recompute_order_status_atomic Result:', { data, error });
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

run();
