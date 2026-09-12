import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getEntregaPricing } from '@/lib/entregaPricing'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Preço da diária + ofertas (pacotes) ativas — público (só número, sem dado
// de empresa nenhum), usado pela tela de compra em /painel/entrega pra
// montar a prévia do valor antes de gerar o Pix.
export async function GET() {
  const pricing = await getEntregaPricing()
  const { data: pacotes } = await supabase
    .from('entrega_pacotes').select('id, categoria, nome, quantidade, preco')
    .eq('ativo', true).order('categoria').order('quantidade')

  return NextResponse.json({
    diaria: pricing.diaria,
    pacotes: pacotes || [],
  })
}
