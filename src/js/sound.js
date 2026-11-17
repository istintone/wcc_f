/* =========================================================================
   wcc_f — 音(→docs/07 §7.5)。**音声ファイルを持たず、Web Audio でその場で合成する**
   (単一ファイル・オフラインのまま)。スマホは最初のタップまで鳴らせないので、タイトルで unlock する。
   ========================================================================= */

const SND={ ctx:null, master:null, crowd:null, crowdGain:null, on:true, crowdLv:0, noise:null };
const SND_KEY="wcc_f.sound";
try{ SND.on=localStorage.getItem(SND_KEY)!=="off"; }catch(e){}

/** 最初のタップで呼ぶ。以降、音が鳴らせるようになる */
function sndUnlock(){
  if(SND.ctx){ if(SND.ctx.state==="suspended")SND.ctx.resume(); return; }
  const AC=window.AudioContext||window.webkitAudioContext;
  if(!AC)return;
  SND.ctx=new AC();
  SND.master=SND.ctx.createGain(); SND.master.gain.value=SND.on?0.9:0;
  SND.master.connect(SND.ctx.destination);
  // 2秒ぶんの雑音(歓声・笛の息・めくる音の素)
  const n=SND.ctx.sampleRate*2, buf=SND.ctx.createBuffer(1,n,SND.ctx.sampleRate), d=buf.getChannelData(0);
  let b0=0,b1=0,b2=0;
  for(let i=0;i<n;i++){                       // ピンクノイズ寄り(耳に痛くない)
    const w=Math.random()*2-1;
    b0=0.997*b0+w*0.029; b1=0.985*b1+w*0.032; b2=0.95*b2+w*0.048;
    d[i]=(b0+b1+b2+w*0.02)*0.9;
  }
  SND.noise=buf;
}
function sndSetOn(v){
  SND.on=v;
  try{ localStorage.setItem(SND_KEY,v?"on":"off"); }catch(e){}
  if(SND.master)SND.master.gain.value=v?0.9:0;
}
const sndOk=()=>SND.ctx&&SND.on;
const now=()=>SND.ctx.currentTime;

function env(g,t,a,peak,hold,rel){
  g.gain.setValueAtTime(0.0001,t);
  g.gain.exponentialRampToValueAtTime(peak,t+a);
  g.gain.setValueAtTime(peak,t+a+hold);
  g.gain.exponentialRampToValueAtTime(0.0001,t+a+hold+rel);
}
function tone(type,freq,t,dur,peak,to){
  const o=SND.ctx.createOscillator(), g=SND.ctx.createGain();
  o.type=type; o.frequency.setValueAtTime(freq,t);
  if(to)o.frequency.exponentialRampToValueAtTime(to,t+dur);
  env(g,t,0.008,peak,dur*0.4,dur*0.6);
  o.connect(g); g.connect(SND.master); o.start(t); o.stop(t+dur+0.05);
}
function noiseBurst(t,dur,peak,filt,f0,f1,q){
  const s=SND.ctx.createBufferSource(), f=SND.ctx.createBiquadFilter(), g=SND.ctx.createGain();
  s.buffer=SND.noise; s.loop=true;
  f.type=filt; f.Q.value=q||0.8; f.frequency.setValueAtTime(f0,t);
  if(f1)f.frequency.exponentialRampToValueAtTime(f1,t+dur);
  env(g,t,Math.min(0.3,dur*0.25),peak,dur*0.3,dur*0.45);
  s.connect(f); f.connect(g); g.connect(SND.master);
  s.start(t,Math.random()); s.stop(t+dur+0.1);
}

/** 笛。n 回(試合開始 1 / 前半終了 2 / 試合終了 3)。long で長く */
function sndWhistle(n,long){
  if(!sndOk())return;
  let t=now()+0.02;
  for(let i=0;i<(n||1);i++){
    const dur=long||i===n-1?0.55:0.22;
    for(const f of [2950,3120]){
      const o=SND.ctx.createOscillator(), g=SND.ctx.createGain(), lfo=SND.ctx.createOscillator(), lg=SND.ctx.createGain();
      o.type="sine"; o.frequency.value=f;
      lfo.frequency.value=28; lg.gain.value=60; lfo.connect(lg); lg.connect(o.frequency);   // 笛の玉が震える
      env(g,t,0.015,0.10,dur,0.06);
      o.connect(g); g.connect(SND.master); o.start(t); lfo.start(t); o.stop(t+dur+0.1); lfo.stop(t+dur+0.1);
    }
    noiseBurst(t,dur,0.05,"bandpass",3000,null,4);                                          // 息
    t+=dur+0.12;
  }
}
/** ボタン。kind: tap(軽い)/ ok(決定)/ ng(取り消し) */
function sndUi(kind){
  if(!sndOk())return;
  const t=now();
  if(kind==="ok"){ tone("triangle",880,t,0.08,0.18); tone("triangle",1320,t+0.07,0.12,0.18); }
  else if(kind==="ng")tone("square",300,t,0.12,0.06,180);
  else tone("square",1400,t,0.035,0.05);
}
/** 歓声の地の音。lv 0〜1 で大きさ(攻め込むと上がる) */
function sndCrowd(on){
  if(!SND.ctx)return;
  if(on&&!SND.crowd){
    const s=SND.ctx.createBufferSource(), f=SND.ctx.createBiquadFilter(), g=SND.ctx.createGain();
    s.buffer=SND.noise; s.loop=true; f.type="bandpass"; f.frequency.value=700; f.Q.value=0.5;
    g.gain.value=0.0001; g.gain.exponentialRampToValueAtTime(0.06,now()+1.2);
    s.connect(f); f.connect(g); g.connect(SND.master); s.start();
    SND.crowd=s; SND.crowdGain=g; SND.crowdLv=0;
  }else if(!on&&SND.crowd){
    const s=SND.crowd, g=SND.crowdGain;
    g.gain.cancelScheduledValues(now()); g.gain.setTargetAtTime(0.0001,now(),0.4);
    setTimeout(()=>{ try{ s.stop(); }catch(e){} },1500);
    SND.crowd=null; SND.crowdGain=null;
  }
}
function sndCrowdLevel(lv){
  if(!SND.crowdGain)return;
  lv=Math.max(0,Math.min(1,lv));
  if(Math.abs(lv-SND.crowdLv)<0.05)return;
  SND.crowdLv=lv;
  SND.crowdGain.gain.setTargetAtTime(0.05+lv*0.09,now(),0.5);
}
/** ゴールの歓声(どっと沸いて、長く残る) */
function sndGoal(mine){
  if(!sndOk())return;
  const t=now();
  noiseBurst(t,2.8,mine?0.55:0.35,"bandpass",450,1300,0.6);
  noiseBurst(t+0.05,2.2,mine?0.3:0.2,"highpass",1800,3000,0.5);
  if(mine){ [523,659,784,1047].forEach((f,i)=>tone("triangle",f,t+0.15+i*0.09,0.28,0.12)); }
}
/** 惜しい(枠外・セーブ)。ため息 */
function sndAww(){
  if(!sndOk())return;
  noiseBurst(now(),1.1,0.18,"lowpass",1400,400,0.7);
}
/** ボールを蹴る音(シュート) */
function sndKick(){
  if(!sndOk())return;
  const t=now();
  tone("sine",150,t,0.09,0.35,55);
  noiseBurst(t,0.06,0.12,"highpass",2500,null,0.7);
}
/** カードをめくる */
function sndFlip(){
  if(!sndOk())return;
  noiseBurst(now(),0.25,0.22,"highpass",900,5000,0.8);
}
/** キラキラ(キラ・レジェンドのカード、覚醒) */
function sndShimmer(big){
  if(!sndOk())return;
  const t=now(), base=big?[1568,1976,2349,2637,3136,3951]:[1318,1760,2093,2637];
  base.forEach((f,i)=>tone("sine",f,t+i*0.07,0.5,big?0.09:0.07));
}
/** ファンファーレ(勝利・レジェンド・称号) */
function sndFanfare(){
  if(!sndOk())return;
  const t=now();
  [[523,0],[659,0.12],[784,0.24],[1047,0.36]].forEach(([f,d])=>tone("triangle",f,t+d,0.22,0.16));
  [523,659,784,1047].forEach(f=>tone("sawtooth",f,t+0.5,0.9,0.045));
}
/** 負けの音(低く沈む) */
function sndLose(){
  if(!sndOk())return;
  const t=now();
  [[392,0],[349,0.22],[294,0.44]].forEach(([f,d])=>tone("triangle",f,t+d,0.35,0.12));
}
