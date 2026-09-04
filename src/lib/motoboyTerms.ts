// Texto único do Termo de Parceria — usado tanto na tela pública de
// cadastro (/motoboy/cadastro) quanto na geração do PDF de assinatura
// (motoboyTermsPdf.ts), pra nunca existirem duas versões divergentes do
// mesmo termo. Mudou o texto, muda a versão — aceites antigos continuam
// apontando pro texto que existia quando foram assinados.
export const MOTOBOY_TERMS_VERSION = 'v1'

export const MOTOBOY_TERMS_SECTIONS: { title: string; body: string }[] = [
  {
    title: '1. O que é essa parceria',
    body: 'Você atua como entregador parceiro autônomo, usando moto e equipamentos próprios, sem horário fixo e sem exclusividade — pode aceitar ou recusar qualquer corrida oferecida, e pode atender (ou não) outras plataformas ao mesmo tempo.',
  },
  {
    title: '2. Não é emprego',
    body: 'Essa parceria não gera vínculo empregatício com a Trindade Online — não há relação de subordinação, horário controlado, salário fixo, 13º, férias ou qualquer outro direito da CLT. É o mesmo modelo usado por iFood, 99Food e Rappi com seus entregadores parceiros.',
  },
  {
    title: '3. Como funciona o pagamento',
    body: 'Você recebe o valor definido para cada corrida, informado antes de você aceitar. Esse valor pode ser alterado pela Trindade Online a qualquer momento e sem aviso prévio (por distância, horário, demanda, etc.) — a mudança vale só pras corridas seguintes, nunca pras que você já aceitou. Os repasses são feitos via Pix, na chave que você cadastrar.',
  },
  {
    title: '4. Responsabilidades suas',
    body: 'Manter CNH válida, moto em dia (documento, seguro se tiver) e cumprir as leis de trânsito. Acidentes, multas e danos durante as corridas são de sua responsabilidade — a Trindade Online é só quem conecta você ao pedido.',
  },
  {
    title: '5. Seus documentos',
    body: 'As fotos e documentos enviados aqui são usados só pra confirmar sua identidade e a segurança da operação, conforme a LGPD — não são compartilhados com terceiros.',
  },
  {
    title: '6. Fim da parceria',
    body: 'Você pode parar de atender quando quiser, sem precisar avisar. A Trindade Online também pode suspender ou encerrar seu cadastro a qualquer momento, principalmente em caso de denúncia, comportamento inadequado ou documentos inválidos.',
  },
]
