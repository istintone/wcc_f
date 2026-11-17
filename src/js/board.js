/* =========================================================================
   wcc_f — カード盤面(下半分)。筐体のフラットパネルにあたる。
   カードを動かすと orderMatch に積まれ、次のステップから試合に効く。
   盤面は映像と同じ向き(左=自陣ゴール / 右=敵陣ゴール)。
   カードを動かさずに離す(タップ)と、そのカードの詳細が開く。
   ========================================================================= */

const BD={ cards:null, bench:null, board:null, map:new Map(), drag:null, pendingIn:new Set(), kp:null };
const TAP_PX=7;                              // これ未満の動きはタップとみなす

// 盤面の % 座標。端のカードが切れないよう内側に寄せる
const bdPos=(h,x)=>[6+h*88, 11+x*0.78];
function bdInv(cx,cy){
  const r=BD.board.getBoundingClientRect();
  return { h:((cx-r.left)/r.width*100-6)/88, x:((cy-r.top)/r.height*100-11)/0.78 };
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
  const O=TUNING.rule, top=bdPos(0,50-O.boxX)[1], bot=100-bdPos(0,50+O.boxX)[1];
  const edge=bdPos(1-O.boxH,0)[0];
  for(const id of ["paOwn","paOpp"]){
    const el=document.getElementById(id);
    el.style.top=top+"%"; el.style.bottom=bot+"%";
    el.style.width="calc("+edge+"% - 6px)";
  }
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
  }
  drawLinks(M);
}

/* ---- 盤面のカードを動かす ---- */
function bindFieldDrag(el,id,gk){
  el.addEventListener("pointerdown",e=>{
    if(BD.drag)return;
    e.preventDefault();
    try{ el.setPointerCapture(e.pointerId); }catch(_){}
    BD.drag={ id, el, pid:e.pointerId, x0:e.clientX, y0:e.clientY, moved:false };
    el.classList.add("drag");
  });
  el.addEventListener("pointermove",e=>{
    const d=BD.drag;
    if(!d||d.id!==id||d.pid!==e.pointerId||d.bench)return;
    if(!d.moved&&Math.hypot(e.clientX-d.x0,e.clientY-d.y0)<TAP_PX)return;
    d.moved=true;
    const raw=bdInv(e.clientX,e.clientY), q=clampPos(gk,raw.h,raw.x), h=q.h, x=q.x;
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
    el.classList.remove("drag"); BD.drag=null;
    if(!d.moved&&e.type==="pointerup")tapCard(id);
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
  el.addEventListener("pointerdown",e=>{
    if(BD.drag)return;
    e.preventDefault();
    try{ el.setPointerCapture(e.pointerId); }catch(_){}
    const can=!G.M.over&&!BD.pendingIn.has(id)&&G.M.home.subs+BD.pendingIn.size<TUNING.squad.subMax;
    BD.drag={ id, el, pid:e.pointerId, bench:true, x0:e.clientX, y0:e.clientY, over:null, moved:false, can };
    if(can)el.classList.add("drag");
  });
  el.addEventListener("pointermove",e=>{
    const d=BD.drag;
    if(!d||d.id!==id||d.pid!==e.pointerId)return;
    if(!d.moved&&Math.hypot(e.clientX-d.x0,e.clientY-d.y0)<TAP_PX)return;
    d.moved=true;
    if(!d.can)return;
    el.style.transform="translate("+(e.clientX-d.x0)+"px,"+(e.clientY-d.y0)+"px) scale(1.14)";
    const tgt=fieldCardAt(e.clientX,e.clientY,el);
    if(tgt!==d.over){
      if(d.over)d.over.classList.remove("drop");
      if(tgt)tgt.classList.add("drop");
      d.over=tgt;
    }
  });
  const end=e=>{
    const d=BD.drag;
    if(!d||d.id!==id||d.pid!==e.pointerId)return;
    el.classList.remove("drag"); el.style.transform="";
    if(d.over){
      d.over.classList.remove("drop");
      if(e.type==="pointerup"){
        orderMatch(G.M,"H",{ type:"sub", out:d.over.dataset.id, in:id });
        BD.pendingIn.add(id);
        el.classList.add("used");
        onSubQueued(id,d.over.dataset.id);
      }
    }
    BD.drag=null;
    if(!d.moved&&e.type==="pointerup")showInfo(id);
  };
  el.addEventListener("pointerup",end);
  el.addEventListener("pointercancel",end);
}
