#!/usr/bin/env python3
# Ajuste dos programas de disparo da VPS (/opt/blast) para poderem mandar pelo WAHA.
# - Faz cópia de segurança dos arquivos antes (index.js.bak-waha, server.js.bak-waha).
# - Mantém o envio pela Evolution como padrão: só passa a usar o WAHA quando a variável de ambiente
#   WA_PROVIDER=waha estiver ligada no PM2. Sem a variável, nada muda.
# - Pode rodar mais de uma vez (não aplica duas vezes). Se algum trecho não for encontrado, para sem mexer em nada.
import re, shutil, sys

WAHA = """    if (process.env.WA_PROVIDER === 'waha') {
      const wres = await fetch((process.env.WAHA_URL || 'http://127.0.0.1:3000') + '/api/sendText', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': process.env.WAHA_API_KEY || '' },
        body: JSON.stringify({ session: process.env.WAHA_SESSION || 'plataforma', chatId: formatted + '@c.us', text: message })
      })
      if (!wres.ok) { return { ok: false, error: await wres.text() } }
      return { ok: true }
    }
"""
CABECALHO = "async function sendWhatsApp(phone, message) {\n  try {\n    const formatted = formatPhone(phone)\n"

def patch(path, extra=None):
    s = open(path, encoding='utf-8').read()
    if "WA_PROVIDER" in s:
        print(path + ': já ajustado, nada a fazer'); return
    if CABECALHO not in s:
        sys.exit(path + ': trecho de sendWhatsApp não encontrado — nada foi alterado')
    novo = s.replace(CABECALHO, CABECALHO + WAHA, 1)
    if extra:
        novo = extra(novo, path)
    shutil.copyfile(path, path + '.bak-waha')
    open(path, 'w', encoding='utf-8').write(novo)
    print(path + ': ajustado (cópia em ' + path + '.bak-waha)')

def server_extra(s, path):
    # /send-test chamava a Evolution direto; passa a usar sendWhatsApp (que já escolhe o provedor)
    padrao = re.compile(r"const evoRes = await fetch\(.*?const data = await evoRes\.text\(\)", re.S)
    if not padrao.search(s):
        sys.exit(path + ': bloco do /send-test não encontrado — nada foi alterado')
    return padrao.sub("const r = await sendWhatsApp(phone, message)\n        const evoRes = { ok: r.ok }\n        const data = r.error || ''", s, count=1)

patch('/opt/blast/index.js')
patch('/opt/blast/server.js', server_extra)
