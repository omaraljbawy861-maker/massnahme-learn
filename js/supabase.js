import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const SUPABASE_URL = "https://edzuhinhxhoxxocfjvbu.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_PVmHT2QwKiWtWYEgb-nYkw_dd2VtQiO";
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
});