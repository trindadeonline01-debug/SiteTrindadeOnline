// Folha de QR codes das mesas pra imprimir e plastificar (nov/2026, mockup
// aprovado pelo Ricardo). TS puro, sem DOM nem alias de import, pra poder ser
// usado tanto pela tela de Mesas (janela de impressão) quanto por script.
//
// Cartão de 91 x 128 mm, 4 por folha A4 (2 colunas x 2 linhas): faixa preta com
// o nome da loja, círculo amarelo só com o número da mesa, QR com a logo da loja
// no centro (o QR precisa ter sido gerado com correção de erro 'H'), três
// avisos do que dá pra fazer e rodapé com a marca Trindade Online.

export type QrCard = { numero: number; qrDataUrl: string }

function esc(s: string) {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
}

function cardHtml(nomeLoja: string, c: QrCard, logoUrl: string | null) {
  return `<div class="cell"><div class="qc">
  <div class="qc-top"><span class="qc-sup">Bem-vindo ao</span><h3>${esc(nomeLoja)}</h3></div>
  <div class="qc-tag"><b>${c.numero}</b></div>
  <div class="qc-qrbox">
    <i class="cn tl"></i><i class="cn tr"></i><i class="cn bl"></i><i class="cn br"></i>
    <div class="qc-qr"><img src="${c.qrDataUrl}" alt="QR da mesa ${c.numero}">${logoUrl ? `<div class="qc-logo"><img src="${logoUrl}" alt=""></div>` : ''}</div>
  </div>
  <p class="qc-cta">Aponte a câmera do celular</p>
  <div class="qc-feat"><span>Veja o cardápio</span><span>Peça da mesa</span><span>Chame o garçom</span></div>
  <div class="qc-foot"><small>Tecnologia</small><span class="wm"><b>TRINDADE</b> <em>ONLINE</em></span></div>
</div></div>`
}

export function buildQrSheetHtml(opts: { nomeLoja: string; cards: QrCard[]; logoUrl: string | null; autoPrint?: boolean }) {
  const { nomeLoja, cards, logoUrl, autoPrint = true } = opts
  const paginas: string[] = []
  for (let i = 0; i < cards.length; i += 4) {
    paginas.push(`<div class="pg">${cards.slice(i, i + 4).map(c => cardHtml(nomeLoja, c, logoUrl)).join('')}</div>`)
  }
  const printScript = autoPrint
    ? `<script>
      (function(){
        var go=function(){setTimeout(function(){window.print()},300)};
        var imgs=Array.prototype.slice.call(document.images);
        var esperaImgs=Promise.all(imgs.map(function(i){return i.complete?1:new Promise(function(r){i.onload=i.onerror=r})}));
        var esperaFontes=(document.fonts&&document.fonts.ready)?document.fonts.ready:Promise.resolve();
        Promise.all([esperaImgs,esperaFontes]).then(go,go);
      })();
    <\/script>`
    : ''
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>QR das mesas</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Archivo:wght@400;600;700;800&display=swap">
<style>
@page{size:A4;margin:0}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font-family:Archivo,Arial,sans-serif;color:#151210}
.pg{width:210mm;height:297mm;display:grid;grid-template-columns:91mm 91mm;grid-template-rows:128mm 128mm;gap:8mm;justify-content:center;align-content:center;page-break-after:always;break-after:page}
.pg:last-child{page-break-after:auto;break-after:auto}
.cell{width:91mm;height:128mm;overflow:hidden;position:relative}
.qc{width:400px;height:563px;transform:scale(.86);transform-origin:top left;border:3px solid #151210;border-radius:24px;overflow:hidden;background:#fff;display:flex;flex-direction:column;align-items:center;text-align:center}
.qc-top{width:100%;background:#151210;color:#fff;padding:18px 0 52px;border-bottom:6px solid #FFC531}
.qc-sup{display:block;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#C9C3B6;font-weight:700}
.qc-top h3{margin:4px 0 0;font-family:Anton,Impact,sans-serif;font-weight:400;font-size:30px;letter-spacing:.6px;text-transform:uppercase;line-height:1.05}
.qc-tag{margin-top:-40px;width:84px;height:84px;border-radius:50%;background:#FFC531;border:4px solid #151210;display:flex;align-items:center;justify-content:center;position:relative;z-index:2}
.qc-tag b{font-family:Anton,Impact,sans-serif;font-weight:400;font-size:44px;line-height:1;padding-top:2px}
.qc-qrbox{position:relative;margin-top:8px;padding:12px;border-radius:18px;background:#fff}
.qc-qr{position:relative;width:226px;height:226px}
.qc-qr>img{width:100%;height:100%;display:block;image-rendering:crisp-edges;image-rendering:pixelated}
.qc-logo{position:absolute;left:50%;top:50%;width:78px;height:78px;transform:translate(-50%,-50%);background:#fff;border-radius:16px;padding:5px;box-shadow:0 0 0 3px #fff}
.qc-logo img{width:100%;height:100%;object-fit:contain;display:block}
.cn{position:absolute;width:26px;height:26px;border:5px solid #FFC531}
.cn.tl{left:0;top:0;border-right:0;border-bottom:0;border-radius:14px 0 0 0}
.cn.tr{right:0;top:0;border-left:0;border-bottom:0;border-radius:0 14px 0 0}
.cn.bl{left:0;bottom:0;border-right:0;border-top:0;border-radius:0 0 0 14px}
.cn.br{right:0;bottom:0;border-left:0;border-top:0;border-radius:0 0 14px 0}
.qc-cta{margin:8px 0 0;font-size:18px;font-weight:800;letter-spacing:.01em}
.qc-feat{display:flex;margin-top:10px;width:calc(100% - 44px);border:1px solid #C2BEB0;border-radius:12px;overflow:hidden;background:#F3F1E8}
.qc-feat span{flex:1;padding:9px 4px;font-size:11.5px;font-weight:700;border-right:1px solid #C2BEB0}
.qc-feat span:last-child{border:0}
.qc-foot{margin-top:auto;width:100%;background:#151210;color:#C9C3B6;display:flex;justify-content:center;align-items:center;gap:10px;padding:11px 0}
.qc-foot small{font-size:10px;letter-spacing:.18em;text-transform:uppercase;font-weight:700}
.wm{font-family:Anton,Impact,sans-serif;font-size:21px;letter-spacing:.5px;line-height:1}
.wm b{font-weight:400;color:#fff}
.wm em{font-style:normal;color:#FFC531}
</style></head><body>${paginas.join('')}${printScript}</body></html>`
}
