const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://okfecjwpxuqbkcfbtfcw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rZmVjandweHVxYmtjZmJ0ZmN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MTY5ODQsImV4cCI6MjA5NjA5Mjk4NH0.fcsrJkS3MVwDpmck3_9cZ8twtyzdfrKb4rqM-S7jr6E';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function check() {
    const tables = ['profiles', 'likes', 'comments', 'shares', 'follows', 'videos'];
    for (const t of tables) {
        const { data, error } = await supabase.from(t).select('*').limit(1);
        if (error) {
            console.log(`Table ${t} error: ${error.message}`);
        } else {
            console.log(`Table ${t} exists. Rows: ${JSON.stringify(data)}`);
        }
    }
}
check();
