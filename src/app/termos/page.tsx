'use client'
import { useState } from 'react'
import Link from 'next/link'

const DATA_ATUALIZACAO = '27 de junho de 2026'

export default function TermosPage() {
  const [tab, setTab] = useState<'termos'|'privacidade'>('termos')

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{font-family:'Inter',sans-serif;background:#fff;}
        .topbar{background:#111;padding:13px 24px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:50;}
        .logo{font-family:'Bebas Neue',sans-serif;font-size:20px;color:#fff;letter-spacing:2px;text-decoration:none;}
        .logo span{color:#C9951A;}
        .hero{background:linear-gradient(160deg,#fff,#FEF8EC);padding:36px 24px;border-bottom:1px solid #F0EDE8;text-align:center;}
        .hero-title{font-family:'Bebas Neue',sans-serif;font-size:clamp(28px,4vw,40px);color:#111;letter-spacing:2px;margin-bottom:6px;}
        .hero-sub{font-size:13px;color:#AAA;}
        .page{max-width:760px;margin:0 auto;padding:32px 24px 56px;}
        @media(max-width:767px){.page{padding:24px 16px 48px;}}
        .tabs{display:flex;gap:4px;background:#FAFAF8;padding:5px;border-radius:12px;border:0.5px solid #E0DDD8;margin-bottom:28px;}
        .tab{flex:1;padding:9px;text-align:center;font-size:13px;font-weight:600;color:#888;cursor:pointer;border-radius:9px;transition:all .15s;font-family:'Inter',sans-serif;}
        .tab.on{background:#fff;color:#C9951A;box-shadow:0 1px 4px rgba(0,0,0,.08);}
        .date{font-size:11px;color:#AAA;margin-bottom:24px;}
        .sec{margin-bottom:0;}
        .sec-title{font-family:'Bebas Neue',sans-serif;font-size:14px;color:#111;letter-spacing:1px;margin-bottom:8px;margin-top:28px;padding-top:28px;border-top:0.5px solid #F0EDE8;}
        .sec-title:first-of-type{margin-top:0;padding-top:0;border-top:none;}
        .sec-num{color:#C9951A;}
        p{font-size:13px;color:#555;line-height:1.85;margin-bottom:10px;}
        ul{font-size:13px;color:#555;line-height:1.85;margin-bottom:10px;padding-left:20px;}
        li{margin-bottom:4px;}
        strong{color:#222;font-weight:600;}
        .highlight{background:#FEF3E2;border-left:3px solid #C9951A;border-radius:0 8px 8px 0;padding:12px 14px;margin:12px 0;font-size:13px;color:#554010;line-height:1.7;}
        .footer{padding:28px 0 0;text-align:center;font-size:12px;color:#AAA;border-top:0.5px solid #F0EDE8;margin-top:32px;}
        .footer a{color:#C9951A;text-decoration:none;}
      `}</style>

      <div className="topbar">
        <Link className="logo" href="/">TRINDADE <span>ONLINE</span></Link>
      </div>

      <div className="hero">
        <div className="hero-title">TERMOS E PRIVACIDADE</div>
        <div className="hero-sub">Última atualização: {DATA_ATUALIZACAO}</div>
      </div>

      <div className="page">
        <div className="tabs">
          <div className={`tab ${tab==='termos'?'on':''}`} onClick={()=>setTab('termos')}>📋 Termos de Uso</div>
          <div className={`tab ${tab==='privacidade'?'on':''}`} onClick={()=>setTab('privacidade')}>🔒 Política de Privacidade</div>
        </div>

        {tab === 'termos' && (
          <div>
            <div className="date">Vigente a partir de {DATA_ATUALIZACAO}</div>

            <div className="highlight">
              Ao acessar ou utilizar o Trindade Online, você concorda com estes Termos de Uso. Leia com atenção antes de utilizar a plataforma.
            </div>

            <div className="sec-title"><span className="sec-num">1. </span>IDENTIFICAÇÃO</div>
            <p>O <strong>Trindade Online</strong> é uma plataforma digital hiperlocal operada por pessoa física, com sede no bairro Trindade, município de São Gonçalo, Estado do Rio de Janeiro. A plataforma tem como finalidade conectar moradores, comércios e serviços do bairro Trindade.</p>
            <p>Contato: <strong>noreply@trindadeonline.com.br</strong></p>

            <div className="sec-title"><span className="sec-num">2. </span>ACEITAÇÃO DOS TERMOS</div>
            <p>Ao criar uma conta, cadastrar uma empresa ou publicar qualquer conteúdo no Trindade Online, o usuário declara ter lido, compreendido e concordado integralmente com estes Termos de Uso e com a Política de Privacidade da plataforma.</p>
            <p>Caso o usuário não concorde com qualquer disposição destes termos, deverá abster-se de utilizar a plataforma.</p>

            <div className="sec-title"><span className="sec-num">3. </span>CADASTRO DE USUÁRIOS</div>
            <p>Para acessar determinadas funcionalidades da plataforma, o usuário deverá criar uma conta fornecendo informações verdadeiras, completas e atualizadas. O usuário é o único responsável pela confidencialidade de suas credenciais de acesso.</p>
            <ul>
              <li>O cadastro é permitido somente para pessoas físicas maiores de 18 anos ou para representantes legais de pessoas jurídicas.</li>
              <li>É vedada a criação de contas com informações falsas, enganosas ou de terceiros sem autorização.</li>
              <li>Cada usuário poderá manter apenas uma conta ativa na plataforma.</li>
              <li>O Trindade Online reserva-se o direito de suspender ou encerrar contas que violem estes Termos.</li>
            </ul>

            <div className="sec-title"><span className="sec-num">4. </span>CADASTRO DE EMPRESAS</div>
            <p>Empresas, comércios e prestadores de serviço poderão se cadastrar na plataforma para divulgação de seus produtos e serviços. Ao realizar o cadastro, o responsável declara:</p>
            <ul>
              <li>Que possui autorização para representar o estabelecimento cadastrado.</li>
              <li>Que todas as informações fornecidas são verdadeiras e atualizadas.</li>
              <li>Que o estabelecimento opera de forma legal, em conformidade com a legislação brasileira.</li>
              <li>Que é responsável pelo conteúdo publicado no perfil da empresa.</li>
            </ul>
            <p>O Trindade Online poderá remover cadastros de empresas que violem estes termos, que apresentem informações falsas ou que recebam denúncias fundamentadas de outros usuários.</p>

            <div className="sec-title"><span className="sec-num">5. </span>PUBLICAÇÕES E ANÚNCIOS</div>
            <p>Os usuários poderão publicar anúncios nas seções Desapega, Empregos, Imóveis e Achados & Perdidos. Ao publicar, o usuário se compromete a:</p>
            <ul>
              <li>Fornecer informações verdadeiras e precisas sobre os itens anunciados.</li>
              <li>Não publicar anúncios de produtos ou serviços ilegais, proibidos ou que violem direitos de terceiros.</li>
              <li>Não utilizar a plataforma para fins de spam, publicidade enganosa ou práticas abusivas.</li>
              <li>Respeitar as regras de cada seção da plataforma.</li>
            </ul>
            <p>O Trindade Online não é parte nas negociações entre usuários e não se responsabiliza por transações realizadas fora da plataforma.</p>

            <div className="sec-title"><span className="sec-num">6. </span>AVALIAÇÕES</div>
            <p>Os usuários cadastrados poderão avaliar empresas presentes na plataforma, respeitando as seguintes regras:</p>
            <ul>
              <li>É permitida uma avaliação por empresa a cada 7 (sete) dias corridos.</li>
              <li>As avaliações devem refletir experiências reais e genuínas.</li>
              <li>É proibido publicar avaliações falsas, difamatórias ou com intuito de prejudicar empresas concorrentes.</li>
              <li>O Trindade Online poderá remover avaliações que violem estas regras, a seu exclusivo critério.</li>
            </ul>

            <div className="sec-title"><span className="sec-num">7. </span>CONTEÚDO PROIBIDO</div>
            <p>É expressamente vedado publicar na plataforma qualquer conteúdo que:</p>
            <ul>
              <li>Seja ilegal, ofensivo, discriminatório, ameaçador, difamatório ou pornográfico.</li>
              <li>Viole direitos de propriedade intelectual de terceiros.</li>
              <li>Contenha vírus, malware ou código malicioso.</li>
              <li>Incite violência, ódio ou discriminação de qualquer natureza.</li>
              <li>Envolva venda de produtos falsificados, ilegais ou sem procedência.</li>
            </ul>

            <div className="sec-title"><span className="sec-num">8. </span>PLANOS E PAGAMENTOS</div>
            <p>O cadastro de empresas na plataforma requer a contratação de um plano pago para que o perfil fique ativo e visível para os moradores. O administrador da plataforma pode, a seu critério, conceder períodos de teste a empresas específicas.</p>
            <p>Os valores, formas de pagamento e condições dos planos são informados no momento da contratação. Pagamentos são processados via Pix, através de plataformas de pagamento parceiras. O Trindade Online não armazena dados de pagamento dos usuários.</p>

            <div className="sec-title"><span className="sec-num">9. </span>LIMITAÇÃO DE RESPONSABILIDADE</div>
            <p>O Trindade Online atua como intermediário entre usuários e empresas, não sendo responsável por:</p>
            <ul>
              <li>A qualidade dos produtos ou serviços oferecidos pelas empresas cadastradas.</li>
              <li>Transações realizadas entre usuários fora da plataforma.</li>
              <li>Danos decorrentes do uso indevido da plataforma por terceiros.</li>
              <li>Indisponibilidade temporária da plataforma por motivos técnicos ou de manutenção.</li>
            </ul>

            <div className="sec-title"><span className="sec-num">10. </span>PROPRIEDADE INTELECTUAL</div>
            <p>O nome <strong>Trindade Online</strong>, logotipo, identidade visual e todo o conteúdo produzido pela plataforma são de propriedade exclusiva do Trindade Online, protegidos pela Lei 9.279/1996 (Propriedade Industrial) e pela Lei 9.610/1998 (Direitos Autorais).</p>
            <p>O usuário concede ao Trindade Online licença não exclusiva para utilizar o conteúdo por ele publicado na plataforma, para fins de exibição e divulgação do serviço.</p>

            <div className="sec-title"><span className="sec-num">11. </span>SUSPENSÃO E ENCERRAMENTO</div>
            <p>O Trindade Online poderá, a qualquer tempo e sem aviso prévio, suspender ou encerrar o acesso de usuários que violem estes Termos de Uso, pratiquem atos fraudulentos ou prejudiciais à plataforma ou a outros usuários.</p>
            <p>O usuário poderá solicitar o encerramento de sua conta a qualquer momento, mediante contato pelo e-mail da plataforma.</p>

            <div className="sec-title"><span className="sec-num">12. </span>ALTERAÇÕES NOS TERMOS</div>
            <p>O Trindade Online reserva-se o direito de alterar estes Termos de Uso a qualquer momento. As alterações entrarão em vigor na data de sua publicação na plataforma. O uso continuado após as alterações implica na aceitação dos novos termos.</p>

            <div className="sec-title"><span className="sec-num">13. </span>LEI APLICÁVEL E FORO</div>
            <p>Estes Termos de Uso são regidos pela legislação brasileira, em especial pelo Marco Civil da Internet (Lei 12.965/2014) e pelo Código de Defesa do Consumidor (Lei 8.078/1990). Fica eleito o foro da Comarca de São Gonçalo/RJ para dirimir eventuais conflitos.</p>

            <div className="footer">
              <a href="/" >← Voltar ao Trindade Online</a>
            </div>
          </div>
        )}

        {tab === 'privacidade' && (
          <div>
            <div className="date">Vigente a partir de {DATA_ATUALIZACAO}</div>

            <div className="highlight">
              Esta Política de Privacidade descreve como o Trindade Online coleta, utiliza e protege seus dados pessoais, em conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei 13.709/2018).
            </div>

            <div className="sec-title"><span className="sec-num">1. </span>CONTROLADOR DOS DADOS</div>
            <p>O controlador dos dados pessoais coletados nesta plataforma é o <strong>Trindade Online</strong>, operado por pessoa física com sede no bairro Trindade, São Gonçalo/RJ.</p>
            <p>Para exercer seus direitos ou obter informações sobre o tratamento de seus dados, entre em contato pelo e-mail: <strong>noreply@trindadeonline.com.br</strong></p>

            <div className="sec-title"><span className="sec-num">2. </span>DADOS COLETADOS</div>
            <p>O Trindade Online coleta os seguintes dados pessoais:</p>
            <ul>
              <li><strong>Dados de cadastro:</strong> nome completo, endereço de e-mail, número de telefone/WhatsApp e bairro de residência.</li>
              <li><strong>Dados de empresa:</strong> nome fantasia, endereço, telefone comercial, categoria de atividade e fotos do estabelecimento.</li>
              <li><strong>Dados de uso:</strong> interações com a plataforma, buscas realizadas, avaliações publicadas e anúncios criados.</li>
              <li><strong>Dados técnicos:</strong> endereço IP, tipo de navegador e dispositivo utilizado, coletados automaticamente para fins de segurança e melhoria do serviço.</li>
            </ul>

            <div className="sec-title"><span className="sec-num">3. </span>FINALIDADE DO TRATAMENTO</div>
            <p>Os dados coletados são utilizados exclusivamente para:</p>
            <ul>
              <li>Criar e gerenciar a conta do usuário na plataforma.</li>
              <li>Exibir o perfil de empresas cadastradas para os moradores do bairro.</li>
              <li>Processar pagamentos e gerenciar planos contratados.</li>
              <li>Enviar comunicações relacionadas ao serviço (confirmações, avisos de trial, atualizações).</li>
              <li>Garantir a segurança da plataforma e prevenir fraudes.</li>
              <li>Melhorar continuamente os serviços oferecidos.</li>
            </ul>

            <div className="sec-title"><span className="sec-num">4. </span>BASE LEGAL</div>
            <p>O tratamento dos dados pessoais pelo Trindade Online é fundamentado nas seguintes bases legais previstas na LGPD:</p>
            <ul>
              <li><strong>Consentimento (Art. 7º, I):</strong> para envio de comunicações de marketing e uso de cookies não essenciais.</li>
              <li><strong>Execução de contrato (Art. 7º, V):</strong> para operação da conta e prestação dos serviços contratados.</li>
              <li><strong>Legítimo interesse (Art. 7º, IX):</strong> para segurança da plataforma, prevenção de fraudes e melhoria dos serviços.</li>
              <li><strong>Cumprimento de obrigação legal (Art. 7º, II):</strong> quando exigido por lei ou autoridade competente.</li>
            </ul>

            <div className="sec-title"><span className="sec-num">5. </span>COMPARTILHAMENTO DE DADOS</div>
            <p>O Trindade Online não vende dados pessoais de seus usuários. Os dados poderão ser compartilhados com as seguintes categorias de terceiros, exclusivamente para viabilizar a operação da plataforma:</p>
            <ul>
              <li><strong>Supabase Inc.:</strong> infraestrutura de banco de dados e autenticação, com servidores nos EUA, sob adequação ao GDPR.</li>
              <li><strong>Resend:</strong> serviço de envio de e-mails transacionais.</li>
              <li><strong>Asaas Gestão Financeira S.A.:</strong> processamento de pagamentos via Pix, empresa brasileira regulada pelo Banco Central.</li>
              <li><strong>Vercel Inc.:</strong> hospedagem e entrega da plataforma web.</li>
            </ul>
            <p>Todos os fornecedores são obrigados contratualmente a proteger os dados pessoais e a utilizá-los somente para as finalidades autorizadas.</p>

            <div className="sec-title"><span className="sec-num">6. </span>DIREITOS DO TITULAR</div>
            <p>Nos termos da LGPD, o usuário tem os seguintes direitos em relação aos seus dados pessoais:</p>
            <ul>
              <li><strong>Acesso:</strong> confirmar a existência de tratamento e acessar seus dados.</li>
              <li><strong>Correção:</strong> solicitar a correção de dados incompletos, inexatos ou desatualizados.</li>
              <li><strong>Anonimização, bloqueio ou eliminação:</strong> de dados desnecessários, excessivos ou tratados em desconformidade com a lei.</li>
              <li><strong>Portabilidade:</strong> solicitar a transferência dos dados a outro fornecedor de serviço.</li>
              <li><strong>Eliminação:</strong> solicitar a exclusão dos dados tratados com base no consentimento.</li>
              <li><strong>Revogação do consentimento:</strong> a qualquer momento, sem prejudicar a legalidade do tratamento anterior.</li>
              <li><strong>Informação:</strong> sobre entidades com as quais os dados são compartilhados.</li>
            </ul>
            <p>Para exercer qualquer desses direitos, entre em contato pelo e-mail <strong>noreply@trindadeonline.com.br</strong>. O prazo de resposta é de até 15 dias úteis.</p>

            <div className="sec-title"><span className="sec-num">7. </span>RETENÇÃO DOS DADOS</div>
            <p>Os dados pessoais são mantidos pelo tempo necessário para cumprir as finalidades para as quais foram coletados, ou conforme exigido por lei. Após o encerramento da conta, os dados poderão ser retidos por até <strong>5 (cinco) anos</strong> para cumprimento de obrigações legais e resolução de eventuais disputas.</p>

            <div className="sec-title"><span className="sec-num">8. </span>COOKIES E TECNOLOGIAS SIMILARES</div>
            <p>O Trindade Online utiliza cookies e tecnologias similares para:</p>
            <ul>
              <li>Manter a sessão do usuário autenticado.</li>
              <li>Analisar o uso da plataforma para melhorias de desempenho.</li>
              <li>Lembrar preferências do usuário.</li>
            </ul>
            <p>O usuário pode configurar seu navegador para recusar cookies, porém isso pode afetar o funcionamento de algumas funcionalidades da plataforma.</p>

            <div className="sec-title"><span className="sec-num">9. </span>SEGURANÇA DOS DADOS</div>
            <p>O Trindade Online adota medidas técnicas e organizacionais adequadas para proteger os dados pessoais contra acesso não autorizado, perda, alteração ou divulgação indevida, incluindo:</p>
            <ul>
              <li>Criptografia de dados em trânsito (HTTPS/TLS).</li>
              <li>Autenticação segura com controle de acesso por nível de usuário.</li>
              <li>Políticas de segurança em nível de banco de dados (Row Level Security).</li>
              <li>Senhas armazenadas com hash criptográfico.</li>
            </ul>

            <div className="sec-title"><span className="sec-num">10. </span>TRANSFERÊNCIA INTERNACIONAL</div>
            <p>Alguns de nossos fornecedores de infraestrutura estão localizados fora do Brasil. Nestas situações, garantimos que as transferências são realizadas em conformidade com o Art. 33 da LGPD, utilizando apenas fornecedores que oferecem nível adequado de proteção de dados.</p>

            <div className="sec-title"><span className="sec-num">11. </span>MENORES DE IDADE</div>
            <p>O Trindade Online não é direcionado a menores de 18 anos. Não coletamos intencionalmente dados de menores. Caso identifiquemos que dados de menores foram coletados sem o consentimento dos responsáveis, procederemos à exclusão imediata.</p>

            <div className="sec-title"><span className="sec-num">12. </span>ALTERAÇÕES NESTA POLÍTICA</div>
            <p>Esta Política de Privacidade pode ser atualizada periodicamente. Alterações relevantes serão comunicadas aos usuários por e-mail ou mediante aviso na plataforma. O uso continuado após as alterações implica na aceitação da nova política.</p>

            <div className="sec-title"><span className="sec-num">13. </span>CONTATO E ENCARREGADO DE DADOS (DPO)</div>
            <p>Para dúvidas, solicitações ou reclamações relacionadas ao tratamento de dados pessoais, entre em contato com nosso responsável pelo tratamento de dados:</p>
            <p><strong>E-mail:</strong> noreply@trindadeonline.com.br<br/><strong>Endereço:</strong> Bairro Trindade, São Gonçalo/RJ<br/><strong>Prazo de resposta:</strong> até 15 dias úteis</p>
            <p>Caso não obtenha resposta satisfatória, você poderá contatar a <strong>Autoridade Nacional de Proteção de Dados (ANPD)</strong> pelo site <strong>gov.br/anpd</strong>.</p>

            <div className="footer">
              <a href="/">← Voltar ao Trindade Online</a>
            </div>
          </div>
        )}
      </div>
    </>
  )
}