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
  // ロック(→docs/14 §14.15)。歪ませたエレキギターのパワーコード(頭は伸ばし、あとは8分のブリッジミュート)・リードのリフ・ベース・ロックのドラム
  //   root … 小節ごとのパワーコードの根音 / mute … ミュートで刻む8分の位置 / acc … 強く弾く位置 / lead … リードのリフ(根音からの半音)。null は休み
  club:{ bpm:128, vol:0.09, root:[40,36,38,35], mute:[1,2,3,5,6,7], acc:[0,3,6],
    kick:[0,3,4,6], snare:[2,6], lead:[12,null,15,17,null,19,17,15] },
  match:{ bpm:150, vol:0.07, root:[38,34,36,33], mute:[1,2,3,4,5,6,7], acc:[0,3,6],
    kick:[0,2,4,6], snare:[2,6], lead:[12,15,17,null,19,null,17,19] }
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
/** 歪ませたギター(のこぎり波2本を少しずらし、波形の歪み → ローパスの順。音の出口は BGM.gtr) */
function bgmGuitar(freq,t,dur,peak,cut){
  [1,1.006].forEach(dt=>{ const o=SND.ctx.createOscillator(), g=SND.ctx.createGain(), f=SND.ctx.createBiquadFilter();
    o.type="sawtooth"; o.frequency.setValueAtTime(freq*dt,t); f.type="lowpass"; f.frequency.value=cut||2600;
    env(g,t,0.004,peak,dur*0.5,dur*0.5); o.connect(f); f.connect(g); g.connect(BGM.gtr); o.start(t); o.stop(t+dur+0.1); });
}
/** パワーコード(根音・5度・オクターブ) */
function bgmPower(root,t,dur,peak,cut){ [0,7,12].forEach(n=>bgmGuitar(mtof(root+n),t,dur,peak,cut)); }
/** 8分音符1つぶんを予約する */
function bgmStep(T,i,t){
  const e=60/T.bpm/2, pos=i%8, barN=Math.floor(i/8), bar=barN%T.root.length, r=T.root[bar]+12;
  if(pos===0)bgmPower(r,t,e*1.8,0.06,3400);                                                        // 頭は伸ばす
  else if(T.mute.includes(pos))bgmPower(r,t,e*0.45,T.acc.includes(pos)?0.05:0.032,1300);        // ブリッジミュートの刻み
  bgmVoice("sawtooth",mtof(T.bass?T.bass[bar]:T.root[bar]),t,e*0.85,0.1,500);                     // ベース
  if(barN%2===1&&T.lead[pos]!=null)bgmGuitar(mtof(T.root[bar]+24+T.lead[pos]),t,e*0.9,0.03,4200);   // リードのリフ(2小節に1回)
  if(T.kick.includes(pos))bgmKick(t,0.3);
  if(T.snare.includes(pos)){ bgmNoise(t,0.16,0.1,"bandpass",1800); bgmNoise(t,0.09,0.05,"highpass",4500); }
  bgmNoise(t,0.03,pos%2?0.025:0.04,"highpass",8500); bgmNoise(t+e/2,0.025,0.018,"highpass",9500);   // ハイハット(16分)
  if(pos===0&&barN%4===0)bgmNoise(t,1.1,0.06,"highpass",5500);                                    // クラッシュ(4小節ごと)
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
  // ギターの歪み: 入力を強めて波形を丸く潰す → 箱鳴りの山(ピーキング)→ 高すぎる成分を落とす
  const pre=SND.ctx.createGain(), ws=SND.ctx.createWaveShaper(), pk=SND.ctx.createBiquadFilter(), lp=SND.ctx.createBiquadFilter();
  pre.gain.value=6; const n=1024, cv=new Float32Array(n); for(let k=0;k<n;k++){ const x=k/(n-1)*2-1; cv[k]=Math.tanh(x*3); } ws.curve=cv; ws.oversample="2x";
  pk.type="peaking"; pk.frequency.value=900; pk.gain.value=4; lp.type="lowpass"; lp.frequency.value=4800;
  pre.connect(ws); ws.connect(pk); pk.connect(lp); lp.connect(BGM.gain); BGM.gtr=pre;
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
