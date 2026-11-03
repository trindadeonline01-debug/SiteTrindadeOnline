import { NextRequest, NextResponse } from 'next/server'
import { sb, acessoMesas, erro, r2, exigePinSupervisor } from '@/lib/mesas'
import { caixaAberto, resumoCaixa, movimentosDoCaixa, type CaixaRow } from '@/lib/caixa'

// Caixa da loja: abrir com troco, sangria/suprimento, fechar com conferência.
// Valores esperados são sempre calculados aqui (lib/caixa.ts) a partir das vendas
// reais — o tablet só informa o que contou na gaveta.

export async function POST(req: NextRequest) {
  try {
    const b = await req.json()
    const companyId = String(b.companyId || '')
    const acao = String(b.acao || '')
    if (!companyId || !acao) return erro('Dados obrigatórios.')
    const acc = await acessoMesas(req, companyId, { exigirLigado: false })
    if (acc instanceof NextResponse) return acc
    const { company } = acc
    const nomeOperador = String(b.operador || '').trim().slice(0, 40) || 'Caixa'
    const dinheiro = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? r2(n) : NaN }

    if (acao === 'status') {
      const aberto = await caixaAberto(companyId)
      const { data: hist } = await sb.from('loja_caixas').select('*').eq('company_id', companyId).eq('status', 'fechado').order('fechado_em', { ascending: false }).limit(20)
      const { count } = await sb.from('loja_caixas').select('id', { count: 'exact', head: true }).eq('company_id', companyId)
      if (!aberto) return NextResponse.json({ ok: true, caixa: null, adotado: (count || 0) > 0, historico: hist || [] })
      const movimentos = await movimentosDoCaixa(aberto.id)
      const resumo = await resumoCaixa(aberto, movimentos)
      return NextResponse.json({ ok: true, caixa: aberto, resumo, movimentos, adotado: true, historico: hist || [] })
    }

    if (acao === 'abrir') {
      const troco = dinheiro(b.troco)
      if (!(troco >= 0 && troco <= 10000)) return erro('Informe o troco inicial (pode ser zero).')
      const { data, error } = await sb.from('loja_caixas').insert({ company_id: companyId, troco_inicial: troco, aberto_por: nomeOperador }).select('id').single()
      if (error) {
        if (error.code === '23505') return erro('Já existe um caixa aberto nesta loja.', 409)
        return erro('Não consegui abrir o caixa: ' + error.message, 500)
      }
      return NextResponse.json({ ok: true, id: data.id })
    }

    const aberto = await caixaAberto(companyId)
    if (!aberto) return erro('Não há caixa aberto. Abra o caixa primeiro.', 409)

    if (acao === 'movimento') {
      const tipo = b.tipo === 'sangria' ? 'sangria' : b.tipo === 'suprimento' ? 'suprimento' : null
      if (!tipo) return erro('Tipo de movimento inválido.')
      const valor = dinheiro(b.valor)
      if (!(valor > 0 && valor <= 100000)) return erro('Informe um valor maior que zero.')
      const motivo = String(b.motivo || '').trim().slice(0, 120)
      if (tipo === 'sangria') {
        if (!motivo) return erro('Diga o motivo da sangria (ex.: depósito, pagamento de fornecedor).')
        const negado = await exigePinSupervisor(req, company, b.pin)
        if (negado) return negado
        const resumo = await resumoCaixa(aberto)
        if (valor > resumo.dinheiroEsperado + 0.005) return erro(`Não há tanto dinheiro na gaveta. Esperado agora: R$ ${resumo.dinheiroEsperado.toFixed(2).replace('.', ',')}.`)
      }
      const { error } = await sb.from('loja_caixa_movimentos').insert({ caixa_id: aberto.id, company_id: companyId, tipo, valor, motivo: motivo || null, por: nomeOperador })
      if (error) return erro('Não consegui registrar: ' + error.message, 500)
      return NextResponse.json({ ok: true })
    }

    if (acao === 'fechar') {
      const contado = dinheiro(b.contado)
      if (!(contado >= 0 && contado <= 1000000)) return erro('Informe quanto dinheiro há na gaveta (pode ser zero).')
      const movimentos = await movimentosDoCaixa(aberto.id)
      const fechadoEm = new Date().toISOString()
      const resumo = await resumoCaixa({ ...aberto, fechado_em: fechadoEm }, movimentos)
      const diferenca = r2(contado - resumo.dinheiroEsperado)
      const obs = String(b.observacao || '').trim().slice(0, 300)
      const { data, error } = await sb.from('loja_caixas').update({
        status: 'fechado', fechado_em: fechadoEm, fechado_por: nomeOperador,
        dinheiro_esperado: resumo.dinheiroEsperado, dinheiro_contado: contado, diferenca,
        observacao: obs || null, resumo: { ...resumo, movimentos },
      }).eq('id', aberto.id).eq('status', 'aberto').select('*').maybeSingle()
      if (error) return erro('Não consegui fechar o caixa: ' + error.message, 500)
      if (!data) return erro('Esse caixa já foi fechado.', 409)
      return NextResponse.json({ ok: true, caixa: data as CaixaRow })
    }

    return erro('Ação desconhecida.')
  } catch (e) {
    return erro(e instanceof Error ? e.message : 'Erro inesperado.', 500)
  }
}
