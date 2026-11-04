'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { iaLiberadaParaEmpresa } from '@/lib/atendimentoIA'

// Campo "Informações para o atendente de IA" no Perfil da empresa (nov/2026).
// Mesmo dado de Mensagens → ⚙️ (companies.crm_ia_prompt_extra), mas num lugar
// fácil de achar e com espaço de verdade pra escrever. A IA lê este texto em
// TODA resposta (crmIA.ts → buildContext) como informação oficial do dono.

const MAX = 4000

export default function InstrucoesIA({ companyId }: { companyId: string }) {
  const [texto, setTexto] = useState('')
  const [original, setOriginal] = useState('')
  const [carregado, setCarregado] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    let vivo = true
    supabase.from('companies').select('crm_ia_prompt_extra').eq('id', companyId).maybeSingle()
      .then(({ data }) => {
        if (!vivo) return
        const t = (data?.crm_ia_prompt_extra as string | null) || ''
        setTexto(t); setOriginal(t); setCarregado(true)
      })
    return () => { vivo = false }
  }, [companyId])

  if (!iaLiberadaParaEmpresa(companyId)) return null

  async function salvar() {
    setSalvando(true); setMsg('')
    const valor = texto.trim() || null
    const { error } = await supabase.from('companies').update({ crm_ia_prompt_extra: valor }).eq('id', companyId)
    setSalvando(false)
    if (error) { setMsg('Não consegui salvar: ' + error.message); return }
    setOriginal(texto.trim()); setTexto(texto.trim())
    setMsg('Salvo! A IA já usa essas informações na próxima resposta.')
    setTimeout(() => setMsg(''), 4000)
  }

  const alterado = texto.trim() !== original.trim()

  return (
    <div className="sec-card">
      <div className="sec-hdr"><span className="sec-title">🤖 INFORMAÇÕES PARA O ATENDENTE DE IA</span></div>
      <div style={{ padding: '4px 18px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: '#4f4c47' }}>
          Escreva aqui o que a IA precisa saber sobre a sua loja e que não está no cadastro: se tem loja física, regras da casa,
          pratos do dia, promoções, bairros que não atende, como funciona retirada, o que ela nunca deve prometer. A IA lê
          este campo em <b>toda</b> resposta e trata como informação oficial sua.
        </p>
        <textarea
          value={texto} disabled={!carregado} maxLength={MAX} rows={9}
          onChange={e => setTexto(e.target.value)}
          placeholder={'Exemplos:\n- Temos loja física na Rua X, 123 (aceita mesa e retirada no balcão).\n- Não entregamos no bairro Y.\n- Aos domingos servimos só o prato executivo.\n- Nunca prometa horário exato de entrega.'}
          style={{ width: '100%', boxSizing: 'border-box', padding: 12, borderRadius: 10, border: '1.5px solid #B9AE97', background: '#F4F1E9', fontFamily: 'inherit', fontSize: 14, lineHeight: 1.5, resize: 'vertical', minHeight: 140 }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: '#6F6C67' }}>{texto.length}/{MAX} caracteres</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {msg && <span role="status" style={{ fontSize: 13, fontWeight: 600, color: msg.startsWith('Salvo') ? '#0F8050' : '#B3261A' }}>{msg}</span>}
            <button
              type="button" onClick={salvar} disabled={!alterado || salvando || !carregado}
              style={{ minHeight: 44, padding: '0 20px', borderRadius: 8, border: 'none', background: alterado ? '#151210' : '#D7CFBE', color: alterado ? '#fff' : '#6F6C67', fontWeight: 700, fontSize: 14, cursor: alterado ? 'pointer' : 'default' }}
            >{salvando ? 'Salvando…' : 'Salvar informações'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
