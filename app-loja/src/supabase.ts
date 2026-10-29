import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Diferente do app-motoboy (token opaco próprio, motoboy não é usuário
// Supabase Auth de verdade) — o lojista JÁ tem login de verdade, então aqui
// dá pra usar @supabase/supabase-js direto, com a mesma política de RLS que
// o painel web já usa (dono só lê/edita a própria empresa). URL e chave
// publicável não são segredo — são os mesmos já embutidos no bundle do site.
const SUPABASE_URL = 'https://plfuznchzuzardkfjmqo.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_l-CdQoONQgg863HX9qiRqg_VB9O-uNx';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
