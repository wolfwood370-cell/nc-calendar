const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf-8');
const urlMatch = env.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/);
const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

async function run() {
  const { data, error } = await supabase.from('bookings').select('id, ignored').limit(1);
  console.log("With ignored:", data, error);
  
  const { data: d2, error: e2 } = await supabase.from('bookings').select('id, status').limit(1);
  console.log("Without ignored:", d2, e2);
}
run();
