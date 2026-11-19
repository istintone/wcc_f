/* =========================================================================
   wcc_f — 試合映像(上のモニター)。エンジンが解いた結果を読むだけで、何も書き戻さない。
   画面座標は u(0=左のゴール 〜 1=右のゴール) / v(0=奥のタッチライン 〜 1=手前)。ホームは右へ攻める。
   見え方(→docs/07 §7.11): テレビ中継のように**斜め上の横から見た立体**。奥ほど狭く小さい(遠近)。
   選手は紙の板が地面に立つように描き(ペーパークラフト風)、足元に影。奥から順に描くので手前の選手が重なる。
   奥にはスタンドと観客(高さはスタジアムの段 →club.js の S.biz.stad)。
   ========================================================================= */

const RV={ cv:null, ctx:null, w:0, h:0, vis:new Map(), ball:[0.5,0.5], lift:0, crowd:null, bg:null, bgKey:"" };

const scrOf=(side,h,x)=>side==="H"?[h,x/100]:[1-h,1-x/100];
const lerp=(a,b,t)=>a+(b-a)*t;
const ease=t=>t<0.5?2*t*t:1-Math.pow(-2*t+2,2)/2;

function initView(){
  RV.cv=document.getElementById("view");
  RV.ctx=RV.cv.getContext("2d");
  resizeView();
  window.addEventListener("resize",resizeView);
}
function resizeView(){
  const r=RV.cv.getBoundingClientRect(), dpr=Math.min(window.devicePixelRatio||1,3);
  RV.w=r.width; RV.h=r.height;
  RV.cv.width=Math.round(r.width*dpr); RV.cv.height=Math.round(r.height*dpr);
  RV.ctx.setTransform(dpr,0,0,dpr,0,0);
  RV.crowd=null;                               // 観客の点は大きさが変わったら作り直す
}
/* ---- 遠近(数値は TUNING.view)---- */
/** 奥行き v(0〜1)での縮み(奥のタッチラインで far、手前で 1) */
function depthS(v){ const f=TUNING.view.far; return 1/(1+(1-v)*(1/f-1)); }
/** 地面の点 (u,v) → 画面 [x, y, 縮み] */
function proj(u,v){
  const V=TUNING.view, s=depthS(v), W=RV.w, H=RV.h;
  const yFar=H*V.farY, yNear=H*V.nearY;
  return [W/2+(u-0.5)*W*V.nearW*s, yFar+(s-V.far)/(1-V.far)*(yNear-yFar), s];
}
const pxOf=(u,v)=>{ const p=proj(u,v); return [p[0],p[1]]; };
function quad(c,pts){ c.beginPath(); pts.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1])); c.closePath(); }
function gline(c,a,b){ const p=proj(a[0],a[1]), q=proj(b[0],b[1]); c.beginPath(); c.moveTo(p[0],p[1]); c.lineTo(q[0],q[1]); c.stroke(); }
function grect(c,u0,v0,u1,v1){ quad(c,[proj(u0,v0),proj(u1,v0),proj(u1,v1),proj(u0,v1)]); c.stroke(); }

/** 奥のスタンドと観客。段が上がるほど高く、屋根が付く */
function drawStands(c,W,H){
  const V=TUNING.view, lv=(typeof CL!=="undefined"&&CL.S&&CL.S.biz)?CL.S.biz.stad:1;
  const yFar=H*V.farY, top=Math.max(2,yFar-H*V.standH[lv-1]);
  const sky=c.createLinearGradient(0,0,0,yFar); sky.addColorStop(0,"#16233d"); sky.addColorStop(1,"#2c3f63");
  c.fillStyle=sky; c.fillRect(0,0,W,yFar);
  c.fillStyle="#3a2430"; c.fillRect(0,top,W,yFar-top);
  // 観客の点(毎回同じ並び)
  if(!RV.crowd||RV.crowd.lv!==lv){
    const r=mulberry32(77+lv), pts=[];
    for(let i=0;i<Math.floor(W*(yFar-top)/14);i++)pts.push([r()*W,top+r()*(yFar-top-3),r()]);
    RV.crowd={ lv, pts };
  }
  for(const [x,y,k] of RV.crowd.pts){ c.fillStyle=k<0.33?"#c8102e":k<0.66?"#e9e2d0":"#5a6a8a"; c.fillRect(x,y,1.6,1.6); }
  // 段の境目と屋根
  c.fillStyle="rgba(0,0,0,.35)"; for(let y=top+6;y<yFar;y+=7)c.fillRect(0,y,W,1);
  if(lv>=5){ c.fillStyle="#9aa4b2"; c.fillRect(0,top-4,W,4); }
  // 広告の看板
  c.fillStyle="#0b0f1a"; c.fillRect(0,yFar-5,W,5);
  c.fillStyle="#ffe28a"; c.font="700 "+Math.max(6,H*0.03)+"px system-ui,sans-serif"; c.textAlign="center"; c.textBaseline="middle";
  const sp=(typeof CL!=="undefined"&&CL.S&&CL.S.biz&&CL.S.biz.sp)?CL.S.biz.sp.name:"wcc_f";
  for(let i=0;i<4;i++)c.fillText(sp,W*(0.125+i*0.25),yFar-2.5);
}
/** 芝・ライン・スタンドは変わらないので、裏のキャンバスに描いておき毎フレーム貼るだけにする(大きさ・スタジアム・スポンサーが変わったら描き直す) */
function drawPitch(){
  const W=RV.w, H=RV.h, dpr=RV.cv.width/W;
  const lv=(typeof CL!=="undefined"&&CL.S&&CL.S.biz)?CL.S.biz.stad:1, sp=(typeof CL!=="undefined"&&CL.S&&CL.S.biz&&CL.S.biz.sp)?CL.S.biz.sp.name:"";
  const key=RV.cv.width+"x"+RV.cv.height+":"+lv+":"+sp;
  if(RV.bgKey!==key){
    const off=RV.bg||(RV.bg=document.createElement("canvas"));
    off.width=RV.cv.width; off.height=RV.cv.height;
    const oc=off.getContext("2d"); oc.setTransform(dpr,0,0,dpr,0,0);
    drawPitchTo(oc,W,H); RV.bgKey=key;
  }
  RV.ctx.save(); RV.ctx.setTransform(1,0,0,1,0,0); RV.ctx.drawImage(RV.bg,0,0); RV.ctx.restore();
}
function drawPitchTo(c,W,H){
  // 毎回、画面全体を塗り直す(遠近で芝が届かない左右の外側に、前の場面のボールや選手が残らないように)
  c.fillStyle="#17603a"; c.fillRect(0,0,W,H);
  drawStands(c,W,H);
  // 芝(縦の縞を遠近つきで)
  const ext=0.03;
  for(let i=0;i<10;i++){
    const u0=-ext+i*(1+2*ext)/10, u1=u0+(1+2*ext)/10;
    c.fillStyle=i%2?"#1b6e3c":"#1f7a43";
    quad(c,[proj(u0,-0.04),proj(u1,-0.04),proj(u1,1.06),proj(u0,1.06)]); c.fill();
  }
  c.strokeStyle="rgba(255,255,255,.7)"; c.lineWidth=1.4;
  grect(c,0,0,1,1);
  gline(c,[0.5,0],[0.5,1]);
  // センターサークル
  c.beginPath();
  for(let i=0;i<=36;i++){ const a=i/36*Math.PI*2, p=proj(0.5+Math.cos(a)*0.087,0.5+Math.sin(a)*0.135); i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]); }
  c.stroke();
  const bx=1-TUNING.rule.boxH, bw=TUNING.rule.boxX*2/100;
  grect(c,0,0.5-bw/2,bx,0.5+bw/2); grect(c,1-bx,0.5-bw/2,1,0.5+bw/2);
  grect(c,0,0.5-0.135,0.052,0.5+0.135); grect(c,1-0.052,0.5-0.135,1,0.5+0.135);
}
/** ゴール(枠に高さを付ける)。奥の柱から描く */
function drawGoal(c,u){
  const gh=TUNING.view.goalH, d=u<0.5?-0.025:0.025;
  const a=proj(u,0.445), b=proj(u,0.555), a2=proj(u+d,0.445), b2=proj(u+d,0.555);
  c.fillStyle="rgba(255,255,255,.18)";
  quad(c,[[a2[0],a2[1]-gh*a2[2]*RV.h],[b2[0],b2[1]-gh*b2[2]*RV.h],[b2[0],b2[1]],[a2[0],a2[1]]]); c.fill();
  c.strokeStyle="#fff"; c.lineWidth=2;
  c.beginPath(); c.moveTo(a[0],a[1]); c.lineTo(a[0],a[1]-gh*a[2]*RV.h); c.lineTo(b[0],b[1]-gh*b[2]*RV.h); c.lineTo(b[0],b[1]); c.stroke();
}

/** いま映すべき場面を G(main.js の状態)から組み立てて描く */
function drawFrame(G,dt){
  const c=RV.ctx, M=G.M;
  if(!M||!RV.w)return;
  drawPitch();

  // ---- ボールの位置 ----
  const ev=G.cur;
  const pin=new Map();                       // この場面で位置が決まっている選手
  let target, lift=0, holderId=null;
  if(ev&&ev.from){
    const t=ease(clamp(G.curT/ev.dur,0,1));
    const a=scrOf(ev.side,ev.from[0],ev.from[1]), b=scrOf(ev.side,ev.dest[0],ev.dest[1]);
    target=[lerp(a[0],b[0],t),lerp(a[1],b[1],t)];
    RV.ball=target;
    const far=Math.hypot(b[0]-a[0],b[1]-a[1]);
    if(ev.type==="pass"||ev.type==="shot"||ev.type==="cross"||ev.type==="offside")lift=Math.sin(Math.PI*t)*far*0.9;
    if(ev.type==="carry"||ev.type==="kickoff"){ pin.set(ev.by,target); holderId=ev.by; }
    else{
      pin.set(ev.by,a);
      if(ev.to&&ev.ok)pin.set(ev.to,b);
    }
    if(ev.vs){                               // 競った相手は競った場所へ寄る
      const cpt=ev.type==="pass"||ev.type==="cross"?b:a;
      pin.set(ev.vs,[lerp(cpt[0],target[0],0.3)+(ev.side==="H"?0.022:-0.022),cpt[1]]);
    }
  }else if(M.ball){
    target=scrOf(M.ball.side,M.ball.h,M.ball.x);
    const k=1-Math.exp(-dt/90);
    RV.ball=[lerp(RV.ball[0],target[0],k),lerp(RV.ball[1],target[1],k)];
    holderId=M.ball.holder.id;
    pin.set(holderId,RV.ball);
  }else{
    const k=1-Math.exp(-dt/200);
    RV.ball=[lerp(RV.ball[0],0.5,k),lerp(RV.ball[1],0.5,k)];
  }

  // ---- 選手の位置(見た目だけ、ゆっくり追う) ----
  const k=1-Math.exp(-dt/170), seen=new Set(), list=[];
  for(const T of [M.home,M.away]){
    const bu=RV.ball[0], bh=T.side==="H"?bu:1-bu;
    const bx=(T.side==="H"?RV.ball[1]:1-RV.ball[1])*100;
    for(const p of T.players){
      seen.add(p.id);
      let goal=pin.get(p.id);
      if(!goal)goal=scrOf(T.side,blockH(p,bh),p.gk?p.x:p.x+(bx-p.x)*0.14);
      let v=RV.vis.get(p.id);
      if(!v){ v=goal.slice(); RV.vis.set(p.id,v); }
      v[0]=lerp(v[0],goal[0],k); v[1]=lerp(v[1],goal[1],k);
      list.push({ p, T, u:v[0], v:v[1] });
    }
  }
  for(const id of RV.vis.keys())if(!seen.has(id))RV.vis.delete(id);

  // ---- 奥から順に: ゴール・選手・ボール ----
  const V=TUNING.view, unit=RV.h*V.manH;    // 手前での選手の高さ
  const items=list.map(o=>({ v:o.v, draw:()=>drawMan(c,o,unit,holderId) }));
  items.push({ v:RV.ball[1]+0.001, draw:()=>drawBall(c,unit,lift) });
  items.push({ v:0.5, draw:()=>{ drawGoal(c,0); drawGoal(c,1); } });
  items.sort((a,b)=>a.v-b.v).forEach(o=>o.draw());
}
/** 【仮】選手の立ち姿の絵(pftb の汎用選手。→docs/10 §10.9)。読み込んだ Image を使い回す */
const RV_IMG={};
function standImg(c){
  if(typeof artSrc!=="function")return null;
  const src=artSrc(c,"play"); if(!src)return null;   // カードと同じ動きのある絵
  let im=RV_IMG[src]; if(!im){ im=RV_IMG[src]=new Image(); im.src=src; }
  return im.complete&&im.naturalWidth?im:null;
}
/** 選手 = 立ち姿の絵(仮)。足元にチームの色の輪と背番号の札。絵が無いときは地面に立つ紙の板 */
function drawMan(c,o,unit,holderId){
  const { p, T }=o, [x,y,s]=proj(o.u,o.v), h=unit*s, w=h*0.62;
  const im=standImg(p.c);
  if(im){
    const col=p.gk?"#d9a521":T.color, ih=h*1.45, iw=ih*im.naturalWidth/im.naturalHeight;
    c.fillStyle="rgba(0,0,0,.3)"; c.beginPath(); c.ellipse(x,y,w*0.7,h*0.14,0,0,Math.PI*2); c.fill();
    c.lineWidth=p.id===holderId?2.6:1.8; c.strokeStyle=p.id===holderId?"#f2c14e":col;
    c.beginPath(); c.ellipse(x,y,w*0.72,h*0.16,0,0,Math.PI*2); c.stroke();
    if(T.side==="A"){ c.save(); c.translate(x,0); c.scale(-1,1); c.drawImage(im,-iw/2,y-ih*0.97,iw,ih); c.restore(); }   // 相手は左右反転
    else c.drawImage(im,x-iw/2,y-ih*0.97,iw,ih);
    const tw=Math.max(10,h*0.5), th=Math.max(7,h*0.32);
    c.fillStyle=col; c.fillRect(x-tw/2,y+2,tw,th);
    c.fillStyle="#fff"; c.font="800 "+Math.max(6,Math.round(th*0.85))+"px system-ui,sans-serif"; c.textAlign="center"; c.textBaseline="middle";
    c.fillText(p.c.no,x,y+2+th/2+0.5);
    if(p.kp){ c.fillStyle="#f2c14e"; c.font="900 "+Math.round(h*0.45)+"px system-ui,sans-serif"; c.fillText("★",x+iw*0.42,y-ih*0.85); }
    if(p.yc){ c.fillStyle="#ffd84a"; c.fillRect(x-iw*0.5,y-ih*0.85,w*0.28,h*0.36); }
    if(p.inj){ c.fillStyle="#c8102e"; c.fillRect(x+iw*0.3,y-ih*0.95,w*0.3,w*0.3); }
    if(p.stam<TUNING.stam.tiredAt){ c.fillStyle="#ff7a6b"; c.fillRect(x-tw/2,y+2+th+1,tw*p.stam/TUNING.stam.tiredAt,2); }
    return;
  }
  c.fillStyle="rgba(0,0,0,.28)"; c.beginPath(); c.ellipse(x+w*0.18,y,w*0.62,h*0.12,0,0,Math.PI*2); c.fill();
  const col=p.gk?"#d9a521":T.color, top=y-h;
  // 厚み(右の縁を暗く)→ 表の板
  c.fillStyle="rgba(0,0,0,.45)"; c.fillRect(x-w/2+1.5,top+1,w,h);
  c.fillStyle=col; c.fillRect(x-w/2,top,w,h);
  c.fillStyle="rgba(255,255,255,.18)"; c.fillRect(x-w/2,top,w,h*0.22);  // 肩の光
  c.lineWidth=p.id===holderId?2.2:1;
  c.strokeStyle=p.id===holderId?"#f2c14e":"rgba(255,255,255,.9)"; c.strokeRect(x-w/2,top,w,h);
  c.fillStyle="#fff"; c.font="800 "+Math.max(7,Math.round(h*0.5))+"px system-ui,sans-serif";
  c.textAlign="center"; c.textBaseline="middle"; c.fillText(p.c.no,x,top+h*0.55);
  if(p.kp){ c.fillStyle="#f2c14e"; c.font="900 "+Math.round(h*0.45)+"px system-ui,sans-serif"; c.fillText("★",x+w*0.55,top-h*0.05); }
  if(p.stam<TUNING.stam.tiredAt){ c.fillStyle="#ff7a6b"; c.fillRect(x-w/2,y+2,w*p.stam/TUNING.stam.tiredAt,2); }
  if(p.yc){ c.fillStyle="#ffd84a"; c.fillRect(x-w/2-w*0.35,top,w*0.28,h*0.36); }
  if(p.inj){ c.fillStyle="#c8102e"; c.fillRect(x+w/2-w*0.3,top-w*0.3,w*0.3,w*0.3); }
}
/** ボール。影は地面に、球は浮いた高さに */
function drawBall(c,unit,lift){
  const [x,y,s]=proj(RV.ball[0],RV.ball[1]), r=Math.max(2.2,unit*0.16*s), up=lift*RV.h*0.6*s;
  c.fillStyle="rgba(0,0,0,.35)"; c.beginPath(); c.ellipse(x,y,r*1.1,r*0.45,0,0,Math.PI*2); c.fill();
  c.fillStyle="#fff"; c.beginPath(); c.arc(x,y-r-up,r,0,Math.PI*2); c.fill();
  c.lineWidth=0.8; c.strokeStyle="#222"; c.stroke();
}
