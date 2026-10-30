import { supabase } from '../supabase';

// Mesmas rotas que o painel do site já chama — o app não duplica regra de
// negócio, só pede ao servidor.
const BASE = 'https://www.trindadeonline.com.br';

async function token(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sessão expirada. Entre de novo.');
  return session.access_token;
}

async function send(path: string, body: Record<string, unknown>, headers: Record<string, string>) {
  const res = await fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Erro ${res.status}`);
  return json;
}

// Rotas novas do site (requireCompanyAccess): token no header Authorization.
export async function apiPost(path: string, body: Record<string, unknown>) {
  return send(path, body, { Authorization: `Bearer ${await token()}` });
}

// Rotas antigas de /api/entrega/*: token no corpo da requisição.
export async function apiPostComTokenNoCorpo(path: string, body: Record<string, unknown>) {
  return send(path, { ...body, access_token: await token() }, {});
}
