// Texto das ofertas (puro, sem Supabase — pode ser usado no navegador e no servidor).
export function primeiroNome(nome: string | null | undefined): string {
  const p = (nome || '').trim().split(/\s+/)[0] || ''
  if (!p || /\d/.test(p) || p.length < 2) return ''
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()
}

// Troca {nome} pelo primeiro nome; sem nome, tira a palavra sem deixar vírgula sobrando.
export function personalizar(modelo: string, nome: string | null | undefined): string {
  const n = primeiroNome(nome)
  let t = modelo.replace(/\{nome\}/gi, n)
  if (!n) {
    t = t.replace(/\s+([,!?.])/g, '$1').replace(/,\s*([!?.])/g, '$1').replace(/^\s*[,!]\s*/, '').replace(/\s{2,}/g, ' ').trim()
    t = t.charAt(0).toUpperCase() + t.slice(1)
  }
  return t.trim()
}
