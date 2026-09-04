import { NextResponse } from 'next/server'
import { getTodayValues } from '@/lib/entregaPricing'

// Preço de hoje pra diária e pra entrega — público (só número, sem dado de
// empresa nenhum), usado pela tela de compra em /painel/entrega pra montar
// a prévia do valor antes de gerar o Pix.
export async function GET() {
  const { pricing, dayType, diaria, entrega, today } = await getTodayValues()
  return NextResponse.json({
    today, dayType, diaria, entrega,
    pacoteDias: pricing.pacote_dias, pacoteDesconto: pricing.pacote_desconto,
  })
}
