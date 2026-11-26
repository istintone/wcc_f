/* =========================================================================
   wcc_f — 試合エンジン(DOM非依存。Node でそのまま回せる)
   柱(→docs/02 §2.1):
     ・勝敗に関わるロジックが正で、見かけはその結果に追従する
     ・1ステップ(=1アクション)解いてから描画に渡す。描画は読むだけ
     ・指示(カード移動・交代・KP・監督の指示)は「次のステップの入力」として効く
     ・ステップごとに独立したたね。指示を出しても以降の乱数列がずれない
   ========================================================================= */

function mulberry32(a){
  return function(){
    a|=0; a=a+0x6D2B79F5|0;
    let t=Math.imul(a^a>>>15,1|a);
    t=t+Math.imul(t^t>>>7,61|t)^t;
    return ((t^t>>>14)>>>0)/4294967296;
  };
}
function hashStr(s){
  let h=2166136261;
  for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); }
  return h>>>0;
}
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const rr=rng=>TUNING.rng.min+rng()*TUNING.rng.span;
const r2=v=>Math.round(v*100)/100;

/* ---------- 位置 → 役割 → 適性 ---------- */

/** 位置 → 細かいポジション(→docs/17)。x が小さいほど左(自陣から見て) */
function posAt(h,x){
  const Z=TUNING.zone, L=x<Z.wide, R=x>100-Z.wide;
  if(h<Z.dfH)return L?"LSB":R?"RSB":"CB";
  if(h>=Z.fwH)return L?"LWG":R?"RWG":h>=Z.cfH?"CF":"ST";
  if(L)return "LMF"; if(R)return "RMF";
  return h<Z.dmfH?"DMF":h>=Z.omfH?"OMF":"CMF";
}
/** 位置 → 試合の動きを決める役割(左右を束ねる。ST は CF) */
function roleAt(h,x){ return baseRole(posAt(h,x)); }
/**
 * 役割の適性。role は細かいポジションでも束ねた役割でもよい。
 * 得意な役割 = own / 同じポジション = group(反対側・CF⇔ST もここ。両側が得意な選手は両方を得意な役割に持つ)/ 隣 = near / DF⇔FW = far
 */
function aptOf(card,role){
  const A=TUNING.apt;
  if(role==="GK"||card.pos==="GK")return (role==="GK"&&card.pos==="GK")?A.own:A.gk;
  if(card.roles.includes(role))return A.own;
  const b=baseRole(role);
  if(role===b&&card.roles.some(r=>baseRole(r)===b))return A.own;   // 束ねた役割で聞かれたとき(左右は問わない)
  const g=GROUP_OF[role];
  if(g===card.pos)return A.group;
  const o={ DF:0, MF:1, FW:2 };
  return Math.abs(o[g]-o[card.pos])===1?A.near:A.far;
}

/* ---------- 選手・チーム ---------- */

/** カードを置ける範囲。GK はペナルティエリアの中、ほかは盤面の内側 */
function clampPos(gk,h,x){
  const B=gk?TUNING.gk:TUNING.board;
  return { h:clamp(h,B.minH,B.maxH), x:clamp(x,B.minX,B.maxX) };
}
/** GK がどれだけ前に出ているか(0=定位置 〜 1=エリアの端) */
/** 指示の状態。十字の5つ + キーパー(→docs/04 §4.9b)。side・line は中から使う派生の値 */
function insOf(o){
  const n={ center:!!o.center, left:!!o.left, right:!!o.right, counter:!!o.counter, press:!!o.press, keeper:!!o.keeper };
  n.side=n.left&&!n.right?-1:n.right&&!n.left?1:0;
  n.line=n.counter?-1:0;
  return n;
}
/** 指示が手の行き先に掛ける重み(中央突破・サイド攻撃) */
function insLane(ins){
  const I=TUNING.ins, w={ in:1, out:1, box:1, switch:1, same:1, any:1 };
  const mul=o=>{ for(const k in o)w[k]*=o[k]; };
  if(ins.center)mul(I.center);
  if(ins.left&&ins.right)mul(I.both); else if(ins.left||ins.right)mul(I.side);
  return w;
}
function gkOut(gk){
  const K=TUNING.gk;
  return gk&&gk.gk?clamp((gk.h+(gk.up||0)-K.baseH)/(K.maxH-K.baseH),0,1):0;   // up = キーパーの指示で上げた分
}
function placePlayer(p,h,x){
  const q=clampPos(p.gk,h,x);
  p.h=q.h; p.x=q.x;
  p.pos=p.gk?"GK":posAt(p.h,p.x);            // 細かいポジション(表示と適性)
  p.role=baseRole(p.pos);
  p.apt=aptOf(p.c,p.pos);
}
/** 効果の入れ物。数値は倍率(1=何も無い)、cov と range だけ加算 */
const FX0=()=>({ chs:[], defs:[], shot:1, mid:1, aerial:1, fk:1, ck:1, pkK:1, blk:1, gk:1, pk:1,
  sweep:1, lob:1, sta:1, all:1, recv:1, recvDeep:1, zone:1, chase:1, assist:1, urge:1, vsKp:1,
  cov:0, range:0 });
function mkPlayer(card,h,x,gk){
  // fat0 = 練習の疲れ。試合をそのぶん消耗した状態で始める(→docs/05 §5.3)
  const f0=card.fat0||0;
  const p={ c:card, id:card.id, gk:!!gk, h:0, x:0, role:"", apt:1, fat:f0, stam:1-f0, yc:0,
    kp:false, fx:FX0(), fxName:undefined, lo:0, stayK:1,
    st:{ act:0, pass:0, passOk:0, duelW:0, duelL:0, shots:0, goals:0 } };
  placePlayer(p,h,x);
  p.b={ h:p.h, x:p.x };                      // 監督が戻ってくる基準の位置(相手監督だけが使う)
  return p;
}
/** 能力に掛かる修正は必ずここへ足す(全判定の単一集約点) */
function eff(p,k){
  return p.c[k]*p.apt*(1-fatOf(p.stam)*TUNING.stam.wear[k])*p.fx.all*(p.c.cond||1)*(p.inj?TUNING.inj.k:1);
}
/** 消耗が能力に響く量(0〜fatMax)。減り始めは軽く、半分を切ると急に重くなる */
function fatOf(stam){
  const S=TUNING.stam;
  return Math.min(S.fatMax,Math.pow(1-stam,S.fatPow)*S.fatK);
}
/** 相手監督の性格。クラブごとに決まっている(試合ごとに変わらない) */
const COACH_PERS=["steady","quick","stubborn","attack","careful"];
const persOfClub=id=>COACH_PERS[hashStr("coach:"+id)%COACH_PERS.length];
function makeTeamDef(teamId,cpu){
  const t=TEAMS[teamId], f=FORMS[t.form];
  // 相手クラブは育成しない代わりに、強さの段に応じた成長グラフを初めから持つ。上の段は既定の KP の軸が金色(→docs/15 §15.7)
  const tg=t.tier?TUNING.club.tierGraph[t.tier-1]:0, st0=t.kp&&CARDS[t.kp]?styleOfCard(CARDS[t.kp]):null;
  const graph=tg?{ O:tg, D:tg, R:tg, C:tg, S:tg, P:tg, gold:{} }:null;
  if(graph&&st0&&t.tier>=TUNING.club.tierGold)for(const a of styleAxes(st0)){ graph[a]=TUNING.grow.graph.max; graph.gold[a]=true; }
  return { id:t.id, name:t.name, short:t.short, color:t.color, cpu:!!cpu,
    kp:t.kp||null, links:t.links||[],
    graph, setplay:0,
    rareOpp:cpu&&(t.tier||0)>=TUNING.rare.oppTier,     // 相手の KP の「特殊能力 ★5 相当」(強さの段5。→docs/11 §11.2・docs/21 §21.5)
    pers:t.pers||persOfClub(t.id),                   // 相手監督の性格(→docs/13 §13.5)
    xi:t.xi.map((id,i)=>({ card:CARDS[id], h:f[i][0], x:f[i][1] })),
    bench:t.bench.map(id=>CARDS[id]) };
}
function buildTeam(def,side){
  const T={ side, id:def.id, name:def.name, short:def.short, color:def.color, cpu:!!def.cpu,
    players:def.xi.map((s,i)=>mkPlayer(s.card,s.h,s.x,i===0)),
    bench:def.bench.slice(), subs:0, score:0, shootOrder:0, posture:"normal",
    kp:null, kp0:def.kp||null, links:def.links||[], rareOpp:!!def.rareOpp, rare:null,
    roles:Object.assign({ cap:null, pk:null, fk:null, ck:null },def.roles||{}),
    pers:def.pers||"steady", shape:"none", tacSub:false, aim:{ side:0, counter:false }, graph:def.graph||null, setplay:def.setplay||0,
    ins:insOf({}), injK:def.injK!=null?def.injK:1, mab:def.mab||{},
    style:null, rank:null, axis:0, rk:0, rk0:0, fx:{}, linkSum:0, lineOff:0,
    st:{ steps:0, shots:0, onT:0, pass:0, passOk:0,
      fouls:0, yc:0, rc:0, ck:0, fk:0, pk:0, off:0 } };
  if(def.kp)setKp(T,def.kp);
  // 相手はいちばん適性の高い選手を自動でキャプテンにする(プレイヤーは任命したときだけ)
  if(def.cpu&&!T.roles.cap){ const b=T.players.slice().sort((a,b)=>capApt(b.c)-capApt(a.c)||b.c.age-a.c.age)[0]; if(b)T.roles.cap=b.id; }
  return T;
}
const outfield=T=>T.players.filter(p=>!p.gk);
const gkOf=T=>T.players.find(p=>p.gk)||T.players[0];
const playerOf=(T,id)=>T.players.find(p=>p.id===id)||null;

/* ---------- スキル・スタイル・連携(→docs/04) ---------- */

const skOf=p=>p&&p.c.skill?SKILLS[p.c.skill]:null;
const styleOfCard=c=>{ const s=c&&c.skill?SKILLS[c.skill]:null; return s?STYLES[s.style]||null:null; };
/** レアKP の表の行(カードが WORLD CLASS 以上で表にあるとき)。発動するかは rareOf */
const rareOfCard=c=>c&&(c.rar==="K"||c.rar==="L")&&typeof RARE_KP!=="undefined"&&RARE_KP[c.id]||null;
/** その選手のレアKP が発動しているか(→docs/11 §11.2): KP で、★5(相手は強さの段が oppTier 以上) */
function rareOf(p,T){
  const R=p&&p.kp?rareOfCard(p.c):null, st=R?styleOfCard(p.c):null;
  // 発動: KP の特殊能力が ★5 **かつ** そのスタイルのランクが G(必要な軸がすべて金色。→docs/15 §15.6)。
  // 相手も同じ条件(対称。→docs/21 §21.5): 育成の無い相手は、強さの段5か Premier Div のリーグ戦(育成レベル最大)を「★5 相当」とみなす
  return R&&((p.c.ss||0)>=5||T.rareOpp)&&st&&styleRank(T,st,ssOfP(p))==="G"?R:null;
}
/** CP適性(キャプテンシー)0=C 〜 3=S。スキル(キャプテン・リーダー)と年齢から(→docs/12 §12.4) */
const CAP_SKILL={ captain:3, leader:3, libero:1, stopper:1, sweeper:1, cover:1, dynamo:1, maker:1 };
const capApt=c=>c?Math.min(3,(CAP_SKILL[c.skill]||0)+(c.age>=30?1:0)):0;
const CAP_MARK=["C","B","A","S"];
/** 任命: 指名した選手がピッチにいればその人。キャプテンは相手(CPU)だけ自動で決める */
function rolePlayer(T,kind){ const id=T.roles&&T.roles[kind]; return id?playerOf(T,id):null; }
function setKp(T,id){
  if(!T.players.some(p=>p.id===id))return false;
  for(const p of T.players)p.kp=p.id===id;
  T.kp=id;
  return true;
}
/** バフ・個人スタイルを効果の入れ物へ足す。k はランクの倍率(バフは 1) */
function addFx(fx,src,k){
  if(!src)return;
  for(const key in src){
    const v=src[key];
    if(key==="ch"||key==="w"||key==="s"||key==="on"||key==="team")continue;
    if(key==="def"){ fx.defs.push({ on:src.on, k:1+(v-1)*k }); continue; }
    if(key==="cov"||key==="range"){ fx[key]+=v*k; continue; }
    fx[key]*=Math.max(0,1+(v-1)*k);
  }
  if(src.ch)fx.chs.push({ ids:src.ch, w:1+((src.w||1)-1)*k, s:1+((src.s||1)-1)*k });
}
const chW=(p,ch)=>{ let v=1; for(const e of p.fx.chs)if(e.ids.includes(ch.id))v*=e.w; return v; };
const chS=(p,ch)=>{ let v=1; for(const e of p.fx.chs)if(e.ids.includes(ch.id))v*=e.s; return v; };
const defK=(p,kind)=>{ let v=1; for(const e of p.fx.defs)if(e.on===kind)v*=e.k; return v; };

function linkLv(T,a,b){
  for(const l of T.links)if((l[0]===a&&l[1]===b)||(l[0]===b&&l[1]===a))return l[2];
  return 0;
}
/** 戦力の6軸に使う能力(レーダーの表示用。ランクには使わない) */
const AXIS_STAT={ O:c=>c.off, D:c=>c.def, R:c=>c.tec, S:c=>c.spd, P:c=>c.pow,
  C:c=>(c.def+c.spd+c.sta)/3 };
/** スタイルに必要な軸の値(2つなら低いほう)。成長グラフを持たないチームは null */
function styleAxisVal(T,st){
  const g=T.graph; if(!g)return null;
  return Math.min(...styleAxes(st).map(a=>g[a]||0));
}
/**
 * スタイルのランク B / A / S / G(→docs/15 §15.5)。**チームの成長グラフだけで決まる**。
 * G = 必要な軸がすべて金色。成長グラフを持たないチームは TUNING.rank.none
 */
/**
 * KP のランク。グラフ(スタイルの軸)で決まるランクに、KP の選手の特殊能力の★(ss)で決まる上限をかける(→docs/14 §14.184)。
 * ss を渡さない(育成の★を持たない CPU の相手など)ときは、グラフだけで決める
 */
const RANK_ORD=["C","B","A","S","G"];
function styleRank(T,st,ss){
  const g=T.graph, R=TUNING.rank;
  let r;
  if(!g)r=R.none;
  else if(styleAxes(st).every(a=>g.gold&&g.gold[a]))r="G";
  else{ const v=styleAxisVal(T,st); r=v>=R.th[1]?"S":v>=R.th[0]?"A":"B"; }
  if(ss!=null){ const cap=R.ssCap[Math.max(0,Math.min(5,ss|0))]; if(RANK_ORD.indexOf(cap)<RANK_ORD.indexOf(r))r=cap; }
  return r;
}
/** 試合の中の選手の特殊能力の★(育成した自分の選手だけ。CPU は null = 上限なし) */
const ssOfP=p=>p&&p.c&&p.c.ss!=null?p.c.ss:null;
/** 全体スタイルの効果。**得るものにだけランクが掛かり、失うものは満額** */
function teamFx(st,rk){
  const out={};
  if(!st||st.scope!=="team")return out;
  const sc=(key,v)=>key==="push"?v*rk:typeof v==="number"?Math.max(0,1+(v-1)*rk):v;
  for(const key in st.gain){
    const v=st.gain[key];
    if(v&&typeof v==="object"){ out[key]={}; for(const k in v)out[key][k]=sc(key,v[k]); }
    else out[key]=sc(key,v);
  }
  for(const key in st.cost)out[key]=st.cost[key];
  return out;
}
/**
 * スタイル・ランク・各選手の効果を組み直す。毎ステップの頭で呼ぶ
 * (KP・交代・退場・カード移動・得点・時間のどれでも変わりうるため)。
 */
function refreshFx(M,min){
  const teams=[M.home,M.away], Y=TUNING.style;
  for(const T of teams){
    const on=new Set(T.players.map(p=>p.id));
    T.linkSum=T.links.reduce((s,l)=>s+(on.has(l[0])&&on.has(l[1])?l[2]:0),0);
    const kp=T.players.find(p=>p.kp)||null, st=kp?styleOfCard(kp.c):null;
    if(!kp)T.kp=null;
    T.style=st?SKILLS[kp.c.skill].style:null;
    T.rare=kp?rareOf(kp,T):null;                 // レアKP(→docs/11)
    T.axis=st?styleAxisVal(T,st)||0:0;
    T.rank=st?styleRank(T,st,ssOfP(kp)):null;
    T.rk0=st?TUNING.rank.k[T.rank]:0;
  }
  for(const T of teams){
    const D=otherOf(M,T), st=T.style?STYLES[T.style]:null, ds=D.style?STYLES[D.style]:null;
    // 相手のアンチキープレイヤーは、こちらのスタイルの効きを落とす
    T.rk=T.rk0*(ds&&ds.scope==="team"&&ds.gain.antiRank!=null?Math.max(0,1+(ds.gain.antiRank-1)*D.rk0):1);
    if(T.mab.leader)T.rk*=1+T.mab.leader;          // 監督能力: リーダーシップ
    T.fx=teamFx(st,T.rk);
    const lineOff=T.lineOff=T.ins.line*TUNING.ins.line+(T.fx.push||0);   // カウンターは隊列を下げる
    T.lane=insLane(T.ins);
    const late=T.fx.late&&(min>=Y.lateMin||T.score<D.score)?T.fx.late:1;
    const solo=st&&st.scope==="solo";
    const kp=T.players.find(p=>p.kp)||null;
    const cp=rolePlayer(T,"cap"), ca=cp?capApt(cp.c):0, CP=TUNING.cap, behind=T.score<D.score;   // キャプテン(→docs/12)
    for(const p of T.players){
      const fx=FX0(), sk=skOf(p);
      const rare=p.kp?T.rare:null, mv=rare&&rare.mv?RARE_MOVES[rare.mv]:null;
      addFx(fx,sk&&sk.buff,(p.c.buffK||1)*(rare?TUNING.rare.buffK:1));   // 特殊能力の★でバフが強まる。レアKP はさらに
      if(mv&&mv.fx)addFx(fx,mv.fx,1);
      p.mv=mv?rare.mv:null;
      if(T.setplay){ fx.fk*=1+T.setplay; fx.ck*=1+T.setplay; fx.pkK*=1+T.setplay; }
      if(p.kp){ fx.recv*=TUNING.kp.recv; if(solo)addFx(fx,st.fx,T.rk); }
      if(solo&&st.fx.team&&kp&&p!==kp){        // フォアザチーム: KP と線で繋がる味方
        const lv=linkLv(T,kp.id,p.id);
        if(lv)fx.all*=1+st.fx.team*lv*T.rk;
      }
      fx.all*=late;
      if(cp){ fx.sta*=1-CP.sta[ca]; if(behind)fx.all*=1+CP.back[ca]; }
      // 監督能力(→docs/10 §10.2 C)。軽い上積みだけ
      const B=T.mab, g=GROUP_OF[p.role], mid=p.x>=30&&p.x<=70;
      if(B.center&&mid&&(g==="FW"||g==="MF"))fx.all*=1+B.center;
      if(B.side&&!mid&&!p.gk)fx.all*=1+B.side;
      if(B.post&&g==="FW"){ fx.recv*=1+B.post; fx.aerial*=1+B.post; }
      if(B.duel){ fx.blk*=1+B.duel; fx.chase*=1+B.duel; }
      if(B.hotline)fx.assist*=1+B.hotline;
      if(B.dfc&&g==="DF")fx.all*=1+B.dfc;
      if(B.stamina)fx.sta*=1-B.stamina;
      if(B.morale)fx.all*=1+B.morale;
      if(B.setpiece){ fx.fk*=1+B.setpiece; fx.ck*=1+B.setpiece; fx.pkK*=1+B.setpiece; }
      if(B.saving&&p.gk)fx.gk*=1+B.saving;
      if(B.spurt&&min>=75)fx.all*=1+B.spurt;
      // ハーフタイムの指示(→docs/10 §10.8): 上がる軸は強く、下がる軸は弱く
      // 限定の指示はその役割の選手だけ、消耗の指示は後半のスタミナの減りが stamK 倍(→docs/26 §26.5)
      if(T.ht&&(!T.ht.pos||T.ht.pos.includes(g))){ const H=T.ht, X=TUNING.ht, m=a=>(H.up.includes(a)?1:0)-(H.down.includes(a)?X.downR:0), kA=X.allK*H.k, kO=X.otherK*H.k;
        if(H.stam)fx.sta*=X.stamK;
        if(g==="FW"||g==="MF")fx.all*=1+m("O")*kA*(g==="FW"?1:0.5);
        if(g==="DF")fx.all*=1+m("D")*kA;
        fx.recv*=1+m("R")*kO; fx.chase*=1+m("C")*kO; fx.blk*=1+m("C")*kO; fx.sta*=1-m("S")*kO; fx.aerial*=1+m("P")*kO; }
      if(p.gk){                                 // キーパーの指示: 高い位置で裏を処理する。ループに弱く、疲れる
        const I=TUNING.ins; p.up=T.ins.keeper?I.keeperH:0;
        if(T.ins.keeper){ fx.sweep*=I.keeperSweep; fx.lob*=I.keeperLob; fx.sta*=I.keeperSta; }
      }
      p.fx=fx; p.lo=lineOff;
      p.stayK=T.fx.fwStay!=null&&GROUP_OF[p.role]==="FW"?T.fx.fwStay:1;
      p.fxName=p.kp&&T.rare?T.rare.name:p.kp&&solo?st.name:sk?sk.label:undefined;
    }
  }
}

/* ---------- 幾何 ---------- */

/**
 * 隊列はボールに合わせて全体で動く。bh は**そのチームのフレームで見た**ボールの高さ。
 *   p.lo    … 監督の指示(ラインを上げる/下げる)とスタイル(全員攻撃)によるずれ
 *   p.stayK … 守るときに下がらない割合(ロングカウンターの前線)
 */
function blockH(p,bh){
  if(p.gk)return p.h;
  const d=(bh-0.5)*TUNING.block.shiftK;
  return clamp(p.h+(d<0?d*p.stayK:d)+p.lo,0.04,0.97);
}
const gauss2=(dh,dx,sh,sx)=>Math.exp(-(dh/sh)*(dh/sh)-(dx/sx)*(dx/sx));

function pickW(rng,list,wfn){
  if(!list.length)return null;
  let tot=0; const ws=list.map(p=>{ const w=Math.max(0,wfn(p)); tot+=w; return w; });
  if(tot<=0)return list[Math.floor(rng()*list.length)];
  let r=rng()*tot;
  for(let i=0;i<list.length;i++){ r-=ws[i]; if(r<=0)return list[i]; }
  return list[list.length-1];
}

/**
 * (h,x) は攻撃側フレーム。守備側から見ると (1-h, 100-x) にあたる。
 * 近い守備者ほど対応しやすく、遠ければ圧(prox)が掛からない。
 */
function matchupDefender(rng,h,x,D,ballH){
  // 隊列の位置は**いまボールがある高さ**で決まる(届け先ではない)。
  // だからラインが高いと、裏へのボールに戻りきれない
  const U=TUNING.duel, mh=1-h, mx=100-x, bh=1-ballH;
  // ゴール側に立っている守備者は遠くても間に合い、裏を取られた守備者は近くても届かない
  const bt=U.beaten*(D.fx.beaten||1)*(1+Math.max(0,D.lineOff)*TUNING.ins.lineBeaten);
  const dhOf=q=>{ const d=blockH(q,bh)-mh; return d<0?d*U.goalSide:d*bt; };
  // **飛び出したGKは守備者として数える**(→docs/02 §2.3a)。定位置では関与しない
  const gk=gkOf(D), sw=gkOut(gk)*TUNING.gk.sweep*gk.fx.sweep;
  const geom=q=>gauss2(dhOf(q),(q.x-mx)/100,U.sigH,U.sigX)*(q.gk?sw:1);
  const field=outfield(D), list=sw>0?field.concat(gk):field;
  const p=pickW(rng,list,q=>geom(q)*(1+eff(q,"spd")/STAT_MAX*U.markSpd));
  if(!p)return null;
  let n=0;
  for(const q of field)
    n+=gauss2(dhOf(q),(q.x-mx)/100,U.sigH*U.covSig,U.sigX*U.covSig)*q.stam*(1+q.fx.cov);
  return { p, prox:Math.min(1,geom(p)*(D.fx.pressK||1)),
    cover:1+Math.max(0,n-U.covBase)*U.covK*(D.fx.covK||1) };
}

/** 監督の指示「左/右サイド重視」が受け手に掛ける倍率。左 = x<50 */
function sideW(T,x){
  const s=T.ins.side, I=TUNING.ins;
  if(!s)return 1;
  const d=(x-50)*s;                          // 重視した側なら正
  return d>12?I.sideOn:d<-12?I.sideOff:1;
}
/** パスの受け手。行き先に近い味方ほど選ばれ、深い位置ほど決定力のある選手を探す */
function receiverAt(rng,T,D,tg,self,bh){
  const R=TUNING.recv, A=T.fx, deep=tg.h>TUNING.style.deepH;
  const geom=q=>gauss2(blockH(q,bh)-tg.h,(q.x-tg.x)/100,R.sigH,R.sigX);
  const list=outfield(T).filter(q=>q!==self);
  const p=pickW(rng,list,q=>geom(q)*(1+tg.h*eff(q,"off")/STAT_MAX*R.atk)
    *q.fx.recv*(deep?q.fx.recvDeep:1)*sideW(T,q.x)
    *(A.recvRole&&A.recvRole[q.role]||1)
    *(q.kp?(A.kpRecv||1)*(D.fx.antiRecv!=null?D.fx.antiRecv:1):1));
  if(!p)return null;
  const g=geom(p);
  return { p, q:R.qMin+(1-R.qMin)*Math.min(1,g*1.15),
    h:tg.h+(blockH(p,bh)-tg.h)*R.pull, x:tg.x+(p.x-tg.x)*R.pull };
}

function strayOf(p,h,x){
  const dh=h-blockH(p,h), dx=(x-p.x)/100;
  return Math.sqrt(dh*dh+dx*dx);
}

function pickChannel(rng,p,h,x,T,fast,ctr){
  const C=TUNING.chain, stray=strayOf(p,h,x), A=T.fx, I=TUNING.ins, L=T.lane||{};
  const mv=p.mv&&RARE_MOVES[p.mv], hand=mv&&mv.ch&&mv.roles.includes(p.role)?CHANNELS[p.role].concat([mv.ch]):CHANNELS[p.role];
  return pickW(rng,hand,ch=>{
    let w=eff(p,ch.stat)*chW(p,ch)*(ch===(mv&&mv.ch)?TUNING.rare.mvW:1);
    if(A.lane)w*=A.lane[ch.lane]||1;
    w*=L[ch.lane]||1;                          // 監督の指示(中央突破・サイド攻撃)
    if(T.ins.center&&ch.kind==="carry")w*=I.centerCarry;
    if(ctr&&ch.to)w*=I.counterTo;              // カウンター: 奪った直後は裏へ
    if(A.chW&&A.chW[ch.id])w*=A.chW[ch.id];
    if(A.safe)w*=Math.pow(ch.risk,A.safe);
    if(ch.to){ if(fast&&A.fastTo)w*=A.fastTo; if(A.direct)w*=A.direct; }
    if(ch.kind==="carry"){
      w*=Math.max(C.strayFloor,1-stray/C.strayFull);
      if(h>0.9)w*=C.deepCarry;
    }else w*=1+stray*C.strayPass;
    return w;
  });
}

function ballTarget(rng,h,x,ch,gainK,side){
  const C=TUNING.chain, j=()=>rng()*2-1;
  let nh=ch.gain<0?h+ch.gain:h+ch.gain*(1-h)*C.gainK*(gainK||1)*(1+j()*C.jit);
  if(ch.to)nh=Math.max(nh,ch.to*(1+j()*C.toJit));
  nh=clamp(nh,0.03,0.96);
  let nx;
  switch(ch.lane){
    case "in":     nx=x+(50-x)*0.55; break;
    // 外へ開く手は、サイド重視の指示があればそちらを向く
    case "out":    nx=side?(side<0?12:88):x<50?12:x>50?88:(rng()<0.5?12:88); break;
    case "switch": nx=clamp(100-x,15,85); break;
    case "box":    nx=50; break;
    case "any":    nx=(side?35+side*15:20)+rng()*(side?30:60); break;
    default:       nx=x;
  }
  nx=clamp(nx+j()*C.spread[ch.lane],3,97);
  return { h:nh, x:nx };
}

/* ---------- 時計 ---------- */

/**
 * 試合を作る。opts:
 *   ko  … 同点で終わったら PK 戦で決める(勝ち抜き戦)
 *   agg … 2試合制の第1試合のスコア [ホーム, アウェイ]。合計が同点なら PK 戦
 */
function createMatch(homeDef,awayDef,seed,opts){
  const K=TUNING.clock, rng=mulberry32((seed^hashStr("clock"))>>>0);
  const at=r=>r[0]+Math.floor(rng()*(r[1]-r[0]+1));
  const M={ seed:seed>>>0, ix:0, len1:K.stepsPerHalf+at(K.at1), len2:K.stepsPerHalf+at(K.at2),
    home:buildTeam(homeDef,"H"), away:buildTeam(awayDef,"A"),
    events:[], orders:{ H:[], A:[] },
    phase:"kickoff", koSide:"H", ball:null, set:null, poss:{ side:null, n:0, h0:0.5 },
    opts:opts||{}, pso:null, ht:false, over:false };
  M.irng=mulberry32((seed^hashStr("inj"))>>>0);   // ケガだけの乱数(ほかの判定の並びを変えない)
  refreshFx(M,0);
  return M;
}
const teamOf=(M,side)=>side==="H"?M.home:M.away;
const otherOf=(M,T)=>T===M.home?M.away:M.home;

function timeOf(M,ix){
  const K=TUNING.clock.stepsPerHalf;
  if(ix<M.len1){
    return ix<K?{ half:1, min:Math.floor(ix*45/K)+1, at:false }:{ half:1, min:45, at:true };
  }
  const j=ix-M.len1;
  return j<K?{ half:2, min:45+Math.floor(j*45/K)+1, at:false }:{ half:2, min:90, at:true };
}
function matchMin(M){ return M.ix?timeOf(M,Math.min(M.ix,M.len1+M.len2)-1).min:0; }

/* ---------- 指示 ---------- */

/**
 * 指示を積む。いつ呼んでもよく、次のステップの頭で効く。
 *   { type:"move", id, h, x }        カードを動かす
 *   { type:"sub", out, in }          交代(控えは出る選手の位置を引き継ぐ)
 *   { type:"kp", id }                KP を決める。**そのカードのスキルが引くスタイルが発動する**
 *   { type:"ins", center, left, right, counter, press, keeper } 監督の指示(渡した項目だけ変わる。→docs/04 §4.9b)
 *                                      line: -1 下げる / 0 / +1 上げる
 *                                      side: -1 左(x<50) / 0 / +1 右
 *                                      press: true / false
 *   { type:"shoot" }                 シュートしろ(数ステップ有効)
 */
function orderMatch(M,side,order){
  const q=M.orders[side];
  if(order.type==="move"){
    const i=q.findIndex(o=>o.type==="move"&&o.id===order.id);
    if(i>=0)q.splice(i,1);
  }
  q.push(order);
}
function doSub(M,T,outId,inId,t){
  if(T.subs>=TUNING.squad.subMax)return false;
  const i=T.players.findIndex(p=>p.id===outId), j=T.bench.findIndex(c=>c.id===inId);
  if(i<0||j<0)return false;
  const out=T.players[i], np=mkPlayer(T.bench[j],out.h,out.x,out.gk);
  np.b=out.b; np.b0=out.b0;
  T.players[i]=np; T.bench.splice(j,1); T.subs++;
  if(out.kp)T.kp=null;                       // KP を下げると KP は居なくなる
  if(M.ball&&M.ball.holder===out)M.ball.holder=np;
  if(M.ball&&M.ball.assist===out)M.ball.assist=null;
  M.events.push({ ix:M.ix, min:t.min, half:t.half, side:T.side, type:"sub", out:outId, in:inId, at:!!(t&&t.at) });
  return true;
}
function changeKp(M,T,id,t){
  if(id===T.kp||!setKp(T,id))return false;
  const R=rareOf(playerOf(T,id),T);
  M.events.push({ ix:M.ix, min:t.min, half:t.half, side:T.side, type:"kp", id, rare:R?R.name:undefined });
  return true;
}
function setIns(M,T,o,t){
  const keys=["center","left","right","counter","press","keeper"], cur=T.ins, nx={};
  for(const k of keys)nx[k]=o[k]!=null?!!o[k]:cur[k];
  if(keys.every(k=>nx[k]===cur[k]))return;
  T.ins=insOf(nx);
  M.events.push(Object.assign({ ix:M.ix, min:t.min, half:t.half, side:T.side, type:"ins" },nx));
}
function applyOrders(M,t){
  for(const side of ["H","A"]){
    const T=teamOf(M,side), q=M.orders[side];
    if(T.shootOrder>0)T.shootOrder--;
    for(const o of q){
      if(o.type==="move"){ const p=playerOf(T,o.id); if(p)placePlayer(p,o.h,o.x); }
      else if(o.type==="sub")doSub(M,T,o.out,o.in,t);
      else if(o.type==="shoot")T.shootOrder=TUNING.shot.orderN;      // 自分たちが持っている間、最大 orderN 手(→docs/08 §8.12)
      else if(o.type==="shootCancel")T.shootOrder=0;
      else if(o.type==="htPlan"){ T.ht={ up:o.up||"", down:o.down||"", k:o.k||1, stam:!!o.stam, pos:o.pos||null };   // ハーフタイムの指示(後半のあいだ。→docs/10 §10.8)
        if(T.graph&&!T.ht.pos){ T.graph=Object.assign({},T.graph); for(const a of T.ht.up)T.graph[a]=(T.graph[a]||0)+TUNING.ht.graph*T.ht.k; for(const a of T.ht.down)T.graph[a]=(T.graph[a]||0)-TUNING.ht.graph*TUNING.ht.downR*T.ht.k; }
        M.events.push({ ix:M.ix, min:t.min, half:t.half, side:T.side, type:"htPlan", name:o.name||"" }); }
      else if(o.type==="ins")setIns(M,T,o,t);
      else if(o.type==="kp")changeKp(M,T,o.id,t);
    }
    q.length=0;
  }
}

/* ---------- 相手監督(→docs/02 §2.8) ---------- */

function coachStep(M,t){
  const K=TUNING.coach;
  for(const T of [M.home,M.away])if(T.cpu)coachMove(M,T,t);
  if(M.ix%K.every)return;
  for(const T of [M.home,M.away]){
    const P=K.pers[T.pers]||K.pers.steady;
    if(!T.cpu||T.subs>=TUNING.squad.subMax)continue;
    if(!T.tacSub&&T.posture!=="normal"&&t.min>=K.tacMin+P.sub&&coachTacSub(M,T,t))continue;   // 点差で選ぶ交代(→docs/13)
    if(t.min<K.subMin+P.sub)continue;
    // ケガ人を先に、次に足の止まった選手から替える
    const tired=outfield(T).filter(p=>p.inj||p.stam<K.subAt).sort((a,b)=>(b.inj?1:0)-(a.inj?1:0)||a.stam-b.stam)[0];
    if(!tired)continue;
    const cand=T.bench.filter(c=>c.pos===tired.c.pos)
      .sort((a,b)=>aptOf(b,tired.pos)-aptOf(a,tired.pos))[0];
    if(cand){ const was=tired.kp; doSub(M,T,tired.id,cand.id,t); if(was)coachKp(M,T,T.posture,t); }
  }
}
/**
 * 点差で選ぶ交代(1試合1回。→docs/13 §13.2)。負けていれば守りの選手を FW・攻撃的MF に、勝っていれば前の選手を DF・守備的MF に。
 * 入れた選手は攻め・守りの位置に置く
 */
function coachTacSub(M,T,t){
  const K=TUNING.coach, atk=T.posture==="attack", fo=outfield(T).filter(p=>!p.kp);
  const out=atk?fo.filter(p=>GROUP_OF[p.role]!=="FW").sort((a,b)=>a.b.h-b.b.h).find(p=>GROUP_OF[p.role]==="MF")||null
    :fo.filter(p=>GROUP_OF[p.role]==="FW").sort((a,b)=>a.stam-b.stam)[0]||null;
  if(!out)return false;
  const want=atk?["FW","MF"]:["DF","MF"], cand=want.map(g=>T.bench.find(c=>c.pos===g)).find(Boolean);
  if(!cand)return false;
  T.tacSub=true;
  const b=atk?{ h:K.ppUp, x:out.b.x }:{ h:0.24, x:out.b.x<50?40:60 };
  if(!doSub(M,T,out.id,cand.id,t))return false;
  const np=playerOf(T,cand.id); np.b=b; np.b0=b;
  return true;
}
/**
 * 陣形の変更(→docs/13 §13.3)。基準の位置(p.b)を動かす。元の位置は p.b0 に残し、"none" で戻す
 *   pp     パワープレー: 攻撃的な MF 2人を前線へ、SB と CB を上げる
 *   shield 守備固め: FW を1人残して中盤へ下げ、SMF・WG と DF を下げる
 */
function setShape(M,T,shape,t){
  if(T.shape===shape)return;
  const K=TUNING.coach, fo=outfield(T);
  for(const p of fo){ if(!p.b0)p.b0={ h:p.b.h, x:p.b.x }; p.b={ h:p.b0.h, x:p.b0.x }; }
  const g=p=>GROUP_OF[roleAt(p.b0.h,p.b0.x)], wide=p=>p.b0.x<25||p.b0.x>75;
  if(shape==="pp"){
    fo.filter(p=>g(p)==="MF").sort((a,b)=>b.b0.h-a.b0.h).slice(0,2).forEach(p=>{ p.b={ h:Math.max(p.b0.h,K.ppUp), x:p.b0.x }; });
    fo.filter(p=>g(p)==="DF").forEach(p=>{ p.b={ h:p.b0.h+(wide(p)?K.ppSb:K.ppCb), x:p.b0.x }; });
  }else if(shape==="shield"){
    fo.filter(p=>g(p)==="FW").sort((a,b)=>b.b0.h-a.b0.h).slice(1).forEach(p=>{ p.b={ h:p.b0.h-K.shDown, x:p.b0.x }; });
    fo.filter(p=>g(p)==="MF"&&wide(p)).forEach(p=>{ p.b={ h:p.b0.h-K.shWide, x:p.b0.x }; });
    fo.filter(p=>g(p)==="DF").forEach(p=>{ p.b={ h:p.b0.h-K.shDf, x:p.b0.x }; });
  }
  for(const p of fo){ const q=clampPos(false,p.b.h,p.b.x); p.b={ h:q.h, x:q.x }; }
  T.shape=shape;
  M.events.push({ ix:M.ix, min:t.min, half:t.half, side:T.side, type:"shape", shape });
}
/**
 * 手薄なスペースを数える(→docs/13 §13.4)。プレイヤーの自陣にいる守備の人数を左右で比べ、少ない側を攻める。
 * 敵陣に人数をかけていれば裏を突く(カウンター)
 */
function coachAim(T,D){
  const K=TUNING.coach, own=outfield(D).filter(q=>q.h<0.5);
  // D の左右(D のフレーム)は T から見ると逆。D の x>55 が手薄なら、T の左(x<50)へ
  const r=own.filter(q=>q.x>55).length, l=own.filter(q=>q.x<45).length;
  const side=l-r>=K.sideGap?-1:r-l>=K.sideGap?1:0;
  return { side, counter:outfield(D).filter(q=>q.h>=0.5).length>=K.pushN };
}
/** 適性を落とさない範囲で、基準の位置から狙いへ寄せる */
function safeTarget(p,tgt){
  const a0=aptOf(p.c,posAt(p.b.h,p.b.x));
  for(const f of [1,0.66,0.33]){
    const q=clampPos(false,p.b.h+(tgt.h-p.b.h)*f,p.b.x+(tgt.x-p.b.x)*f);
    if(aptOf(p.c,posAt(q.h,q.x))>=a0)return q;
  }
  return p.b;
}
/**
 * 構えに合う KP を選ぶ。**相手監督にできるのはプレイヤーと同じ「KP を替える」だけ**。
 *   前がかり → 攻撃のスタイルを持つカード / 固める → 守備のスタイルを持つカード /
 *   それ以外 → クラブの既定の KP。候補の中ではランクの高いものを取る
 */
function coachKp(M,T,mode,t){
  const want=mode==="attack"?"atk":mode==="defend"?"def":null;
  let best=null, bs=-1;
  if(!want&&T.kp0&&playerOf(T,T.kp0))best=T.kp0;
  else for(const p of T.players){
    const st=styleOfCard(p.c);
    if(!st||(want&&st.kind!==want))continue;
    const s=TUNING.rank.k[styleRank(T,st,ssOfP(p))]+(p.id===T.kp0?0.01:0)+(st.scope==="team"?0.02:0);
    if(s>bs){ bs=s; best=p.id; }
  }
  if(best)changeKp(M,T,best,t);
}
/**
 * 相手監督の1ステップ。乱数は使わない。
 *   ① 構え   負けていれば前がかり、勝っていれば固める。構えに合わせて**指示と KP**を替える
 *   ② マーク 相手の前線の左右に、最終ラインが付いていく(カードを動かす)
 *   ③ GK     ボールのある側へ寄る
 */
function coachMove(M,T,t){
  const K=TUNING.coach, D=otherOf(M,T), diff=T.score-D.score, P=K.pers[T.pers]||K.pers.steady;
  const mode=(diff<0&&t.min>=K.atkMin+P.atk)||(diff===0&&P.drawAtk!=null&&t.min>=P.drawAtk)?"attack"
    :diff>0&&t.min>=K.defMin+P.def?"defend":"normal";
  if(mode!==T.posture){
    T.posture=mode;
    M.events.push({ ix:M.ix, min:t.min, half:t.half, side:T.side, type:"posture", mode });
    coachKp(M,T,mode,t);
  }
  if(!T.kp)coachKp(M,T,mode,t);
  // 陣形(性格で変えない監督もいる)
  if(P.shape){
    const sh=mode==="attack"&&diff<0&&P.pp!=null&&t.min>=K.ppMin+P.pp?"pp":mode==="defend"&&t.min>=K.shieldMin+P.def?"shield":"none";
    setShape(M,T,sh,t);
  }
  // 手薄なスペース(性格で狙い始める時間が違う。頑固は狙わない)
  if(P.space!=null&&t.min>=P.space&&M.ix%K.spaceEvery===0)T.aim=coachAim(T,D);
  const A=P.space!=null&&t.min>=P.space?T.aim:{ side:0, counter:false };
  setIns(M,T,{ center:mode==="attack", left:A.side<0, right:A.side>0, counter:mode==="defend"||A.counter,
    press:mode==="attack"&&t.min>=K.allOutMin },t);
  const nar=mode==="defend"?K.narrow:1;
  const markX=new Map();
  const free=outfield(T).filter(p=>p.b.h<TUNING.zone.dfH);
  const fw=outfield(D).filter(q=>q.h>=K.markH).sort((a,b)=>b.h-a.h);
  for(const q of fw){
    if(!free.length)break;
    const mx=100-q.x;
    let bi=0;
    for(let i=1;i<free.length;i++)
      if(Math.abs(free[i].b.x-mx)<Math.abs(free[bi].b.x-mx))bi=i;
    const d=free.splice(bi,1)[0];
    markX.set(d,d.b.x+clamp((mx-d.b.x)*K.markPull,-K.markMax,K.markMax));
  }
  for(const p of T.players){
    if(p.gk){
      if(!M.ball)continue;
      const bx=M.ball.side===T.side?M.ball.x:100-M.ball.x;
      const tx=50+(bx-50)*TUNING.gk.follow;
      placePlayer(p,p.b.h,p.x+clamp(tx-p.x,-K.gkStep,K.gkStep));
      continue;
    }
    const s=safeTarget(p,{ h:p.b.h, x:50+((markX.has(p)?markX.get(p):p.b.x)-50)*nar });
    placePlayer(p,p.h+clamp(s.h-p.h,-K.stepH,K.stepH),p.x+clamp(s.x-p.x,-K.stepX,K.stepX));
  }
}

function refreshStamina(M,t){
  const S=TUNING.stam, I=TUNING.ins;
  for(const T of [M.home,M.away]){
    const tk=(T.fx.sta||1)*(T.ins.press?I.pressSta:1);   // GK のキーパー指示は p.fx.sta に入っている
    for(const p of T.players){
      const mul=(1-(p.c.sta-1)/(STAT_MAX-1)*S.staReduce)*tk*p.fx.sta;
      p.fat+=S.perStep*S.offBall[p.role]*mul;
      p.stam=clamp(1-p.fat,S.min,1);
      if(!p.tired&&p.stam<S.tiredAt){           // 足が止まった(1人1回だけ知らせる)
        p.tired=true;
        M.events.push({ ix:M.ix, min:t.min, half:t.half, side:T.side, type:"tired", by:p.id });
      }
    }
  }
}
function tire(p){
  const S=TUNING.stam;
  p.fat+=S.perAct*(1-(p.c.sta-1)/(STAT_MAX-1)*S.staReduce);
  p.st.act++;
}

/* ---------- 1ステップ ---------- */

function nearestTo(T,h,x,except){
  let best=null, bd=1e9;
  for(const p of outfield(T)){
    if(p===except)continue;
    const d=(blockH(p,h)-h)*(blockH(p,h)-h)+((p.x-x)/100)*((p.x-x)/100);
    if(d<bd){ bd=d; best=p; }
  }
  return best||gkOf(T);
}
function giveBall(M,T,h,x,holder){
  M.ball={ side:T.side, h, x, holder:holder||nearestTo(T,h,x), assist:null };
}

function stepMatch(M){
  if(M.over)return [];
  const from=M.events.length, total=M.len1+M.len2;
  if(M.ix===M.len1&&!M.ht){
    M.ht=true; M.phase="kickoff"; M.koSide="A"; M.set=null;
    for(const T of [M.home,M.away])for(const p of T.players){    // ハーフタイムで少し戻る
      p.fat=Math.max(0,p.fat-TUNING.stam.htRest-(T.mab.half||0));   // 監督能力: ハーフタイムケア
      p.stam=clamp(1-p.fat,TUNING.stam.min,1);
    }
    M.events.push({ ix:M.ix, min:45, half:1, type:"halftime", hg:M.home.score, ag:M.away.score });
    return M.events.slice(from);
  }
  if(M.ix>=total){
    M.over=true;
    const agg=M.opts.agg||[0,0];
    if(M.opts.ko&&M.home.score+agg[0]===M.away.score+agg[1])shootout(M);
    M.events.push({ ix:M.ix, min:90, half:2, type:"fulltime", hg:M.home.score, ag:M.away.score,
      pso:M.pso||undefined });
    return M.events.slice(from);
  }
  const ix=M.ix++, t=timeOf(M,ix);
  const rng=mulberry32((M.seed^hashStr("s:"+ix))>>>0);
  coachStep(M,t);
  applyOrders(M,t);
  refreshFx(M,t.min);
  refreshStamina(M,t);
  const push=e=>M.events.push(Object.assign({ ix, min:t.min, half:t.half, at:t.at },e));

  if(M.phase==="kickoff"){
    const T=teamOf(M,M.koSide);
    giveBall(M,T,0.5,50);
    M.phase="play";
    push({ side:T.side, type:"kickoff", by:M.ball.holder.id, from:[0.5,50], dest:[0.5,50] });
    return M.events.slice(from);
  }

  if(M.phase==="set"){
    takeSet(M,rng,push);
    return M.events.slice(from);
  }

  const B=M.ball, T=teamOf(M,B.side), D=otherOf(M,T), c=B.holder, h=B.h, x=B.x;
  const A=T.fx, Dt=D.fx, I=TUNING.ins, Y=TUNING.style;
  T.st.steps++;
  // 奪ってから何手目か・どこで奪ったか(カウンターが見る)
  if(M.poss.side===B.side)M.poss.n++; else{ M.poss={ side:B.side, n:0, h0:h }; otherOf(M,T).shootOrder=0; }   // 奪われたら「撃て」は消える
  const fast=A.fastN!=null&&M.poss.n<A.fastN&&(A.fastZone==="own"?M.poss.h0<0.5:M.poss.h0>=0.5);
  if(B.cross&&!c.gk&&rng()<TUNING.shot.xcP){       // 流れの中のクロスに頭で合わせる
    shoot(M,rng,push,T,D,c,h,x,"hdr",B.assist,B.xk||1);
    return M.events.slice(from);
  }
  if(!c.gk&&((T.shootOrder>0&&h>=TUNING.shot.forceH)||shotUrge(rng,h,x,c,A.urgeK))){
    const ordered=T.shootOrder>0&&h>=TUNING.shot.forceH; T.shootOrder=0;
    if(ordered)push({ side:T.side, type:"shootCall" });   // 指示で撃った(画面に「SHOOT!」)
    shoot(M,rng,push,T,D,c,h,x,null,B.assist);
    return M.events.slice(from);
  }

  const U=TUNING.duel;
  const ctr=T.ins.counter&&M.poss.n<TUNING.ins.counterN&&M.poss.h0<0.5;
  const ch=pickChannel(rng,c,h,x,T,fast,ctr), tg=ballTarget(rng,h,x,ch,ch.to?1:A.gainK,T.ins.side);
  const rc=ch.kind==="pass"?receiverAt(rng,T,D,tg,c,h):null;
  const dest=rc?{ h:rc.h, x:rc.x }:tg;
  // 競る場所: パスは届け先(カットされる場所)、持ち運びはいま居る場所
  const cp=ch.kind==="pass"?dest:{ h, x };
  // オフサイド(→docs/02 §2.10)。相手の最終ラインより前で受けると取られる
  if(rc&&dest.h>0.5&&dest.h>h){
    const O=TUNING.rule, over=dest.h-lastLine(D,h);
    if(over>0&&rng()<O.offBase*(Dt.off||1)*(A.offRisk||1)*Math.min(1,over/O.offSpan)){
      tire(c); T.st.pass++; c.st.pass++; T.st.off++;
      push({ side:T.side, type:"offside", by:c.id, to:rc.p.id, label:ch.label, ok:false,
        from:[r2(h),r2(x)], dest:[r2(dest.h),r2(dest.x)] });
      giveBall(M,D,1-dest.h,100-dest.x);
      return M.events.slice(from);
    }
  }
  const mk=matchupDefender(rng,cp.h,cp.x,D,h);
  tire(c);
  let ok=true, ask, dsk, flankK=1;
  if(mk){
    tire(mk.p);
    const m=mk.p, high=h<0.5;                   // ボールがいまどちらの陣にあるかで見る
    // ---- 攻撃側に掛かるもの ----
    const cs=chS(c,ch);
    if(cs>1)ask=c.fxName;
    let tA=(A.riskK||1)*cs*(A.fastN!=null?(fast?A.fastK:A.slowK)||1:1);
    if(A.chS&&A.chW&&A.chW[ch.id])tA*=A.chS;
    if(c.kp)tA*=(A.kpS||1)*(Dt.antiDuel!=null?Dt.antiDuel:1);
    if(strayOf(c,h,x)<Y.zoneNear)tA*=c.fx.zone;
    if(!high)tA*=1+T.lineOff*I.lineAtk;         // ラインが高いほど敵陣に人数が掛かる
    if(ctr)tA*=I.counterK*(1+(T.mab.counter||0));   // カウンター: 守備が整う前に攻め切る(監督能力で上積み)
    if(T.ins.side&&(x-50)*T.ins.side>I.flankX){     // サイド攻撃: そのサイドの相手の守備が薄いほど通る(→docs/02 §2.15)
      const n=outfield(D).filter(q=>q.h<I.flankH&&(50-q.x)*T.ins.side>I.flankX).length;
      flankK=clamp(1+I.flankK*(I.flankN-n),I.flankMin,I.flankMax); tA*=flankK;
    }
    if(rc){
      const lv=linkLv(T,c.id,rc.p.id);
      tA*=lv?1+TUNING.link.pass*lv*(A.linkK||1):(A.noLinkK||1);
      if(!rc.p.kp&&A.nonKpQ)tA*=A.nonKpQ;
    }
    // ---- 守備側に掛かるもの ----
    const dk=defK(m,ch.kind);
    if(dk>1)dsk=m.fxName;
    let tD=dk*(high?(Dt.highK||1)*(D.ins.press?I.pressHigh:1)*m.fx.chase
                   :(Dt.lowK||1)*(D.ins.press?I.pressLow:1));
    if(c.kp)tD*=m.fx.vsKp; else if(Dt.others)tD*=Dt.others;
    if(mk.prox>0.5)tD*=m.fx.zone;
    if(!high)tD*=1-D.lineOff*I.lineDef;         // ラインが低いほど自陣が堅い
    const aSc=(eff(c,"off")*U.atkW+eff(c,ch.stat)*(1-U.atkW))*ch.risk*(rc?rc.q:1)*tA*rr(rng);
    const dSc=(eff(m,"def")*U.defW+eff(m,ch.stat)*(1-U.defW))
      *(U.pressMin+(1-U.pressMin)*mk.prox)*mk.cover*tD*rr(rng);
    ok=aSc>dSc*U.th;
  }
  if(ch.kind==="pass"){ T.st.pass++; c.st.pass++; if(ok){ T.st.passOk++; c.st.passOk++; } }
  if(ok){ c.st.duelW++; if(mk)mk.p.st.duelL++; }
  else{ c.st.duelL++; mk.p.st.duelW++; }
  const end=ok?dest:cp;
  // **止めた瞬間だけが反則の入口**。何も起きていない所で笛は鳴らない
  let fouled=false;
  if(!ok){
    const O=TUNING.rule;
    fouled=rng()<(ch.kind==="carry"?O.foulCarry:O.foulPass)*(inBox(cp.h,cp.x)?O.boxCare:1)*(Dt.foulK||1);
  }
  push({ side:T.side, type:ch.kind, by:c.id, to:rc?rc.p.id:null, vs:mk?mk.p.id:null,
    ch:ch.id, label:ch.label, ok, role:c.role, foul:fouled||undefined,
    sk:ok?ask:undefined, dsk:ok?undefined:dsk, fast:(fast&&ok)||undefined,
    mv:ok&&/^mv/.test(ch.id)?ch.label:!ok&&mk&&mk.p.mv==="sliding"&&ch.kind==="carry"?RARE_MOVES.sliding.label:undefined,
    mvBy:ok&&/^mv/.test(ch.id)?c.id:!ok&&mk&&mk.p.mv==="sliding"&&ch.kind==="carry"?mk.p.id:undefined,
    out:(!ok&&!fouled&&ch.kind==="pass"&&(end.x<8||end.x>92))||undefined,
    from:[r2(h),r2(x)], dest:[r2(end.h),r2(end.x)] });
  if(ok)M.ball={ side:T.side, h:dest.h, x:dest.x, holder:rc?rc.p:c, assist:rc?c:B.assist,
    // サイドからゴール前へのクロスが通った(次の手で頭で合わせる。→docs/02 §2.15)
    cross:!!rc&&!!T.ins.side&&ch.lane==="box"&&Math.abs(x-50)>=TUNING.shot.xcWide&&dest.h>=TUNING.shot.xcDeep, xk:flankK };   // xk … 崩したサイドの度合い(頭で合わせる質に効く)
  else if(fouled)giveFoul(M,rng,push,T,D,mk.p,rc?rc.p:c,cp.h,cp.x,false);
  else if(cp.h>=TUNING.rule.ckH&&rng()<TUNING.rule.ckDuel){   // 深い位置で止めて、外へ逃げる
    M.events[M.events.length-1].ck=true;
    setPiece(M,T,"ck",0.97,cp.x<50?3:97);
  }
  else M.ball={ side:D.side, h:1-cp.h, x:100-cp.x, holder:mk.p, assist:null };
  if(!ok&&!fouled)injCheck(M,push,T,c,TUNING.inj.duel);   // 止められた持ち手
  return M.events.slice(from);
}

/* ---------- 反則とセットプレー(→docs/02 §2.10) ---------- */

const inBox=(h,x)=>h>=TUNING.rule.boxH&&Math.abs(x-50)<=TUNING.rule.boxX;

/** 相手の最終ライン(GKを除いていちばん後ろの選手)を、攻撃側フレームの高さで返す */
function lastLine(D,ballH){
  let m=1;
  for(const q of outfield(D))m=Math.min(m,blockH(q,1-ballH));
  return 1-m;
}
function spKicker(T,kind){
  const nm=rolePlayer(T,kind); if(nm)return nm;      // 指名したキッカーがピッチにいれば(→docs/12 §12.3)
  const sc=kind==="pk"?p=>(eff(p,"off")*1.2+eff(p,"tec"))*p.fx.pkK
    :kind==="fk"?p=>(eff(p,"tec")*1.2+eff(p,"off")*0.8)*p.fx.fk
    :p=>(eff(p,"tec")+eff(p,"pow")*0.6)*p.fx.ck;
  let best=null, bs=-1;
  for(const p of outfield(T)){ const s=sc(p); if(s>bs){ bs=s; best=p; } }
  return best||gkOf(T);
}
function setPiece(M,T,kind,h,x){
  M.phase="set"; M.set={ kind, side:T.side, h, x };
  M.ball={ side:T.side, h, x, holder:spKicker(T,kind), assist:null };
}
/**
 * 反則。(h,x) は反則を受けた側 T のフレーム。
 * 警告2枚か一発で退場し、そのまま人数が減って試合が続く。
 */
/** ケガ(→docs/08 §8.8)。疲れているほど起きやすい。ケガをしても出続け、能力が落ちる(交代は監督が決める) */
function injCheck(M,push,T,p,base){
  const J=TUNING.inj;
  if(!p||p.inj||!M.irng)return;
  // p.c.injK … 選手のタグ(ケガに強い・ケガがち・MVP。→docs/23)
  if(M.irng()<base*T.injK*(p.c.injK??1)*(1+J.fatK*(1-p.stam))){ p.inj=true; push({ side:T.side, type:"injury", by:p.id }); }
}
function giveFoul(M,rng,push,T,D,fouler,victim,h,x,forcePk){
  const O=TUNING.rule, pk=forcePk||inBox(h,x), k=pk?O.pkCardK:1, r=rng();
  D.st.fouls++;
  let card=null;
  if(r<O.red*k)card="r";
  else if(r<(O.red+O.yellow)*k){ fouler.yc++; D.st.yc++; card=fouler.yc>=2?"yr":"y"; }
  if(card&&card!=="y"){
    if(fouler.gk||D.players.length<=O.minPlayers){
      if(card==="yr")fouler.yc=1;
      card=card==="yr"?"y":null;
    }else{
      D.players=D.players.filter(p=>p!==fouler); D.st.rc++;
      if(fouler.kp)D.kp=null;
    }
  }
  const set=pk?"pk":h>=O.setH?"fk":"re";
  push({ side:D.side, type:"foul", by:fouler.id, on:victim.id, card, set });
  injCheck(M,push,T,victim,TUNING.inj.foul);
  if(set==="pk")setPiece(M,T,"pk",O.pkH,50);
  else if(set==="fk")setPiece(M,T,"fk",h,x);
  else M.ball={ side:T.side, h, x, holder:victim, assist:null };
}
function takeSet(M,rng,push){
  const O=TUNING.rule, s=M.set, T=teamOf(M,s.side), D=otherOf(M,T);
  M.set=null; M.phase="play";
  T.st.steps++;
  if(s.kind==="pk"){ T.st.pk++; return shoot(M,rng,push,T,D,spKicker(T,"pk"),O.pkH,50,"pk"); }
  if(s.kind==="fk")T.st.fk++; else T.st.ck++;
  if(s.kind==="fk"&&s.h>=O.directH&&Math.abs(s.x-50)<=O.directX&&rng()<O.directP)
    return shoot(M,rng,push,T,D,spKicker(T,"fk"),s.h,s.x,"fk");
  // ボックスへ入れる → 空中戦。高さ(pow)が主役
  const k=spKicker(T,s.kind), th=0.9, tx=50+(rng()*2-1)*10, air=T.fx.aerial||1;
  const a=pickW(rng,outfield(T).filter(q=>q!==k),q=>Math.pow((eff(q,"pow")+eff(q,"off")*0.5)*q.fx.aerial,2));
  const d=pickW(rng,outfield(D),q=>Math.pow((eff(q,"pow")+eff(q,"def")*0.5)*q.fx.aerial,2));
  tire(k); if(a)tire(a); if(d)tire(d);
  let won=false;
  if(a&&d){
    const aSc=(eff(a,"pow")*0.65+eff(a,"off")*0.35)*(0.75+eff(k,"tec")/STAT_MAX*0.5)
      *a.fx.aerial*k.fx.ck*air*rr(rng);
    const dSc=(eff(d,"pow")*0.65+eff(d,"def")*0.35)*d.fx.aerial*rr(rng);
    won=aSc>dSc*O.thAerial;
  }else won=!!a;
  push({ side:T.side, type:"cross", sp:s.kind, by:k.id, to:a?a.id:null, vs:d?d.id:null, ok:won,
    label:s.kind==="ck"?"コーナーキック":"フリーキック",
    from:[r2(s.h),r2(s.x)], dest:[th,r2(tx)] });
  if(!won){
    if(d)M.ball={ side:D.side, h:1-th, x:100-tx, holder:d, assist:null }; else giveBall(M,D,1-th,100-tx);
    return;
  }
  if(rng()<O.hdrShot)return shoot(M,rng,push,T,D,a,th,tx,"hdr",k);
  M.ball={ side:T.side, h:th-0.06, x:tx, holder:a, assist:k };   // 触っただけ。こぼれて続く
}

/* ---------- シュート ---------- */

function nearOf(h){
  const S=TUNING.shot;
  return clamp((h-S.dead)/(1-S.dead),S.minRange,1);
}
const angleOf=x=>1-Math.abs(x-50)/50*TUNING.shot.angle;

/** 深く入るほど・中央ほど・撃てる選手ほど撃ちに行く */
function shotUrge(rng,h,x,p,urgeK){
  const S=TUNING.shot, minH=S.minH-p.fx.range;
  if(h<minH)return false;
  const d=(h-minH)/(1-minH);
  const u=(S.base+d*d*S.depth)*(0.35+eff(p,"off")/STAT_MAX*0.65)
    *(1-Math.abs(x-50)/50*S.wideCut)*(urgeK||1)*p.fx.urge;
  return rng()<u;
}

/**
 * GK の立ち位置がセーブに掛かる倍率(→docs/02 §2.3a)。**定位置(中央・ライン上)で 1.0**。
 *   左右 … ボールのある側へ寄るほど強く、逆へずれるほど弱い
 *   前後 … 飛び出すと近距離のシュートに強く、遠目のシュートに弱い
 * (h,x) は撃つ側のフレーム。
 */
function gkPosK(gk,h,x){
  const K=TUNING.gk, out=gkOut(gk);
  const ideal=50+((100-x)-50)*K.follow;
  const lat=1-K.lat*(Math.abs(gk.x-ideal)-Math.abs(50-ideal))/K.latSpan;
  const close=clamp((h-K.farH)/(K.nearH-K.farH),0,1);
  return lat*(1+out*(K.rush*close-K.lob*gk.fx.lob*(1-close)));
}

/**
 * シュート。sp はセットプレーの種類(pk / fk / hdr)。流れの中なら省略。
 * assist は直前にボールを渡した選手(チャンスメイクが見る)。
 * どれも同じ経路(ブロック → 枠 → GK → こぼれ球)を通る。
 */
function shoot(M,rng,push,T,D,p,h,x,sp,assist,xk){
  const S=TUNING.shot, O=TUNING.rule, gk=gkOf(D);
  const near=sp==="pk"?1:nearOf(h), ang=sp==="pk"?1:angleOf(x);
  tire(p); p.st.shots++; T.st.shots++;
  const ev={ side:T.side, type:"shot", by:p.id, gk:gk.id, from:[r2(h),r2(x)], vs:null, sp:sp||undefined,
    nk:(sp==="fk"||sp==="pk")&&T.roles&&T.roles[sp]===p.id||undefined };
  // ① ブロック(PKとヘディングには無い。FKは壁)
  if(sp==="fk"){
    if(rng()<O.wall){
      ev.res="block"; ev.wall=true; ev.dest=[r2(h+(1-h)*0.3),r2(x)];
      push(ev);
      giveBall(M,D,1-ev.dest[0],100-x);
      return;
    }
  }else if(!sp){
    const mk=matchupDefender(rng,h,x,D,h);
    if(mk){
      const aSc=(eff(p,"tec")*0.5+eff(p,"off")*0.5)*rr(rng);
      const bSc=(eff(mk.p,"def")*0.6+eff(mk.p,"pow")*0.4)*mk.prox*mk.cover
        *mk.p.fx.blk*(D.fx.blk||1)*rr(rng);
      if(bSc>aSc*S.thBlock){
        tire(mk.p);
        if(mk.p.fx.blk>1)ev.dsk=mk.p.fxName;
        ev.res="block"; ev.vs=mk.p.id; ev.dest=[r2(h+(1-h)*0.35),r2(x)];
        const r=rng();
        if(inBox(h,x)&&r<O.foulBlock){                      // 止めに行った身体の入れ方が反則
          ev.foul=true; push(ev);
          giveFoul(M,rng,push,T,D,mk.p,p,h,x,true);
        }else if(r<O.foulBlock+O.ckBlock){
          ev.ck=true; push(ev);
          setPiece(M,T,"ck",0.97,x<50?3:97);
        }else{
          push(ev);
          M.ball={ side:D.side, h:1-ev.dest[0], x:100-x, holder:mk.p, assist:null };
        }
        return;
      }
    }
  }
  // ② 枠
  const gy=50+(rng()*2-1)*7;
  const acc=sp==="pk"?S.pkAcc
    :(S.accBase+eff(p,"tec")/STAT_MAX*S.accTec)*Math.pow(near,S.accRange)*ang
      *(sp==="hdr"?S.hdrAcc:sp==="fk"?S.fkAcc:1);
  if(rng()>=acc){
    ev.res="miss"; ev.dest=[1.03,r2(50+(rng()<0.5?-1:1)*(9+rng()*8))];
    push(ev);
    giveBall(M,D,TUNING.board.gkH,50,gk);
    return;
  }
  // ③ GK
  T.st.onT++;
  const raw=sp==="hdr"?(eff(p,"pow")*0.6+eff(p,"off")*0.4)*S.hdrPow
    :sp==="fk"?(eff(p,"tec")*0.5+eff(p,"pow")*0.3+eff(p,"off")*0.2)*S.fkPow
    :eff(p,"off")*0.7+eff(p,"pow")*0.3;
  // 効果は**当てはまる場面だけ**に掛かる
  const far=!sp&&h<S.midH;
  const sk=sp==="hdr"?p.fx.aerial*(T.fx.aerial||1):sp==="fk"?p.fx.fk:sp==="pk"?p.fx.pkK
    :p.fx.shot*(far?p.fx.mid:1);
  const as=assist&&assist!==p&&!sp?assist.fx.assist:1;
  if(sk>1)ev.sk=p.fxName; else if(as>1){ ev.sk=assist.fxName; ev.ask=assist.id; }
  if((far&&p.mv==="longshot")||(sp==="hdr"&&p.mv==="overhead")){ ev.mv=RARE_MOVES[p.mv].label; ev.mvBy=p.id; }
  const sSc=raw*Math.pow(near,S.rangePow)*ang*sk*as*(xk||1);   // xk … 薄いサイドを崩したクロス(→docs/02 §2.15)
  const gk1=sp==="pk"?gk.fx.pk:gk.fx.gk;
  const gSc=(eff(gk,"def")*0.65+eff(gk,"pow")*0.20+eff(gk,"tec")*0.15)*gkPosK(gk,h,x)*gk1;
  ev.dest=[1.0,r2(gy)];
  const a=rr(rng), b=rr(rng);
  let goal=sp==="pk"?sSc*a>gSc*b*S.thPk:Math.pow(sSc/gSc,S.gapPow)*a>S.thGoal*b;
  if(goal&&sp!=="pk"&&gk.mv==="godsave"&&!gk.mvUsed){ goal=false; gk.mvUsed=true; ev.mv=RARE_MOVES.godsave.label; ev.mvBy=gk.id; }   // 1試合に1回
  if(goal){
    T.score++; p.st.goals++;
    ev.res="goal"; ev.hg=M.home.score; ev.ag=M.away.score;
    if(assist&&assist!==p)ev.as=assist.id;       // 記録だけ(採点のアシスト)。判定には使わない
    push(ev);
    M.phase="kickoff"; M.koSide=D.side; M.ball=null;
    return;
  }
  ev.res="save";
  if(gk1>1)ev.dsk=gk.fxName;
  if(sp==="pk"){ push(ev); giveBall(M,D,TUNING.board.gkH,50,gk); return; }
  const r=rng();
  if(r<O.ckSave){                                           // 弾いてコーナー
    ev.ck=true; push(ev);
    setPiece(M,T,"ck",0.97,gy<50?3:97);
    return;
  }
  // ④ こぼれ球
  if(r<O.ckSave+S.rebound){
    const at=nearestTo(T,0.9,gy,p), df=nearestTo(D,0.1,100-gy);
    const aSc=(eff(at,"spd")*0.5+eff(at,"off")*0.5)*rr(rng);
    const dSc=(eff(df,"def")*0.5+eff(df,"spd")*0.5)*rr(rng);
    ev.reb=aSc>dSc?at.id:df.id;
    push(ev);
    if(aSc>dSc)M.ball={ side:T.side, h:0.9, x:gy, holder:at, assist:null };
    else M.ball={ side:D.side, h:0.1, x:100-gy, holder:df, assist:null };
    return;
  }
  push(ev);
  giveBall(M,D,TUNING.board.gkH,50,gk);
}

/* ---------- PK戦 ---------- */

/**
 * PK戦。5人ずつ蹴り、決まらなければ1人ずつ。**必ずどちらかが勝つ**。
 * 判定は試合中の PK と同じ式。蹴る順は「決める力」の高い順(乱数は試合のたねから)。
 */
function shootout(M){
  const P=TUNING.pso, S=TUNING.shot, rng=mulberry32((M.seed^hashStr("pso"))>>>0);
  const order=T=>outfield(T).slice().sort((a,b)=>
    (eff(b,"off")*1.2+eff(b,"tec"))*b.fx.pkK-(eff(a,"off")*1.2+eff(a,"tec"))*a.fx.pkK);
  const K={ H:order(M.home), A:order(M.away) }, sc={ H:0, A:0 }, n={ H:0, A:0 };
  const kick=side=>{
    const T=teamOf(M,side), D=otherOf(M,T), list=K[side], p=list.length?list[n[side]%list.length]:gkOf(T);
    const gk=gkOf(D);
    let ok=rng()<S.pkAcc;
    if(ok){
      const sSc=(eff(p,"off")*0.7+eff(p,"pow")*0.3)*p.fx.pkK;
      const gSc=(eff(gk,"def")*0.65+eff(gk,"pow")*0.20+eff(gk,"tec")*0.15)*gk.fx.pk;
      ok=sSc*rr(rng)>gSc*rr(rng)*S.thPk;
    }
    n[side]++; if(ok)sc[side]++;
    M.events.push({ ix:M.ix, min:90, half:2, type:"pso", side, by:p.id, gk:gk.id, ok, h:sc.H, a:sc.A });
  };
  for(let i=0;i<P.kicks;i++){
    for(const side of ["H","A"]){
      kick(side);
      // もう追いつけないなら終わり
      if(sc.H>sc.A+(P.kicks-n.A)||sc.A>sc.H+(P.kicks-n.H)){ M.pso=[sc.H,sc.A]; return; }
    }
  }
  for(let i=0;i<P.maxKicks&&sc.H===sc.A;i++){ kick("H"); kick("A"); }
  if(sc.H===sc.A)sc[rng()<0.5?"H":"A"]++;     // 打ち切り(まず起きない)
  M.pso=[sc.H,sc.A];
}

/* ---------- まとめて解く ---------- */

function finishMatch(M){
  let guard=0;
  while(!M.over&&guard++<2000)stepMatch(M);
  return M;
}
function simulateMatch(homeDef,awayDef,seed,opts){
  return finishMatch(createMatch(homeDef,awayDef,seed,opts));
}

/* ---- 試合の記録(結果の画面が読む。→docs/07 §7.12) ---- */
/** チームの数字。支配率は攻めの手数(steps)の割合 */
function matchStats(M){
  const H=M.home.st, A=M.away.st, all=(H.steps+A.steps)||1;
  const one=(T,s)=>({ shots:s.shots, onT:s.onT, poss:Math.round(s.steps/all*100),
    pass:s.pass?Math.round(s.passOk/s.pass*100):0, fouls:s.fouls, ck:s.ck });
  return { H:one(M.home,H), A:one(M.away,A) };
}
/**
 * 選手の採点(10点満点・0.5刻み)。**記録(イベント)から数える**。途中で下がった選手は終了時の名簿にいないため。
 * 返り値 { list:[{ id, side, r, g, a }](出た全員), mvp:id }
 */
function matchRatings(M){
  const R=TUNING.rate, sc={}, side={}, g={}, a={}, pass={}, ga={ H:M.away.score, A:M.home.score };
  const oth=s=>s==="H"?"A":"H";
  const add=(id,v,sd)=>{ if(!id)return; if(!(id in sc))sc[id]=0; sc[id]+=v; if(sd)side[id]=sd; };
  const ok=(id,sd)=>{ if(!id)return; add(id,0,sd); pass[id]=(pass[id]||0)+R.passOk; };
  for(const T of [M.home,M.away])for(const p of T.players)add(p.id,0,T.side);
  for(const e of M.events){
    if(e.type==="sub"){ add(e.out,0,e.side); add(e.in,0,e.side); }
    else if(e.type==="shot"){
      if(e.res==="goal"){ add(e.by,R.goal+R.onT,e.side); g[e.by]=(g[e.by]||0)+1;
        if(e.as){ add(e.as,R.assist,e.side); a[e.as]=(a[e.as]||0)+1; } }
      else if(e.res==="save"){ add(e.by,R.onT,e.side); add(e.gk,R.save,oth(e.side)); }
      else if(e.res==="block"){ add(e.by,0,e.side); add(e.vs,R.block,oth(e.side)); }
      else add(e.by,R.miss,e.side);
    }else if(e.type==="pass"||e.type==="carry"||e.type==="cross"){
      if(e.ok)ok(e.by,e.side); else{ add(e.by,R.lost,e.side); add(e.vs,R.won,oth(e.side)); }
    }else if(e.type==="foul"){ add(e.by,e.card==="r"||e.card==="yr"?R.red:R.foul,e.side); }
  }
  const d=(M.pso?M.pso[0]-M.pso[1]:0)||M.home.score-M.away.score;
  const list=Object.keys(sc).filter(id=>side[id]).map(id=>{
    const c=CARDS[id], sd=side[id];
    let v=R.base+sc[id]+Math.min(R.passMax,pass[id]||0);
    if(c&&c.pos==="GK")v+=R.concede*ga[sd]; else if(c&&c.pos==="DF")v+=R.concedeDf*ga[sd];
    const res=sd==="H"?d:-d;
    if(res>0)v+=R.win; else if(res<0)v+=R.lose;
    return { id, side:sd, r:Math.round(clamp(v,R.min,R.max)*2)/2, g:g[id]||0, a:a[id]||0, won:res>0 };
  });
  const best=list.slice().sort((x,y)=>y.r-x.r||y.g-x.g||(y.won-x.won)||y.a-x.a)[0];
  return { list, mvp:best?best.id:null };
}
