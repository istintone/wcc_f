/* =========================================================================
   wcc_f — カード盤面(下半分)。筐体のフラットパネルにあたる。
   カードを動かすと orderMatch に積まれ、次のステップから試合に効く。
   盤面は筐体と同じ縦向き(下=自陣ゴール / 上=敵陣ゴール。左サイドが左)。映像(モニター)は横向きのまま。
   **長押しでカードの裏(詳細)が盤面の上に開く**。タップは KP を選ぶときだけ使う。
   動かしているカードは指の少し上に出す(指で隠れないように)。
   ========================================================================= */

const BD={ cards:null, bench:null, board:null, map:new Map(), drag:null, pendingIn:new Set(), kp:null };
const TAP_PX=7;                              // これ未満の動きはタップとみなす
const LONG_MS=420;                           // これだけ動かさずに押していたら長押し
const LIFT_PX=34;                            // ドラッグ中、カードを指より上に出す量

// 盤面の % 座標 [左, 上]。端のカードが切れないよう内側に寄せる(SQUAD の盤面と同じ考え方 →clubui.js sqPos)
const bdPos=(h,x)=>[9+x*0.82, 93-h*86];
function bdInv(cx,cy){
  const r=BD.board.getBoundingClientRect();
  return { x:((cx-r.left)/r.width*100-9)/0.82, h:(93-(cy-r.top)/r.height*100)/86 };
}
const aptClass=a=>a>=TUNING.apt.own?"a0":a>=TUNING.apt.group?"a1":"a2";

function mkCard(card){
  const el=document.createElement("div");
  el.className="cd "+card.pos.toLowerCase();
  el.dataset.id=card.id;
  el.innerHTML='<i class="rl">'+card.pos+'</i><i class="no">'+card.no+'</i>'+
    '<u class="nm">'+nameOf(card)+'</u><s class="stm"><em style="width:100%"></em></s>'+
    '<b class="kpm">KP</b><b class="ycm"></b>';
  return el;
}

function initBoard(){
  BD.board=document.getElementById("board");
  BD.cards=document.getElementById("cards");
  BD.bench=document.getElementById("bench");
  // ペナルティエリアを判定と同じ値から引く(自陣 h≦1-boxH / 敵陣 h≧boxH / 左右は中央 ±boxX)
  const O=TUNING.rule, lf=bdPos(0,50-O.boxX)[0], rt=100-bdPos(0,50+O.boxX)[0];
  const depth=100-bdPos(1-O.boxH,0)[1];       // 自陣のエリアの奥行き(下の端から)
  for(const id of ["paOwn","paOpp"]){
    const el=document.getElementById(id);
    el.style.left=lf+"%"; el.style.right=rt+"%";
    el.style.height="calc("+depth+"% - 6px)";
  }
  fitBoard();
  window.addEventListener("resize",fitBoard);
}

/** 画面の大きさに合わせて、盤面と控えのカードの倍率(--k)を決める。盤面の高さが基準より低いほど小さく */
function fitBoard(){
  const P=TUNING.play, deck=document.getElementById("deck");
  if(!BD.board||!deck)return;
  const h=BD.board.clientHeight; if(!h)return;
  const k=clamp(h/P.cardRef,P.cardMin,P.cardMax);
  deck.style.setProperty("--k",k.toFixed(3));
}
function buildBoard(M){
  BD.cards.textContent=""; BD.bench.textContent=""; BD.map.clear(); BD.drag=null;
  for(const p of M.home.players){
    const el=mkCard(p.c);
    bindFieldDrag(el,p.id,p.gk);
    BD.cards.appendChild(el); BD.map.set(p.id,el);
  }
  const lbl=document.createElement("span"); lbl.className="lbl"; lbl.textContent="控え";
  BD.bench.appendChild(lbl);
  for(const card of M.home.bench){
    const el=mkCard(card);
    el.querySelector(".stm").remove();
    if(BD.pendingIn.has(card.id))el.classList.add("used");
    bindBenchDrag(el,card.id);
    BD.bench.appendChild(el);
  }
  syncBoard(M);
  fitBoard();
}

/** 連携の線を引き直す。段が高いほど太く、金色に近い */
function drawLinks(M){
  const svg=document.getElementById("links"), NS="http://www.w3.org/2000/svg";
  svg.textContent="";
  const at=id=>{ const el=BD.map.get(id); return el?[parseFloat(el.style.left),parseFloat(el.style.top)]:null; };
  for(const l of M.home.links){
    const a=at(l[0]), b=at(l[1]);
    if(!a||!b)continue;
    const ln=document.createElementNS(NS,"line");
    ln.setAttribute("x1",a[0]+"%"); ln.setAttribute("y1",a[1]+"%");
    ln.setAttribute("x2",b[0]+"%"); ln.setAttribute("y2",b[1]+"%");
    ln.setAttribute("class","lk lk"+l[2]);
    svg.appendChild(ln);
  }
}
function setCardLook(el,role,apt){
  const rl=el.firstChild;
  rl.textContent=role; rl.className="rl "+aptClass(apt);
}
function syncBoard(M){
  const hold=M.ball&&M.ball.side==="H"?M.ball.holder.id:null;
  const kp=BD.kp||M.home.kp;
  for(const p of M.home.players){
    const el=BD.map.get(p.id);
    if(!el)continue;
    if(!(BD.drag&&BD.drag.id===p.id&&!BD.drag.bench)){
      const [l,t]=bdPos(p.h,p.x);
      el.style.left=l+"%"; el.style.top=t+"%";
      setCardLook(el,p.role,p.apt);
    }
    const em=el.querySelector(".stm em");
    em.style.width=Math.round(p.stam*100)+"%";
    em.className=p.stam<TUNING.stam.tiredAt?"low":p.stam<0.6?"midv":"";
    el.classList.toggle("tired",p.stam<TUNING.stam.tiredAt);
    el.classList.toggle("hasball",p.id===hold);
    el.classList.toggle("iskp",p.id===kp);
    el.classList.toggle("booked",p.yc>0);
    el.classList.toggle("inj",!!p.inj);
  }
  drawLinks(M);
}

/* ---- 盤面のカードを動かす ---- */
function bindFieldDrag(el,id,gk){
  el.addEventListener("pointerdown",e=>{
    if(BD.drag)return;
    e.preventDefault();
    try{ el.setPointerCapture(e.pointerId); }catch(_){}
    const d=BD.drag={ id, el, pid:e.pointerId, x0:e.clientX, y0:e.clientY, moved:false, long:false };
    d.timer=setTimeout(()=>{ if(BD.drag===d&&!d.moved){ d.long=true; el.classList.remove("drag"); showInfo(id); } },LONG_MS);
    el.classList.add("drag");
  });
  el.addEventListener("pointermove",e=>{
    const d=BD.drag;
    if(!d||d.id!==id||d.pid!==e.pointerId||d.bench||d.long)return;
    if(!d.moved&&Math.hypot(e.clientX-d.x0,e.clientY-d.y0)<TAP_PX)return;
    if(!d.moved){ d.moved=true; clearTimeout(d.timer); hideInfo(); }
    const raw=bdInv(e.clientX,e.clientY-LIFT_PX), q=clampPos(gk,raw.h,raw.x), h=q.h, x=q.x;
    const [l,t]=bdPos(h,x);
    el.style.left=l+"%"; el.style.top=t+"%";
    const role=gk?"GK":roleAt(h,x);
    setCardLook(el,role,aptOf(CARDS[id],role));
    drawLinks(G.M);
    orderMatch(G.M,"H",{ type:"move", id, h, x });
  });
  const end=e=>{
    const d=BD.drag;
    if(!d||d.id!==id||d.pid!==e.pointerId)return;
    clearTimeout(d.timer);
    el.classList.remove("drag"); BD.drag=null;
    if(!d.moved&&!d.long&&e.type==="pointerup")tapCard(id);
  };
  el.addEventListener("pointerup",end);
  el.addEventListener("pointercancel",end);
}

/* ---- 控えを盤面のカードに重ねて交代 ---- */
function fieldCardAt(cx,cy,except){
  for(const n of document.elementsFromPoint(cx,cy)){
    if(n===except)continue;
    const c=n.closest&&n.closest("#cards .cd");
    if(c)return c;
  }
  return null;
}
function bindBenchDrag(el,id){
  const ghostAt=(g,cx,cy)=>{ g.style.left=cx+"px"; g.style.top=(cy-LIFT_PX)+"px"; };
  el.addEventListener("pointerdown",e=>{
    if(BD.drag)return;
    e.preventDefault();
    try{ el.setPointerCapture(e.pointerId); }catch(_){}
    const can=!G.M.over&&!BD.pendingIn.has(id)&&G.M.home.subs+BD.pendingIn.size<TUNING.squad.subMax;
    const d=BD.drag={ id, el, pid:e.pointerId, bench:true, x0:e.clientX, y0:e.clientY, over:null, moved:false, can, long:false, ghost:null };
    d.timer=setTimeout(()=>{ if(BD.drag===d&&!d.moved){ d.long=true; showInfo(id); } },LONG_MS);
  });
  el.addEventListener("pointermove",e=>{
    const d=BD.drag;
    if(!d||d.id!==id||d.pid!==e.pointerId||d.long)return;
    if(!d.moved&&Math.hypot(e.clientX-d.x0,e.clientY-d.y0)<TAP_PX)return;
    if(!d.moved){
      d.moved=true; clearTimeout(d.timer); hideInfo();
      if(!d.can){ say(G.M.home.subs+BD.pendingIn.size>=TUNING.squad.subMax?"交代はもう使い切った":"この選手は交代できない"); return; }
      // 盤面の上を自由に動けるよう、控えの列の外(画面の一番上)に浮かせる
      d.ghost=el.cloneNode(true); d.ghost.className=el.className+" ghost"; document.body.appendChild(d.ghost);
      el.classList.add("lifted");
      document.getElementById("board").classList.add("subbing");
    }
    if(!d.can||!d.ghost)return;
    ghostAt(d.ghost,e.clientX,e.clientY);
    // 重ねる相手は浮いたカードの位置で探す(指ではなく、見えているカードの真下)
    const tgt=fieldCardAt(e.clientX,e.clientY-LIFT_PX,d.ghost);
    if(tgt!==d.over){
      if(d.over)d.over.classList.remove("drop");
      if(tgt){ tgt.classList.add("drop"); say("離すと交代: OUT "+nm(tgt.dataset.id)+" → IN "+nm(id)); }
      d.over=tgt;
    }
  });
  const end=e=>{
    const d=BD.drag;
    if(!d||d.id!==id||d.pid!==e.pointerId)return;
    clearTimeout(d.timer);
    if(d.ghost)d.ghost.remove();
    el.classList.remove("lifted");
    document.getElementById("board").classList.remove("subbing");
    BD.drag=null;
    if(d.over){
      d.over.classList.remove("drop");
      if(e.type==="pointerup")askSub(d.over.dataset.id,id);
    }
    if(!d.moved&&!d.long&&e.type==="pointerup")say("長押しでカードの裏を見る ・ 盤面の選手に重ねると交代");
  };
  el.addEventListener("pointerup",end);
  el.addEventListener("pointercancel",end);
}
/** 交代の確認。確認している間は試合を止める(→docs/07 §7.11) */
function askSub(outId,inId){
  const wasPlaying=G.playing;
  if(wasPlaying)setPlaying(false);
  BD.ask={ outId, inId, wasPlaying };
  document.getElementById("subAskText").innerHTML='<small>交代</small><b class="out">OUT '+nm(outId)+'</b><i>→</i><b class="in">IN '+nm(inId)+'</b>';
  document.getElementById("subAsk").classList.add("on");
}
function answerSub(yes){
  const a=BD.ask; BD.ask=null;
  document.getElementById("subAsk").classList.remove("on");
  if(!a)return;
  if(yes&&!G.M.over){
    orderMatch(G.M,"H",{ type:"sub", out:a.outId, in:a.inId });
    BD.pendingIn.add(a.inId);
    const b=[...document.querySelectorAll("#bench .cd")].find(x=>x.dataset.id===a.inId);
    if(b)b.classList.add("used");
    onSubQueued(a.inId,a.outId);
  }else say("交代をやめた");
  if(a.wasPlaying)setPlaying(true);
}
