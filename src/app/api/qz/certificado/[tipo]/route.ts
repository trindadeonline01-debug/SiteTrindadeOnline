import { NextRequest, NextResponse } from 'next/server'
import { QZ_CERTIFICATE } from '@/lib/qzPrint'
import { QZ_ROOT_CA_CERTIFICATE } from '@/lib/qzRootCa'

// Serve os dois certificados públicos do QZ Tray como download direto —
// sempre a partir do que está no código, então nunca fica desatualizado
// em relação ao que o site realmente usa (evita o problema de antes: um
// certificado gerado numa sessão e nunca salvo em lugar nenhum pra
// download). Nenhum dos dois é sensível — são as chaves PRIVADAS que
// nunca saem do servidor/nunca são commitadas.
const FILES: Record<string, { content: string; filename: string }> = {
  raiz: { content: QZ_ROOT_CA_CERTIFICATE, filename: 'trindade-online-root-ca.crt' },
  site: { content: QZ_CERTIFICATE, filename: 'trindade-online-site.crt' },
}

export async function GET(req: NextRequest, context: { params: Promise<{ tipo: string }> }) {
  const { tipo } = await context.params
  const file = FILES[tipo]
  if (!file) return NextResponse.json({ error: 'tipo inválido — use "raiz" ou "site"' }, { status: 400 })

  return new NextResponse(file.content, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-x509-ca-cert',
      'Content-Disposition': `attachment; filename="${file.filename}"`,
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
