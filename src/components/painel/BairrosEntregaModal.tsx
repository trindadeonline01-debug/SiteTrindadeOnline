'use client'
import { useEffect, useMemo, useState } from 'react'
import { BAIRROS_SAO_GONCALO, normalizeBairro } from '@/lib/bairrosSaoGoncalo'

type BairroRow = { bairro: string; price: number; disabled: boolean }

function fmt(n: number) { return 'R$ ' + n.toFixed(2).replace('.', ',') }

// Painel "Bairros e valores de entrega" — pedido do Ricardo, set/2026: um
// jeito de conferir, na tela (Entrega e retirada / Pedidos), quanto a
// plataforma cobra por bairro no motoboy da Trindade Entrega, sem precisar
// abrir o admin. Busca sempre ao vivo no Supabase quando abre — nunca cache
// — porque se o admin mudar o valor tem que refletir na hora.
export default function BairrosEntregaModal({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<Record<string, BairroRow>>({})
  const [taxaMetodo, setTaxaMetodo] = useState<'bairro' | 'distancia'>('bairro')
  const [taxaPadrao, setTaxaPadrao] = useState(0)
  const [search, setSearch] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const [precosRes, bairrosRes] = await Promise.all([
        fetch('/api/entrega/precos').then(r => r.json()).catch(() => null),
        fetch('/api/admin/entrega-bairros').then(r => r.json()).catch(() => null),
      ])
      if (cancelled) return
      if (precosRes) {
        setTaxaMetodo(precosRes.taxaMetodo === 'distancia' ? 'distancia' : 'bairro')
        setTaxaPadrao(Number(precosRes.taxaPadrao) || 0)
      }
      const map: Record<string, BairroRow> = {}
      for (const b of (bairrosRes?.bairros || [])) {
        map[normalizeBairro(b.bairro)] = { bairro: b.bairro, price: Number(b.price) || 0, disabled: !!b.disabled }
      }
      setRows(map)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  const lista = useMemo(() => {
    const q = normalizeBairro(search)
    return BAIRROS_SAO_GONCALO
      .filter(nome => !q || normalizeBairro(nome).includes(q))
      .map(nome => {
        const row = rows[normalizeBairro(nome)]
        return {
          nome,
          price: row ? row.price : taxaPadrao,
          isPadrao: !row,
          disabled: row?.disabled || false,
        }
      })
  }, [search, rows, taxaPadrao])

  return (
    <div className="bev-overlay" onClick={onClose}>
      <div className="bev-modal" onClick={e => e.stopPropagation()}>
        <div className="bev-head">
          <div>
            <div className="bev-title">📍 Bairros e valores de entrega</div>
            <div className="bev-sub">Valor pago por quem pede entrega com o motoboy da plataforma</div>
          </div>
          <button className="bev-close" onClick={onClose} aria-label="Fechar">✕</button>
        </div>
        <input
          className="bev-search"
          placeholder="Buscar bairro..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {taxaMetodo === 'bairro' ? (
          <div className="bev-note">
            Bairro sem valor próprio cadastrado usa a taxa padrão da plataforma: <b>{fmt(taxaPadrao)}</b>.
          </div>
        ) : (
          <div className="bev-note bev-note-warn">
            A cobrança da plataforma está configurada por <b>distância</b>, não por bairro — os valores abaixo (taxa padrão {fmt(taxaPadrao)}) podem não refletir o que é cobrado de verdade em cada entrega.
          </div>
        )}
        <div className="bev-list">
          {loading && <div className="bev-empty">Carregando valores...</div>}
          {!loading && lista.length === 0 && <div className="bev-empty">Nenhum bairro encontrado.</div>}
          {!loading && lista.map(b => (
            <div className="bev-row" key={b.nome}>
              <span className={`bev-row-name ${b.disabled ? 'off' : ''}`}>{b.nome}</span>
              {b.disabled ? (
                <span className="bev-badge-off">Fora da área</span>
              ) : (
                <span className="bev-row-price">
                  {fmt(b.price)}
                  {b.isPadrao && <span className="bev-row-padrao"> (padrão)</span>}
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="bev-foot">Atualizado agora · valores geridos pelo admin</div>
      </div>
      <style>{`
        .bev-overlay{ position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:80;display:flex;align-items:center;justify-content:center;padding:16px; }
        .bev-modal{ background:#fff;border-radius:16px;max-width:460px;width:100%;max-height:88vh;display:flex;flex-direction:column;overflow:hidden;font-family:'Archivo',sans-serif; }
        .bev-head{ padding:16px 18px 12px;border-bottom:1px solid #F0EEE7;display:flex;align-items:flex-start;justify-content:space-between;gap:10px; }
        .bev-title{ font-size:16px;font-weight:800;color:#151210; }
        .bev-sub{ font-size:11.5px;font-weight:600;color:#A79E8B;margin-top:2px; }
        .bev-close{ width:26px;height:26px;border-radius:50%;background:#F5F6F2;color:#8A8478;border:none;font-size:13px;font-weight:700;cursor:pointer;flex:none; }
        .bev-search{ margin:12px 18px 0;padding:9px 12px;border-radius:9px;border:1px solid #E6E0D2;background:#F5F6F2;font-size:13px;font-family:inherit; }
        .bev-note{ margin:10px 18px 0;padding:8px 12px;border-radius:9px;background:#FBF6E8;color:#8A6410;font-size:11.5px;font-weight:600;line-height:1.4; }
        .bev-note-warn{ background:#FBEAEA;color:#C43D3D; }
        .bev-list{ flex:1;overflow-y:auto;margin-top:8px;padding-bottom:8px; }
        .bev-row{ display:flex;align-items:center;justify-content:space-between;padding:9px 18px;border-bottom:1px solid #F7F5F0; }
        .bev-row-name{ font-size:13px;font-weight:600;color:#151210; }
        .bev-row-name.off{ color:#C79A9A;text-decoration:line-through; }
        .bev-row-price{ font-size:13px;font-weight:800;color:#151210;white-space:nowrap; }
        .bev-row-padrao{ font-size:10px;font-weight:700;color:#C4BCA8; }
        .bev-badge-off{ font-size:11px;font-weight:800;color:#C43D3D;background:#FBEAEA;padding:3px 9px;border-radius:12px; }
        .bev-empty{ padding:24px 18px;text-align:center;color:#A79E8B;font-size:13px; }
        .bev-foot{ padding:10px 18px;border-top:1px solid #F0EEE7;font-size:10.5px;color:#C4BCA8;font-weight:600;text-align:center; }
      `}</style>
    </div>
  )
}
