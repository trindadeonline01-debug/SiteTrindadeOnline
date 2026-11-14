/* eslint-disable */
// @ts-nocheck
// Jogo do Quiz Pesca Premiada — tela do cliente. Portado do mockup aprovado (docs/pesca-premiada/quiz-mockup.html):
// o visual é o mesmo; a diferença é que aqui o SERVIDOR (/api/mesa/quiz) sorteia, conta o tempo e confere.
// Escrito em JS simples de propósito (veio do mockup); `montarQuiz` devolve a função de limpeza.
export function montarQuiz(view: HTMLElement, TOKEN: string): () => void {
  function $(s) { return view.querySelector(s) }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] }) }

  var SND=true, AC=null;
  function ac(){ if(!SND) return null; try{ if(!AC) AC=new (window.AudioContext||window.webkitAudioContext)(); if(AC.state==='suspended') AC.resume(); return AC }catch(e){ return null } }
  function tone(c,f,t0,dur,type,vol){ var o=c.createOscillator(), g=c.createGain(); o.type=type; o.frequency.setValueAtTime(f,t0); g.gain.setValueAtTime(0.0001,t0); g.gain.exponentialRampToValueAtTime(vol,t0+0.01); g.gain.exponentialRampToValueAtTime(0.0001,t0+dur); o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0+dur+0.05) }
  function noiseBuf(c,sec){ var b=c.createBuffer(1,Math.floor(c.sampleRate*sec),c.sampleRate), d=b.getChannelData(0); for(var i=0;i<d.length;i++) d[i]=Math.random()*2-1; return b }
  function applause(c,t0,dur,vol){ var src=c.createBufferSource(); src.buffer=noiseBuf(c,dur+0.1); var bp=c.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=2200; bp.Q.value=.6; var g=c.createGain(); g.gain.setValueAtTime(0,t0); var t=t0; while(t<t0+dur-0.12){ var a=vol*(0.5+Math.random()*0.7); g.gain.linearRampToValueAtTime(a,t+0.008); g.gain.linearRampToValueAtTime(a*0.15,t+0.045); t+=0.045+Math.random()*0.05 } g.gain.linearRampToValueAtTime(0,t0+dur); src.connect(bp); bp.connect(g); g.connect(c.destination); src.start(t0) }
  function sndCash(big){ var c=ac(); if(!c) return; var t=c.currentTime+0.01;
    var n=c.createBufferSource(); n.buffer=noiseBuf(c,0.06); var hp=c.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=1800; var ng=c.createGain(); ng.gain.setValueAtTime(0.25,t); ng.gain.exponentialRampToValueAtTime(0.001,t+0.06); n.connect(hp); hp.connect(ng); ng.connect(c.destination); n.start(t);
    tone(c,1318.5,t+0.05,0.7,'sine',0.28); tone(c,3640,t+0.05,0.35,'sine',0.08); tone(c,1760,t+0.17,0.9,'sine',0.3); tone(c,4850,t+0.17,0.4,'sine',0.07);
    for(var i=0;i<6;i++) tone(c,3200+Math.random()*1800,t+0.3+i*0.045,0.12,'triangle',0.06);
    if(big) applause(c,t+0.25,1.4,0.12) }
  function sndErr(){ var c=ac(); if(!c) return; var t=c.currentTime+0.01; var lp=c.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=900; lp.connect(c.destination);
    [[330,260,0],[247,170,0.2]].forEach(function(x){ var o=c.createOscillator(), g=c.createGain(); o.type='sawtooth'; o.frequency.setValueAtTime(x[0],t+x[2]); o.frequency.exponentialRampToValueAtTime(x[1],t+x[2]+0.22); g.gain.setValueAtTime(0.0001,t+x[2]); g.gain.exponentialRampToValueAtTime(0.28,t+x[2]+0.02); g.gain.exponentialRampToValueAtTime(0.0001,t+x[2]+0.26); o.connect(g); g.connect(lp); o.start(t+x[2]); o.stop(t+x[2]+0.3) }) }
  function pop(c,t0){ var n=c.createBufferSource(); n.buffer=noiseBuf(c,0.12); var bp=c.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=900; bp.Q.value=.8; var g=c.createGain(); g.gain.setValueAtTime(0.32,t0); g.gain.exponentialRampToValueAtTime(0.001,t0+0.12); n.connect(bp); bp.connect(g); g.connect(c.destination); n.start(t0); tone(c,190,t0,0.1,'sine',0.18) }
  function sndMarco(){ var c=ac(); if(!c) return; var t=c.currentTime+0.01; applause(c,t+0.15,3.2,0.16); [523.25,659.25,783.99,1046.5,1318.5].forEach(function(f,i){ tone(c,f,t+i*0.09,0.55,'triangle',0.16) }); [0.2,0.55,0.95,1.4,1.9,2.5].forEach(function(d){ pop(c,t+d) }) }
  var FW={raf:0,parts:[],timers:[]}
  function stopFogos(){ if(FW.raf) cancelAnimationFrame(FW.raf); FW.raf=0; FW.timers.forEach(clearTimeout); FW.timers=[]; FW.parts=[] }
  function iniciarFogos(){
    stopFogos()
    var cv=view.querySelector('#qz-fw'); if(!cv) return
    if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    var dpr=Math.min(2,window.devicePixelRatio||1), W=cv.clientWidth||320, H=cv.clientHeight||560
    cv.width=W*dpr; cv.height=H*dpr
    var g=cv.getContext('2d'); g.scale(dpr,dpr)
    var cores=['#FFC531','#FF6B5E','#4BD6A5','#5CC8FF','#FF8AD8','#FFFFFF']
    function cor(){ return cores[Math.floor(Math.random()*cores.length)] }
    function burst(){
      var x=W*(0.15+Math.random()*0.7), y=H*(0.12+Math.random()*0.4), c1=cor(), i, a, v
      for(i=0;i<36;i++){ a=Math.random()*6.2832; v=1.4+Math.random()*3.8; FW.parts.push({k:'f',x:x,y:y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:1,dec:.011+Math.random()*.01,c:Math.random()<.7?c1:cor(),r:1.5+Math.random()*1.8}) }
      for(i=0;i<14;i++){ FW.parts.push({k:'c',x:x,y:y,vx:(Math.random()-.5)*5,vy:-1-Math.random()*3,life:1,dec:.006+Math.random()*.005,c:cor(),w:5+Math.random()*4,h:3+Math.random()*3,rot:Math.random()*6,vr:(Math.random()-.5)*.4}) }
    }
    ;[200,550,950,1400,1900,2500].forEach(function(d){ FW.timers.push(setTimeout(burst,d)) })
    function loop(){
      if(DESTROYED||cur!=='marco'){ stopFogos(); return }
      g.clearRect(0,0,W,H)
      FW.parts=FW.parts.filter(function(p){ return p.life>0 && p.y<H+20 })
      FW.parts.forEach(function(p){
        p.x+=p.vx; p.y+=p.vy; p.vy+=.06; p.vx*=.985; p.life-=p.dec; g.globalAlpha=Math.max(0,p.life); g.fillStyle=p.c
        if(p.k==='f'){ g.beginPath(); g.arc(p.x,p.y,p.r,0,6.2832); g.fill() }
        else { p.rot+=p.vr; g.save(); g.translate(p.x,p.y); g.rotate(p.rot); g.fillRect(-p.w/2,-p.h/2,p.w,p.h); g.restore() }
      })
      g.globalAlpha=1
      FW.raf=requestAnimationFrame(loop)
    }
    FW.raf=requestAnimationFrame(loop)
  }
  function sndWin(){ var c=ac(); if(!c) return; var t=c.currentTime+0.01; applause(c,t,2.2,0.14); [523.25,659.25,783.99,1046.5].forEach(function(f,i){ tone(c,f,t+i*0.11,0.5,'triangle',0.16) }) }
  var IC_SPK='<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  var IC_SPK_OFF='<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  var IC_SHIELD='<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8.5 12l2.5 2.5 4.5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var IC_FLAME='<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 3c.8 4 5 5.2 5 10a5 5 0 0 1-10 0c0-2 .9-3.4 2.2-4.4.1 1.8.9 2.9 2.1 3.2C10.6 9 10.8 6 12 3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
  function hearts(){ var h=''; for(var i=0;i<3;i++){ h+='<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M12 21s-7-4.6-9.3-9A5.3 5.3 0 0 1 12 6.4 5.3 5.3 0 0 1 21.3 12C19 16.4 12 21 12 21z" fill="currentColor" opacity="'+(i<3-G.erros?1:.22)+'"/></svg>' } return h }
  function hud(){ var safe=G.estado!=='risco'&&G.acertos<30, lvl=nivelTxt().toUpperCase();
    var mid = safe ? '<div class="plate ph" aria-label="'+(3-G.erros)+' chances de errar"><small>Chances</small><span class="hrow">'+hearts()+'</span></div>'
                   : '<div class="plate ph risk"><small>Zona de risco</small><span class="hrow">'+IC_FLAME+'<em>cada erro encerra</em></span></div>';
    return '<div class="hud2"><div class="plate pq"><small>'+lvl+'</small><b><span>Pergunta</span> '+(G.acertos+1)+'</b></div>'+mid+'<div class="plate ps'+(G.res&&G.res.ok?' bump':'')+'"><small>Pontos</small><b id="pts">'+G.pontos+'</b></div></div>' }
  function ringHtml(ms,total){
    var C=2*Math.PI*36, off=C*(1-Math.max(0,ms)/total);
    return '<div class="timer"><svg viewBox="0 0 84 84"><circle cx="42" cy="42" r="36" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="7"/><circle id="ring" cx="42" cy="42" r="36" fill="none" stroke="'+(ms<2000?'#FF7A6B':'#FFC531')+'" stroke-width="7" stroke-linecap="round" stroke-dasharray="'+C.toFixed(1)+'" stroke-dashoffset="'+off.toFixed(1)+'"/></svg><div class="n" id="sec">'+Math.ceil(Math.max(0,ms)/1000)+'</div></div>'
  }
  var IC_CLOCK='<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 8v5l3 2M9 3h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  var IC_SKIP='<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 5l8 7-8 7zM14 5l8 7-8 7z" fill="currentColor"/></svg>';
  var IC_HEART='<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 21s-7-4.6-9.3-9A5.3 5.3 0 0 1 12 6.4 5.3 5.3 0 0 1 21.3 12C19 16.4 12 21 12 21z" fill="currentColor"/></svg>';
  var IC_BULB='<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M9 21h6M10 18h4M12 3a6 6 0 0 0-3.5 10.9c.9.7 1.5 1.5 1.5 2.1h4c0-.6.6-1.4 1.5-2.1A6 6 0 0 0 12 3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function scene(){
    var b='', bs=[[10,8,0,9],[28,5,3,11],[48,9,6,10],[70,6,2,12],[88,8,5,9]];
    bs.forEach(function(x){ b+='<i class="bub" style="left:'+x[0]+'%;width:'+x[1]+'px;height:'+x[1]+'px;animation-delay:-'+x[2]+'s;animation-duration:'+x[3]+'s"></i>' });
    return '<div class="scene" aria-hidden="true"><div class="rays"></div>'+b+'<div class="vig"></div></div>'
  }
  var IC_SKIP_L='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5l9 7-9 7zM13 5l9 7-9 7z" fill="currentColor"/></svg>';
  var IC_THINK_L='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M12 8v5l3.2 2M9 3h6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
  function perguntaHtml(frozen){
    var q=G.q, ms = frozen ? 4000 : (q.dur-(Date.now()-q.ini)), done=G.resp!==null;
    var h='<div class="screen sea qs">'+bar()+ladder()+hud()+'<div class="qmid">'+ringHtml(ms,q.dur)+
      '<div class="q"><small>'+nivelTxt()+(G.pensando?' · pensando (20 s)':'')+'</small><span>'+esc(q.txt)+'</span></div><div class="opts2">';
    q.ops.forEach(function(o,i){
      var cls='opt c'+i; if(done){ if(G.busy&&!G.res){ cls+= i===G.resp ? ' pick' : ' dim' } else if(o.ok) cls+=' right'; else if(i===G.resp) cls+=' wrong'; else cls+=' dim' }
      h+='<button class="'+cls+'" data-act="ans" data-i="'+i+'"'+(done||frozen?' tabindex="-1"':'')+'><i>'+'ABCD'[i]+'</i><span>'+esc(o.t)+'</span></button>'
    });
    h+='</div></div><div class="tiles">'+
      '<button class="tile skip" data-act="skip"'+(G.pulos<=0||done?' disabled':'')+'><span class="tc">'+G.pulos+'</span>'+IC_SKIP_L+'<b>Pular</b><small>trocar pergunta</small></button>'+
      '<button class="tile think" data-act="think"'+(G.pensar<=0||G.pensando||done?' disabled':'')+'><span class="tc">'+G.pensar+'</span>'+IC_THINK_L+'<b>'+(G.pensando?'Pensando':'Pensar')+'</b><small>'+(G.pensando?'+ tempo ativo':'+ tempo: 20 s')+'</small></button></div></div>';
    if(G.res){ var li=h.lastIndexOf('</div>'); h=h.slice(0,li)+rsHtml()+h.slice(li) }
    return h
  }
  var IC_OK='<svg viewBox="0 0 24 24" width="96" height="96" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var IC_X='<svg viewBox="0 0 24 24" width="88" height="88" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round"/></svg>';
  function rsHtml(){ var r=G.res; if(!r) return '';
    var big = r.ok ? '+'+r.pts : (r.motivo==='tempo'?'Tempo esgotado':'Errou');
    var sm = r.ok ? 'pontos' : (r.fim ? (G.fim&&G.fim.semChances?'Acabaram as chances':'Fim da rodada') : 'Restam '+r.left+(r.left===1?' chance':' chances'));
    return '<div class="rs" role="status"><div class="rs-c '+(r.ok?'ok':'bad')+'">'+(r.ok?IC_OK:IC_X)+'</div><div class="rs-big '+(r.ok?'ok':'bad')+'">'+big+'</div><div class="rs-sm">'+sm+'</div>'+(r.ok?'':'<div class="rs-certa">Certa: <b>'+esc(r.certa)+'</b></div>')+'</div>' }


  // ======== estado ========
  var API = '/api/mesa/quiz', LS = 'quizjt:' + TOKEN
  // Modo loja (página de jogos, sem mesa): só ranking, nunca cashback. Token = 'loja:<slug>'.
  var MODO_LOJA = TOKEN.indexOf('loja:') === 0
  var HOME = MODO_LOJA ? '/jogos/' + TOKEN.slice(5) : '/mesa/' + TOKEN
  var IDENT_URL = MODO_LOJA ? HOME + '?identificar=1' : HOME + '?identificar=jogar'
  var VOLTAR = MODO_LOJA ? 'Jogos' : 'Mesa'
  // Tema escolhido na tela inicial ('' = misturado). Fica guardado neste aparelho.
  var TEMA = ''; try { TEMA = localStorage.getItem('quiztema') || '' } catch (e) {}
  var JT = ''; try { JT = localStorage.getItem(LS) || '' } catch (e) {}
  var INFO = null, G = null, T = null, cur = 'load', ZONES = false, LEAVE = false, DESTROYED = false
  var CT = { n: 3, t: null }
  var REG = { apelido: '', tel: '', idade: false, aceite: false, err: '', cod: '' }
  var RK = { tab: 'sem', data: null }
  var NIVEIS = ['Muito fácil', 'Fácil', 'Intermediário', 'Difícil', 'Impossível']
  function nivelTxt() { return NIVEIS[((G && G.nivel) || 1) - 1] }
  function fmtN(n) { return Number(n || 0).toLocaleString('pt-BR') }
  function stopT() { if (T) { clearInterval(T); T = null } }
  function emJogo() { return !!(G && G.live && !G.fimJogo && cur === 'q') }

  function api(acao, extra) {
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ token: TOKEN, jt: JT, acao: acao }, extra || {})) })
      .then(function (r) { return r.json().catch(function () { return {} }).then(function (j) {
        if (!r.ok || j.error) { var e = new Error(j.error || 'Algo deu errado. Tente de novo.'); e.status = r.status; throw e }
        return j }) })
  }
  var toastT = null
  function toast(msg) {
    var el = $('#qz-toast'); if (!el) return
    el.textContent = msg; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { el.classList.remove('on') }, 3500)
  }
  function fail(e) {
    if (G) G.busy = false
    if (e && e.status === 401) { JT = ''; try { localStorage.removeItem(LS) } catch (x) {} if (INFO) INFO.jogador = null; location.href = IDENT_URL; return }
    if (e && e.status === 409 && G && G.live) { // rodada já encerrada no servidor
      cur = 'intro'; G = null; render(); toast('Essa rodada já terminou.'); return
    }
    toast((e && e.message) || 'Sem conexão. Tente de novo.')
  }

  // ======== peças de tela ========
  function bar() {
    var voltar = ['ranking', 'cadastro', 'codigo'].indexOf(cur) >= 0
    var back = cur === 'intro' || cur === 'load' || cur === 'queda' ? '<button class="back" data-go="mesa">‹ ' + VOLTAR + '</button>'
      : '<button class="back" ' + (emJogo() ? 'data-act="leave"' : 'data-go="' + (voltar ? 'intro' : 'mesa') + '"') + '>‹ ' + (emJogo() ? 'Sair' : (voltar ? 'Voltar' : VOLTAR)) + '</button>'
    var nome = esc(((INFO && INFO.loja) || 'Quiz').trim().toUpperCase()), sp = nome.indexOf(' ')
    var marca = sp > 0 ? nome.slice(0, sp) + ' <b>' + nome.slice(sp + 1) + '</b>' : nome
    return '<div class="bar">' + back + '<div class="brand">' + marca + '</div><div class="bar-r"><button class="snd" data-act="snd" aria-label="' + (SND ? 'Desligar som' : 'Ligar som') + '" aria-pressed="' + SND + '">' + (SND ? IC_SPK : IC_SPK_OFF) + '</button>' + (MODO_LOJA ? '' : '<div class="mesa">Mesa ' + esc((INFO && INFO.mesa) || '') + '</div>') + '</div></div>'
  }
  function ladder() {
    var tiers = [10, 20, 30, 35, 40, 45], h = '<div class="zl"><span class="ok">Zona segura</span><span class="rk">Zona de risco</span></div><div class="ladder">'
    tiers.forEach(function (t, i) { if (i === 3) h += '<span class="gate" title="Depois de 30 acertos, cada erro encerra a rodada"></span>'; h += '<div class="st' + (G.acertos >= t ? ' got' : '') + '">' + t + '<small>acertos</small></div>' })
    return h + '</div>'
  }
  function msg(titulo, texto) { return '<div class="screen sea">' + scene() + bar() + '<div class="res"><div><h2 class="h1">' + titulo + '</h2></div><div class="box">' + texto + '</div></div></div>' }

  // ======== telas ========
  var S = {}
  S.load = function () { return '<div class="screen sea">' + scene() + bar() + '<div class="res"><p class="p" style="color:#CFE3E6">Carregando…</p></div></div>' }
  S.off = function () { return '<div class="screen sea">' + scene() + bar() + '<div class="res"><div><h2 class="h1">Quiz indisponível</h2></div><div class="box">O quiz não está ligado nesta loja agora. ' + (MODO_LOJA ? '' : 'Chame o garçom se quiser jogar.') + '</div><div style="margin-top:auto"><button class="btn" data-go="mesa">' + (MODO_LOJA ? 'Voltar aos jogos' : 'Voltar à mesa') + '</button></div></div></div>' }

  S.intro = function () {
    var premio = INFO && INFO.premio
    return '<div class="screen sea game">' + scene() + bar() + '<div class="gi2">' +
      '<div class="hero"><span class="kick">Quiz</span><h2 class="h2t"><span>Pesca</span><span class="g">Premiada</span></h2><p class="sub2">' + (premio ? 'Acerte as perguntas e ganhe cashback para a sua próxima compra.' : 'Acerte as perguntas e suba no ranking da loja.') + '</p></div>' +
      '<div class="prize"><div class="pm"><div class="pm-in"><small>entre no</small><b>TOP</b><em>da loja</em></div></div></div>' +
      (MODO_LOJA ? '<div class="fx-noprize" style="margin:0 16px 10px"><b>🏆 Aqui vale só para o ranking</b><span>Para ganhar cashback, jogue pelo QR da sua mesa no restaurante.</span></div>' : (premio ? '<div class="fx-noprize" style="margin:0 16px 10px"><b>🎁 Esta rodada vale cashback</b><span>Ele só é creditado quando você pagar a conta da mesa.</span></div>' : '')) +
      '<div class="facts"><span><b>10</b> segundos por pergunta</span><i></i><span><b>3</b> chances de errar</span></div>' +
      '<div class="hwrow"><button class="how" data-act="zones"><span class="hi">i</span>Como funciona</button><button class="how" data-go="ranking"><span class="hi">★</span>Ver ranking</button></div>' +
      (MODO_LOJA ? '' : '<div class="hwrow"><button class="how" data-go="grupo"><span class="hi">👥</span>Jogar em grupo</button></div>') +
      '<div class="temas"><span class="tm-t">Tema</span><div class="tm-row"><button class="tm' + (TEMA ? '' : ' on') + '" data-act="tema" data-v="">🎲 Misturado</button>' + ((INFO && INFO.temas) || []).map(function (t) { return '<button class="tm' + (TEMA === t.id ? ' on' : '') + '" data-act="tema" data-v="' + esc(t.id) + '">' + t.icone + ' ' + esc(t.nome) + '</button>' }).join('') + '</div></div>' +
      '<div class="cta2"><p class="pn">' + (INFO && INFO.jogador ? 'Jogando como <b>' + esc(INFO.jogador.apelido) + '</b>' : 'Você informa seu nome e WhatsApp antes de jogar') + '</p><button class="go" data-act="start"><span>Jogar</span></button></div></div></div>'
  }
  S.contagem = function () {
    var n = CT.n, ja = n <= 0
    return '<div class="screen sea game">' + scene() + bar() + '<div class="cnt"><div class="cnt-top"><span class="cnt-tag fun">Valendo ranking</span><p>Prepare-se</p></div>' +
      '<div class="cnt-ring"><i></i><i></i><div class="cnt-num' + (ja ? ' ja' : '') + '" key="' + n + '">' + (ja ? 'JÁ!' : n) + '</div></div>' +
      '<p class="cnt-sub">' + (ja ? 'Boa sorte!' : 'Seu jogo começa em instantes') + '</p><div class="cnt-rules"><span><b>10 s</b> por pergunta</span><span><b>3</b> chances de errar</span></div></div></div>'
  }
  S.cadastro = function () {
    return '<div class="screen">' + bar() + '<div class="body"><div><h2 class="h1">Antes de jogar</h2><p class="p" style="margin-top:6px">Escolha um apelido e confirme seu WhatsApp. O apelido aparece no ranking da loja.</p></div>' +
      '<label class="fld"><span>Apelido (3 a 16 letras)</span><input id="rg-ap" maxlength="16" autocomplete="off" value="' + esc(REG.apelido) + '"></label>' +
      '<label class="fld"><span>WhatsApp com DDD</span><input id="rg-tel" inputmode="tel" autocomplete="tel" placeholder="(21) 99999-9999" value="' + esc(REG.tel) + '"></label>' +
      '<label class="chk"><input type="checkbox" id="rg-18"' + (REG.idade ? ' checked' : '') + '> Tenho 18 anos ou mais</label>' +
      '<label class="chk"><input type="checkbox" id="rg-ok"' + (REG.aceite ? ' checked' : '') + '> Aceito aparecer no ranking com meu apelido</label>' +
      (REG.err ? '<div class="warn">' + esc(REG.err) + '</div>' : '<p class="note">O apelido não troca depois e não pode repetir nesta loja. Quem já jogou aqui com este WhatsApp volta com o mesmo apelido.</p>') +
      '<div style="margin-top:auto;display:grid;gap:8px"><button class="btn" data-act="regsend"' + (REG.busy ? ' disabled' : '') + '>' + (REG.busy ? 'Enviando…' : 'Enviar código no WhatsApp') + '</button></div></div></div>'
  }
  S.codigo = function () {
    return '<div class="screen">' + bar() + '<div class="body"><div><h2 class="h1">Digite o código</h2><p class="p" style="margin-top:6px">Enviamos 6 números para o WhatsApp <b>' + esc(REG.tel) + '</b>. Vale por 10 minutos.</p></div>' +
      '<label class="fld"><span>Código de 6 números</span><input id="rg-cod" class="big6" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="000000" value="' + esc(REG.cod) + '"></label>' +
      (REG.err ? '<div class="warn">' + esc(REG.err) + '</div>' : '') +
      '<div style="margin-top:auto;display:grid;gap:8px"><button class="btn" data-act="regok"' + (REG.busy ? ' disabled' : '') + '>' + (REG.busy ? 'Confirmando…' : 'Confirmar e jogar') + '</button><button class="btn alt" style="color:var(--ap-ink)" data-go="cadastro">Trocar o número</button></div></div></div>'
  }
  S.queda = function () {
    return '<div class="screen sea">' + scene() + bar() + '<div class="res"><div><div class="tag" style="background:var(--ap-gold);color:#151210">Rodada guardada</div><h2 class="h1" style="margin-top:10px">Você tem um jogo em andamento</h2></div>' +
      '<div class="box">Continue de onde parou. O relógio da pergunta não para: se o tempo acabou enquanto você estava fora, conta como erro.</div>' +
      '<div style="margin-top:auto;display:grid;gap:8px"><button class="btn" data-act="resume">Continuar de onde parei</button><button class="btn alt" data-act="leaveyes2">Desistir (perde tudo)</button></div></div></div>'
  }
  S.q = function () { return perguntaHtml(false) }
  // Comemoração dos marcos antes do portão (10 e 20 acertos): fogos, aplauso e a escolha continuar/parar.
  S.marco = function () {
    var a = G.acertos, bloq = INFO && INFO.premioBloqueado, cash = INFO && INFO.premio && !bloq && G.marco > 0
    var prox = a < 20 ? '3% de cashback aos 20 acertos' : '5% de cashback aos 30 acertos'
    return '<div class="screen sea mkscr">' + scene() + '<canvas class="fw" id="qz-fw" aria-hidden="true"></canvas>' + bar() +
      '<div class="mkc"><div class="mkc-card"><span class="mkc-kick">Parabéns!</span><h2 class="mkc-t">' + a + ' acertos! 🎉</h2>' +
      (cash
        ? '<div class="mkc-pct"><b>' + G.marco + '%</b><span>de cashback garantido</span></div><p>Você já garantiu <b>' + G.marco + '% de cashback</b>. É provisório: vira valor em R$ quando você pagar a conta de hoje e vale para a sua próxima compra.</p>'
        : '<p>Muito bem! Você já fez <b>' + fmtN(G.pontos) + ' pontos</b>' + (INFO && INFO.premio && bloq ? '. Como você já ganhou um prêmio nos últimos 7 dias, esta rodada vale só para o ranking.' : ' no ranking da loja.') + '</p>') +
      (cash ? '<p>Continuar não faz você perder isso. Próximo prêmio: <b>' + prox + '</b>.</p>' : '') +
      '<div class="mkc-btns"><button class="btn" data-act="mkgo">Continuar jogando</button><button class="btn alt" data-act="mkstop">Parar por aqui</button></div></div></div></div>'
  }
  // Decisão dos 30+ acertos: parar e garantir ou arriscar. Tela de decisão importante: compara as duas saídas lado a lado.
  S.portao = function () {
    var a = G.acertos, bloq = INFO && INFO.premioBloqueado
    var cash = INFO && INFO.premio && !bloq && G.marco > 0
    var prox = a < 35 ? 35 : a < 40 ? 40 : 45
    var proxPct = prox === 35 ? 6 : prox === 40 ? 8 : 10
    var falta = prox - a
    var stopOpt = '<div class="dc-opt safe"><small>Se parar agora</small>' +
      (cash ? '<b>' + G.marco + '%</b><span>de cashback garantido</span>' : '<b>' + fmtN(G.pontos) + '</b><span>pontos no ranking</span>') +
      '<em>' + (cash ? fmtN(G.pontos) + ' pontos no ranking' : 'A rodada termina aqui') + '</em></div>'
    var goOpt = '<div class="dc-opt risk"><small>Se continuar</small>' +
      (cash ? '<b>' + proxPct + '%</b><span>aos ' + prox + ' acertos (faltam ' + falta + ')</span>' : '<b>' + falta + '</b><span>acertos para chegar aos ' + prox + '</span>') +
      '<em>' + (cash ? 'Um erro encerra a rodada e você perde o cashback' : 'Um erro encerra a rodada') + '</em></div>'
    return '<div class="screen sea">' + scene() + bar() + ladder() +
      '<div class="mkc"><div class="mkc-card dc"><span class="mkc-kick warn">Decisão importante</span><h2 class="mkc-t">' + a + ' acertos!</h2>' +
      '<div class="dc-opts">' + stopOpt + goOpt + '</div>' +
      (cash ? '<p>O cashback é provisório: vira valor em R$ quando você pagar a conta de hoje e vale para a sua próxima compra.</p>' : '<p>Como você já ganhou um prêmio nos últimos 7 dias, esta rodada vale só para o ranking.</p>') +
      '<div class="mkc-btns"><button class="btn" data-act="stop">' + (cash ? 'Parar e garantir ' + G.marco + '%' : 'Parar aqui') + '</button><button class="btn alt dc-go" data-act="go">' + (cash ? 'Arriscar por ' + proxPct + '%' : 'Continuar') + '</button></div></div></div></div>'
  }

  function rkRows(top) {
    var rows = ''
    top.forEach(function (r) { rows += '<div class="rkr' + (r.eu ? ' me' : '') + '"><span class="rp">' + r.pos + 'º</span><span class="rn">' + esc(r.apelido) + '<small>' + r.acertos + ' acertos</small></span><span class="rv">' + fmtN(r.pontos) + '</span></div>' })
    return rows
  }
  S.ranking = function () {
    var sem = RK.tab === 'sem', d = RK.data
    var meCard = !d ? '<div class="rk-me none"><small>Carregando…</small></div>'
      : d.eu ? '<div class="rk-me"><small>Sua posição ' + (sem ? 'na semana' : 'de sempre') + '</small><b>' + d.eu.pos + 'º</b><em>de ' + d.total + ' jogadores · melhor rodada ' + fmtN(d.eu.pontos) + ' pts</em></div>'
      : '<div class="rk-me none"><small>Você ainda não está no ranking</small><em>Jogue uma rodada para entrar. Vale a melhor de todas.</em></div>'
    var lista = d ? (d.top.length ? rkRows(d.top) : '<p class="fx-note" style="text-align:center">Ninguém jogou ainda. Seja o primeiro!</p>') : ''
    if (d && d.eu && d.eu.pos > 10) lista += '<div class="rk-dots">•••</div><div class="rkr me"><span class="rp">' + d.eu.pos + 'º</span><span class="rn">' + esc(d.eu.apelido) + '<small>Você · ' + d.eu.acertos + ' acertos</small></span><span class="rv">' + fmtN(d.eu.pontos) + '</span></div>'
    return '<div class="screen sea">' + scene() + bar() + '<div class="rkp"><div><h2 class="h2t" style="font-size:30px"><span>Ranking</span> <span class="g">da loja</span></h2><p class="sub2" style="margin-top:4px">' + esc((INFO && INFO.loja || '').trim()) + ' · melhor rodada de cada jogador</p></div>' +
      '<div class="rtabs" role="tablist"><button role="tab" class="' + (sem ? 'on' : '') + '" aria-selected="' + sem + '" data-act="rktab" data-t="sem">Semana</button><button role="tab" class="' + (sem ? '' : 'on') + '" aria-selected="' + (!sem) + '" data-act="rktab" data-t="sempre">Sempre</button></div>' +
      meCard + '<div class="rk">' + lista + '</div>' +
      '<p class="fx-note" style="text-align:center">' + (sem ? 'A semana recomeça na segunda-feira.' : 'Nunca zera.') + ' Só aparece o apelido de quem aceitou.</p>' +
      '<button class="go" data-act="start"><span>Jogar agora</span></button></div></div>'
  }

  function fin() {
    var ab = G.fim && G.fim.motivo === 'abandono', d = RK.data
    if (ab) {
      return '<div class="screen sea fin">' + scene() + bar() + '<div class="fx"><span class="fx-tag off">Você saiu da rodada</span>' +
        '<div class="fx-stats"><div class="plate"><small>Seus pontos</small><b>0</b><em>perdidos</em></div><div class="plate"><small>No ranking</small><b>—</b><em>rodada não conta</em></div></div>' +
        '<div class="fx-noprize"><b>Pontos perdidos</b><span>Sair no meio da rodada zera tudo.</span></div>' +
        '<div class="fx-note" style="text-align:center">Sua melhor rodada da semana continua valendo no ranking.</div>' +
        '<div class="fx-cta"><button class="btn" data-act="start">Jogar de novo</button><button class="btn alt" data-go="mesa">' + (MODO_LOJA ? 'Voltar aos jogos' : 'Voltar à mesa') + '</button></div></div></div>'
    }
    var pos = d && d.eu ? d.eu.pos : null, tot = d ? d.total : 0
    var porque = G.fim && G.fim.motivo === 'parou' ? 'Você parou na hora certa.' : (G.fim && G.fim.motivo === 'tempo' ? 'O tempo acabou.' : 'Você errou.')
    var top = d ? d.top.slice(0, 3) : []
    var rows = rkRows(top)
    if (d && d.eu && d.eu.pos > 3) rows += '<div class="rk-dots">•••</div><div class="rkr me"><span class="rp">' + d.eu.pos + 'º</span><span class="rn">' + esc(d.eu.apelido) + '<small>Você · ' + d.eu.acertos + ' acertos</small></span><span class="rv">' + fmtN(d.eu.pontos) + '</span></div>'
    return '<div class="screen sea fin">' + scene() + bar() + '<div class="fx"><span class="fx-tag off">Fim de jogo</span>' +
      '<div class="fx-stats"><div class="plate"><small>Seus pontos</small><b class="g">' + fmtN(G.pontos) + '</b><em>' + G.acertos + ' acertos</em></div><div class="plate"><small>Na semana</small><b>' + (pos ? pos + 'º' : '…') + '</b><em>' + (tot ? 'de ' + tot + ' jogadores' : 'calculando') + '</em></div></div>' +
      (INFO && INFO.premio && G.marco > 0 && !(d && d.premioBloqueado)
        ? '<div class="fx-noprize" style="border-color:var(--ap-gold)"><b>🎁 Você garantiu ' + G.marco + '% de cashback</b><span>Ainda é provisório: vira valor em R$ quando você pagar a conta de hoje e leva para a próxima compra. Vale a sua melhor rodada.</span></div>'
        : INFO && INFO.premio && G.marco > 0 && d && d.premioBloqueado
          ? '<div class="fx-noprize"><b>' + porque + '</b><span>Você já ganhou um prêmio nos últimos 7 dias, então esta rodada vale só para o ranking.</span></div>'
          : '<div class="fx-noprize"><b>' + porque + '</b><span>' + (INFO && INFO.premio ? 'Faça 10 acertos para garantir cashback. ' : '') + 'Vale a melhor rodada da semana no ranking da loja.</span></div>') +
      '<div class="rk"><div class="rkt">Ranking da loja · esta semana</div>' + rows + '<button class="rklink" data-go="ranking">Ver ranking completo ›</button></div>' +
      '<div class="fx-cta"><button class="btn" data-act="start">Jogar de novo</button><button class="btn alt" data-go="mesa">' + (MODO_LOJA ? 'Voltar aos jogos' : 'Voltar à mesa') + '</button></div></div></div>'
  }
  S.fim = fin

  // ======== render ========
  function sheet(html) { return '<div class="ovl"><div class="sheet tall">' + html + '</div></div>' }
  function render() {
    if (DESTROYED) return
    stopT()
    if (cur !== 'marco') stopFogos()
    if (cur !== 'contagem' && CT.t) { clearInterval(CT.t); CT.t = null }
    if (cur !== 'intro') ZONES = false
    var html = (S[cur] || S.load)()
    if (LEAVE && emJogo()) {
      html = html.slice(0, html.lastIndexOf('</div>')) + '<div class="ovl"><div class="sheet"><h3>Sair do jogo?</h3><p>Se você sair agora, <b>perde tudo</b>: os pontos desta rodada. Na próxima, começa do zero.</p><button class="btn" data-act="leaveno">Continuar jogando</button><button class="btn alt" style="color:#151210" data-act="leaveyes">Sair e perder tudo</button></div></div></div>'
    }
    if (ZONES && cur === 'intro') {
      var rr = [[IC_CLOCK, '10 segundos', 'para responder cada pergunta'], [IC_HEART, '3 chances', 'de errar até os 30 acertos'], [IC_SKIP, '3 pulos', 'para trocar a pergunta'], [IC_BULB, '2 × Pensar', 'dá 20 segundos na pergunta']].map(function (r) { return '<div class="rrow"><span class="ri">' + r[0] + '</span><div><b>' + r[1] + '</b> ' + r[2] + '</div></div>' }).join('')
      var zv = sheet('<h3>Como funciona</h3><div class="zcard ok"><span class="zi">' + IC_SHIELD + '</span><div><b>5 níveis de dificuldade</b><p>Começa muito fácil e vai ficando difícil: fácil, intermediário, difícil e impossível. Quanto mais acertos, mais pontos no ranking.</p></div></div>' +
        '<div class="zcard rk"><span class="zi">' + IC_FLAME + '</span><div><b>Depois de 30 acertos</b><p>Cada erro encerra a rodada. Antes disso você pode errar 3 vezes e continuar.</p></div></div>' +
        '<div class="hw-t">Regras</div><div class="rrows">' + rr + '</div><p class="note" style="color:#4a4742">Sair no meio da rodada perde os pontos dela. O ranking guarda a sua melhor rodada.</p><button class="btn" data-act="zonesclose">Entendi</button>')
      html = html.slice(0, html.lastIndexOf('</div>')) + zv + '</div>'
    }
    view.innerHTML = html + '<div class="qz-toast" id="qz-toast" role="status"></div>'
    if (cur === 'q' && G && G.q && !G.res && !G.busy) startTimer()
    if (cur === 'marco') iniciarFogos()
  }

  // ======== relógio da pergunta (quem manda é o servidor; aqui só mostra e avisa) ========
  function startTimer() {
    stopT()
    T = setInterval(function () {
      if (!G || !G.q || G.resp !== null || G.res || G.busy) { stopT(); return }
      var left = G.q.dur - (Date.now() - G.q.ini), ring = $('#ring'), sec = $('#sec')
      if (ring) { var C = 2 * Math.PI * 36; ring.setAttribute('stroke-dashoffset', (C * (1 - Math.max(0, left) / G.q.dur)).toFixed(1)); ring.setAttribute('stroke', left < 2000 ? '#FF7A6B' : '#FFC531') }
      if (sec) sec.textContent = Math.ceil(Math.max(0, left) / 1000)
      if (left <= 0) { stopT(); enviarTempo() }
    }, 100)
  }
  function enviarTempo(tentativa) {
    if (!G || !G.q || G.busy) return
    G.busy = true
    api('tempo', { itemId: G.q.id }).then(function (j) { G.resp = -1; aplicaResultado(j) }).catch(function (e) {
      G.busy = false
      if (e.status === 409 && /Ainda há tempo/.test(e.message) && (tentativa || 0) < 6) { setTimeout(function () { enviarTempo((tentativa || 0) + 1) }, 350); return }
      fail(e)
    })
  }

  // ======== fluxo do jogo ========
  function sync(r) {
    if (!r) return
    G.acertos = r.acertos; G.pontos = r.pontos; G.erros = r.erros; G.estado = r.estado; G.pulos = r.pulos; G.pensar = r.pensar; G.marco = r.marco
    G.fimJogo = r.estado === 'encerrada'
  }
  function novoG(r) { G = { live: true, res: null, resp: null, pensando: false, fim: null, q: null, nivel: 1, busy: false, acertos: 0, pontos: 0, erros: 0, pulos: 3, pensar: 2, estado: 'jogando' }; sync(r) }
  function setItem(it) {
    var dur = it.pensando ? 20000 : 10000
    G.q = { id: it.itemId, txt: it.enunciado, ops: it.opcoes.map(function (t) { return { t: t, ok: false } }), dur: dur, ini: Date.now() - (dur - it.restanteMs) }
    G.resp = null; G.res = null; G.pensando = !!it.pensando; G.nivel = it.nivel; G.busy = false
  }
  function comecar() {
    ac()
    api('iniciar', { tema: TEMA || null }).then(function (j) {
      novoG(j.rodada)
      if (j.retomada && j.item) { setItem(j.item); cur = 'q'; render(); return }
      if (j.retomada && j.rodada.estado === 'portao') { return decidirAuto() }
      contagem()
    }).catch(fail)
  }
  function contagem() {
    CT.n = 3; cur = 'contagem'; render()
    CT.t = setInterval(function () {
      CT.n--
      if (CT.n < 0) { clearInterval(CT.t); CT.t = null; proxima(); return }
      render()
    }, 900)
  }
  function proxima() {
    api('pergunta').then(function (j) {
      if (j.vencida) { sync(j.vencida.rodada); if (j.vencida.fim) { G.fim = { motivo: 'tempo' }; terminar() } else proxima(); return }
      sync(j.rodada)
      if (j.decisao) { decidirAuto(); return }
      setItem(j.item); cur = 'q'; render()
    }).catch(fail)
  }
  // Sem prêmio, a decisão "parar ou continuar" não faz sentido: segue sempre em frente.
  function decidirAuto() {
    if (INFO && INFO.premio) { cur = 'portao'; render(); return }
    api('decidir', { parar: false }).then(function (j) { sync(j.rodada); proxima() }).catch(fail)
  }
  function aplicaResultado(j) {
    var estavaSegura = G.acertos < 30 && G.estado !== 'risco'
    G.busy = false; sync(j.rodada)
    if (j.certaPos != null) G.q.ops.forEach(function (o, k) { o.ok = (k === j.certaPos) })
    if (j.acertou) { G.res = { ok: true, pts: j.pontos }; sndCash(G.acertos % 5 === 0) }
    else {
      G.res = { ok: false, motivo: j.motivo, certa: j.certaTexto, left: 3 - G.erros, fim: !!j.fim }
      if (G.resp === null) G.resp = -1
      if (j.fim) G.fim = { motivo: j.motivo, semChances: estavaSegura }
      sndErr()
    }
    render()
    var item = G.q
    setTimeout(function () {
      if (DESTROYED || G.q !== item || cur !== 'q') return
      G.res = null
      if (G.fimJogo) { terminar(); return }
      if (G.estado === 'portao') { decidirAuto(); return }
      // 10 e 20 acertos (ainda na fase segura): comemora e deixa escolher continuar ou parar.
      if (j.acertou && INFO && INFO.premio && G.estado === 'jogando' && (G.acertos === 10 || G.acertos === 20)) { cur = 'marco'; render(); sndMarco(); return }
      proxima()
    }, j.acertou ? 1300 : 1800)
  }
  function terminar() {
    cur = 'fim'; render()
    if (G.fim && G.fim.motivo !== 'abandono') sndWin()
    carregarRanking('sem')
  }
  function carregarRanking(aba, depois) {
    RK.tab = aba
    api('ranking', { aba: aba }).then(function (j) { RK.data = j; if (cur === 'ranking' || cur === 'fim') render(); if (depois) depois() }).catch(function () {})
  }

  // ======== cliques ========
  function onClick(e) {
    var t = e.target.closest('[data-go],[data-act]'); if (!t || !view.contains(t)) return
    if (t.dataset.go) {
      var k = t.dataset.go
      if (k === 'mesa') { location.href = HOME; return }
      if (k === 'grupo') { location.href = '/mesa/' + TOKEN + '/grupo'; return }
      cur = k; if (k === 'ranking') { RK.data = null; render(); carregarRanking('sem') } else render()
      return
    }
    var a = t.dataset.act
    if (a === 'tema') { TEMA = t.dataset.v || ''; try { localStorage.setItem('quiztema', TEMA) } catch (x) {} render(); return }
    if (a === 'snd') { SND = !SND; if (SND) ac(); render(); return }
    if (a === 'zones') { ZONES = true; render(); return }
    if (a === 'zonesclose') { ZONES = false; render(); return }
    if (a === 'leave') { LEAVE = true; render(); return }
    if (a === 'leaveno') { LEAVE = false; render(); return }
    if (a === 'leaveyes' || a === 'leaveyes2') {
      LEAVE = false; stopT()
      api('sair').then(function () { if (!G) novoG({ acertos: 0, pontos: 0, erros: 0, estado: 'encerrada', pulos: 3, pensar: 2, marco: 0 }); G.fim = { motivo: 'abandono' }; G.fimJogo = true; cur = 'fim'; render() }).catch(fail)
      return
    }
    if (a === 'start') {
      ac()
      if (!INFO.jogador) { location.href = IDENT_URL; return }
      comecar(); return
    }
    if (a === 'resume') { comecar(); return }
    if (a === 'regsend') {
      var ap = (REG.apelido || '').trim()
      if (!INFO.jogador) {
        if (ap.length < 3 || ap.length > 16) { REG.err = 'O apelido precisa ter de 3 a 16 caracteres.'; render(); return }
      }
      if ((REG.tel || '').replace(/\D/g, '').length < 10) { REG.err = 'Confira o WhatsApp: DDD mais o número.'; render(); return }
      if (!REG.idade) { REG.err = 'O quiz é para maiores de 18 anos.'; render(); return }
      if (!REG.aceite) { REG.err = 'Para jogar, aceite aparecer no ranking com o seu apelido.'; render(); return }
      REG.err = ''; REG.busy = true; render()
      api('cadastro_enviar', { apelido: ap, telefone: REG.tel, idade: true, aceite: true }).then(function (j) {
        REG.busy = false; if (j.jaCadastrado) REG.apelido = j.jaCadastrado; REG.cod = ''; cur = 'codigo'; render()
      }).catch(function (e) { REG.busy = false; REG.err = e.message; render() })
      return
    }
    if (a === 'regok') {
      var cod = (REG.cod || '').replace(/\D/g, '')
      if (cod.length !== 6) { REG.err = 'Digite os 6 números do código.'; render(); return }
      REG.err = ''; REG.busy = true; render()
      api('cadastro_verificar', { telefone: REG.tel, codigo: cod, apelido: REG.apelido }).then(function (j) {
        REG.busy = false; JT = j.jt; try { localStorage.setItem(LS, JT) } catch (x) {}
        INFO.jogador = { apelido: j.apelido }; comecar()
      }).catch(function (e) { REG.busy = false; REG.err = e.message; render() })
      return
    }
    if (a === 'rktab') { RK.tab = t.dataset.t; RK.data = null; render(); carregarRanking(RK.tab); return }
    if (a === 'ans') {
      if (!G || G.resp !== null || G.busy || G.res) return
      stopT(); G.busy = true; G.resp = +t.dataset.i; render()
      api('responder', { itemId: G.q.id, pos: G.resp }).then(aplicaResultado).catch(fail)
      return
    }
    if (a === 'skip') {
      if (!G || G.busy || G.res || G.pulos <= 0) return
      stopT(); G.busy = true
      api('pular', { itemId: G.q.id }).then(function (j) { G.busy = false; sync(j.rodada); proxima() }).catch(fail)
      return
    }
    if (a === 'think') {
      if (!G || G.busy || G.res || G.pensar <= 0 || G.pensando) return
      G.busy = true
      api('pensar', { itemId: G.q.id }).then(function (j) { G.busy = false; sync(j.rodada); G.pensando = true; G.q.dur = 20000; G.q.ini = Date.now() - (20000 - j.restanteMs); render() }).catch(fail)
      return
    }
    if (a === 'mkgo') { stopFogos(); proxima(); return }
    if (a === 'mkstop') {
      stopFogos()
      api('parar').then(function (j) { sync(j.rodada); G.fim = { motivo: 'parou' }; terminar() }).catch(fail)
      return
    }
    if (a === 'stop' || a === 'go') {
      api('decidir', { parar: a === 'stop' }).then(function (j) { sync(j.rodada); if (j.fim) { G.fim = { motivo: 'parou' }; terminar() } else proxima() }).catch(fail)
      return
    }
  }
  function onInput(e) {
    var t = e.target
    if (t.id === 'rg-ap') REG.apelido = t.value
    if (t.id === 'rg-tel') REG.tel = t.value
    if (t.id === 'rg-cod') REG.cod = t.value
  }
  function onChange(e) { var t = e.target; if (t.id === 'rg-18') REG.idade = t.checked; if (t.id === 'rg-ok') REG.aceite = t.checked }
  view.addEventListener('click', onClick)
  view.addEventListener('input', onInput)
  view.addEventListener('change', onChange)

  // ======== início ========
  render()
  api('estado').then(function (j) {
    INFO = j
    if (!j.ativo) { cur = 'off'; render(); return }
    cur = j.jogador && j.retomar ? 'queda' : 'intro'; render()
  }).catch(function () { INFO = { ativo: false }; cur = 'off'; render() })

  return function () { DESTROYED = true; stopT(); stopFogos(); if (CT.t) clearInterval(CT.t); view.removeEventListener('click', onClick); view.removeEventListener('input', onInput); view.removeEventListener('change', onChange) }
}
