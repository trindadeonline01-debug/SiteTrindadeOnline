import { notifyAdmin } from '@/lib/notifyAdmin'
import { resolveOwnerNotifyPhone, sendPlatformWhatsApp } from '@/lib/whatsapp'

// Avisa admin + lojista que a conta do Mercado Pago saiu da plataforma.
// Diferente dos avisos de pedido, não depende do módulo CRM WhatsApp estar
// ativo: perder a conexão afeta o recebimento, o dono precisa saber sempre.
// Best-effort — nunca lança erro pro chamador.
export async function avisarMpDesconectado(companyId: string, empresa: string, motivo: string, pelaLoja: boolean) {
  let lojistaAvisado = false
  try {
    const { phone } = await resolveOwnerNotifyPhone(companyId)
    if (phone) {
      const texto = pelaLoja
        ? `🔌 Sua conta do Mercado Pago foi desconectada da plataforma Trindade Online.\n\nSe não foi você, ou quiser voltar a receber Pix e cartão direto pelo site, é só conectar de novo em Painel → Pagamentos.`
        : `⚠️ Sua conta do Mercado Pago foi desconectada da plataforma Trindade Online.\n\nSem essa conexão, você para de receber pagamentos por Pix e cartão pelo site. Entre em Painel → Pagamentos e conecte de novo o quanto antes.`
      lojistaAvisado = (await sendPlatformWhatsApp(phone, texto)).ok
    }
  } catch (err) {
    console.error('[avisarMpDesconectado] lojista', companyId, err)
  }
  await notifyAdmin({ type: 'mp_desconectado', empresa, motivo, lojistaAvisado })
}
