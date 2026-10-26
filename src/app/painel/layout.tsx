'use client'
import { Suspense, useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { moduleActive } from '@/lib/modules'
import { beep, unlockAudio } from '@/lib/beep'
import { autoImprimirPedido } from '@/lib/autoprint'
import { isRawBtMode } from '@/lib/qzPrint'
import { refreshSessionOnce } from '@/lib/authRefresh'
import { useRealtimeResync } from '@/hooks/useRealtimeResync'
import EmpresaShell, { type EmpresaNavKey } from '@/components/EmpresaShell'
import { PainelShellContext } from '@/contexts/PainelShellContext'

type ShellCompany = { id: string; name: string; slug: string; loja_digital_enabled: boolean; crm_whatsapp_enabled: boolean; crm_atendimento_pilot: boolean; crm_vendas_pilot: boolean; entrega_enabled: boolean; entrega_chamada_automatica: boolean; store_paused: boolean }
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
  if (pathname.startsWith('/painel/atendimento')) return 'atendimento'
  if (pathname.startsWith('/painel/radar')) return 'radar'
  if (pathname.startsWith('/painel/relatorios')) return 'relatorios'
  if (pathname.startsWith('/painel/pagamentos')) return 'pagamentos'
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
  // Todos os negócios do dono logado (não só o ativo) — alimenta o
  // seletor "es-switch-list" da sidebar em QUALQUER tela do painel, não só
  // no Dashboard. Fica vazio pro admin em modo impersonação (?empresa=),
  // que nunca vê seletor. set/2026: caso real Marilene (Calçada do Peixe +
  // Peixaria Trindade LTDA), dono com 2+ negócios só ligados via
  // membership/owner_id, precisando trocar de um pro outro sem deslogar.
  const [ownerCompanies, setOwnerCompanies] = useState<any[]>([])
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
  function setStorePaused(paused: boolean) {
    setCompany(prev => prev ? { ...prev, store_paused: paused } : prev)
    if (company) supabase.from('companies').update({ store_paused: paused }).eq('id', company.id).then(() => {})
  }

  async function refreshPedidosBadge(companyId: string) {
    const { count } = await supabase.from('loja_pedidos').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'recebido')
    setPedidosBadge(count || 0)
  }
  async function refreshAvaliacoesBadge(companyId: string) {
    const { data: revs } = await supabase.from('reviews').select('*, response:review_responses(text)').eq('company_id', companyId)
    setAvaliacoesBadge((revs || []).filter((r: any) => !r.response || (Array.isArray(r.response) && r.response.length === 0)).length)
  }
  // Aplica os dados da empresa ativa no shell — usado tanto na resolução
  // inicial quanto ao trocar de negócio pelo seletor da sidebar.
  // forceUnlocked só é true pro admin em impersonação (?empresa=): cadeado
  // de plano não pode travar o próprio admin testando/configurando.
  function applyActiveCompany(comp: any, forceUnlocked = false) {
    setCompany({
      id: comp.id, name: comp.name, slug: comp.slug,
      loja_digital_enabled: forceUnlocked || moduleActive(comp.loja_digital_enabled, comp.trial_modules_until),
      crm_whatsapp_enabled: forceUnlocked || moduleActive(comp.crm_whatsapp_enabled, comp.trial_modules_until),
      crm_atendimento_pilot: !!comp.crm_atendimento_pilot,
      crm_vendas_pilot: !!comp.crm_vendas_pilot,
      entrega_enabled: forceUnlocked || moduleActive(comp.entrega_enabled, comp.trial_modules_until),
      entrega_chamada_automatica: comp.entrega_chamada_automatica !== false,
      store_paused: !!comp.store_paused,
    })
    setAutoAceitarState(comp.loja_auto_aceitar_pedidos !== false)
    setPrinterNameState(comp.loja_impressora_nome || '')
    refreshAvaliacoesBadge(comp.id)
    refreshPedidosBadge(comp.id)
  }
  // Troca a empresa ativa entre os negócios do mesmo dono — a seleção fica
  // salva por conta (localStorage) pra sobreviver a reload/navegação.
  function switchCompany(id: string) {
    const comp = ownerCompanies.find((c: any) => c.id === id)
    if (!comp) return
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      try { localStorage.setItem(`painel_empresa_ativa_${session.user.id}`, id) } catch {}
    })
    applyActiveCompany(comp)
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

      const COMPANY_SELECT = 'id,name,slug,loja_digital_enabled,crm_whatsapp_enabled,crm_atendimento_pilot,crm_vendas_pilot,entrega_enabled,entrega_chamada_automatica,trial_modules_until,loja_auto_aceitar_pedidos,loja_impressora_nome,store_paused'
      let comp: any = null
      const adminOverride = profile?.user_type === 'admin' && !!empresaParam
      if (adminOverride) {
        const { data } = await supabase.from('companies')
          .select(COMPANY_SELECT)
          .eq('id', empresaParam).maybeSingle()
        comp = data
        if (!cancelled) { setIsAdminMode(true); setAdminEmpresaId(empresaParam) }
      } else if (profile?.user_type === 'company') {
        const { data } = await supabase.from('companies')
          .select(COMPANY_SELECT)
          .eq('owner_id', session.user.id).order('created_at', { ascending: true })
        const list = data || []
        if (!cancelled) setOwnerCompanies(list)
        // Empresa ativa: a última escolhida no seletor (persistida por
        // conta), se ainda estiver na lista — senão a mais antiga, como
        // sempre foi. Dono com 1 negócio só nunca vê o seletor (ownerCompanies
        // com 1 item), então esse ramo é irrelevante pra ele.
        let savedId: string | null = null
        try { savedId = localStorage.getItem(`painel_empresa_ativa_${session.user.id}`) } catch {}
        comp = (savedId && list.find((c: any) => c.id === savedId)) || list[0] || null
      } else if (profile?.user_type !== 'admin') {
        window.location.href = '/'; return
      }
      if (cancelled) return

      // Admin editando o cardápio de uma empresa (?empresa=) precisa
      // acessar toda função do painel pra configurar/testar por ela, mesmo
      // que o plano dela não tenha os módulos ativos — pedido do Ricardo,
      // set/2026: cadeado de plano não pode travar o próprio admin. Só
      // afeta o que aparece nessa sessão de impersonação; não muda o
      // módulo real da empresa no banco.
      if (comp) applyActiveCompany(comp, adminOverride)
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
  //
  // Catch-up (out/2026): recriar o canal sozinho não resolve o pedido que
  // chegou DURANTE o intervalo surdo — esse INSERT nunca foi entregue a
  // canal nenhum, então nunca tocava nem imprimia, e só aparecia na lista
  // quando alguém abria a tela de Pedidos. Causa real da "impressão
  // intermitente" relatada pelo Ricardo (Peixaria Trindade, Calçada do
  // Peixe, Mineroca — as 3 com mais volume). `printedIdsRef` deduplica por
  // pedido (evita imprimir 2x o mesmo se ele chegar tanto pelo catch-up
  // quanto pelo realtime); `lastCheckRef` marca até onde já foi coberto,
  // resetado pra null ao trocar de empresa (nunca busca histórico de outra
  // loja) e no primeiro mount (nunca busca o backlog inteiro ao abrir o
  // painel, só o que ficou pra trás a partir daqui).
  const resyncTick = useRealtimeResync()
  const printedIdsRef = useRef<Set<string>>(new Set())
  const lastCheckRef = useRef<string | null>(null)
  const prevCompanyIdRef = useRef<string | null>(null)
  function tryPrintPedido(id: string): boolean {
    if (printedIdsRef.current.has(id)) return false
    printedIdsRef.current.add(id)
    // RawBT (tablet) fica de fora da impressão automática de propósito —
    // o Android só deixa abrir outro app (RawBT) a partir de um toque de
    // verdade na tela; chamado sozinho aqui (sem gesto nenhum, veio do
    // realtime/catch-up) o navegador bloqueia silenciosamente. Só o QZ Tray
    // (computador) consegue imprimir sem alguém tocar em nada.
    if (autoAceitarRef.current && printerNameRef.current && company && !isRawBtMode(printerNameRef.current)) {
      autoImprimirPedido(company.name, id, printerNameRef.current)
    }
    return true
  }
  useEffect(() => {
    if (!company?.id) return
    refreshSessionOnce().catch(() => {})
    unlockAudio()
    refreshPedidosBadge(company.id)

    const isNewCompany = prevCompanyIdRef.current !== company.id
    prevCompanyIdRef.current = company.id
    const since = isNewCompany ? null : lastCheckRef.current
    lastCheckRef.current = new Date().toISOString()
    if (since) {
      supabase.from('loja_pedidos').select('id').eq('company_id', company.id).eq('status', 'recebido').gt('created_at', since)
        .then(({ data }) => { (data || []).forEach(p => { if (tryPrintPedido(p.id)) beep() }) })
    }

    const channel = supabase.channel(`pedidos-print-${company.id}-${resyncTick}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'loja_pedidos', filter: `company_id=eq.${company.id}` }, payload => {
        refreshPedidosBadge(company.id)
        if (tryPrintPedido(payload.new.id as string)) beep()
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

  const switcherList: SwitcherCompany[] = ownerCompanies.map((c: any) => ({ id: c.id, name: c.name, slug: c.slug }))

  return (
    <PainelShellContext.Provider value={{ company, loading, isAdminMode, setActiveOverride, printerName, autoAceitar, setPrinterName, setAutoAceitar, setStorePaused }}>
      <EmpresaShell
        active={active}
        companyName={company?.name}
        companySlug={company?.slug}
        lojaDigitalEnabled={company?.loja_digital_enabled}
        crmEnabled={company?.crm_whatsapp_enabled}
        crmAtendimentoPilot={company?.crm_atendimento_pilot}
        crmVendasPilot={company?.crm_vendas_pilot}
        entregaEnabled={company?.entrega_enabled}
        avaliacoesBadge={avaliacoesBadge}
        pedidosBadge={pedidosBadge}
        companies={switcherList.length > 1 ? switcherList : undefined}
        onSwitchCompany={switcherList.length > 1 ? (c) => switchCompany(c.id) : undefined}
        adminEmpresaId={isAdminMode ? adminEmpresaId ?? undefined : undefined}
      >
        {isAdminMode && (
          // Não-sticky de propósito (Ricardo, set/2026, no mobile): já tinha
          // sido corrigido uma vez um header grudado sobrepondo o topo do
          // painel (783b50e — header do site sobre o cabeçalho do Catálogo)
          // e voltou a acontecer aqui, cortando o topo da tela mesmo
          // rolando. Essa faixa é só um aviso pro admin (nenhum lojista
          // normal chega a ver) — não vale manter sticky e correr o risco
          // de grudar por cima de conteúdo de novo. flexWrap garante que
          // "Voltar ao admin" nunca fica espremido/cortado se o nome da
          // empresa for longo em tela estreita.
          <div style={{ position: 'relative', zIndex: 30, background: '#1A0F00', color: '#F0EDE8', padding: '9px 16px', fontSize: 12, fontWeight: 600, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span>🛠️ Modo admin — vendo como <strong>{company?.name || 'carregando...'}</strong></span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {/* Pausar/retomar sem precisar sair da tela atual (ex: Catálogo)
                  pra ir até a Visão geral — pedido do Ricardo, out/2026. Fora
                  de /painel só (lá a Visão geral já tem o próprio toggle
                  grande; duplicar aqui criaria duas fontes da mesma coisa na
                  mesma tela, podendo ficar dessincronizadas entre si). */}
              {company && pathname !== '/painel' && (
                <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(240,237,232,0.3)' }}>
                  <button
                    onClick={() => setStorePaused(false)}
                    disabled={!company.store_paused}
                    style={{
                      padding: '5px 10px', fontSize: 11, fontWeight: 700, fontFamily: 'Archivo,sans-serif', border: 'none', cursor: company.store_paused ? 'pointer' : 'default',
                      background: company.store_paused ? 'transparent' : 'var(--sign)', color: company.store_paused ? '#F0EDE8' : 'var(--ink)',
                    }}
                  >🟢 Automático</button>
                  <button
                    onClick={() => setStorePaused(true)}
                    disabled={company.store_paused}
                    style={{
                      padding: '5px 10px', fontSize: 11, fontWeight: 700, fontFamily: 'Archivo,sans-serif', border: 'none', cursor: !company.store_paused ? 'pointer' : 'default',
                      background: company.store_paused ? '#C43D3D' : 'transparent', color: company.store_paused ? '#fff' : '#F0EDE8',
                    }}
                  >🔴 Pausar loja</button>
                </div>
              )}
              <a href="/admin?tab=empresas" style={{ color: 'var(--sign)', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>← Voltar ao admin</a>
            </div>
          </div>
        )}
        {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#AAA', fontFamily: 'Archivo,sans-serif', fontSize: 13 }}>Carregando...</div> : children}
      </EmpresaShell>
    </PainelShellContext.Provider>
  )
}
