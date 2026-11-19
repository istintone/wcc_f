/* =========================================================================
   wcc_f — 場面(→docs/07 §7.2)。全画面の場面を順に進む。
     タイトル → (監督室) → 対戦カード → 試合 → 結果 → ロッカールーム(優勝なら撮影) → カード排出 → 監督室
   場面は #scene に描く。進むときは帯が横切る。押せば必ず音が返る。
   ========================================================================= */

const SC={ el:null, timer:0, next:null, busy:false };

function sceneInit(){
  SC.el=document.getElementById("scene");
  SC.el.addEventListener("click",e=>{
    const b=e.target.closest("[data-sc]");
    if(b){ e.stopPropagation(); sceneAct(b.dataset.sc,b); return; }
    if(SC.next&&!SC.busy){ sndUi("tap"); const f=SC.next; SC.next=null; clearTimeout(SC.timer); f(); }
  });
}
/** 場面を出す。tapNext=画面のどこを押しても次へ / auto=自動で次へ(ミリ秒) */
function sceneShow(cls,html,opt){
  opt=opt||{};
  clearTimeout(SC.timer);
  SC.el.className="on "+cls;
  SC.el.innerHTML='<div class="wipe"></div><div class="dots"></div><div class="slab s1"></div><div class="slab s2"></div>'+html;
  SC.next=opt.next||null;
  SC.busy=!!opt.lock;
  // 押しても進まない間は TOUCH を薄く(→docs/14)
  if(opt.lock){ SC.el.classList.add("lk"); setTimeout(()=>{ SC.busy=false; SC.el.classList.remove("lk"); },opt.lock); }
  if(opt.auto&&opt.next)SC.timer=setTimeout(()=>{ if(SC.next){ const f=SC.next; SC.next=null; f(); } },opt.auto);
}
function sceneHide(){ clearTimeout(SC.timer); SC.next=null; SC.el.className=""; SC.el.innerHTML=""; }

/* ---- エンブレム(クラブの色と略称から描く盾。独自の意匠) ---- */
function emblemSvg(team,size){
  // pftb のエンブレムメーカーで描く(→docs/10 §10.2 A)。自分のクラブは監督契約で組んだ形と色、ほかは id と名前から決まる
  const own=team&&team.id==="azr"&&typeof CL!=="undefined"&&CL.S&&CL.S.club;
  const c=own?CL.S.club:null;
  return embSvg(team.id,c?c.name:(team.name||team.short||""),Math.round((size||40)*1.1),{ color:c?c.color:team.color, design:c?c.emblem:null });
}

/* ---- タイトル ---- */
function sceneTitle(onStart){
  const S=CL.S, sub=S?"第"+S.term+"任期 ・ "+S.played+"/"+TUNING.club.termLen+" 試合":"";
  sceneShow("sc-title",
    '<div class="beams"><i></i><i></i><i></i><i></i></div>'+
    '<div class="logo">'+logoSvg(true)+'</div>'+   // ロゴ「スラッシュ・ボール」(→docs/14 第3弾)
    '<div class="club">'+emblemSvg(myTeam(CL.S),46)+'<div><b>'+myTeam(CL.S).name+'</b><small>'+sub+'</small></div></div>'+
    '<div class="touch">TOUCH TO START</div>'+
    '<button class="snd" data-sc="snd">'+(SND.on?"🔊 音あり":"🔇 音なし")+'</button>',
    { next:()=>{ sndUnlock(); sndUi("ok"); bgmPlay("club"); onStart(); } });
}

/* ---- 対戦カード ---- */
function axisBars(T){
  // 戦力グラフ(相手はクラブの段、自分は育成)を6本の短い帯で
  const t=T.tier?TUNING.club.tierGraph[T.tier-1]:0;
  return '<div class="ax">'+["O","D","R","C","S","P"].map(a=>{
    const ids=T.xi||[], f=AXIS_STAT[a];
    const v=ids.length?ids.map(id=>f(CARDS[id])).sort((x,y)=>y-x).slice(0,6).reduce((s,x)=>s+x,0)/6:12;
    const w=Math.max(6,Math.min(100,(v+t-9)/9*100));
    return '<span><i>'+AXIS_LABEL[a].slice(0,2)+'</i><em><u style="width:'+w+'%"></u></em></span>'; }).join("")+'</div>';
}
function sideHtml(T,side,kpId){
  const kp=kpId?CARDS[kpId]:null, st=kp?styleOfCard(kp):null;
  const art=kp&&typeof artSrc==="function"?artSrc(kp,"play"):null;   // KP の絵を帯の奥に大きく(→docs/14 第3弾)
  return '<div class="vs-side '+side+'" style="--tc:'+T.color+'">'+(art?'<img class="vs-art" src="'+art+'" alt="">':'')+
    '<div class="vs-em">'+emblemSvg(T,74)+'</div>'+
    '<div class="vs-info"><b>'+teamNameOf(T)+'</b>'+
      '<small>'+(T.tier?"★".repeat(T.tier)+"☆".repeat(5-T.tier)+" ・ ":"")+T.form+'</small>'+
      (kp?'<div class="vs-kp"><i>KP</i>'+nameOf(kp)+'<em>'+(st?st.name:"")+'</em></div>':'')+
      (side==="away"&&T.id?'<div class="vs-coach">相手監督: '+TUNING.coach.pers[T.pers||persOfClub(T.id)].name+'型</div>':'')+   // 性格(→docs/13 §13.5)
      (side==="home"&&CL.S&&CL.S.biz&&CL.S.biz.sp?'<div class="vs-sp">'+CL.S.biz.sp.name+'</div>':'')+
      axisBars(T)+'</div></div>';
}
function sceneMatchup(fx,go){
  const comp=COMPS[fx.comp], S=CL.S, me=Object.assign(myTeam(S),{ xi:(S.sq||startSquad()).slice(0,11) });
  const opp=TEAMS[fx.opp];
  sceneShow("sc-vs",
    '<div class="vs-band"><i>第'+fx.no+'試合</i><b>'+comp.name+'</b><em>'+(fx.label||"")+'</em></div>'+
    sideHtml(me,"home",S.kp||TEAMS.azr.kp)+
    '<div class="vs-mark">VS</div>'+
    sideHtml(opp,"away",opp.kp)+
    (fx.agg?'<div class="vs-note">第1試合 '+fx.agg[0]+' - '+fx.agg[1]+'</div>':fx.ko?'<div class="vs-note">同点なら PK 戦</div>':'')+
    '<div class="touch sm">TOUCH</div>',
    { next:go, lock:700 });   // 自動では進まない(相手監督の型やグラフを読めるように →docs/14)
  sndUi("ok"); setTimeout(()=>sndCrowdBurst(),350);
}
/** 対戦カードの「どっ」 */
function sndCrowdBurst(){ if(sndOk())noiseBurst(now(),1.6,0.22,"bandpass",600,900,0.6); }

/* ---- 結果(→docs/07 §7.12): スコア・得点者・チームの数字・採点・MVP ---- */
function goalsOf(M,side){
  return M.events.filter(e=>e.type==="shot"&&e.res==="goal"&&e.side===side)
    .map(e=>'<li><i>'+(e.at?e.min+"+":e.min+"'")+'</i>'+nm(e.by)+(e.sp==="pk"?" (PK)":e.sp==="fk"?" (FK)":"")+'</li>').join("");
}
const POS_ORD={ GK:0, DF:1, MF:2, FW:3 };
/** 採点の色: 7.5 以上は金、5.5 以下は青 */
const rateCls=r=>r>=7.5?"hi":r<=5.5?"lo":"";
const rateTxt=r=>r.toFixed(1);
const resOf=M=>{ const d=M.pso?M.pso[0]-M.pso[1]:M.home.score-M.away.score; return d>0?"WIN":d<0?"LOSE":"DRAW"; };
function sceneResult(M,last,go){
  bgmPlay("club");
  const H=M.home, A=M.away, pso=M.pso, res=resOf(M), RT=matchRatings(M), ST=matchStats(M);
  const mvp=RT.mvp?RT.list.find(x=>x.id===RT.mvp):null;
  const rows=[["シュート","shots",""],["枠内","onT",""],["支配率","poss","%"],["パス成功率","pass","%"]];
  const stHtml='<div class="res-st">'+rows.map(([l,k,u])=>{
    const h=ST.H[k], a=ST.A[k], sh=h+a?Math.round(h/(h+a)*100):50;
    return '<div><b>'+h+u+'</b><span><i>'+l+'</i><em style="--p:'+sh+'%"></em></span><b>'+a+u+'</b></div>'; }).join("")+'</div>';
  // 採点は両チーム(左に自チーム・右に相手。→docs/14)
  const side=sd=>RT.list.filter(x=>x.side===sd).sort((x,y)=>POS_ORD[CARDS[x.id].pos]-POS_ORD[CARDS[y.id].pos]||y.r-x.r);
  const rtCol=(sd,T)=>'<div class="col"><h4 style="--tc:'+T.color+'">'+T.short+'</h4>'+side(sd).map(x=>{ const c=CARDS[x.id];
    return '<span class="'+(x.id===RT.mvp?'mvp':'')+'"><i class="pos '+c.pos.toLowerCase()+'">'+c.pos+'</i><b>'+nameOf(c)+
      (x.g?'<u>'+"⚽".repeat(Math.min(3,x.g))+'</u>':'')+'</b><em class="'+rateCls(x.r)+'">'+rateTxt(x.r)+'</em></span>'; }).join("")+'</div>';
  const rtHtml='<div class="res-rt two">'+rtCol("H",H)+rtCol("A",A)+'</div>';
  const mv=mvp?'<div class="res-mvp">'+(artSrc(CARDS[mvp.id],"play")?'<img class="mvp-art" src="'+artSrc(CARDS[mvp.id],"play")+'" alt="">':'')+
      '<i>MVP</i><b>'+nameOf(CARDS[mvp.id])+'</b><em>'+rateTxt(mvp.r)+'</em><small>'+(mvp.side==="H"?H.short:A.short)+'</small></div>':'';
  sceneShow("sc-res r-"+res.toLowerCase(),
    '<div class="res-mark">'+logoMarkSvg(300,"wm")+'</div>'+   // ロゴのマークの透かし(→docs/14 第3弾)
    '<div class="res-word">'+res+'</div>'+
    '<div class="res-score">'+
      '<div class="rs">'+emblemSvg(H,40)+'<b>'+H.short+'</b></div>'+
      '<div class="rn"><b class="cnt" data-v="'+H.score+'">0</b><i>-</i><b class="cnt" data-v="'+A.score+'">0</b></div>'+
      '<div class="rs">'+emblemSvg(A,40)+'<b>'+A.short+'</b></div></div>'+
    (pso?'<div class="res-pso">PK '+pso[0]+' - '+pso[1]+'</div>':'')+
    '<div class="res-goals"><ul>'+goalsOf(M,"H")+'</ul><ul class="a">'+goalsOf(M,"A")+'</ul></div>'+
    mv+                                            // MVP は上の段(得点者の下。→docs/14)
    stHtml+rtHtml+
    '<div class="touch sm">TOUCH</div>',
    { next:()=>go(RT), lock:1400 });
  // スコアのカウントアップ
  SC.el.querySelectorAll(".cnt").forEach(el=>{
    const v=+el.dataset.v; let i=0;
    const tick=()=>{ el.textContent=i; if(i<v){ i++; setTimeout(tick,260); } };
    setTimeout(tick,500);
  });
  sndCrowd(false);
  if(res==="WIN")setTimeout(sndFanfare,300); else if(res==="LOSE")setTimeout(sndLose,300); else setTimeout(()=>sndUi("ok"),300);
}

/* ---- ロッカールーム(→docs/07 §7.12・docs/08 §8.11): 秘書のまとめ + 目立った選手1〜2人の一言 + 成長 ---- */
const LOCKER_VOICE={
  awake: ["体の奥から力が湧いてくる……これが本当の自分です！","監督、見ていてくれましたか。何かが目覚めました！"],
  star5: ["自分のプレーの型が、ついに完成しました。","もう迷いはありません。この形で戦います。"],
  gold:  ["あいつとは目を合わせるだけで分かるんです。","最高のコンビになれました！"],
  q:     ["何かが変わりそうな予感がします。次のフレンドリーマッチで試させてください。","体が軽いんです。何かが起きそうです。"],
  star:  ["練習の成果が出てきました！","少しずつ上手くなっているのが分かります。"],
  link:  ["あいつとの呼吸が合ってきました。","だんだん息が合ってきた気がします。"],
  mvpW:  ["今日は最高の気分です！","チームのみんなのおかげです。"],
  mvpL:  ["……いい出来でも、勝てなきゃ意味がない。","次は必ず勝ちます。"],
  mvpD:  ["勝ちきれなかったのが悔しいです。","次こそ決めます。"]
};
const NEWS_ORD=["awake","star5","gold","q","star","link"];
/** 話す選手(最大2人)。知らせの重い順。足りなければ自チームでいちばん採点が高い選手 */
function lockerSpeakers(last,RT){
  const S=CL.S, out=[], seen=new Set();
  const news=(last&&last.news||[]).slice().sort((a,b)=>NEWS_ORD.indexOf(a.kind)-NEWS_ORD.indexOf(b.kind));
  for(const n of news){
    const id=n.ids.find(x=>!seen.has(x)&&S.g.pl[x]);
    if(!id)continue;
    seen.add(id); out.push({ id, kind:n.kind, line:n.line });
    if(out.length>=2)return out;
  }
  if(RT){
    const best=RT.list.filter(x=>x.side==="H"&&!seen.has(x.id)&&CARDS[x.id]).sort((a,b)=>b.r-a.r)[0];
    if(best)out.push({ id:best.id, kind:"mvp", r:best.r });
  }
  return out;
}
function lockerSay(sp,res){
  const k=sp.kind==="mvp"?(res==="WIN"?"mvpW":res==="LOSE"?"mvpL":"mvpD"):sp.kind;
  const list=LOCKER_VOICE[k]||LOCKER_VOICE.mvpD, S=CL.S;
  return list[hashStr("lk:"+S.term+":"+S.played+":"+sp.id)%list.length];
}
function sceneLocker(M,last,RT,go){
  const H=M.home, A=M.away, pso=M.pso, res=resOf(M);
  const gl0=last&&last.gl||[], gset=new Set(gl0);
  const rl=(last&&last.lines||[]).filter(x=>!/^カード:/.test(x)&&!gset.has(x));
  const sps=lockerSpeakers(last,RT), said=new Set(sps.map(sp=>sp.line));
  const gl=gl0.filter(x=>!said.has(x));                // 吹き出しで話した知らせは繰り返さない
  sceneShow("sc-lock",
    '<div class="lk-head"><b>LOCKER ROOM</b><small>'+H.short+' '+H.score+' - '+A.score+' '+A.short+(pso?' (PK '+pso[0]+'-'+pso[1]+')':'')+'</small></div>'+
    '<div class="lk-sec"><i class="sec-ic">SEC</i><div><b class="sec-nm">'+secOf(CL.S).name+'</b><p>'+secSay(CL.S,res.toLowerCase())+'</p>'+
      (rl.length?'<ul>'+rl.map(x=>'<li>'+x+'</li>').join("")+'</ul>':'')+'</div></div>'+
    sps.map((sp,i)=>'<div class="lk-pl" style="animation-delay:'+(0.4+i*0.45)+'s">'+
      '<div class="lk-card">'+cardHtml(sp.id,"s")+'</div>'+
      '<div class="lk-say"><b>'+nameOf(CARDS[sp.id])+'</b><p>「'+lockerSay(sp,res)+'」</p>'+
        (sp.line?'<em class="hi">'+sp.line+'</em>':sp.r!=null?'<em>採点 '+rateTxt(sp.r)+'</em>':'')+'</div></div>').join("")+
    (gl.length?'<ul class="lk-grow">'+gl.map((x,i)=>'<li style="animation-delay:'+(1.2+i*0.12)+'s"'+
      (/覚醒|黄金|★5/.test(x)?' class="hi"':'')+'>'+x+'</li>').join("")+'</ul>':'')+
    '<div class="touch sm">TOUCH</div>',
    { next:go, lock:900 });
  setTimeout(()=>sndUi("ok"),200);
  if(gl0.some(x=>/覚醒|黄金|★5/.test(x)))setTimeout(()=>sndShimmer(true),900);
}

/* ---- 優勝のウイニングショット(→docs/08 §8.11)。大会の優勝すべてで、ロッカールームの代わりに出す ---- */
const TROPHY_SVG='<svg class="tr-cup" viewBox="0 0 120 150"><defs><linearGradient id="trg" x1="0" x2="1">'+
  '<stop offset="0" stop-color="#8a6414"/><stop offset=".35" stop-color="#ffe9a3"/><stop offset=".6" stop-color="#e2b84a"/><stop offset="1" stop-color="#7a5510"/></linearGradient></defs>'+
  '<path fill="url(#trg)" d="M28 10h64v8c0 26-12 44-26 50v18h10l6 14H38l6-14h10V68C40 62 28 44 28 18z"/>'+
  '<path fill="none" stroke="url(#trg)" stroke-width="7" d="M30 22H12c0 18 8 28 20 30M90 22h18c0 18-8 28-20 30"/>'+
  '<rect x="30" y="112" width="60" height="28" rx="2" fill="#1a1a1a"/><rect x="36" y="118" width="48" height="5" fill="url(#trg)"/></svg>';
function sceneTrophy(M,last,go){
  const titles=(last&&last.lines||[]).filter(x=>/^🏆 /.test(x)).map(x=>x.replace(/^🏆 | 優勝$/g,""));
  const H=M.home, gl=last&&last.gl||[], hi=gl.filter(x=>/覚醒|黄金|★5/.test(x));
  sceneShow("sc-trophy",
    '<div class="tr-head"><small>'+titles.join(" ・ ")+'</small><b>CHAMPIONS</b></div>'+
    '<div class="tr-stage">'+TROPHY_SVG+'<div class="tr-team">'+H.players.map(p=>'<span>'+nameOf(p.c)+'</span>').join("")+'</div></div>'+
    // 集合写真: 後ろの列(6人)と前の列(5人)。トロフィーを囲む(→docs/14 第3弾)
    '<div class="tr-photo">'+[H.players.slice(5),H.players.slice(0,5)].map((row,ri)=>'<div class="row r'+ri+'">'+row.map((p,k)=>{ const a=artSrc(p.c,"play");   // 動きのある絵で並べる(→docs/14)
      return a?'<img'+(k>=row.length/2?' class="fl"':'')+' src="'+a+'" alt="">':''; }).join("")+'</div>').join("")+'</div>'+   // 右半分は左右反転して中央を向く
    '<div class="tr-club">'+emblemSvg(H,30)+'<b>'+H.name+'</b></div>'+
    (hi.length?'<ul class="lk-grow">'+hi.map(x=>'<li class="hi">'+x+'</li>').join("")+'</ul>':'')+
    '<div class="flash"></div><div class="touch sm">TOUCH</div>',
    { next:go, lock:1600 });
  setTimeout(sndFanfare,200);
  [700,1150].forEach(t=>setTimeout(sndShutter,t));
}
function sndShutter(){ if(sndOk())noiseBurst(now(),0.08,0.35,"highpass",2500,4000,0.5); }

/* ---- カード排出(→docs/07 §7.12) ----
 * めくる前の予兆: 裏の後ろの光(pk-aura)がレア度どおりに光る(W なし / B 銀 / K 虹 / L 金で震える)。
 * TUNING.pack.promo の割合で一段下の光り方から始まり、少しして本来の光り方へ「昇格」する。どちらになるかはたねで決まる */
const OMEN_ORD=["W","B","K","L"];
function sceneCard(id,isNew,go){
  const c=CARDS[id], r=c.rar||"W", P=TUNING.pack, S=CL.S;
  const promo=r!=="W"&&(hashStr("om:"+id+":"+(S?S.term+":"+S.played:0))%1000)/1000<(P.promo[r]||0);
  const shown=promo?OMEN_ORD[OMEN_ORD.indexOf(r)-1]:r;
  // 本家と同じく、上の排出口からパックを引き出し(①)、パックを破って中身を見る(②)。予兆の光は引き出したパックの後ろで
  sceneShow("sc-card",
    '<div class="pk-head"><b>CARD</b><small>試合のあとに1枚</small></div>'+
    '<div class="pk-mouth top"><i></i></div>'+
    '<div class="pk-slot st0">'+(r==="L"?'<div class="rays"></div>':'')+'<i class="pk-aura"></i>'+
      '<div class="pk-pack" data-sc="flip">'+
        '<div class="pk-cardin r-'+r+'">'+cardHtml(id,"m")+'</div>'+
        '<div class="pk-wrap"><div class="pk-top"><span>ここから破る ✂</span></div>'+
          '<div class="pk-body"><b>wcc<span>_</span>f</b><small>PLAYER CARD ・ 1枚入り</small><i></i></div></div>'+
      '</div></div>'+
    '<div class="pk-msg">パックを下へ引き出す</div>',
    { lock:500 });
  SC.card={ r, shown, promo, isNew, c, go, stage:0 };
  SC.promote=()=>{
    clearTimeout(SC.promoT); SC.promote=null;
    const slot=SC.el.querySelector(".pk-slot");
    if(!slot||slot.classList.contains("om-"+r))return;
    slot.classList.remove("om-"+shown); slot.classList.add("om-"+r,"promo");
    sndShimmer(r==="L");
  };
  // 引く・破るは、なぞっても押しても進む(なぞる向き: 引く = 下、破る = 横)
  const pack=SC.el.querySelector(".pk-pack"); let p0=null;
  pack.addEventListener("pointerdown",e=>{ p0={ x:e.clientX, y:e.clientY }; SC.packMoved=false; });   // 前のなぞりの印は押すたびに消す(→docs/14)
  pack.addEventListener("pointermove",e=>{
    if(!p0)return; const dx=e.clientX-p0.x, dy=e.clientY-p0.y, st=SC.card&&SC.card.stage;
    if((st===0&&dy>28)||(st===1&&Math.abs(dx)>28)){ if(SC.busy)return; p0=null; SC.packMoved=true; packStep(); }   // 待ちの間のなぞりは、明けてから効く
  });
  pack.addEventListener("pointerup",()=>{ p0=null; });
  sndUi("tap");
}
/** パックを1段進める: 0 口から少し出ている → 1 引き出した → 2 破って中身が見えた → 監督室へ */
function packStep(){
  const K=SC.card; if(!K||SC.busy)return;
  const slot=SC.el.querySelector(".pk-slot"), msg=SC.el.querySelector(".pk-msg");
  if(K.stage===0){
    K.stage=1; slot.classList.replace("st0","st1"); slot.classList.add("om-"+K.shown);
    msg.textContent="切り口を横になぞって破る";
    sndPull(); if(K.shown!=="W")setTimeout(()=>sndShimmer(K.shown==="L"),420);
    SC.promoT=K.promo?setTimeout(()=>SC.promote&&SC.promote(),TUNING.pack.promoMs):0;
    if(!K.promo)SC.promote=null;
    SC.busy=true; setTimeout(()=>{ SC.busy=false; },550);
    return;
  }
  if(K.stage===1){
    if(SC.promote)SC.promote();                 // 昇格の前に破ったら、先に昇格させる
    K.stage=2; slot.classList.replace("st1","st2");
    sndTear();
    if(K.r==="L"){ SC.el.classList.add("glow-L"); setTimeout(sndFanfare,350); setTimeout(()=>sndShimmer(true),500); }
    else if(K.r==="K"){ SC.el.classList.add("glow-K"); setTimeout(()=>sndShimmer(false),350); }
    else setTimeout(()=>sndUi("ok"),300);
    msg.innerHTML='<b class="rar r-'+K.r+'">'+RAR_TAG[K.r]+'</b>'+(K.isNew?' <b class="new">NEW</b>':'')+
      '<br><span>'+nameOf(K.c)+' ・ '+clubOfCard(K.c)+'</span><br><small>TOUCH で監督室へ</small>';
    SC.next=K.go; SC.busy=true; setTimeout(()=>{ SC.busy=false; },700);
    return;
  }
  if(SC.next){ const f=SC.next; SC.next=null; SC.card=null; f(); }
}
function sndPull(){ if(sndOk())noiseBurst(now(),0.22,0.25,"bandpass",900,1400,0.4); }
function sndTear(){ if(sndOk()){ noiseBurst(now(),0.12,0.3,"highpass",1800,3200,0.5); noiseBurst(now()+0.08,0.16,0.22,"bandpass",2400,3000,0.45); } }
function sceneAct(act,b){
  if(act==="snd"){ sndUnlock(); sndSetOn(!SND.on); b.textContent=SND.on?"🔊 音あり":"🔇 音なし"; sndUi("ok"); return; }
  if(act==="flip"){
    if(SC.packMoved){ SC.packMoved=false; return; }   // なぞった直後のタップは数えない
    packStep();
  }
}

/**
 * レアKP のカットイン(→docs/11 §11.6)。斜めの帯が横切り、選手の絵・固有名・技を見せる。タッチで飛ばせる。
 *   c … カード / side … "A" なら相手(帯が逆から来る) / ms … 長さ / fn … 終わったら
 */
function cutIn(c,side,ms,fn){
  const R=rareOfCard(c); if(!R){ if(fn)fn(); return; }
  const old=document.querySelector(".cutin"); if(old)old.remove();
  const sk=c.skill?SKILLS[c.skill]:null, mv=R.mv?RARE_MOVES[R.mv]:null, img=typeof artSrc==="function"?artSrc(c,"play"):null;
  const el=document.createElement("div");
  el.className="cutin r-"+c.rar+(side==="A"?" opp":"");
  el.innerHTML='<div class="ci-band"><i class="ci-line"></i>'+(img?'<img src="'+img+'" alt="">':'')+
    '<div class="ci-tx"><small>'+(side==="A"?"相手の ":"")+'RARE KP ・ ★5</small><b>'+R.name+'</b>'+
    '<i>'+nameOf(c)+(sk?' ・ '+sk.label+'の極み':'')+'</i>'+(mv?'<em>技: '+mv.label+'</em>':'')+'</div></div>';
  let done=false;
  const end=()=>{ if(done)return; done=true; el.classList.add("out"); setTimeout(()=>{ el.remove(); if(fn)fn(); },260); };
  el.addEventListener("pointerdown",end);
  document.body.appendChild(el);
  if(typeof sndShimmer==="function")sndShimmer(c.rar==="L");
  setTimeout(end,ms||TUNING.rare.cutMs);
}
