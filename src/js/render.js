/* =========================================================================
   wcc_f — 試合映像(上半分)。エンジンが解いた結果を読むだけで、何も書き戻さない。
   画面座標は u(0=左のゴール 〜 1=右のゴール) / v(0=上 〜 1=下)。ホームは右へ攻める。
   ========================================================================= */

const RV={ cv:null, ctx:null, w:0, h:0, vis:new Map(), ball:[0.5,0.5], lift:0 };

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
}
function pxOf(u,v){
  const mx=RV.w*0.045, my=RV.h*0.06;
  return [mx+u*(RV.w-2*mx), my+v*(RV.h-2*my)];
}

function drawPitch(){
  const c=RV.ctx, W=RV.w, H=RV.h;
  for(let i=0;i<10;i++){
    c.fillStyle=i%2?"#1b6e3c":"#1f7a43";
    c.fillRect(i*W/10,0,W/10+1,H);
  }
  const [x0,y0]=pxOf(0,0), [x1,y1]=pxOf(1,1), pw=x1-x0, ph=y1-y0;
  c.strokeStyle="rgba(255,255,255,.6)"; c.lineWidth=1.5;
  c.strokeRect(x0,y0,pw,ph);
  c.beginPath(); c.moveTo(x0+pw/2,y0); c.lineTo(x0+pw/2,y1); c.stroke();
  c.beginPath(); c.arc(x0+pw/2,y0+ph/2,ph*0.135,0,Math.PI*2); c.stroke();
  const box=(w,hh)=>{
    c.strokeRect(x0,y0+ph*(0.5-hh/2),pw*w,ph*hh);
    c.strokeRect(x1-pw*w,y0+ph*(0.5-hh/2),pw*w,ph*hh);
  };
  box(1-TUNING.rule.boxH,TUNING.rule.boxX*2/100); box(0.052,0.27);
  c.fillStyle="rgba(255,255,255,.85)";
  const gw=W*0.018, gh=ph*0.11;
  c.fillRect(x0-gw,y0+ph/2-gh/2,gw,gh);
  c.fillRect(x1,y0+ph/2-gh/2,gw,gh);
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

  // ---- 選手 ----
  const k=1-Math.exp(-dt/170), rad=Math.max(7,RV.w*0.024);
  const seen=new Set();
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
      const [x,y]=pxOf(v[0],v[1]);
      c.beginPath(); c.arc(x,y+rad*0.35,rad*0.9,0,Math.PI*2);
      c.fillStyle="rgba(0,0,0,.22)"; c.fill();
      c.beginPath(); c.arc(x,y,rad,0,Math.PI*2);
      c.fillStyle=p.gk?"#d9a521":T.color; c.fill();
      c.lineWidth=p.id===holderId?2.5:1.2;
      c.strokeStyle=p.id===holderId?"#f2c14e":"rgba(255,255,255,.9)"; c.stroke();
      c.fillStyle="#fff"; c.font="700 "+Math.round(rad*1.05)+"px system-ui,sans-serif";
      c.textAlign="center"; c.textBaseline="middle";
      c.fillText(p.c.no,x,y+0.5);
      if(p.kp){                                // KP の印
        c.fillStyle="#f2c14e"; c.font="900 "+Math.round(rad*0.9)+"px system-ui,sans-serif";
        c.fillText("★",x+rad*0.95,y-rad*0.95);
      }
      if(p.stam<TUNING.stam.tiredAt){          // 足が止まっている
        c.fillStyle="#ff7a6b"; c.fillRect(x-rad,y+rad*1.25,rad*2*p.stam/TUNING.stam.tiredAt,2.5);
      }
      if(p.yc){                                // 警告を受けている
        c.fillStyle="#ffd84a"; c.fillRect(x-rad*1.25,y-rad*1.3,rad*0.5,rad*0.7);
      }
    }
  }
  for(const id of RV.vis.keys())if(!seen.has(id))RV.vis.delete(id);

  // ---- ボール ----
  const [bx,by]=pxOf(RV.ball[0],RV.ball[1]), br=rad*0.42, up=lift*RV.h*0.5;
  c.beginPath(); c.ellipse(bx+rad*0.5,by+rad*0.55,br,br*0.6,0,0,Math.PI*2);
  c.fillStyle="rgba(0,0,0,.35)"; c.fill();
  c.beginPath(); c.arc(bx+rad*0.5,by+rad*0.2-up,br*(1+lift*1.2),0,Math.PI*2);
  c.fillStyle="#fff"; c.fill();
  c.lineWidth=1; c.strokeStyle="#222"; c.stroke();
}
