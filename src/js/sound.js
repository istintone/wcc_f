/* =========================================================================
   wcc_f — 音(→docs/07 §7.5)。**音声ファイルを持たず、Web Audio でその場で合成する**
   (単一ファイル・オフラインのまま)。スマホは最初のタップまで鳴らせないので、タイトルで unlock する。
   ========================================================================= */

const SND={ ctx:null, master:null, crowd:null, crowdGain:null, on:true, crowdLv:0, noise:null };
const SND_KEY="wcc_f.sound";
try{ SND.on=localStorage.getItem(SND_KEY)!=="off"; }catch(e){}

/** 最初のタップで呼ぶ。以降、音が鳴らせるようになる */
function sndUnlock(){
  if(SND.ctx){ if(SND.ctx.state!=="running"&&!SND.hidden)SND.ctx.resume().catch(()=>{}); return; }
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
/** 裏に回ったら止める(電池と、iPhone の割り込みのあとに戻すため) */
function sndSuspend(hidden){
  SND.hidden=hidden;
  if(!SND.ctx)return;
  try{ if(hidden)SND.ctx.suspend().catch(()=>{}); else if(SND.ctx.state!=="running")SND.ctx.resume().catch(()=>{}); }catch(e){}
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

/* =========================================================================
   BGM(→docs/14 第4弾。本家はどこでも BGM が流れていた)。音声ファイルは持たず、その場で合成する独自の曲。
     club  … 監督室・タイトル・結果。ゆったりした4和音の循環にパッド・ベース・アルペジオ・軽いドラム
     match … 試合中。軽快な8分のベースと四つ打ち。歓声の下で小さく鳴らす
   先読みで 8分音符ずつ予約する(setInterval で 120ms 先まで)。効果音とは別に、設定で切れる
   ========================================================================= */
const BGM={ on:true, cur:null, gain:null, timer:null, step:0, next:0 };
const BGM_KEY="wcc_f.bgm";
try{ BGM.on=localStorage.getItem(BGM_KEY)!=="off"; }catch(e){}
const mtof=n=>440*Math.pow(2,(n-69)/12);
/** 曲。prog は小節ごとの和音(MIDI の音の高さ)、bass は小節ごとの根音 */
const BGM_TRACKS={
  // アップテンポのスポーツゲーム風(→docs/14 §14.15)。16分のシェイカー・8分のハイハット・2拍4拍のスネア・裏拍の和音のスタブ
  club:{ bpm:116, vol:0.10, prog:[[60,64,67,71],[57,60,64,67],[53,57,60,64],[55,59,62,65]], bass:[36,33,29,31],
    arp:[0,2,1,3,2,1,3,2], kick:[0,3,4], hat:[0,1,2,3,4,5,6,7], snare:[2,6], bassPat:[0,2,3,4,6,7], oct:[3,7], stab:[1,3,5,7], shaker:true },
  match:{ bpm:138, vol:0.075, prog:[[62,65,69,72],[58,62,65,69],[53,57,60,64],[60,64,67,70]], bass:[38,34,41,36],
    arp:[0,1,2,3,2,1,0,2], kick:[0,2,4,6], hat:[0,1,2,3,4,5,6,7], snare:[2,6], bassPat:[0,1,2,3,4,5,6,7], oct:[1,3,5,7], stab:[1,4,7], shaker:true }
};
function bgmVoice(type,freq,t,dur,peak,cut){
  const o=SND.ctx.createOscillator(), g=SND.ctx.createGain(), f=SND.ctx.createBiquadFilter();
  o.type=type; o.frequency.setValueAtTime(freq,t);
  f.type="lowpass"; f.frequency.value=cut||2000;
  env(g,t,Math.min(0.06,dur*0.2),peak,dur*0.35,dur*0.6);
  o.connect(f); f.connect(g); g.connect(BGM.gain); o.start(t); o.stop(t+dur+0.1);
}
function bgmNoise(t,dur,peak,filt,f0){
  const s=SND.ctx.createBufferSource(), f=SND.ctx.createBiquadFilter(), g=SND.ctx.createGain();
  s.buffer=SND.noise; f.type=filt; f.frequency.value=f0;
  env(g,t,0.003,peak,0.005,dur);
  s.connect(f); f.connect(g); g.connect(BGM.gain); s.start(t,Math.random()); s.stop(t+dur+0.05);
}
function bgmKick(t,peak){
  const o=SND.ctx.createOscillator(), g=SND.ctx.createGain();
  o.frequency.setValueAtTime(120,t); o.frequency.exponentialRampToValueAtTime(42,t+0.12);
  env(g,t,0.004,peak,0.02,0.14); o.connect(g); g.connect(BGM.gain); o.start(t); o.stop(t+0.25);
}
/** 8分音符1つぶんを予約する */
function bgmStep(T,i,t){
  const e=60/T.bpm/2, pos=i%8, bar=Math.floor(i/8)%T.prog.length, ch=T.prog[bar];
  if(pos===0)ch.forEach(n=>{ bgmVoice("triangle",mtof(n),t,e*7.6,0.03,1600); bgmVoice("sawtooth",mtof(n)*1.004,t,e*7.6,0.008,1100); });   // パッド(薄く)
  if(T.stab&&T.stab.includes(pos))ch.forEach(n=>bgmVoice("square",mtof(n+12),t,e*0.35,0.012,3200));                                // 裏拍の和音のスタブ
  if(T.bassPat.includes(pos))bgmVoice("sawtooth",mtof(T.bass[bar]+(T.oct&&T.oct.includes(pos)?12:0)),t,e*0.8,0.09,700);          // ベース(オクターブ跳び)
  bgmVoice("triangle",mtof(ch[T.arp[pos]]+24),t,e*0.6,0.022,4200);                                                            // アルペジオ
  if(T.kick.includes(pos))bgmKick(t,0.26);
  if(T.hat.includes(pos))bgmNoise(t,0.035,pos%2?0.03:0.045,"highpass",8000);                                                 // ハイハット
  if(T.shaker){ bgmNoise(t+e/2,0.03,0.022,"bandpass",9000); if(pos%2)bgmNoise(t+e/4,0.02,0.012,"bandpass",10000); }          // 16分のシェイカー
  if(T.snare.includes(pos)){ bgmNoise(t,0.14,0.08,"bandpass",1900); bgmNoise(t+0.012,0.08,0.04,"highpass",5000); }          // スネア + クラップ
}
/** 曲を鳴らす(同じ曲なら何もしない)。音が出せない・切ってあるときは何もしない */
function bgmPlay(name){
  if(BGM.cur===name&&BGM.timer)return;
  bgmStop();
  BGM.cur=name;
  if(!SND.ctx||!BGM.on||!BGM_TRACKS[name])return;
  const T=BGM_TRACKS[name];
  BGM.gain=SND.ctx.createGain(); BGM.gain.gain.setValueAtTime(0.0001,now()); BGM.gain.gain.exponentialRampToValueAtTime(T.vol,now()+1.2);
  BGM.gain.connect(SND.master);
  BGM.step=0; BGM.next=now()+0.1;
  BGM.timer=setInterval(()=>{
    if(!SND.ctx||SND.ctx.state!=="running")return;
    while(BGM.next<now()+0.12){ bgmStep(T,BGM.step,BGM.next); BGM.step++; BGM.next+=60/T.bpm/2; }
    if(BGM.next<now()-0.5)BGM.next=now()+0.05;      // 裏から戻ったときに溜まった分は飛ばす
  },40);
}
function bgmStop(){
  clearInterval(BGM.timer); BGM.timer=null;
  if(BGM.gain&&SND.ctx){ const g=BGM.gain; try{ g.gain.cancelScheduledValues(now()); g.gain.setValueAtTime(g.gain.value||0.0001,now()); g.gain.exponentialRampToValueAtTime(0.0001,now()+0.6); }catch(e){} setTimeout(()=>{ try{ g.disconnect(); }catch(e){} },800); }
  BGM.gain=null;
}
function bgmSetOn(v){
  BGM.on=v;
  try{ localStorage.setItem(BGM_KEY,v?"on":"off"); }catch(e){}
  const c=BGM.cur; if(v&&c){ BGM.cur=null; bgmPlay(c); } else bgmStop();
}
