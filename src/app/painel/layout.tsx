'use client'
import { Suspense, useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { moduleActive } from '@/lib/modules'
import { beep, unlockAudio } from '@/lib/beep'
import { autoImprimirPedido } from '@/lib/autoprint'
import { refreshSessionOnce } from '@/lib/authRefresh'
import { useRealtimeResync } from '@/hooks/useRealtimeResync'
import EmpresaShell, { type EmpresaNavKey } from '@/components/EmpresaShell'
import { PainelShellContext } from '@/contexts/PainelShellContext'

type ShellCompany = { id: string; name: string; slug: string; loja_digital_enabled: boolean; crm_whatsapp_enabled: boolean; entrega_enabled: boolean }
type SwitcherCompany = { id: string; name: string; slug?: string }

// Rotas que são "modos" de tela cheia (ESPECIFICACAO.md §4.4 — "modo não é
// página de menu") ou a tela "Mais" do mobile: não levam a sidebar/topbar
// do painel, cada uma cuida do próprio layout.
const BARE_ROUTES = ['/painel/mais', '/painel/cozinha']

const TAB_TO_KEY_PAINEL: Record<string, EmpresaNavKey> = {
  destaques: 'destaques', banners: 'banners', avaliacoes: 'avaliacoes', perfil: 'perfil',
  plano: 'plano', cupons: 'cupons', promocoes: 'promocoes',
}
const TAB_TO_KEY_PESSOAL: Record<string, EmpresaNavKey> = {
  perfil: 'pessoal-perfil', anuncios: 'pessoal-anuncios', avaliacoes: 'pessoal-avaliacoes',
  favoritos: 'pessoal-favoritos', cupons: 'pessoal-cupons', pedidos: 'pessoal-pedidos',
}

// Palpite de qual item da sidebar destacar, só a partir da URL — cobre toda
// rota 1-pra-1. /painel e /painel/pessoal têm abas que às vezes trocam sem
// mudar a URL (setTab interno) — essas duas se corrigem via override no
// contexto (ver PainelShellContext), isso aqui é só o valor inicial/fallback.
function deriveActiveKey(pathname: string, tab: string | null): EmpresaNavKey {
  if (pathname === '/painel') return (tab && TAB_TO_KEY_PAINEL[tab]) || 'dashboard'
  if (pathname === '/painel/pessoal') return (tab && TAB_TO_KEY_PESSOAL[tab]) || 'pessoal-perfil'
  if (pathname.startsWith('/painel/pedidos')) return 'pedidos'
  if (pathname.startsWith('/painel/interesses')) return 'interesses'
  if (pathname.startsWith('/painel/mensagens')) return 'mensagens'
  if (pathname.startsWith('/painel/catalogo')) return 'catalogo'
  if (pathname.startsWith('/painel/compartilhar')) return 'compartilhar'
  if (pathname.startsWith('/painel/entrega')) return 'entrega'
  if (pathname.startsWith('/painel/motoboys')) return 'motoboys'
  if (pathname.startsWith('/painel/clientes')) return 'clientes'
  if (pathname.startsWith('/painel/relatorios')) return 'relatorios'
  return 'dashboard'
}

export default function PainelLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--concrete)' }} />}>
      <PainelLayoutInner>{children}</PainelLayoutInner>
    </Suspense>
  )
}

function PainelLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const bare = BARE_ROUTES.includes(pathname)

  const [loading, setLoading] = useState(true)
  const [company, setCompany] = useState<ShellCompany | null>(null)
  const [isAdminMode, setIsAdminMode] = useState(false)
  const [adminEmpresaId, setAdminEmpresaId] = useState<string | null>(null)
  const [avaliacoesBadge, setAvaliacoesBadge] = useState(0)
  const [pedidosBadge, setPedidosBadge] = useState(0)
  const [activeOverride, setActiveOverride] = useState<EmpresaNavKey | null>(null)
  const [switcherExtras, setSwitcherExtras] = useState<{ companies?: SwitcherCompany[]; onSwitchCompany?: (c: SwitcherCompany) => void } | null>(null)
  const [printerName, setPrinterNameState] = useState('')
  const [autoAceitar, setAutoAceitarState] = useState(true)
  // Refs pra leitura dentro do handler de realtime, criado uma vez só por
  // company.id — sem isso ele sempre veria o valor do momento em que foi
  // registrado, mesmo depois de mudar a impressora ou o auto-aceitar.
  const printerNameRef = useRef('')
  const autoAceitarRef = useRef(true)
  useEffect(() => { printerNameRef.current = printerName }, [printerName])
  useEffect(() => { autoAceitarRef.current = autoAceitar }, [autoAceitar])

  function setPrinterName(name: string) {
    setPrinterNameState(name)
    if (company) supabase.from('companies').update({ loja_impressora_nome: name || null }).eq('id', company.id).then(() => {})
  }
  function setAutoAceitar(v: boolean) {
    setAutoAceitarState(v)
    if (company) supabase.from('companies').update({ loja_auto_aceitar_pedidos: v }).eq('id', company.id).then(() => {})
  }

  async function refreshPedidosBadge(companyId: string) {
    const { count } = await supabase.from('loja_pedidos').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'recebido')
    setPedidosBadge(count || 0)
  }

  // Destrava o áudio a cada toque/clique na tela — celular exige um gesto
  // do usuário antes de deixar tocar som, e o pedido chega pelo WebSocket
  // (sem gesto nenhum). Não é "só uma vez": iOS volta a suspender o
  // AudioContext depois que a aba fica em segundo plano (tela apagada,
  // trocou de app), então cada toque tenta destravar de novo — resume() num
  // contexto que já está rodando não custa nada. Mesmo assim, no iPhone o
  // som sintetizado ainda pode sair mudo se o interruptor físico lateral
  // estiver no modo silencioso — Safari trata som via Web Audio como
  // "ambiente" por padrão, categoria que respeita esse interruptor; ver
  // setPlaybackAudioSession() em src/lib/beep.ts pra pedir categoria
  // "playback" (Safari 17+), que ignora o interruptor igual app de música.
  useEffect(() => {
    const handler = () => unlockAudio()
    document.addEventListener('pointerdown', handler)
    document.addEventListener('touchstart', handler)
    document.addEventListener('keydown', handler)
    return () => {
      document.removeEventListener('pointerdown', handler)
      document.removeEventListener('touchstart', handler)
      document.removeEventListener('keydown', handler)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.href = `/login?redirect=${pathname}`; return }
      const { data: profile } = await supabase.from('profiles').select('user_type').eq('id', session.user.id).single()
      const empresaParam = new URLSearchParams(window.location.search).get('empresa')

      const COMPANY_SELECT = 'id,name,slug,loja_digital_enabled,crm_whatsapp_enabled,entrega_enabled,trial_modules_until,loja_auto_aceitar_pedidos,loja_impressora_nome'
      let comp: any = null
      if (profile?.user_type === 'admin' && empresaParam) {
        const { data } = await supabase.from('companies')
          .select(COMPANY_SELECT)
          .eq('id', empresaParam).maybeSingle()
        comp = data
        if (!cancelled) { setIsAdminMode(true); setAdminEmpresaId(empresaParam) }
      } else if (profile?.user_type === 'company') {
        const { data } = await supabase.from('companies')
          .select(COMPANY_SELECT)
          .eq('owner_id', session.user.id).order('created_at', { ascending: true }).limit(1).maybeSingle()
        comp = data
      } else if (profile?.user_type !== 'admin') {
        window.location.href = '/'; return
      }
      if (cancelled) return

      if (comp) {
        setCompany({
          id: comp.id, name: comp.name, slug: comp.slug,
          loja_digital_enabled: moduleActive(comp.loja_digital_enabled, comp.trial_modules_until),
          crm_whatsapp_enabled: moduleActive(comp.crm_whatsapp_enabled, comp.trial_modules_until),
          entrega_enabled: moduleActive(comp.entrega_enabled, comp.trial_modules_until),
        })
        setAutoAceitarState(comp.loja_auto_aceitar_pedidos !== false)
        setPrinterNameState(comp.loja_impressora_nome || '')
        const { data: revs } = await supabase.from('reviews').select('*, response:review_responses(text)').eq('company_id', comp.id)
        if (!cancelled) setAvaliacoesBadge((revs || []).filter((r: any) => !r.response || (Array.isArray(r.response) && r.response.length === 0)).length)
        if (!cancelled) refreshPedidosBadge(comp.id)
      }
      setLoading(false)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Impressão automática de pedido novo — mora aqui (não em /painel/pedidos)
  // de propósito: o layout persiste entre navegações, então continua
  // imprimindo mesmo com outra tela do painel aberta (achado real do
  // Ricardo, set/2026 — antes só imprimia com a tela de Pedidos em foco).
  // Recria o canal (e força renovar o token) sempre que a aba volta a
  // ficar visível/em foco/com internet — celular com tela apagada deixa o
  // WebSocket "vivo" mas surdo, sem erro nenhum, e foi exatamente o que
  // aconteceu na loja da Vivi (set/2026): pedido chegou sem som e sem
  // atualizar a tela, só voltou ao normal com F5. Ver useRealtimeResync.
  const resyncTick = useRealtimeResync()
  useEffect(() => {
    if (!company?.id) return
    refreshSessionOnce().catch(() => {})
    unlockAudio()
    refreshPedidosBadge(company.id)
    const channel = supabase.channel(`pedidos-print-${company.id}-${resyncTick}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'loja_pedidos', filter: `company_id=eq.${company.id}` }, payload => {
        beep()
        refreshPedidosBadge(company.id)
        if (autoAceitarRef.current && printerNameRef.current) {
          autoImprimirPedido(company.name, payload.new.id as string, printerNameRef.current)
        }
      })
      // Recontagem do badge "N pedidos pendentes" da tabbar do mobile — some
      // sozinha quando o pedido sai de "recebido" (lojista aceita/avança) ou
      // é cancelado/excluído.
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'loja_pedidos', filter: `company_id=eq.${company.id}` }, () => refreshPedidosBadge(company.id))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'loja_pedidos', filter: `company_id=eq.${company.id}` }, () => refreshPedidosBadge(company.id))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id, company?.name, resyncTick])

  if (bare) return <>{children}</>

  const active = activeOverride || deriveActiveKey(pathname, searchParams.get('tab'))

  return (
    <PainelShellContext.Provider value={{ company, loading, isAdminMode, setActiveOverride, setSwitcherExtras, printerName, autoAceitar, setPrinterName, setAutoAceitar }}>
      <EmpresaShell
        active={active}
        companyName={company?.name}
        companySlug={company?.slug}
        lojaDigitalEnabled={company?.loja_digital_enabled}
        crmEnabled={company?.crm_whatsapp_enabled}
        entregaEnabled={company?.entrega_enabled}
        avaliacoesBadge={avaliacoesBadge}
        pedidosBadge={pedidosBadge}
        companies={switcherExtras?.companies as any}
        onSwitchCompany={switcherExtras?.onSwitchCompany as any}
        adminEmpresaId={isAdminMode ? adminEmpresaId ?? undefined : undefined}
      >
        {isAdminMode && (
          <div style={{ position: 'sticky', top: 0, zIndex: 30, background: '#1A0F00', color: '#F0EDE8', padding: '9px 16px', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span>🛠️ Modo admin — vendo como <strong>{company?.name || 'carregando...'}</strong></span>
            <a href="/admin?tab=empresas" style={{ color: 'var(--sign)', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>← Voltar ao admin</a>
          </div>
        )}
        {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#AAA', fontFamily: 'Archivo,sans-serif', fontSize: 13 }}>Carregando...</div> : children}
      </EmpresaShell>
    </PainelShellContext.Provider>
  )
}
