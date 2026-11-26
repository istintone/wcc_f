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

/** スタジアムの段(クラブの S.biz.stad。クイック試合は 1) */
const stadLv=()=>(typeof CL!=="undefined"&&CL.S&&CL.S.biz&&CL.S.biz.stad)||1;
/** 奥の壁の下の端(= 広告の帯の下の端 = 芝の始まり)の高さ */
const wallY=()=>proj(0.5,TUNING.view.wallV)[1];
/**
 * 奥のスタンドと広告の帯(→docs/14 §14.152)。上から「スタンドの絵(ぼかし・暗く・もや)→ 広告の帯 → 芝」。
 * 芝より後に描き、壁より上を塗りつぶす(芝が壁より上にはみ出さないように)
 */
function drawStands(c,W,H){
  const V=TUNING.view, lv=stadLv(), yW=wallY(), yB=yW-H*V.boardH;
  const sky=c.createLinearGradient(0,0,0,yW); sky.addColorStop(0,"#16233d"); sky.addColorStop(1,"#2c3f63");
  c.fillStyle=sky; c.fillRect(0,0,W,yW);
  const im=stadImg(lv);
  if(im){ const sc=W/STAD_W, sy1=STAD_TOP[lv-1], sh=Math.min(sy1,yW/sc), sy0=sy1-sh;   // 絵の芝の線を、帯の下の端(帯の裏)に合わせる
    // A: ぼかす … 小さく縮めてから引き伸ばす(ctx.filter はブラウザでばらつくので使わない)
    const k=V.standBlur, tw=Math.max(1,Math.round(W/k)), th=Math.max(1,Math.round(sh*sc/k));
    const t=document.createElement("canvas"); t.width=tw; t.height=th;
    const tc=t.getContext("2d"); tc.imageSmoothingEnabled=true; tc.drawImage(im,0,sy0,STAD_W,sh,0,0,tw,th);
    c.imageSmoothingEnabled=true; c.drawImage(t,0,0,tw,th,0,yW-sh*sc,W,sh*sc);
    // 色を抑えて暗くする(奥を遠くに見せ、選手を前に出す)
    c.globalCompositeOperation="saturation"; c.fillStyle="rgba(128,128,128,"+V.standDesat+")"; c.fillRect(0,0,W,yB);
    c.globalCompositeOperation="source-over"; c.fillStyle="rgba(10,14,26,"+V.standDim+")"; c.fillRect(0,0,W,yB);
    // もや(帯のすぐ上を霞ませる)
    const mh=H*0.05, g=c.createLinearGradient(0,yB-mh,0,yB); g.addColorStop(0,"rgba(180,192,210,0)"); g.addColorStop(1,"rgba(180,192,210,.2)");
    c.fillStyle=g; c.fillRect(0,yB-mh,W,mh);
  } else {
    // 絵が読めないときの描き方(観客の点)
    const top=Math.max(2,yB-H*V.standH[lv-1]);
    c.fillStyle="#3a2430"; c.fillRect(0,top,W,yB-top);
    if(!RV.crowd||RV.crowd.lv!==lv){
      const r=mulberry32(77+lv), pts=[];
      for(let i=0;i<Math.floor(W*(yB-top)/14);i++)pts.push([r()*W,top+r()*(yB-top-3),r()]);
      RV.crowd={ lv, pts };
    }
    for(const [x,y,k] of RV.crowd.pts){ c.fillStyle=k<0.33?"#c8102e":k<0.66?"#e9e2d0":"#5a6a8a"; c.fillRect(x,y,1.6,1.6); }
    c.fillStyle="rgba(0,0,0,.35)"; for(let y=top+6;y<yB;y+=7)c.fillRect(0,y,W,1);
    if(lv>=5){ c.fillStyle="#9aa4b2"; c.fillRect(0,top-4,W,4); }
  }
  drawBoards(c,W,H,yB,yW);
}
/** 広告の枠に出すもの(順に繰り返す)。スポンサーが増えたらここに足す */
function boardAds(){
  const sp=(typeof CL!=="undefined"&&CL.S&&CL.S.biz&&CL.S.biz.sp)?CL.S.biz.sp.name:"";
  // 赤い枠はスポンサー。スポンサーがいなければ白いロゴ(ボール + 2行の文字。→docs/14 §14.155)
  return [sp?{ text:sp, bg:"#c8102e", fg:"#fff" }:{ text:"WCC F", logo:true, white:true, bg:"#c8102e", fg:"#fff" },
    { text:"WCC F", logo:true, bg:"#f4f1ea", fg:"#111" }];   // logo … ボール + ロゴの2行の文字(→docs/14 §14.154)
}
/** B: 奥の広告の帯(壁)。y0〜y1 の高さで画面の端から端まで。枠ごとに広告を出し、下の芝に影を落とす */
function drawBoards(c,W,H,y0,y1){
  const bh=y1-y0, ads=boardAds(), n=TUNING.view.boardN, cw=W/n, lg=logoImg();
  c.fillStyle="#0b0d12"; c.fillRect(0,y0,W,bh);
  c.fillStyle="#c8102e"; c.fillRect(0,y0,W,Math.max(1.5,bh*0.1));                 // 上の縁(赤)
  const p0=y0+bh*0.18, ph=bh*0.7;
  c.textAlign="center"; c.textBaseline="middle"; c.font="italic 900 "+Math.max(7,ph*0.74)+"px system-ui,sans-serif";
  for(let i=0;i<n;i++){ const a=ads[i%ads.length], x=i*cw+1, w=cw-2, cx=x+w/2, cy=p0+ph/2;
    c.fillStyle=a.bg; c.fillRect(x,p0,w,ph);
    c.fillStyle="rgba(255,255,255,.14)"; c.fillRect(x,p0,w,ph*0.4);                 // LED の光り(上半分を少し明るく)
    c.fillStyle=a.fg;
    const wd=a.logo&&lg?wordsImg(a.white):null;
    if(wd){ let ls=ph*0.82, wh=ph*0.66, ww=wd.naturalWidth*wh/wd.naturalHeight; const k=Math.min(1,(w-8)/(ls+4+ww)); ls*=k; wh*=k; ww*=k;
      const sx=cx-(ls+4+ww)/2; c.drawImage(lg,sx,cy-ls/2,ls,ls); c.drawImage(wd,sx+ls+4,cy-wh/2,ww,wh); }
    else if(a.logo&&lg){ const ls=ph*0.78, tw=c.measureText(a.text).width, sx=cx-(ls+3+tw)/2;
      c.drawImage(lg,sx,cy-ls/2,ls,ls); c.textAlign="left"; c.fillText(a.text,sx+ls+3,cy+0.5); c.textAlign="center"; }
    else c.fillText(a.text,cx,cy+0.5); }
  const g=c.createLinearGradient(0,y1,0,y1+bh*0.6); g.addColorStop(0,"rgba(0,0,0,.38)"); g.addColorStop(1,"rgba(0,0,0,0)");
  c.fillStyle=g; c.fillRect(0,y1,W,bh*0.6);                                           // 芝に落ちる影
}
/** スタジアムの絵(Lv ごと)。読み込みが済むまでは null */
const RV_STAD={};
function stadImg(lv){
  if(typeof STAD_ART==="undefined"||!STAD_ART[lv-1])return null;
  if(!RV_STAD[lv]){ RV_STAD[lv]=new Image(); RV_STAD[lv].src=STAD_ART[lv-1]; }
  const im=RV_STAD[lv]; return im.complete&&im.naturalWidth?im:null;
}
/** ロゴの2行の文字 WORLD CHAMPION / CLUBS FOOTBALLERS(LOGO_IMG.words)。読み込みが済むまでは null */
const RV_WORDS={};
function wordsImg(white){
  const k=white?"wordsW":"words";
  if(typeof LOGO_IMG==="undefined"||!LOGO_IMG[k])return null;
  if(!RV_WORDS[k]){ RV_WORDS[k]=new Image(); RV_WORDS[k].src=LOGO_IMG[k]; }
  const im=RV_WORDS[k]; return im.complete&&im.naturalWidth?im:null;
}
/** ロゴのマーク(看板に描く)。TOP のロゴと同じボール(LOGO_IMG.ball。→docs/14 §14.153)。読み込みが済むまでは null */
let RV_LOGO=null;
function logoImg(){
  if(!RV_LOGO&&typeof LOGO_IMG!=="undefined"&&LOGO_IMG.ball){ RV_LOGO=new Image(); RV_LOGO.src=LOGO_IMG.ball; }
  if(typeof ballMarkSvg!=="function"&&!RV_LOGO)return null;
  if(!RV_LOGO){ RV_LOGO=new Image();
    RV_LOGO.src="data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'+ballMarkSvg(50,50,46,"rvm")+'</svg>'); }
  return RV_LOGO.complete&&RV_LOGO.naturalWidth?RV_LOGO:null;
}
/** 芝・ライン・スタンドは変わらないので、裏のキャンバスに描いておき毎フレーム貼るだけにする(大きさ・スタジアム・スポンサーが変わったら描き直す) */
function drawPitch(){
  const W=RV.w, H=RV.h, dpr=RV.cv.width/W;
  const lv=(typeof CL!=="undefined"&&CL.S&&CL.S.biz)?CL.S.biz.stad:1, sp=(typeof CL!=="undefined"&&CL.S&&CL.S.biz&&CL.S.biz.sp)?CL.S.biz.sp.name:"";
  const key=RV.cv.width+"x"+RV.cv.height+":"+lv+":"+sp+":"+!!logoImg()+":"+!!wordsImg()+!!wordsImg(true)+":"+!!stadImg(lv);   // 絵の読み込みが済んだら描き直す
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
  // C: 芝の色はスタジアムの絵の芝に寄せる(→docs/14 §14.152)
  const gc=(typeof STAD_GRASS!=="undefined"&&STAD_GRASS[stadLv()-1])||[31,122,67], tone=k=>"rgb("+gc.map(v=>Math.round(v*k)).join(",")+")";
  c.fillStyle=tone(0.86); c.fillRect(0,0,W,H);
  // 芝(縦の縞を遠近つきで)。左右の外側まで縞を続け、奥は壁の下の端から
  const sw=(1+2*0.03)/10, wv=TUNING.view.wallV;
  for(let i=-6;i<16;i++){
    const u0=-0.03+i*sw, u1=u0+sw;
    c.fillStyle=i%2?tone(0.9):tone(1);
    quad(c,[proj(u0,wv),proj(u1,wv),proj(u1,1.06),proj(u0,1.06)]); c.fill();
  }
  drawStands(c,W,H);
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

/* ---- ボールを持たない選手の動き(見た目だけ。→docs/07 §7.15) ----
 * 隊列(blockH)だけで置くと全員が同じ上下動になるので、1人ずつ「ゆらぎ・走り込み・寄せ・追いつく速さ」を持たせる。
 * 試合の結果には触れない(乱数も Math.random。エンジンの乱数は使わない) */
const RV_MV=new Map();
/** 走り込みの向き(スキル)。大きいほどよく走る。SB はオーバーラップ系のスキルで駆け上がる */
const RUN_SKILL={ runner:2.2, sprint:2.2, chase:1.8, hunter:1.5, hunt:1.2, wing:1.6, drib:1.3, fanta:1.2, ace:1.3, over:1.8, allout:1.8, dynamo:1.4,
  post:0.4, target:0.4, tower:0.5, maker:0.6, passer:0.7, stopper:0.3, leader:0.4, libero:0.8 };
function mvOf(p){
  let m=RV_MV.get(p.id);
  if(!m){ const h=hashStr("mv:"+p.id);
    m={ ph:(h%628)/100, ph2:((h>>9)%628)/100, f:0.0006+((h>>4)%50)/100000, f2:0.0004+((h>>14)%50)/100000, run:null,
      delay:TUNING.view.mv.delay0+((h>>6)%100)/100*TUNING.view.mv.delayRnd+(STAT_MAX-p.c.spd)*TUNING.view.mv.delaySpd };
    RV_MV.set(p.id,m); }
  return m;
}
/** 走り込みを始める。dh … 前への深さ(チームのフレーム)、dx … 横 */
function startRun(m,now,V,k){
  const r=()=>Math.random();
  m.run={ t0:now, dur:V.runMs[0]+r()*(V.runMs[1]-V.runMs[0]), dh:(V.runH[0]+r()*(V.runH[1]-V.runH[0]))*(k||1), dx:(r()*2-1)*V.runX };
}
/**
 * 1人の目標の位置(チームのフレーム h・x)。att … 自チームが攻めている / press … ボールへ寄せる1人 / bhx … ボールの位置(チームのフレーム)
 */
function offBallGoal(p,bh,bx,att,press,now,dt){
  const V=TUNING.view.mv, m=mvOf(p);
  // ⓪ 隊列の上下は1人ずつ遅れて、役割ごとの幅で(全員が同じ上下動にならないように)
  const hb=blockH(p,0.5);
  let h=hb+(blockH(p,bh)-hb)*(V.amp[p.role]||1)*(0.85+((hashStr("amp:"+p.id)%30)/100)), x=p.gk?p.x:p.x+(bx-p.x)*(0.08+((hashStr("bx:"+p.id)%12)/100));
  // ① その場のゆらぎ(1人ずつ周期が違う)
  const g=p.gk?0.3:1;
  h+=V.driftH*g*Math.sin(now*m.f+m.ph); x+=V.driftX*g*Math.sin(now*m.f2+m.ph2);
  // ② 走り込み(攻めているとき。FW と攻撃的な選手ほど、スキルの向きで増減)
  if(m.run&&now-m.run.t0>m.run.dur)m.run=null;
  if(!p.gk&&att&&!m.run){
    const grp=GROUP_OF[p.role], base=grp==="FW"?1:grp==="MF"?0.45:(p.role==="SB"?0.35:0.05);
    const tend=base*(RUN_SKILL[p.c.skill]||1);
    if(Math.random()<dt/1000*V.runRate*tend)startRun(m,now,V,grp==="DF"?0.8:1);
  }
  if(m.run){ const s=clamp((now-m.run.t0)/m.run.dur,0,1), a=Math.sin(Math.PI*s);
    h+=m.run.dh*a; x+=m.run.dx*a; }
  // ③ 寄せ(守っているとき、ボールに近い人だけ)
  if(press){ h+=(press[0]-h)*V.press; x+=(press[1]-x)*V.press; }
  return [clamp(h,0.02,0.98),clamp(x,2,98)];
}

/* ---- ボールの軌道(→docs/29 §29.3)。プレーの種類で描き分ける ----
 * ground … 地を這うパス(出だしが速く減速)/ through … スルーパス(速く転がり、受け手が後ろから走り込む)/ lowx … グラウンダーのクロス
 * loft … 高い放物線 / drive … 低めの弾道 / shot … 速い直線と残像 / cross … セットプレーの高いボール */
const BALL_KIND={ gkShort:"ground", cbVert:"ground", dmSpray:"ground", cfLay:"ground", cmThru:"through", omLast:"through",
  gkLong:"loft", cbFeed:"loft", dmSwitch:"drive", cmWide:"drive", sbEarly:"drive", gkThrow:"drive", smCross:"cross?", wgCross:"cross?" };
function ballKind(ev){
  if(ev.type==="shot")return "shot";
  if(ev.type==="cross")return "loft";
  if(ev.type==="carry"||ev.type==="kickoff")return "carry";
  let k=BALL_KIND[ev.ch]||"ground";
  if(k==="cross?")k=(hashStr("x:"+ev.by+":"+ev.min+":"+(ev.ix||0))%3===0)?"lowx":"loft";   // クロスは3回に1回グラウンダー
  return k;
}
/** t(0〜1)でのボールの位置と高さ。a・b は画面の [u, v] */
function ballPath(ev,t,a,b){
  const k=ballKind(ev), far=Math.hypot(b[0]-a[0],b[1]-a[1]);
  const at=q=>[lerp(a[0],b[0],q),lerp(a[1],b[1],q)];
  switch(k){
    case "ground":  { const q=1-Math.pow(1-t,2.2); return { pos:at(q), lift:0, k }; }               // 転がって減速
    case "through": { const q=1-Math.pow(1-t,1.6); return { pos:at(q), lift:0, k, trail:t<0.7 }; }
    case "lowx":    { const q=1-Math.pow(1-t,1.8); return { pos:at(q), lift:far*0.04*Math.sin(Math.PI*q), k, trail:t<0.8 }; }
    case "loft":    { const q=t; let lift=Math.sin(Math.PI*Math.min(1,q/0.9))*far*0.9; if(q>0.9)lift=Math.sin(Math.PI*(q-0.9)/0.1)*far*0.08; return { pos:at(Math.min(1,q*1.02)), lift:Math.max(0,lift), k }; }
    case "drive":   { const q=t; return { pos:at(q), lift:Math.sin(Math.PI*q)*far*0.42, k }; }
    case "shot":    { const q=Math.min(1,t*1.15); return { pos:at(q), lift:Math.sin(Math.PI*q)*far*0.12, k, trail:true }; }
    default:        { const q=ease(t); return { pos:at(q), lift:0, k }; }
  }
}
/** 速いボールの残像(シュート・スルーパス・グラウンダーのクロス) */
function drawTrail(c,unit){
  const T=RV.trail||[]; if(T.length<2)return;
  for(let i=0;i<T.length-1;i++){ const [u,v,l]=T[i], [x,y,s]=proj(u,v), r=Math.max(2,unit*0.16*s)*(0.5+i/T.length*0.4);
    c.fillStyle="rgba(255,255,255,"+(0.08+i/T.length*0.28).toFixed(2)+")"; c.beginPath(); c.arc(x,y-r-l*RV.h*0.6*s,r,0,Math.PI*2); c.fill(); }
}
/**
 * 選手の走り(→docs/29 §29.2)。位置・速度を持ち、目標へ加速して走り、近づくと減速して止まる(最高速はスピードで変わる)。
 * 速度から歩みの位相(ph)・向き(face)を進める。snap … ボールと一緒に動く人(ドリブル)はボールの位置に合わせる
 */
function kinStep(st,goal,p,fast,dt,snap){
  const K=TUNING.view.kin, SX=105, SY=68;
  if(snap){ const nx=goal[0], ny=goal[1], vx=(nx-st.x)*SX/Math.max(1,dt), vy=(ny-st.y)*SY/Math.max(1,dt);
    st.vx=lerp(st.vx,vx,0.5); st.vy=lerp(st.vy,vy,0.5); st.x=nx; st.y=ny; }
  else{
    const dx=(goal[0]-st.x)*SX, dy=(goal[1]-st.y)*SY, d=Math.hypot(dx,dy);
    const vmax=(K.v0+(p.c.spd||10)*K.vSpd)*(fast?K.ball:1), acc=K.acc*(fast?1.6:1), dec=K.dec*(fast?1.6:1);
    const want=d>0.05?Math.min(vmax,Math.sqrt(2*dec*d)):0;
    const tx=d>0.05?dx/d*want:0, ty=d>0.05?dy/d*want:0;
    let ax=tx-st.vx, ay=ty-st.vy; const al=Math.hypot(ax,ay), lim=(want<Math.hypot(st.vx,st.vy)?dec:acc)*dt;
    if(al>lim){ ax*=lim/al; ay*=lim/al; }
    st.vx+=ax; st.vy+=ay;
    st.x+=st.vx*dt/SX; st.y+=st.vy*dt/SY;
  }
  const sp=Math.hypot(st.vx,st.vy);
  st.ph=(st.ph||0)+sp*dt/K.stride*Math.PI;
  st.sp=sp/((K.v0+(p.c.spd||10)*K.vSpd));
  if(Math.abs(st.vx)>K.face)st.face=st.vx>0?1:-1;
  return st;
}

/** いま映すべき場面を G(main.js の状態)から組み立てて描く */
function drawFrame(G,dt){
  const c=RV.ctx, M=G.M;
  if(!M||!RV.w)return;
  drawPitch();

  // ---- ボールの位置 ----
  const ev=G.cur;
  const pin=new Map();                       // この場面で位置が決まっている選手
  let target, lift=0, holderId=null, snapId=null, trail=false;
  RV.kick=null;
  if(ev&&ev.from){
    const t=clamp(G.curT/ev.dur,0,1);
    const a=scrOf(ev.side,ev.from[0],ev.from[1]), b=scrOf(ev.side,ev.dest[0],ev.dest[1]);
    const B=ballPath(ev,t,a,b); target=B.pos; lift=B.lift; trail=!!B.trail;
    if(B.k==="carry"){   // ドリブル: ボールは足元の少し前で、小さくタッチしながら運ぶ
      const du=b[0]-a[0], dv=b[1]-a[1], dl=Math.hypot(du,dv)||1, tp=0.5+0.5*Math.sin(t*Math.PI*6);
      pin.set(ev.by,target); holderId=ev.by; snapId=ev.by;
      target=[target[0]+du/dl*0.012*tp,target[1]+dv/dl*0.012*tp];
    }
    RV.ball=target;
    if(B.k!=="carry"){
      pin.set(ev.by,a);
      if(t<0.22)RV.kick={ id:ev.by, dir:Math.sign(b[0]-a[0])||1 };   // 蹴る瞬間の踏み込み
      if(ev.to&&ev.ok){
        // スルーパスは受け手が後ろから走り込んで追いつく
        if(B.k==="through"){ const back=[b[0]-(b[0]-a[0])*0.28,b[1]+(b[1]>0.5?-0.06:0.06)]; pin.set(ev.to,[lerp(back[0],b[0],Math.min(1,t*1.1)),lerp(back[1],b[1],Math.min(1,t*1.1))]); }
        else pin.set(ev.to,b);
      }
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
  }
else{
    const k=1-Math.exp(-dt/200);
    RV.ball=[lerp(RV.ball[0],0.5,k),lerp(RV.ball[1],0.5,k)];
  }
  // 速いボールの残像
  RV.trail=RV.trail||[];
  if(trail){ RV.trail.push([RV.ball[0],RV.ball[1],lift]); if(RV.trail.length>6)RV.trail.shift(); } else RV.trail.length=0;

  // ---- 選手の位置(見た目だけ。1人ずつ独立して動く →docs/07 §7.15) ----
  const VM=TUNING.view.mv, now=(RV.t=(RV.t||0)+dt), seen=new Set(), list=[];
  const atkSide=ev&&ev.side?ev.side:M.ball?M.ball.side:null;
  // パスが通ったら、味方の誰か(FW・MF)が走り出す(イベントで動きを起こす)
  if(ev&&ev!==RV.lastEv){
    RV.lastEv=ev;
    if(ev.type==="pass"&&ev.ok&&Math.random()<VM.evRun){
      const T=teamOf(M,ev.side), c=T.players.filter(p=>!p.gk&&p.id!==ev.by&&p.id!==ev.to&&GROUP_OF[p.role]!=="DF");
      const q=c[Math.floor(Math.random()*c.length)]; if(q)startRun(mvOf(q),now,VM,1.2);
    }
  }
  // ボールの位置の履歴(選手ごとに遅れて反応するため)
  // 隊列はボールのある区域に合わせて動く(なめらかにした位置を履歴に積む)。寄せる人は今のボールを見る
  const ks=1-Math.exp(-dt/VM.shapeTau); RV.sb=RV.sb||RV.ball.slice();
  RV.sb[0]=lerp(RV.sb[0],RV.ball[0],ks); RV.sb[1]=lerp(RV.sb[1],RV.ball[1],ks);
  RV.hist=RV.hist||[]; RV.hist.push([now,RV.sb[0],RV.sb[1]]);
  while(RV.hist.length>2&&now-RV.hist[0][0]>1500)RV.hist.shift();
  const ballAt=d=>{ const H=RV.hist; for(let i=H.length-1;i>=0;i--)if(now-H[i][0]>=d)return H[i]; return H[0]; };
  for(const T of [M.home,M.away]){
    const bu=RV.ball[0], bh=T.side==="H"?bu:1-bu;
    const bx=(T.side==="H"?RV.ball[1]:1-RV.ball[1])*100, att=atkSide===T.side;
    // 守っているときにボールへ寄せる人(ボールに近い順に pressN 人。GK は除く)
    const pr=att?new Set():new Set(T.players.filter(p=>!p.gk&&!pin.has(p.id))
      .map(p=>({ p, d:Math.hypot(blockH(p,bh)-bh,(p.x-bx)/100) })).sort((a,b)=>a.d-b.d).slice(0,VM.pressN).map(o=>o.p.id));
    for(const p of T.players){
      seen.add(p.id);
      let goal=pin.get(p.id);
      if(!goal){ const bd=ballAt(mvOf(p).delay), dh=T.side==="H"?bd[1]:1-bd[1], dx=(T.side==="H"?bd[2]:1-bd[2])*100;
        const q=offBallGoal(p,dh,dx,att,pr.has(p.id)?[bh,bx]:null,now,dt); goal=scrOf(T.side,q[0],q[1]); }
      let st=RV.vis.get(p.id);
      if(!st||Array.isArray(st)){ st={ x:goal[0], y:goal[1], vx:0, vy:0, ph:Math.random()*6, face:T.side==="H"?1:-1 }; RV.vis.set(p.id,st); }
      // 走る・止まる: 速度と加速度で目標へ(スピードが高いほど速い)。ボールに絡む人(pin)は速く、ドリブルする人はボールに合わせる(→docs/29 §29.2)
      kinStep(st,goal,p,pin.has(p.id),Math.min(dt,60),p.id===snapId);
      if(Math.abs(st.vx)*105<0.004){ const bf=RV.ball[0]>st.x?1:-1; if(st.sp<0.15)st.face=bf; }   // 止まっているときはボールの方を向く
      list.push({ p, T, u:st.x, v:st.y, st });
    }
  }
  for(const id of RV.vis.keys())if(!seen.has(id))RV.vis.delete(id);

  // ---- 奥から順に: ゴール・選手・ボール ----
  const V=TUNING.view, unit=RV.h*V.manH;    // 手前での選手の高さ
  const items=list.map(o=>({ v:o.v, draw:()=>drawMan(c,o,unit,holderId) }));
  items.push({ v:RV.ball[1]+0.001, draw:()=>{ drawTrail(c,unit); drawBall(c,unit,lift); } });
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
    if(p.kp)kpRing(c,x,y,w*0.72,h*0.16);   // KP は足元の輪の外側に金の輪(2重の輪。→docs/14 §14.161)
    // 走り(→docs/29 §29.2): 速さに合わせて上下に揺れ・前に傾く。進む向き(止まっていればボールの方)を向く。蹴る瞬間は踏み込む
    const K=TUNING.view.kin, st=o.st||{ sp:0, ph:0, face:T.side==="H"?1:-1 }, r=Math.min(1.2,st.sp||0);
    const kick=RV.kick&&RV.kick.id===p.id, face=kick?RV.kick.dir:(st.face||1);
    const bob=Math.abs(Math.sin(st.ph||0))*ih*K.bob*Math.min(1,r), lean=(kick?14:K.lean*Math.min(1,r))*face*Math.PI/180;
    const sq=1-0.035*Math.min(1,r)*Math.cos(2*(st.ph||0));
    c.save(); c.translate(x,y); c.rotate(lean); c.scale(face,sq);
    c.drawImage(im,-iw/2,-ih*0.97-bob/sq,iw,ih); c.restore();
    const tw=Math.max(10,h*0.5), th=Math.max(7,h*0.32);
    c.fillStyle=col; c.fillRect(x-tw/2,y+2,tw,th);
    c.font="800 "+Math.max(6,Math.round(th*0.85))+"px system-ui,sans-serif"; c.textAlign="center"; c.textBaseline="middle";
    noText(c,p,x,y+2+th/2+0.5);
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
  c.font="800 "+Math.max(7,Math.round(h*0.5))+"px system-ui,sans-serif";
  c.textAlign="center"; c.textBaseline="middle"; noText(c,p,x,top+h*0.55);
  if(p.kp)kpRing(c,x,y,w*0.62,h*0.12);
  if(p.stam<TUNING.stam.tiredAt){ c.fillStyle="#ff7a6b"; c.fillRect(x-w/2,y+2,w*p.stam/TUNING.stam.tiredAt,2); }
  if(p.inj){ c.fillStyle="#c8102e"; c.fillRect(x+w/2-w*0.3,top-w*0.3,w*0.3,w*0.3); }
}
/**
 * KP の金の光(足元の輪 rx・ry の外側。KP の札と同じ金。→docs/14 §14.161・§14.162)。
 * 足元にぼんやり光る金の輪を置き、そこから光の輪が外へ広がりながら消える(2つの波を交互に。毎フレーム描く)
 */
function kpRing(c,x,y,rx,ry){
  const k=TUNING.view.kpRing, t=(performance.now()%k.ms)/k.ms;
  const ring=(e,lw,col)=>{ c.lineWidth=lw; c.strokeStyle=col; c.beginPath(); c.ellipse(x,y,rx+k.gap+e,ry+(k.gap+e)*0.45,0,0,Math.PI*2); c.stroke(); };
  c.save(); c.shadowColor="rgba(255,214,110,.95)"; c.shadowBlur=k.blur;
  ring(0,k.w,"rgba(240,206,120,.85)");                                   // 足元の光る輪
  for(const off of [0,0.5]){ const u=(t+off)%1;                          // 外へ広がる光の輪
    c.globalAlpha=(1-u)*(1-u)*0.95; ring(u*k.spread,k.w*(1.3-u*0.8),"#ffe08a"); }
  c.restore();
}
/** 背番号。警告(イエロー)を受けた選手は黄色の字(読めるように濃い縁取り。→docs/14 §14.161) */
function noText(c,p,x,y){
  if(p.yc){ c.lineWidth=2; c.strokeStyle="rgba(0,0,0,.75)"; c.strokeText(p.c.no,x,y); c.fillStyle="#ffd84a"; }
  else c.fillStyle="#fff";
  c.fillText(p.c.no,x,y);
}
/** ボール。影は地面に、球は浮いた高さに */
function drawBall(c,unit,lift){
  const [x,y,s]=proj(RV.ball[0],RV.ball[1]), r=Math.max(2.2,unit*0.16*s), up=lift*RV.h*0.6*s;
  c.fillStyle="rgba(0,0,0,.35)"; c.beginPath(); c.ellipse(x,y,r*1.1,r*0.45,0,0,Math.PI*2); c.fill();
  c.fillStyle="#fff"; c.beginPath(); c.arc(x,y-r-up,r,0,Math.PI*2); c.fill();
  c.lineWidth=0.8; c.strokeStyle="#222"; c.stroke();
}
