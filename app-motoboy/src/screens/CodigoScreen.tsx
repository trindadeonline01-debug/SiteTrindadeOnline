import { useState } from 'react'
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, fonts } from '../theme'
import Icon from '../components/Icon'
import Keypad from '../components/Keypad'

export type CodigoAlvo = { id: string; label: string }
type Props = {
  etapa: 'retirada' | 'entrega'
  titulo: string
  quem: string // "o lojista da Confeitaria da Juju" / "a Pâmela"
  alvos: CodigoAlvo[] // 1 = corrida solo; 2+ = retirada em grupo (um código por pedido)
  confirmarLabel: string
  onBack: () => void
  // Devolve um mapa id → mensagem de erro (vazio = tudo certo).
  onConfirm: (codes: Record<string, string>) => Promise<Record<string, string>>
}

// Código de 4 dígitos com teclado próprio — redesenho aprovado (nov/2026).
// Retirada em grupo: um chip por pedido, cada um com o seu código.
export default function CodigoScreen({ etapa, titulo, quem, alvos, confirmarLabel, onBack, onConfirm }: Props) {
  const [codes, setCodes] = useState<Record<string, string>>({})
  const [ativo, setAtivo] = useState(alvos[0].id)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const code = codes[ativo] || ''
  const completo = alvos.every(a => (codes[a.id] || '').length === 4)

  function digit(d: string) {
    if (code.length >= 4) return
    setErros(e => ({ ...e, [ativo]: '' }))
    const next = code + d
    setCodes(c => ({ ...c, [ativo]: next }))
    // Em grupo, pula sozinho pro próximo pedido que ainda falta.
    if (next.length === 4 && alvos.length > 1) {
      const falta = alvos.find(a => a.id !== ativo && (codes[a.id] || '').length < 4)
      if (falta) setAtivo(falta.id)
    }
  }
  function back() { setCodes(c => ({ ...c, [ativo]: code.slice(0, -1) })) }

  async function confirmar() {
    setBusy(true)
    try {
      const r = await onConfirm(codes)
      setErros(r)
      const primeiro = alvos.find(a => r[a.id])
      if (primeiro) {
        setAtivo(primeiro.id)
        setCodes(c => { const n = { ...c }; Object.keys(r).forEach(id => { if (r[id]) n[id] = '' }); return n })
      }
    } finally { setBusy(false) }
  }

  const erro = erros[ativo]
  return (
    <SafeAreaView style={s.wrap}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <Pressable accessibilityLabel="Voltar" style={s.backBtn} onPress={onBack}><Icon name="chevronLeft" size={22} stroke={2.4} /></Pressable>
          <View style={s.etapa}><Text style={s.etapaTxt}>{etapa === 'retirada' ? 'ETAPA 1 DE 2 · RETIRAR' : 'ETAPA 2 DE 2 · ENTREGAR'}</Text></View>
        </View>

        <Text style={s.titulo}>{titulo}</Text>
        <Text style={s.sub}>Peça o código de 4 números {quem}.{etapa === 'entrega' ? ' É ele que libera o seu pagamento.' : ''}</Text>

        {alvos.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginTop: 16 }} contentContainerStyle={{ gap: 8 }}>
            {alvos.map(a => {
              const ok = (codes[a.id] || '').length === 4
              return (
                <Pressable key={a.id} style={[s.chip, a.id === ativo && s.chipOn, !!erros[a.id] && s.chipErro]} onPress={() => setAtivo(a.id)}>
                  {ok && <Icon name="check" size={14} color={a.id === ativo ? colors.gold : colors.good} stroke={3} />}
                  <Text style={[s.chipTxt, a.id === ativo && { color: colors.gold }]}>{a.label}</Text>
                </Pressable>
              )
            })}
          </ScrollView>
        )}

        <View style={s.boxes}>
          {[0, 1, 2, 3].map(i => {
            const cur = i === code.length && !busy
            return (
              <View key={i} style={[s.box, cur && s.boxCur, !!erro && s.boxErro]}>
                {code[i] ? <Text style={s.digit}>{code[i]}</Text> : cur ? <View style={s.caret} /> : null}
              </View>
            )
          })}
        </View>

        <View style={s.status}>
          {erro ? <Text style={s.erro}>{erro}</Text>
            : completo ? <View style={s.okRow}><Icon name="check" size={16} color={colors.goodDark} stroke={2.6} /><Text style={s.ok}>Código completo — pode confirmar</Text></View>
            : null}
        </View>

        <Keypad onDigit={digit} onBackspace={back} />
      </ScrollView>

      <View style={s.footer}>
        <Pressable style={[s.confirm, (!completo || busy) && s.confirmOff]} disabled={!completo || busy} onPress={confirmar}>
          {busy ? <ActivityIndicator color={colors.ink} /> : (
            <>
              <Icon name="check" size={22} color={completo ? colors.ink : colors.muted} stroke={2.8} />
              <Text style={[s.confirmTxt, !completo && { color: colors.muted }]}>{confirmarLabel}</Text>
            </>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.paper },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  etapa: { backgroundColor: colors.ink, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12 },
  etapaTxt: { color: colors.gold, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  titulo: { marginTop: 20, fontSize: 30, fontWeight: '800', color: colors.ink, lineHeight: 34 },
  sub: { marginTop: 8, fontSize: 15, lineHeight: 21, color: colors.muted },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, borderWidth: 1.5, borderColor: colors.btnBorder, backgroundColor: colors.card, paddingVertical: 8, paddingHorizontal: 14 },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipErro: { borderColor: colors.bad },
  chipTxt: { fontSize: 13, fontWeight: '700', color: colors.ink },
  boxes: { flexDirection: 'row', gap: 12, justifyContent: 'center', marginTop: 22 },
  box: { width: 74, height: 90, borderRadius: 20, backgroundColor: colors.card, borderWidth: 2, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  boxCur: { borderColor: colors.gold, borderWidth: 3 },
  boxErro: { borderColor: colors.bad },
  digit: { fontFamily: fonts.display, fontSize: 62, lineHeight: 70, color: colors.ink, paddingTop: 6 },
  caret: { width: 3, height: 44, borderRadius: 2, backgroundColor: colors.ink },
  status: { minHeight: 36, alignItems: 'center', justifyContent: 'center', marginTop: 4, marginBottom: 6 },
  okRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ok: { color: colors.goodDark, fontSize: 13, fontWeight: '700' },
  erro: { color: colors.bad, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  footer: { paddingHorizontal: 20, paddingBottom: 12, paddingTop: 6 },
  confirm: { height: 64, borderRadius: 18, backgroundColor: colors.gold, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  confirmOff: { backgroundColor: colors.disabled },
  confirmTxt: { fontSize: 17, fontWeight: '800', color: colors.ink },
})
