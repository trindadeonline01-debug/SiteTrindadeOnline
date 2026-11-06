// CSS do jogo do quiz (extraído do mockup aprovado, docs/pesca-premiada/quiz-mockup.html).
export const ESTILO = `
.qz{position:fixed;inset:0;font-family:'Archivo',system-ui,-apple-system,'Segoe UI',sans-serif;color:#151210;background:#082B38;
  --display:'Anton',Impact,'Arial Narrow',sans-serif;--body:'Archivo',system-ui,-apple-system,'Segoe UI',sans-serif;
  --ap-paper:#FFFFFF;--ap-bg:#F4F2EC;--ap-ink:#151210;--ap-muted:#6F6C67;--ap-line:#DEDBD2;--ap-sign:#FFC531;
  --ap-sea1:#0E4D64;--ap-sea2:#082B38;--ap-foam:#E9F4F3;--ap-ok:#0F8A57;--ap-bad:#D6392B;--ap-gold:#FFC531;--bg:#082B38;--chip:#F3F4EF;--line:#D9DAD3;--muted:#6B6862;--ink:#151210}
.qz *{box-sizing:border-box}
.qz button,.qz input{font-family:inherit}
.qz #qz-view{width:100%;height:100%}
.qz .screen{border-radius:0;max-width:560px;margin:0 auto;height:100%;min-height:100%}
.qz .bar{padding-top:max(12px,env(safe-area-inset-top))}
.qz-toast{position:absolute;left:50%;bottom:max(20px,env(safe-area-inset-bottom));transform:translateX(-50%) translateY(20px);background:#151210;color:#fff;padding:11px 16px;border-radius:10px;font:600 14px var(--body);opacity:0;pointer-events:none;transition:opacity .2s,transform .2s;z-index:20;max-width:calc(100% - 32px);text-align:center}
.qz-toast.on{opacity:1;transform:translateX(-50%) translateY(0)}
.bar{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--ap-paper);border-bottom:1px solid var(--ap-line);flex:none}
.brand{font-family:var(--display);font-size:19px;letter-spacing:.01em}.brand b{font-weight:400;color:#A87200}
.mesa{font-size:12px;color:var(--ap-muted);font-weight:600}
.back{font:600 14px var(--body);background:transparent;border:0;color:var(--ap-ink);cursor:pointer;min-height:44px;padding:0 8px 0 0;margin-left:-4px;white-space:nowrap}
.sea .back{color:#fff}
.back:focus-visible{outline:3px solid var(--ap-gold);outline-offset:2px}
.ovl{position:absolute;inset:0;background:rgba(0,0,0,.62);display:flex;align-items:flex-end;z-index:5}
.sheet{background:#fff;color:#151210;border-radius:16px 16px 0 0;padding:18px 16px 20px;display:grid;gap:10px;width:100%}
.sheet h3{font-family:var(--display);font-weight:400;font-size:24px;margin:0}
.sheet p{margin:0;font-size:14px;color:#4a4742}
.stp{display:flex;align-items:center;gap:6px;font-weight:700}.stp span{width:30px;height:30px;border-radius:8px;border:1px solid var(--ap-line);display:grid;place-items:center}
.body{flex:1;min-height:0;overflow:auto;padding:16px;display:flex;flex-direction:column;gap:12px}
.h1{font-family:var(--display);font-weight:400;font-size:30px;line-height:1.05;margin:0}
.p{margin:0;font-size:14px;color:var(--ap-muted)}
.card{background:var(--ap-paper);border:1px solid var(--ap-line);border-radius:12px;padding:14px;display:flex;gap:12px;align-items:center}
.card .ic{width:44px;height:44px;border-radius:10px;background:var(--ap-bg);display:grid;place-items:center;font-size:22px;flex:none}
.card b{display:block;font-size:15px}.card span{font-size:12.5px;color:var(--ap-muted)}
.card.hot{background:var(--ap-sea2);color:#fff;border-color:var(--ap-sea2)}
.card.hot .ic{background:rgba(255,255,255,.12)}.card.hot span{color:#BFD9DE}
.btn{font:700 16px var(--body);min-height:52px;border:0;border-radius:10px;background:var(--ap-sign);color:#151210;cursor:pointer;width:100%;padding:0 16px}
.btn.alt{background:transparent;border:2px solid currentColor;color:inherit}
.btn.dark{background:#151210;color:#fff}
.btn:focus-visible{outline:3px solid #151210;outline-offset:2px}
.note{font-size:12.5px;color:var(--ap-muted);line-height:1.4}
.pill{display:inline-flex;align-items:center;gap:6px;background:var(--ap-bg);border:1px solid var(--ap-line);border-radius:99px;padding:4px 10px;font-size:12px;font-weight:600}
/* jogo (fundo do mar) */
.sea{background:radial-gradient(120% 70% at 50% 0%,var(--ap-sea1) 0%,var(--ap-sea2) 70%);color:#fff}
.sea .bar{background:transparent;border-bottom:1px solid rgba(255,255,255,.14)}
.sea .brand b{color:var(--ap-gold)}.sea .mesa{color:#BFD9DE}
.ladder{display:flex;align-items:center;gap:4px;padding:10px 14px 0}
.ladder .st{flex:1;text-align:center;border-radius:6px;padding:5px 0;background:rgba(255,255,255,.08);color:#9EC3CB;font-size:11px;font-weight:700;line-height:1.15}
.ladder .st small{display:block;font-weight:500;font-size:9.5px;opacity:.85}
.ladder .st.got{background:var(--ap-gold);color:#151210}
.ladder .gate{width:2px;align-self:stretch;background:#fff;opacity:.5;margin:0 3px;border-radius:2px}
.hud{display:flex;justify-content:space-between;align-items:center;padding:10px 16px 0;font-size:12.5px;color:#CFE3E6}
.hud b{color:#fff;font-variant-numeric:tabular-nums}
.hearts{display:inline-flex;gap:2px;align-items:center;color:#FF7A6B}
.timer{position:relative;width:84px;height:84px;margin:6px auto 0;flex:none}
.timer svg{width:84px;height:84px;transform:rotate(-90deg)}
.timer .n{position:absolute;inset:0;display:grid;place-items:center;font-family:var(--display);font-size:34px;font-variant-numeric:tabular-nums}
.q{background:var(--ap-foam);color:#0A2A33;border-radius:14px;padding:16px;margin:0 14px;font-weight:700;font-size:19px;line-height:1.25;text-wrap:balance}
.q small{display:block;font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:#4A7783;margin-bottom:6px;font-weight:700}
.opts{display:grid;gap:8px;padding:12px 14px 0}
.opt{font:600 16px var(--body);text-align:left;min-height:54px;border-radius:10px;border:2px solid rgba(255,255,255,.18);background:rgba(255,255,255,.07);color:#fff;display:flex;align-items:center;gap:12px;padding:0 14px;cursor:pointer;width:100%}
.opt i{font-style:normal;font-family:var(--display);font-size:18px;color:var(--ap-gold);width:18px}
.opt.right{background:var(--ap-ok);border-color:var(--ap-ok)}.opt.wrong{background:var(--ap-bad);border-color:var(--ap-bad)}.opt.dim{opacity:.45}
.opt.pick{background:var(--ap-gold);border-color:var(--ap-gold);color:#151210}
.qs .opt.pick i{background:rgba(21,18,16,.14);color:#151210;box-shadow:none}
.opt:focus-visible{outline:3px solid var(--ap-gold);outline-offset:2px}
.helps{display:flex;gap:8px;padding:12px 14px 14px;margin-top:auto}
.helps button{flex:1;font:600 13px var(--body);min-height:46px;border-radius:10px;border:1.5px solid rgba(255,255,255,.35);background:transparent;color:#fff;cursor:pointer}
.helps button:disabled{opacity:.35;cursor:default}
.big{font-family:var(--display);font-size:54px;line-height:1;margin:0;font-variant-numeric:tabular-nums}
.res{padding:18px 16px;display:flex;flex-direction:column;gap:12px;flex:1;min-height:0}
.res .box{background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.18);border-radius:12px;padding:12px 14px;font-size:14px}
.res .box b{color:var(--ap-gold)}
.gold{color:var(--ap-gold)}
.input{min-height:50px;border:1px solid var(--ap-line);border-radius:8px;background:var(--ap-paper);padding:0 14px;font:600 17px var(--body);display:flex;align-items:center;justify-content:space-between}
.codes{display:flex;gap:6px}.codes span{flex:1;height:52px;border:1px solid var(--ap-line);border-radius:8px;background:var(--ap-paper);display:grid;place-items:center;font:400 26px var(--display)}
.warn{background:#FCE9E6;border:1px solid #E9B1A9;color:#7A1F14;border-radius:10px;padding:12px 14px;font-size:14px}
.good{background:#E3F3EA;border:1px solid #A8D5BC;color:#0B5A37;border-radius:10px;padding:12px 14px;font-size:14px}
.row{display:flex;justify-content:space-between;gap:10px;align-items:baseline;padding:10px 0;border-bottom:1px solid var(--ap-line);font-variant-numeric:tabular-nums}
.row:last-child{border-bottom:0}
.bal{background:var(--ap-paper);border:1px solid var(--ap-line);border-radius:12px;padding:14px}
.bal .big{font-size:44px}

/* tela de entrada com cara de jogo */
.game{overflow:hidden}
.game .bar{position:relative;z-index:2}
.scene{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.scene .rays{position:absolute;inset:-10% -20% 0 -20%;-webkit-mask-image:linear-gradient(180deg,#000 0,transparent 85%);mask-image:linear-gradient(180deg,#000 0,transparent 85%);background:repeating-linear-gradient(105deg,rgba(255,255,255,.07) 0 22px,transparent 22px 70px);transform:skewX(-12deg);animation:rays 9s ease-in-out infinite alternate}
.bub{position:absolute;bottom:-20px;border-radius:50%;border:1.5px solid rgba(255,255,255,.55);background:rgba(255,255,255,.12);animation:rise linear infinite}
.fsh{position:absolute;width:46px;opacity:.75}
.fsh svg{display:block;width:100%}
.f1{top:60%;animation:swim 14s linear infinite}
.f2{top:70%;width:34px;animation:swimr 18s linear infinite;animation-delay:-6s}
.f3{top:80%;width:40px;animation:swim 22s linear infinite;animation-delay:-11s}
.weed{position:absolute;left:0;right:0;bottom:0;width:100%;height:70px}
.gi{position:relative;z-index:1;flex:1;min-height:0;display:flex;flex-direction:column;gap:12px;padding:6px 16px 16px}
.ttl{position:relative;line-height:.9;padding-top:6px}
.t1,.t2{display:block;font-family:var(--display);letter-spacing:.02em;text-transform:uppercase}
.t1{font-size:64px;color:#fff;text-shadow:0 4px 0 #082B38,0 0 22px rgba(127,214,229,.45)}
.t2{font-size:50px;color:var(--ap-gold);text-shadow:0 4px 0 #6B4A00,0 0 24px rgba(255,197,49,.5)}
.hook{position:absolute;right:6px;top:-4px;transform-origin:20px 0;animation:sway 3.2s ease-in-out infinite}
.sub{margin:0;font-size:15px;color:#CFE3E6;line-height:1.35;max-width:30ch}
.lad{background:linear-gradient(180deg,rgba(255,255,255,.12),rgba(255,255,255,.05));border:1px solid rgba(255,255,255,.2);border-radius:16px;padding:10px 10px 8px}
.lcap{font-size:11px;letter-spacing:.09em;text-transform:uppercase;font-weight:700;color:#BFD9DE;text-align:center;margin-bottom:8px}
.coins{display:flex;align-items:flex-end;justify-content:space-between;gap:4px}
.coin{width:var(--s);height:var(--s);border-radius:50%;background:radial-gradient(circle at 32% 28%,#FFE79A 0,#FFC531 45%,#C98F0A 100%);border:2px solid #8A5E00;display:grid;place-items:center;box-shadow:0 3px 0 #6B4A00;flex:none}
.coin b{font-family:var(--display);font-weight:400;font-size:14px;color:#4A3200;letter-spacing:.01em}
.coin.max{animation:glow 1.8s ease-in-out infinite}
.risk{align-self:stretch;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:#FF9F95;font-weight:700;gap:2px}
.risk u{flex:1;border-left:2px dashed rgba(255,159,149,.7);min-height:30px}
.lnum{display:flex;justify-content:space-between;padding:4px 6px 0;font-size:10.5px;color:#9EC3CB;font-variant-numeric:tabular-nums}
.chips{display:flex;gap:6px;flex-wrap:wrap}
.chips span{display:inline-flex;align-items:center;gap:5px;background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.18);border-radius:99px;padding:6px 9px;font-size:12px;font-weight:600;color:#E6F2F3}
.chips svg{color:var(--ap-gold)}
.rib{background:rgba(255,197,49,.14);border:1px dashed rgba(255,197,49,.65);color:#FFE7A0;border-radius:10px;padding:8px 12px;font-size:13px;text-align:center}
.rib b{color:#fff}
.cta{margin-top:auto;display:grid;gap:6px}
.go{position:relative;overflow:hidden;font-family:var(--display);font-size:24px;letter-spacing:.04em;text-transform:uppercase;min-height:64px;border:0;border-radius:16px;color:#2B1B00;cursor:pointer;background:linear-gradient(180deg,#FFE27A,#FFC531 55%,#F0A800);box-shadow:0 6px 0 #8A5E00,0 0 0 0 rgba(255,197,49,.55);animation:pulse 2s ease-in-out infinite}
.go:active{transform:translateY(3px);box-shadow:0 3px 0 #8A5E00}
.go::after{content:"";position:absolute;top:0;bottom:0;width:60px;left:-80px;background:linear-gradient(100deg,transparent,rgba(255,255,255,.7),transparent);transform:skewX(-20deg);animation:shine 3.2s ease-in-out infinite}
.go:focus-visible,.fun:focus-visible{outline:3px solid #fff;outline-offset:3px}
.fun{background:transparent;border:0;color:#CFE3E6;font:600 14px var(--body);text-decoration:underline;cursor:pointer;min-height:40px}
@keyframes rise{from{transform:translateY(0);opacity:0}15%{opacity:1}to{transform:translateY(-820px);opacity:0}}
@keyframes swim{from{left:-14%}to{left:112%}}
@keyframes swimr{from{left:112%;transform:scaleX(-1)}to{left:-14%;transform:scaleX(-1)}}
@keyframes rays{from{opacity:.6;transform:skewX(-12deg) translateX(-14px)}to{opacity:1;transform:skewX(-12deg) translateX(14px)}}
@keyframes sway{0%,100%{transform:rotate(7deg)}50%{transform:rotate(-7deg)}}
@keyframes glow{0%,100%{box-shadow:0 3px 0 #6B4A00,0 0 0 rgba(255,197,49,0)}50%{box-shadow:0 3px 0 #6B4A00,0 0 18px 4px rgba(255,197,49,.8)}}
@keyframes pulse{0%,100%{box-shadow:0 6px 0 #8A5E00,0 0 0 0 rgba(255,197,49,.5)}50%{box-shadow:0 6px 0 #8A5E00,0 0 0 10px rgba(255,197,49,0)}}
@keyframes shine{0%,55%{left:-80px}100%{left:120%}}
@media (prefers-reduced-motion:reduce){.bub,.fsh,.rays,.hook,.coin.max,.go,.go::after{animation:none}.bub{display:none}.f1{left:20%}.f2{left:60%}.f3{left:35%}}

/* entrada: versão enxuta */
.vig{position:absolute;inset:0;background:radial-gradient(120% 80% at 50% 0%,transparent 40%,rgba(3,18,24,.55) 100%)}
.gi{gap:14px;padding:8px 18px 18px}
.ttl2{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:4px}
.ttl2 .t1{font-size:58px;line-height:.92;text-shadow:0 2px 0 rgba(0,0,0,.35)}
.ttl2 .t2{font-size:46px;line-height:.95;text-shadow:0 2px 0 rgba(0,0,0,.35)}
.medal{flex:none;animation:floaty 4s ease-in-out infinite;filter:drop-shadow(0 6px 10px rgba(0,0,0,.35))}
.sub{font-size:15px;max-width:none;color:#D5E7EA}
.trk{background:rgba(5,26,34,.55);border:1px solid rgba(255,255,255,.16);border-radius:16px;padding:12px 12px 10px}
.zones{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}
.z{font-size:10px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;text-align:center;padding-bottom:5px;border-bottom:3px solid}
.z.ok{color:#8FE3B5;border-color:#3FB57A}.z.rk{color:#FF9F95;border-color:#E2574A}
.stops{position:relative;display:grid;grid-template-columns:repeat(6,1fr);gap:0}
.stops::before{content:"";position:absolute;left:8%;right:8%;top:21px;height:3px;background:rgba(255,255,255,.22);border-radius:2px}
.stop{position:relative;display:flex;flex-direction:column;align-items:center;gap:6px}
.dot{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;font-family:var(--display);font-size:15px;color:#4A3200;background:radial-gradient(circle at 32% 28%,#FFE79A 0,#FFC531 50%,#C98F0A 100%);border:2px solid #8A5E00}
.dot.max{box-shadow:0 0 0 3px rgba(255,197,49,.35),0 0 16px rgba(255,197,49,.7)}
.ac{font-size:11px;color:#A9CBD2;font-variant-numeric:tabular-nums}
.tcap{text-align:center;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:#7FA9B2;margin-top:6px}
.rules{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.rl{display:flex;align-items:center;gap:10px;min-width:0;padding:12px 10px;border-radius:14px;background:linear-gradient(180deg,rgba(255,255,255,.1),rgba(255,255,255,.04));border:1px solid rgba(255,255,255,.18)}
.rl .ico{flex:none;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;color:var(--ap-gold);background:rgba(255,197,49,.14);border:1.5px solid rgba(255,197,49,.55)}
.rl div{min-width:0}
.rl b{display:flex;align-items:baseline;gap:5px;white-space:nowrap;font-family:var(--display);font-weight:400;font-size:15px;line-height:1;letter-spacing:.03em;text-transform:uppercase;color:#fff}
.rl b i{font-style:normal;font-size:30px;line-height:.9;color:var(--ap-gold);letter-spacing:0}
.rl div span{display:block;font-size:11.5px;line-height:1.25;color:#BFD9DE;margin-top:4px}
.pnote{display:flex;align-items:center;justify-content:center;gap:6px;margin:0;font-size:12.5px;color:#BFD9DE;text-align:center}
.pnote svg{color:var(--ap-gold);flex:none}.pnote b{color:#fff}
.go{min-height:58px;font-size:22px;border-radius:14px;box-shadow:0 8px 22px rgba(255,197,49,.32);animation:none}
.go:active{transform:translateY(2px)}
.fun2{min-height:48px;border-radius:14px;background:transparent;border:1.5px solid rgba(255,255,255,.4);color:#fff;font:600 15px var(--body);cursor:pointer}
.fun2:focus-visible{outline:3px solid #fff;outline-offset:3px}
.zl{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:8px 14px 0;font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;text-align:center}
.zl .ok{color:#8FE3B5}.zl .rk{color:#FF9F95}
@keyframes floaty{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
@media (prefers-reduced-motion:reduce){.medal{animation:none}}

/* contagem 3-2-1 */
.cnt{position:relative;z-index:1;flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:16px;text-align:center}
.cnt-top{display:grid;gap:10px;justify-items:center}
.cnt-top p{margin:0;font-family:var(--display);font-size:34px;letter-spacing:.04em;text-transform:uppercase}
.cnt-tag{background:var(--ap-gold);color:#2B1B00;font-weight:700;font-size:12px;letter-spacing:.08em;text-transform:uppercase;padding:5px 12px;border-radius:99px}
.cnt-tag.fun{background:rgba(255,255,255,.16);color:#fff}
.cnt-ring{position:relative;width:220px;height:220px;display:grid;place-items:center}
.cnt-ring i{position:absolute;inset:0;border-radius:50%;border:3px solid rgba(255,197,49,.55);animation:ping 1.8s ease-out infinite}
.cnt-ring i:nth-child(2){animation-delay:.9s}
.cnt-num{position:relative;width:170px;height:170px;border-radius:50%;display:grid;place-items:center;font-family:var(--display);font-size:120px;line-height:1;color:#2B1B00;background:radial-gradient(circle at 32% 28%,#FFE79A 0,#FFC531 50%,#C98F0A 100%);border:4px solid #8A5E00;box-shadow:0 10px 30px rgba(0,0,0,.35),0 0 40px rgba(255,197,49,.45);animation:popn .9s ease-out both}
.cnt-num.ja{font-size:64px;background:radial-gradient(circle at 32% 28%,#9BF0C2 0,#3FB57A 55%,#1E7F52 100%);border-color:#0F5A37;color:#fff;box-shadow:0 10px 30px rgba(0,0,0,.35),0 0 40px rgba(63,181,122,.55)}
.cnt-sub{margin:0;color:#CFE3E6;font-size:15px}
.cnt-rules{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.cnt-rules span{background:rgba(5,26,34,.55);border:1px solid rgba(255,255,255,.16);border-radius:99px;padding:6px 12px;font-size:12.5px;color:#C5DDE1}
.cnt-rules b{color:var(--ap-gold)}
@keyframes popn{0%{transform:scale(.55);opacity:0}45%{transform:scale(1.08);opacity:1}100%{transform:scale(1)}}
@keyframes ping{0%{transform:scale(.8);opacity:.9}100%{transform:scale(1.18);opacity:0}}
@media (prefers-reduced-motion:reduce){.cnt-ring i,.cnt-num{animation:none}}

/* zonas explicadas */
.zones{gap:8px;margin-bottom:12px}
.zn{display:flex;align-items:flex-start;gap:7px;background:none;border:0;border-bottom:3px solid;padding:0 0 8px;color:inherit;font:inherit;cursor:pointer;text-align:left;min-width:0}
.zn.ok{color:#8FE3B5;border-color:#3FB57A}.zn.rk{color:#FF9F95;border-color:#E2574A}
.zn svg{flex:none;margin-top:1px}
.zt{display:flex;flex-direction:column;gap:2px;min-width:0}
.zt b{font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;font-weight:700;line-height:1.1}
.zt span{font-size:11px;color:#C5DDE1;line-height:1.2}
.inf{margin-left:auto;flex:none;width:17px;height:17px;border-radius:50%;border:1.5px solid currentColor;display:grid;place-items:center;font:700 10.5px var(--body);font-style:normal}
.zn:focus-visible{outline:3px solid #fff;outline-offset:3px;border-radius:6px}
.tcap{text-transform:none;letter-spacing:.01em;font-size:11px}
.zcard{display:flex;gap:12px;padding:12px;border-radius:12px;border:1px solid}
.zcard.ok{background:#E8F6EE;border-color:#A8D5BC;color:#0B5A37}.zcard.rk{background:#FCEBE8;border-color:#EFB5AD;color:#7A1F14}
.zcard .zi{flex:none;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:#fff;border:1.5px solid currentColor}
.zcard b{display:block;font-size:14px;margin-bottom:3px}.zcard p{margin:0;font-size:13px;line-height:1.4;color:#2b2926}
.zcard em{display:inline-block;margin-top:6px;font-style:normal;font-size:12px;font-weight:700;background:#fff;border:1px solid currentColor;border-radius:99px;padding:3px 9px}

/* pop-up redondo de resultado */
.rs{position:absolute;inset:0;z-index:4;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:20px;text-align:center;background:rgba(3,18,24,.66);animation:fadein .18s ease-out}
.rs-c{width:176px;height:176px;border-radius:50%;display:grid;place-items:center;border:4px solid;animation:popn .5s ease-out both;margin-bottom:6px}
.rs-c.ok{background:radial-gradient(circle at 32% 28%,#9BF0C2 0,#3FB57A 55%,#1E7F52 100%);border-color:#0F5A37;box-shadow:0 10px 30px rgba(0,0,0,.4),0 0 46px rgba(63,181,122,.6)}
.rs-c.bad{background:radial-gradient(circle at 32% 28%,#FFB3AA 0,#E2574A 55%,#B3261A 100%);border-color:#7A1F14;box-shadow:0 10px 30px rgba(0,0,0,.4),0 0 46px rgba(226,87,74,.55)}
.rs-big{font-family:var(--display);font-size:46px;line-height:1;letter-spacing:.02em;text-transform:uppercase}
.rs-big.ok{color:#9BF0C2}.rs-big.bad{color:#FFB3AA}
.rs-sm{font-size:15px;color:#D5E7EA}
.rs-certa{margin-top:10px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.22);border-radius:99px;padding:7px 14px;font-size:14px;color:#fff}
.rs-certa b{color:var(--ap-gold)}
@keyframes fadein{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion:reduce){.rs,.rs-c{animation:none}}

/* entrada: limpa e com respiro */
.gi2{position:relative;z-index:1;flex:1;min-height:0;display:flex;flex-direction:column;padding:26px 26px 24px;gap:0}
.kick{display:inline-block;font-size:11px;letter-spacing:.2em;text-transform:uppercase;font-weight:700;color:var(--ap-gold);margin-bottom:10px}
.h2t{margin:0;font-family:var(--display);font-weight:400;text-transform:uppercase;line-height:.92;letter-spacing:.02em}
.h2t span{display:block;font-size:56px;color:#fff}.h2t .g{color:var(--ap-gold);font-size:56px}
.sub2{margin:16px 0 0;font-size:16px;line-height:1.45;color:#C9DEE2;max-width:26ch}
.prize{flex:1;display:grid;place-items:center;min-height:0}
.pm{width:176px;height:176px;border-radius:50%;padding:9px;background:conic-gradient(from 210deg,#FFE79A,#FFC531,#C98F0A,#FFE79A);box-shadow:0 0 60px rgba(255,197,49,.28),0 18px 36px rgba(0,0,0,.35);animation:floaty 5s ease-in-out infinite}
.pm-in{width:100%;height:100%;border-radius:50%;background:radial-gradient(circle at 35% 28%,#10596F 0,#0A3A4B 60%,#072B38 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;border:2px solid rgba(255,255,255,.12)}
.pm-in small{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#BFD9DE}
.pm-in b{font-family:var(--display);font-weight:400;font-size:62px;line-height:1;color:var(--ap-gold)}
.pm-in em{font-style:normal;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#E6F2F3}
.facts{display:flex;align-items:center;justify-content:center;gap:14px;font-size:13.5px;color:#C9DEE2;margin-bottom:12px}
.facts b{font-family:var(--display);font-weight:400;font-size:26px;line-height:1;color:var(--ap-gold);margin-right:3px;vertical-align:-2px}
.facts i{width:1px;height:20px;background:rgba(255,255,255,.25)}
.how{align-self:center;display:inline-flex;align-items:center;gap:8px;background:transparent;border:0;color:#fff;font:600 14px var(--body);cursor:pointer;padding:10px 12px;min-height:44px;margin-bottom:10px}
.how .hi{width:18px;height:18px;border-radius:50%;border:1.5px solid currentColor;display:grid;place-items:center;font:700 11px var(--body)}
.how:focus-visible{outline:3px solid #fff;outline-offset:2px;border-radius:8px}
.cta2{display:grid;gap:10px}
.pn{margin:0 0 2px;text-align:center;font-size:12.5px;color:#9EC3CB}.pn b{color:#fff}
.go{min-height:60px;font-size:22px;border-radius:16px}
.fun3{min-height:46px;background:transparent;border:0;color:#E6F2F3;font:600 15px var(--body);cursor:pointer;border-radius:12px}
.fun3:hover{background:rgba(255,255,255,.08)}.fun3:focus-visible{outline:3px solid #fff;outline-offset:2px}
.sheet.tall{max-height:88%;overflow:auto;gap:12px}
.hw-t{font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;color:#6B6862;margin-top:2px}
.hw-dark{background:linear-gradient(180deg,#0E4D64,#082B38);border-radius:14px;color:#fff;padding:2px}
.hw-dark .trk{background:transparent;border:0}
.rrows{display:grid;gap:8px}
.rrow{display:flex;align-items:center;gap:12px;font-size:14px;color:#2b2926}
.rrow .ri{flex:none;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:#FFF1C7;color:#8A5E00;border:1.5px solid #E9C35B}
.rrow b{color:#151210}
@media (prefers-reduced-motion:reduce){.pm{animation:none}}

/* tela da pergunta: cabe numa tela só, estilo video game */
.qs{overflow:hidden;container-type:size;container-name:scr;display:flex;flex-direction:column}
.qs .zl{padding-top:6px}
.qs .ladder{padding-top:4px}
.hud2{display:grid;grid-template-columns:1fr 1.1fr 1fr;gap:6px;padding:8px 12px 0}
.plate{position:relative;min-width:0;border-radius:12px;padding:5px 8px 6px;text-align:center;background:linear-gradient(180deg,rgba(255,255,255,.16),rgba(255,255,255,.05));border:2px solid rgba(255,197,49,.55);box-shadow:inset 0 -3px 0 rgba(0,0,0,.28),0 0 14px rgba(255,197,49,.16)}
.plate small{display:block;font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:#BFD9DE;line-height:1.1}
.plate b{display:block;font-family:var(--display);font-weight:400;letter-spacing:.02em;line-height:1.05}
.pq b{font-size:15px;color:#fff;text-transform:uppercase;margin-top:3px}.pq b span{font-size:11px;color:#BFD9DE}
.pq b{font-size:26px}.pq b span{font-size:11px;letter-spacing:.1em;margin-right:2px;vertical-align:3px}
.ps b{font-size:28px;color:var(--ap-gold);text-shadow:0 0 14px rgba(255,197,49,.5);margin-top:2px;font-variant-numeric:tabular-nums}
.ph .hrow{display:flex;align-items:center;justify-content:center;gap:3px;margin-top:4px;color:#FF6B5E;filter:drop-shadow(0 0 6px rgba(255,107,94,.65))}
.ph .hrow svg{width:22px;height:22px}
.ph.risk{border-color:rgba(255,107,94,.75);box-shadow:inset 0 -3px 0 rgba(0,0,0,.28),0 0 16px rgba(255,107,94,.3)}
.ph.risk small{color:#FFB3AA}.ph.risk .hrow{gap:4px;filter:none}.ph.risk svg{width:20px;height:20px}
.ph.risk em{font-style:normal;font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;font-weight:700;line-height:1.1;color:#FFD2CC;text-align:left}
.ps.bump{animation:bump .5s ease-out}
@keyframes bump{0%{transform:scale(1)}40%{transform:scale(1.12);box-shadow:inset 0 -3px 0 rgba(0,0,0,.28),0 0 26px rgba(255,197,49,.8)}100%{transform:scale(1)}}
.qmid{flex:1;min-height:0;display:flex;flex-direction:column;gap:8px;padding-top:6px}
.qs .timer{width:68px;height:68px;margin:0 auto;flex:none}
.qs .timer svg{width:68px;height:68px}.qs .timer .n{font-size:28px}
.qs .q{flex:none;margin:0 14px;padding:12px 14px;font-size:18px;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center}
.qs .q small{margin-bottom:3px;text-align:center}.qs .q span{display:block;text-wrap:balance}
.opts2{flex:1;min-height:0;display:grid;grid-template-rows:repeat(4,minmax(40px,60px));gap:8px;padding:0 14px;align-content:center}
.qs .opt{min-height:0;height:100%;padding:0 10px 0 8px;gap:10px;font-size:16px;border-width:2px}
.qs .opt i{flex:none;width:34px;height:34px;border-radius:9px;display:grid;place-items:center;font-family:var(--display);font-size:19px;color:#fff;box-shadow:inset 0 -3px 0 rgba(0,0,0,.25)}
.qs .opt i{background:rgba(255,255,255,.12);color:var(--ap-gold);box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.22)}
.qs .opt span{min-width:0;line-height:1.15;text-align:left}
.tiles{flex:none;display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:8px 14px 14px}
.tile{position:relative;height:clamp(74px,12cqh,98px);border:0;border-radius:18px;color:#fff;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;font-family:var(--body)}
.tile svg{width:30px;height:30px;margin-bottom:1px}
.tile b{font-family:var(--display);font-weight:400;font-size:21px;letter-spacing:.05em;text-transform:uppercase;line-height:1}
.tile small{font-size:11px;opacity:.9;line-height:1.1}
.tile .tc{position:absolute;top:-8px;right:-6px;min-width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:var(--ap-gold);color:#2B1B00;border:3px solid #082B38;font-family:var(--display);font-size:17px}
.tile.skip{background:linear-gradient(180deg,#4B9BFF,#1D5FD6);box-shadow:0 6px 0 #123F94,0 10px 18px rgba(0,0,0,.35)}
.tile.think{background:linear-gradient(180deg,#B77BFF,#6D3BD4);box-shadow:0 6px 0 #45248F,0 10px 18px rgba(0,0,0,.35)}
.tile:active:not(:disabled){transform:translateY(4px);box-shadow:0 2px 0 rgba(0,0,0,.4)}
.tile:disabled{filter:grayscale(.85);opacity:.5;cursor:default}
.tile:focus-visible{outline:3px solid #fff;outline-offset:3px}
@container scr (max-height:680px){
  .qs .zl{display:none}.qs .bar{padding:8px 14px}.qs .ladder{padding-top:6px}.qs .ladder .st{padding:3px 0}
  .hud2{padding-top:6px}.pq b{font-size:22px}.ps b{font-size:24px}.ph .hrow svg{width:19px;height:19px}
  .qs .timer,.qs .timer svg{width:54px;height:54px}.qs .timer .n{font-size:22px}
  .qmid{gap:6px;padding-top:4px}.qs .q{padding:8px 12px;font-size:16px}
  .opts2{grid-template-rows:repeat(4,minmax(36px,52px));gap:6px}.qs .opt{font-size:15px}.qs .opt i{width:30px;height:30px;font-size:17px}
  .tile{height:64px}.tile small{display:none}.tile b{font-size:18px}.tiles{padding:6px 14px 12px}
}
@container scr (max-height:580px){
  .qs .ladder{display:none}.plate small{font-size:8.5px}.qs .timer,.qs .timer svg{width:46px;height:46px}.qs .timer .n{font-size:19px}
  .qs .q{font-size:15px;padding:7px 10px}.qs .q small{display:none}.opts2{grid-template-rows:repeat(4,minmax(34px,46px));gap:5px}.tile{height:56px}
}
@container scr (max-width:340px){ .pq small{display:none}.pq b span{display:inline;font-size:9.5px;margin-right:3px}.qs .q{font-size:14.5px}.qs .opt{font-size:14px}.plate{padding:4px 5px 5px}.ph.risk em{font-size:8.5px} }
@media (prefers-reduced-motion:reduce){.ps.bump{animation:none}}

/* telas de fim: centradas, ganho em destaque */
.fin{overflow:hidden;container-type:size;container-name:scr;display:flex;flex-direction:column}
.fx{position:relative;z-index:1;flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;text-align:center;padding:14px 22px 22px;gap:14px}
.fx-top{flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px}
.fx-tag{background:var(--ap-gold);color:#2B1B00;font-weight:700;font-size:12px;letter-spacing:.12em;text-transform:uppercase;padding:6px 14px;border-radius:99px}
.fx-tag.off{background:rgba(255,255,255,.16);color:#fff}
.pm.sm{width:158px;height:158px;padding:8px;flex:none}
.pm.sm .pm-in b{font-size:54px}.pm.sm .pm-in small{font-size:11px}.pm.sm .pm-in em{font-size:12px}
.pm.off{background:conic-gradient(from 210deg,#9DB5BB,#5E7C85,#9DB5BB);box-shadow:0 12px 30px rgba(0,0,0,.35);animation:none}
.pm.off .pm-in b{color:#fff}
.fx-h{margin:0;font-family:var(--display);font-weight:400;font-size:30px;line-height:1.05;letter-spacing:.02em;text-transform:uppercase}
.fx-stats{width:100%;display:grid;grid-template-columns:1fr 1fr;gap:10px}
.fx-stats .plate{padding:8px 6px 9px}
.fx-stats .plate b{font-size:32px;color:#fff;line-height:1}.fx-stats .plate b.g{color:var(--ap-gold);text-shadow:0 0 14px rgba(255,197,49,.45)}
.fx-stats .plate small{margin-top:3px;font-size:10px}
.fx-card{width:100%;display:flex;flex-direction:column;align-items:center;gap:8px;background:rgba(5,26,34,.55);border:1px solid rgba(255,255,255,.16);border-radius:16px;padding:14px 14px 13px}
.fx-card p{margin:0;font-size:14.5px;line-height:1.4;color:#DCEBEE}.fx-card p b{color:var(--ap-gold)}
.fx-ic{color:var(--ap-gold)}
.fx-chips{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.fx-chips span{font-size:12px;color:#C9DEE2;background:rgba(255,255,255,.1);border-radius:99px;padding:4px 10px}.fx-chips b{color:#fff}
.fx-note{margin:0;font-size:12.5px;color:#9EC3CB}
.fx-cta{width:100%;display:grid;gap:10px;margin-top:2px}
.fin .btn.alt{color:#fff}
.cf{position:absolute;width:7px;height:11px;border-radius:2px;opacity:0;animation:confall 4.2s ease-in infinite}
@keyframes confall{0%{opacity:0;transform:translateY(-6px) rotate(0)}12%{opacity:1}100%{opacity:0;transform:translateY(150px) rotate(280deg)}}
@container scr (max-height:660px){ .fx{gap:10px;padding:14px 18px 16px}.fx-top{padding-top:6px}.pm.sm{width:124px;height:124px}.pm.sm .pm-in b{font-size:42px}.fx-top{gap:10px}.fx-chips{display:none}.fx-stats .plate b{font-size:26px}.fx-card p{font-size:13.5px}.fx-h{font-size:24px}.fx-note{display:none} }
@media (prefers-reduced-motion:reduce){.cf{animation:none;opacity:.7}}

.bar-r{display:flex;align-items:center;gap:6px}
.snd{width:34px;height:34px;border-radius:50%;border:0;background:transparent;color:var(--ap-ink);display:grid;place-items:center;cursor:pointer}
.sea .snd{color:#fff}
.snd:focus-visible{outline:3px solid var(--ap-gold);outline-offset:1px}
@container scr (max-width:340px){ .qs .bar .mesa,.fin .bar .mesa{display:none} }

/* fim: placar + ranking */
.fx{gap:12px;padding:12px 20px 20px}
.fx-stats .plate{padding:8px 6px 8px}
.fx-stats .plate em{display:block;font-style:normal;font-size:11px;color:#C9DEE2;margin-top:3px}
.fx-stats .plate small{margin-bottom:2px}
.fx-prize{width:100%;display:flex;flex-direction:column;align-items:center;gap:2px;padding:12px 12px 11px;border-radius:16px;background:linear-gradient(180deg,rgba(255,197,49,.26),rgba(255,197,49,.1));border:1.5px solid rgba(255,197,49,.7);box-shadow:0 0 26px rgba(255,197,49,.18)}
.fx-prize small{font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:#FFE7A0}
.fx-prize b{font-family:var(--display);font-weight:400;font-size:32px;line-height:1.05;color:var(--ap-gold);text-transform:uppercase;letter-spacing:.02em}
.fx-prize .fp-s{font-size:12px;color:#E6F2F3}
.fx-prize .fx-ic{margin-bottom:2px}
.fx-noprize{width:100%;display:flex;flex-direction:column;gap:3px;padding:11px 12px;border-radius:16px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18)}
.fx-noprize b{font-family:var(--display);font-weight:400;font-size:22px;letter-spacing:.03em;text-transform:uppercase}
.fx-noprize span{font-size:12.5px;color:#C9DEE2;line-height:1.3}
.rk{width:100%;display:grid;gap:5px;text-align:left}
.rkt{font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:#9EC3CB;text-align:center;margin-bottom:1px}
.rkr{display:grid;grid-template-columns:34px 1fr auto;align-items:center;gap:8px;padding:7px 12px;border-radius:10px;background:rgba(5,26,34,.55);border:1px solid rgba(255,255,255,.12);font-size:14px}
.rkr .rp{font-family:var(--display);font-size:16px;color:#BFD9DE}
.rkr .rn{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rkr .rv{font-family:var(--display);font-size:17px;color:#fff;font-variant-numeric:tabular-nums}
.rkr.me{background:linear-gradient(180deg,rgba(255,197,49,.3),rgba(255,197,49,.14));border-color:rgba(255,197,49,.85);box-shadow:0 0 16px rgba(255,197,49,.25)}
.rkr.me .rp,.rkr.me .rv{color:var(--ap-gold)}.rkr.me .rn{font-weight:700}
.rk-dots{text-align:center;color:#6F97A1;font-size:12px;line-height:1;letter-spacing:.3em}
.fx-cta{margin-top:auto}
@container scr (max-height:700px){ .fx{gap:9px;padding:10px 16px 14px}.fx-prize b{font-size:26px}.fx-prize .fp-s{display:none}.rkr{padding:5px 10px;font-size:13px}.rkr:nth-of-type(n+3):not(.me){display:none}.fx-tag{font-size:11px;padding:5px 12px} }
@container scr (max-height:600px){ .rk .rkr:not(.me){display:none}.rk-dots{display:none}.fx-stats .plate b{font-size:26px}.fx-stats .plate em{display:none}.fx-noprize span{display:none} }
/* painel da loja / garçom */
.hwrow{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
.fld{display:grid;gap:5px;font-size:13px;font-weight:600;color:var(--ap-ink)}
.fld input{min-height:50px;border:1px solid var(--ap-line);border-radius:8px;background:var(--ap-paper);padding:0 14px;font:600 17px var(--body);color:var(--ap-ink);width:100%}
.fld input.big6{font:400 30px var(--display);letter-spacing:.35em;text-align:center}
.fld input:focus-visible{outline:3px solid #151210;outline-offset:1px}
.chk{display:flex;gap:10px;align-items:center;font-size:14px;min-height:36px;color:var(--ap-ink)}.chk input{width:20px;height:20px;flex:none}
.rkp{flex:1;min-height:0;overflow:auto;padding:6px 18px 18px;display:grid;align-content:start;gap:10px;position:relative}
.rtabs{display:grid;grid-template-columns:1fr 1fr;gap:6px;background:rgba(5,26,34,.6);border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:4px}
.rtabs button{min-height:42px;border:0;border-radius:9px;background:transparent;color:#CFE3E6;font:700 14px var(--body);cursor:pointer}
.rtabs button.on{background:var(--ap-gold);color:#2B1B00}
.rtabs button:focus-visible{outline:3px solid #fff;outline-offset:2px}
.rk-me{display:grid;justify-items:center;gap:2px;background:rgba(255,197,49,.14);border:1px solid rgba(255,197,49,.7);border-radius:14px;padding:10px 12px;text-align:center}
.rk-me small{font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:#9EC3CB}
.rk-me b{font-family:var(--display);font-weight:400;font-size:38px;line-height:1;color:var(--ap-gold)}
.rk-me em{font-style:normal;font-size:12.5px;color:#DCEBEE}
.rk-me.none{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.2)}
.rkr .rn small{display:block;font-size:11px;color:#9EC3CB;margin-top:1px}
.rklink{background:none;border:0;color:var(--ap-gold);font:700 13px var(--body);cursor:pointer;padding:8px 4px;text-align:center;min-height:36px}
.rklink:focus-visible{outline:3px solid #fff;outline-offset:2px}


/* Entrada responsiva (nov/2026): em celular Android com barra do navegador/sistema o botão Jogar
   ficava cortado. Tudo escala pela ALTURA visível (dvh) e, em último caso, a tela rola. */
.qz{bottom:auto;height:100vh;height:100dvh}
.gi2{overflow-y:auto;scrollbar-width:none;padding:clamp(10px,2.6dvh,26px) 24px max(14px,env(safe-area-inset-bottom))}
.gi2::-webkit-scrollbar{display:none}
.kick{margin-bottom:clamp(2px,.9dvh,10px)}
.h2t span,.h2t .g{font-size:clamp(32px,7dvh,56px)}
.sub2{margin-top:clamp(6px,1.5dvh,16px);font-size:clamp(13px,2dvh,16px);line-height:1.35;max-width:30ch}
.prize{flex:1 1 auto;min-height:0;padding:clamp(4px,1.2dvh,12px) 0}
.pm{width:clamp(92px,18dvh,176px);height:clamp(92px,18dvh,176px);padding:clamp(5px,1dvh,9px)}
.pm-in b{font-size:clamp(32px,6.6dvh,62px)}
.pm-in small{font-size:clamp(8.5px,1.4dvh,12px)}
.pm-in em{font-size:clamp(9px,1.5dvh,13px)}
.facts{gap:12px;font-size:clamp(11.5px,1.8dvh,13.5px);margin-bottom:clamp(2px,.8dvh,12px)}
.facts b{font-size:clamp(20px,3.4dvh,26px)}
.how{min-height:40px;padding:6px 10px;margin-bottom:clamp(0px,.8dvh,10px)}
.cta2{gap:clamp(4px,1dvh,10px)}
.go{min-height:clamp(50px,7.4dvh,60px);font-size:clamp(19px,2.9dvh,22px)}

.fw{position:absolute;inset:0;width:100%;height:100%;z-index:6;pointer-events:none}
.mkc{position:relative;z-index:7;flex:1;display:flex;align-items:center;justify-content:center;padding:16px}
.mkc-card{width:100%;max-width:380px;background:linear-gradient(180deg,#0E4D64,#082B38);border:2px solid var(--ap-gold);border-radius:20px;padding:22px 18px 18px;display:grid;gap:12px;text-align:center;box-shadow:0 0 0 6px rgba(255,197,49,.15),0 20px 50px rgba(0,0,0,.45);animation:mkpop .5s cubic-bezier(.2,1.4,.4,1) both}
.mkc-kick{font-size:11px;letter-spacing:.22em;text-transform:uppercase;font-weight:700;color:var(--ap-gold)}
.mkc-t{font-family:var(--display);font-weight:400;font-size:40px;line-height:1;margin:0;color:#fff}
.mkc-pct{display:grid;gap:2px;justify-items:center;background:rgba(255,197,49,.12);border:1.5px solid rgba(255,197,49,.6);border-radius:14px;padding:10px}
.mkc-pct b{font-family:var(--display);font-weight:400;font-size:64px;line-height:1;color:var(--ap-gold);text-shadow:0 4px 0 #6B4A00,0 0 24px rgba(255,197,49,.5)}
.mkc-pct span{font-size:14px;font-weight:700;color:#fff}
.mkc-card p{margin:0;font-size:14px;color:#D7E7EA;line-height:1.4}
.mkc-card p b{color:var(--ap-gold)}
.mkc-btns{display:grid;gap:8px;margin-top:4px}
@keyframes mkpop{from{transform:scale(.7);opacity:0}to{transform:scale(1);opacity:1}}
@media (prefers-reduced-motion:reduce){.mkc-card{animation:none}}

.mkc-kick.warn{display:inline-block;justify-self:center;width:auto;background:#D6392B;color:#fff;border-radius:999px;padding:6px 14px;font-size:11px;letter-spacing:.16em}
.mkc-card.dc{animation-duration:.35s}
.dc-opts{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.dc-opt{display:grid;gap:3px;justify-items:center;align-content:start;border-radius:14px;padding:12px 8px;border:2px solid;text-align:center}
.dc-opt small{font-size:11px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:#D7E7EA}
.dc-opt b{font-family:var(--display);font-weight:400;font-size:44px;line-height:1}
.dc-opt span{font-size:13px;font-weight:700;color:#fff;line-height:1.2}
.dc-opt em{font-style:normal;font-size:12px;line-height:1.3;color:#D7E7EA;margin-top:4px}
.dc-opt.safe{border-color:var(--ap-gold);background:rgba(255,197,49,.12)}
.dc-opt.safe b{color:var(--ap-gold)}
.dc-opt.risk{border-color:#FF7A6B;background:rgba(214,57,43,.14)}
.dc-opt.risk b{color:#FF9C8F}
.btn.dc-go{color:#FFB3A8;border-color:#FF7A6B}
`
