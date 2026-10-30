import { NextRequest, NextResponse } from 'next/server'
import { processarFilaWhatsApp } from '@/lib/whatsappFila'

// Chamado pelo pg_cron `whatsapp-fila` a cada 5 min — manda no máximo 1
// mensagem da fila por chamada (ver src/lib/whatsappFila.ts).
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const result = await processarFilaWhatsApp()
  return NextResponse.json({ ok: true, ...result })
}
