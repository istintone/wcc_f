/* =========================================================================
   wcc_f — 場面(→docs/07 §7.2)。全画面の場面を順に進む。
     タイトル → (監督室) → 対戦カード → 試合 → 結果 → カード排出 → 監督室
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
  if(opt.lock)setTimeout(()=>{ SC.busy=false; },opt.lock);
  if(opt.auto&&opt.next)SC.timer=setTimeout(()=>{ if(SC.next){ const f=SC.next; SC.next=null; f(); } },opt.auto);
}
function sceneHide(){ clearTimeout(SC.timer); SC.next=null; SC.el.className=""; SC.el.innerHTML=""; }

/* ---- エンブレム(クラブの色と略称から描く盾。独自の意匠) ---- */
function emblemSvg(team,size){
  const c=team.color||"#2f7fe0", s=size||40, txt=(team.short||"").slice(0,3);
  const dark="rgba(0,0,0,.28)";
  return '<svg class="emb" width="'+s+'" height="'+Math.round(s*1.15)+'" viewBox="0 0 40 46">'+
    '<path d="M20 1 L38 6 L38 22 C38 34 29 41 20 45 C11 41 2 34 2 22 L2 6 Z" fill="'+c+'" stroke="#f2c14e" stroke-width="1.6"/>'+
    '<path d="M20 1 L38 6 L38 22 C38 34 29 41 20 45 Z" fill="'+dark+'"/>'+
    '<rect x="6" y="15" width="28" height="11" rx="1.5" fill="rgba(10,14,24,.78)"/>'+
    '<text x="20" y="23.6" text-anchor="middle" font-size="8.4" font-weight="900" font-style="italic" fill="#fff" '+
      'font-family="system-ui,sans-serif" letter-spacing=".5">'+txt+'</text>'+
    '<circle cx="20" cy="34" r="3.2" fill="#fff" opacity=".85"/></svg>';
}

/* ---- タイトル ---- */
function sceneTitle(onStart){
  const S=CL.S, sub=S?"第"+S.term+"任期 ・ "+S.played+"/"+TUNING.club.termLen+" 試合":"";
  sceneShow("sc-title",
    '<div class="beams"><i></i><i></i><i></i><i></i></div>'+
    '<div class="logo"><b>wcc<span>_</span>f</b><small>CLUB CARD FOOTBALL</small></div>'+
    '<div class="club">'+emblemSvg(TEAMS.azr,46)+'<div><b>'+teamNameOf(TEAMS.azr)+'</b><small>'+sub+'</small></div></div>'+
    '<div class="touch">TOUCH TO START</div>'+
    '<button class="snd" data-sc="snd">'+(SND.on?"🔊 音あり":"🔇 音なし")+'</button>',
    { next:()=>{ sndUnlock(); sndUi("ok"); onStart(); } });
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
  return '<div class="vs-side '+side+'" style="--tc:'+T.color+'">'+
    '<div class="vs-em">'+emblemSvg(T,74)+'</div>'+
    '<div class="vs-info"><b>'+teamNameOf(T)+'</b>'+
      '<small>'+(T.tier?"★".repeat(T.tier)+"☆".repeat(5-T.tier)+" ・ ":"")+T.form+'</small>'+
      (kp?'<div class="vs-kp"><i>KP</i>'+nameOf(kp)+'<em>'+(st?st.name:"")+'</em></div>':'')+
      axisBars(T)+'</div></div>';
}
function sceneMatchup(fx,go){
  const comp=COMPS[fx.comp], S=CL.S, me=Object.assign({},TEAMS.azr,{ xi:(S.sq||startSquad()).slice(0,11) });
  const opp=TEAMS[fx.opp];
  sceneShow("sc-vs",
    '<div class="vs-band"><i>第'+fx.no+'試合</i><b>'+comp.name+'</b><em>'+(fx.label||"")+'</em></div>'+
    sideHtml(me,"home",S.kp||TEAMS.azr.kp)+
    '<div class="vs-mark">VS</div>'+
    sideHtml(opp,"away",opp.kp)+
    (fx.agg?'<div class="vs-note">第1試合 '+fx.agg[0]+' - '+fx.agg[1]+'</div>':fx.ko?'<div class="vs-note">同点なら PK 戦</div>':'')+
    '<div class="touch sm">TOUCH</div>',
    { next:go, auto:4200, lock:700 });
  sndUi("ok"); setTimeout(()=>sndCrowdBurst(),350);
}
/** 対戦カードの「どっ」 */
function sndCrowdBurst(){ if(sndOk())noiseBurst(now(),1.6,0.22,"bandpass",600,900,0.6); }

/* ---- 結果 ---- */
function goalsOf(M,side){
  return M.events.filter(e=>e.type==="shot"&&e.res==="goal"&&e.side===side)
    .map(e=>'<li><i>'+(e.at?e.min+"+":e.min+"'")+'</i>'+nm(e.by)+(e.sp==="pk"?" (PK)":e.sp==="fk"?" (FK)":"")+'</li>').join("");
}
/**
 * MVP。**試合の記録(イベント)から数える**。途中で交代した選手は終了時の名簿にいないため。
 * 得点を最も重く、次に勝った側であること。競り合い・パス・セーブは差を付ける程度
 */
function mvpOf(M){
  const d=(M.pso?M.pso[0]-M.pso[1]:0)||M.home.score-M.away.score;
  const sc={}, side={}, add=(id,v,sd)=>{ if(!id)return; sc[id]=(sc[id]||0)+v; if(sd)side[id]=sd; };
  const other=s=>s==="H"?"A":"H";
  for(const e of M.events){
    if(e.type==="shot"){
      add(e.by,e.res==="goal"?6:0.3,e.side);
      if(e.res==="save")add(e.gk,0.6,other(e.side));
      if(e.res==="block")add(e.vs,0.4,other(e.side));
    }else if(e.type==="pass"||e.type==="carry"){
      if(e.ok)add(e.by,0.08,e.side); else add(e.vs,0.25,other(e.side));
    }
  }
  let best=null, bs=-1;
  for(const id in sc){
    const won=(side[id]==="H"?d:-d)>0, s=sc[id]+(won?3:0);
    if(s>bs){ bs=s; best=id; }
  }
  return best?{ c:CARDS[best], side:side[best] }:null;
}
function sceneResult(M,last,go){
  const H=M.home, A=M.away, pso=M.pso, d=pso?pso[0]-pso[1]:H.score-A.score;
  const res=d>0?"WIN":d<0?"LOSE":"DRAW", mvp=mvpOf(M);
  const lines=(last&&last.lines||[]).filter(x=>!/^カード:/.test(x));
  sceneShow("sc-res r-"+res.toLowerCase(),
    '<div class="res-word">'+res+'</div>'+
    '<div class="res-score">'+
      '<div class="rs">'+emblemSvg(H,44)+'<b>'+H.short+'</b></div>'+
      '<div class="rn"><b class="cnt" data-v="'+H.score+'">0</b><i>-</i><b class="cnt" data-v="'+A.score+'">0</b></div>'+
      '<div class="rs">'+emblemSvg(A,44)+'<b>'+A.short+'</b></div></div>'+
    (pso?'<div class="res-pso">PK '+pso[0]+' - '+pso[1]+'</div>':'')+
    '<div class="res-goals"><ul>'+goalsOf(M,"H")+'</ul><ul class="a">'+goalsOf(M,"A")+'</ul></div>'+
    (mvp?'<div class="res-mvp"><i>MVP</i><b>'+nameOf(mvp.c)+'</b><small>'+(mvp.side==="H"?H.short:A.short)+'</small></div>':'')+
    (lines.length?'<ul class="res-lines">'+lines.map((x,i)=>'<li style="animation-delay:'+(1.0+i*0.18)+'s"'+
      (/覚醒|黄金|★5|🏆/.test(x)?' class="hi"':'')+'>'+x+'</li>').join("")+'</ul>':'')+
    '<div class="touch sm">TOUCH</div>',
    { next:go, lock:1400 });
  // スコアのカウントアップ
  SC.el.querySelectorAll(".cnt").forEach(el=>{
    const v=+el.dataset.v; let i=0;
    const tick=()=>{ el.textContent=i; if(i<v){ i++; setTimeout(tick,260); } };
    setTimeout(tick,500);
  });
  sndCrowd(false);
  if(res==="WIN")setTimeout(sndFanfare,300); else if(res==="LOSE")setTimeout(sndLose,300); else setTimeout(()=>sndUi("ok"),300);
  if(lines.some(x=>/覚醒|黄金|★5/.test(x)))setTimeout(()=>sndShimmer(true),1400);
}

/* ---- カード排出 ---- */
function sceneCard(id,isNew,go){
  const c=CARDS[id], r=c.rar||"W";
  sceneShow("sc-card",
    '<div class="pk-head"><b>CARD</b><small>試合のあとに1枚</small></div>'+
    '<div class="pk-slot"><div class="pk-card" data-sc="flip"><div class="pk-in">'+
      '<div class="pk-back"><b>wcc<span>_</span>f</b><i></i></div>'+
      '<div class="pk-front r-'+r+'">'+cardHtml(id,"m")+'</div>'+
    '</div></div>'+(r==="L"?'<div class="rays"></div>':'')+'</div>'+
    '<div class="pk-msg">カードをタッチしてめくる</div>',
    { lock:600 });
  SC.flipNext=()=>{
    SC.el.querySelector(".pk-msg").innerHTML='<b class="rar r-'+r+'">'+RARITY[r].name+'</b>'+(isNew?' <b class="new">NEW</b>':'')+
      '<br><span>'+nameOf(c)+' ・ '+(c.club||"")+'</span><br><small>TOUCH で監督室へ</small>';
    SC.next=go; SC.busy=true; setTimeout(()=>{ SC.busy=false; },700);
  };
  sndUi("tap");
}
function sceneAct(act,b){
  if(act==="snd"){ sndUnlock(); sndSetOn(!SND.on); b.textContent=SND.on?"🔊 音あり":"🔇 音なし"; sndUi("ok"); return; }
  if(act==="flip"){
    const card=SC.el.querySelector(".pk-card");
    if(card.classList.contains("open")){ if(SC.next&&!SC.busy){ const f=SC.next; SC.next=null; f(); } return; }
    card.classList.add("open");
    const r=SC.el.querySelector(".pk-front").className.match(/r-(\w)/)[1];
    sndFlip();
    if(r==="L"){ SC.el.classList.add("glow-L"); setTimeout(sndFanfare,350); setTimeout(()=>sndShimmer(true),500); }
    else if(r==="K"){ SC.el.classList.add("glow-K"); setTimeout(()=>sndShimmer(false),350); }
    else setTimeout(()=>sndUi("ok"),300);
    SC.flipNext();
  }
}
