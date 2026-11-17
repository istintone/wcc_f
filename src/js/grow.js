/* =========================================================================
   wcc_f — 育成(DOM非依存)→docs/05 §5.3〜5.6
   1試合ごとに:
     ① チーム練習  メニューを1つ + 強度(軽め / 普通 / ハード)。強いほど伸びるが、疲労がたまる
     ② コミュニケーション  最大3回。個人練習 / ミーティング / ラウンジ / 声かけ
     ③ 試合  経験がたまり、**試合のあとに**★の上昇・覚醒・連携の変化が起きる
   ★の上がり方
     個人能力 ★0〜5 … 経験がたまると試合後に上がる。★5(覚醒)は兆しのあとフレンドリーマッチの勝利で
     特殊能力 ★0〜5 … ミーティングで経験をため、★突破の3択に成功すると上がる。★5はフレンドリーマッチの勝利で
     連携     0〜3   … 経験がたまると試合後に太くなる。黄金線はラウンジで兆し → フレンドリーマッチの勝利で
   育成の状態は S.g に素の値だけで持つ(そのまま保存できる)。
   ========================================================================= */

const PARAM_AXIS={ off:"O", def:"D", tec:"R", pow:"P", spd:"S", sta:"C" };
const AXIS_PARAM={ O:"off", D:"def", R:"tec", P:"pow", S:"spd", C:"sta" };
const MOT_LABEL=["ケガ","絶不調","不調","好調","絶好調"];
const LINK_LABEL=["線なし","薄線","太線","黄金線"];
const INT_LABEL=["軽め","普通","ハード"];
const COMM_LABEL={ ind:"個人練習", meet:"ミーティング", lounge:"ラウンジ", talk:"声かけ" };
/** ラウンジの3択。相性(2=良い / 1=ふつう / 0=悪い)ごとに、いちばん合う手が違う */
const LOUNGE_CHOICE=["連携の練習をさせる","食事に行かせる","競わせる"];
const LOUNGE_HINT=["ふたりは張り合っているようだ","ふたりはまだよそよそしい","ふたりは気が合うようだ"];
const LOUNGE_BEST=[2,0,1];                   // 相性 0/1/2 のときにいちばん合う手
/** ミーティングの3択。選手の性格ごとに、響く言い方が違う */
const MEET_CHOICE=["褒めて伸ばす","厳しく求める","本人に任せる"];
const PERS_LABEL=["褒められて伸びる","負けず嫌い","マイペース"];

const AFF_N=11;                              // 相性の組(本家の A〜K)
const affOf=id=>hashStr("aff:"+id)%AFF_N;
const persOf=id=>hashStr("pers:"+id)%3;
/** 年齢の区切り(0 = 21歳以下 〜 4 = 32歳以上) */
const ageBand=id=>{ const a=CARDS[id].age||26, b=TUNING.grow.age.band; let i=0; while(i<b.length&&a>b[i])i++; return i; };
/**
 * 伸びやすさ = 年齢 × 能力。若いほど・能力が低いほど育ちやすい(→docs/05 §5.4)。
 * 全員が同じ時期に★4へ揃わないのは、これと「選んだ練習」「個人練習で呼んだ回数」の差による
 */
function growK(id){
  const G0=TUNING.grow, c=CARDS[id], A=G0.abil;
  const top=STATS.map(k=>c[k]).sort((a,b)=>b-a), best=(top[0]+top[1])/2;
  return G0.age.grow[ageBand(id)]*clamp(1-(best-A.ref)*A.k,A.lo,A.hi);
}
/** やる気の上下の起きやすさ。若いほどむらがある */
const motSwing=id=>TUNING.grow.age.swing[ageBand(id)];
/** 2人の相性。2=良い(試合に出るだけで太線まで)/ 1=ふつう(薄線まで)/ 0=悪い(ラウンジでしか育たない) */
function compatOf(a,b){
  const d=Math.abs(affOf(a)-affOf(b)), c=Math.min(d,AFF_N-d);
  return c<=1?2:c<=3?1:0;
}
const lkey=(a,b)=>a<b?a+"|"+b:b+"|"+a;

/* ---------- 状態 ---------- */

/** 1人ぶんの育成の初め */
function newPlayerGrowth(){
  return { ie:0, is:0, se:0, ss:0, tr:{}, up:{}, mot:TUNING.grow.mot.start, fat:0, q:false, sq:false, bond:0 };
}
/** 登録選手(ids)ぶんの育成。ids を省くとアズーロFCの初めの16枚 */
function newGrowth(ids){
  const pl={};
  (ids||TEAMS.azr.xi.concat(TEAMS.azr.bench)).forEach(id=>{ pl[id]=newPlayerGrowth(); });
  return { pl, links:{}, graph:{ O:0, D:0, R:0, C:0, S:0, P:0 }, set:0,
    step:"train", cn:0, done:[], opts:null };
}
/** 古いセーブの育成に、あとから増えた項目を補う */
function migrateGrowth(g,sq){
  for(const id in g.pl)if(!CARDS[id]||(sq&&!sq.includes(id)))delete g.pl[id];
  if(sq)sq.forEach(id=>{ if(!g.pl[id])g.pl[id]=newPlayerGrowth(); });
  for(const k of Object.keys(g.links))if(!k.split("|").every(id=>g.pl[id]))delete g.links[k];
  for(const id in g.pl)if(g.pl[id].fat==null)g.pl[id].fat=0;
  if(g.cn==null)g.cn=0;
  if(!g.done)g.done=[];
  if(g.step==="ready")g.step="comm";
  return g;
}
const linkOf=(S,a,b)=>S.g.links[lkey(a,b)]||{ lv:0, exp:0, gold:false };
function linkSet(S,a,b){ const k=lkey(a,b); return S.g.links[k]||(S.g.links[k]={ lv:0, exp:0, gold:false }); }

/** 育成を反映したカード。試合にはこれを渡す(元のカードは書き換えない) */
function growCard(S,card){
  const G0=TUNING.grow, g=S.g.pl[card.id], c=Object.assign({},card);
  if(!g)return c;
  for(const k of STATS){
    const base=card[k]+(card[k]<=G0.startKeep?0:G0.startOff);
    c[k]=clamp(base+(g.up[k]||0),1,STAT_MAX);
  }
  c.cond=G0.mot.mul[g.mot];
  c.buffK=1+G0.sp.buff*g.ss;
  c.ss=g.ss; c.is=g.is;
  c.fat0=g.fat;                              // 練習の疲れを残したまま試合を始める
  return c;
}
/** 連携の線を、試合に渡す形 [a, b, 段] にする */
function growLinks(S){
  return Object.keys(S.g.links).filter(k=>S.g.links[k].lv>0).map(k=>{ const p=k.split("|"); return [p[0],p[1],S.g.links[k].lv]; });
}
/** 疲労の平均(盤面の11人) */
function teamFatigue(S){
  const xi=squadXi(S);
  return xi.reduce((s,id)=>s+(S.g.pl[id]?S.g.pl[id].fat:0),0)/(xi.length||1);
}

/* ---------- ① チーム練習 ---------- */

/** 今回の練習の候補6つ。基本練習が能力ごとに1つずつ。施設が良いほど特殊練習に差し替わる */
function trainOptions(S){
  if(S.g.opts)return S.g.opts;
  const G0=TUNING.grow, rng=mulberry32((S.seed^hashStr("tr:"+S.term+":"+S.played))>>>0);
  S.g.opts=STATS.map(param=>{
    if(rng()<G0.spChance*(S.fac||1)){             // 施設レベル(累計の年俸で上がる →term.js)
      const pool=TRAIN_SP.map((t,i)=>i).filter(i=>TRAIN_SP[i].slot===param||TRAIN_SP[i].slot==="any");
      if(pool.length)return { param, sp:pool[Math.floor(rng()*pool.length)] };
    }
    return { param, sp:-1 };
  });
  return S.g.opts;
}
function trainLabel(o){ return o.sp>=0?TRAIN_SP[o.sp].name:STAT_LABEL[o.param]+"の練習"; }
/** 練習の中身を、選ぶ前に見せる文にする */
function trainDesc(o){
  const ax=s=>s.split("").map(a=>AXIS_LABEL[a]).join("・");
  if(o.sp<0)return "個人能力 ・ グラフ: "+AXIS_LABEL[PARAM_AXIS[o.param]]+" ↑";
  const t=TRAIN_SP[o.sp], e=t.eff, nm={ ind:"個人", link:"連携", sp:"特殊", set:"セットプレイ" };
  return Object.keys(e).map(k=>nm[k]+"★".repeat(e[k])).join(" ")+" ・ グラフ: "+
    (t.up?ax(t.up)+" ↑":"")+(t.down?" / "+ax(t.down)+" ↓":"");
}
function graphAdd(S,axis,v){
  const R=TUNING.grow.graph;
  S.g.graph[axis]=clamp(S.g.graph[axis]+v,R.min,R.max);
}
/** 個人能力の★が上がるか見る(試合のあとに呼ぶ)。上がったら、その間にいちばん練習した能力が伸びる */
function checkInd(S,id,out){
  const I=TUNING.grow.ind, g=S.g.pl[id], card=CARDS[id];
  while(g.is<4&&g.ie>=I.need[g.is]){
    g.ie-=I.need[g.is]; g.is++;
    let best=null, bv=-1;
    for(const k of STATS){ const v=(g.tr[k]||0)*100+card[k]; if(card[k]+(g.up[k]||0)<STAT_MAX&&v>bv){ bv=v; best=k; } }
    if(best)g.up[best]=(g.up[best]||0)+I.starUp;
    g.tr={};
    out.push(nameOf(card)+" 個人能力 ★"+g.is+(best?"("+STAT_LABEL[best]+" +"+I.starUp+")":""));
  }
  if(g.is===4&&!g.q&&g.ie>=I.awake){ g.q=true; out.push(nameOf(card)+" に覚醒の兆し(フレンドリーマッチで勝てば覚醒)"); }
}
function checkSp(S,id,out){
  const P=TUNING.grow.sp, g=S.g.pl[id];
  if(g.ss===4&&!g.sq&&g.se>=P.awake){ g.sq=true; out.push(nameOf(CARDS[id])+" の特殊能力が極まりそうだ(フレンドリーマッチで勝てば ★5)"); }
}
/** ミーティングで★突破の3択が出る状態か */
const spReady=(S,id)=>{ const g=S.g.pl[id]; return g.ss<4&&g.se>=TUNING.grow.sp.need[g.ss]; };
/** 連携の経験を足す。**段は試合のあとに上がる**(settleLinks)。cap は相性で決まる上限 */
function linkExp(S,a,b,v,cap){
  const l=linkSet(S,a,b);
  l.cap=Math.max(l.cap||0,cap);
  if(l.lv<Math.min(l.cap,2))l.exp+=v;
}
/** 試合のあと、たまった経験で連携の段を上げる(黄金線=3 はここでは上がらない) */
function settleLinks(S,out){
  const L=TUNING.grow.link;
  for(const k in S.g.links){
    const l=S.g.links[k], p=k.split("|"), cap=Math.min(l.cap||0,2);
    while(l.lv<cap&&l.exp>=L.need[l.lv]){
      l.exp-=L.need[l.lv]; l.lv++;
      out.push(nameOf(CARDS[p[0]])+" と "+nameOf(CARDS[p[1]])+" の連携が"+LINK_LABEL[l.lv]+"に");
    }
  }
}
/** いま盤面に並べている11人(前の試合の最後の配置。無ければクラブの既定) */
function squadXi(S){
  const ids=Object.keys(S.layout).filter(id=>S.g.pl[id]);
  return ids.length>=8?ids:(S.sq||startSquad()).slice(0,11);
}
/**
 * チーム練習を1つ行う。intensity: 0=軽め / 1=普通 / 2=ハード。
 * 強いほど経験とグラフの伸びが大きく、**全員の疲労がたまる**(試合を消耗した状態で始める)。
 */
function doTraining(S,i,intensity){
  const G0=TUNING.grow, I=G0.ind, R=G0.graph, N=G0.int, o=trainOptions(S)[i], out=[];
  if(S.g.step!=="train"||!o)return out;
  const lv=intensity==null?1:clamp(intensity,0,2), k=N.k[lv];
  const ids=Object.keys(S.g.pl);
  for(const a in S.g.graph)S.g.graph[a]*=R.decay;
  if(o.sp<0){
    for(const id of ids){
      const g=S.g.pl[id], top=STATS.slice().sort((a,b)=>CARDS[id][b]-CARDS[id][a]).slice(0,2);
      g.ie+=(I.train+(top.includes(o.param)?I.trainFit:0))*k*growK(id);
      g.tr[o.param]=(g.tr[o.param]||0)+1;
    }
    graphAdd(S,PARAM_AXIS[o.param],R.basic*k);
  }else{
    const t=TRAIN_SP[o.sp], e=t.eff, all=t.up.length===6;
    for(const id of ids){
      const g=S.g.pl[id];
      g.ie+=(1+(e.ind||0))*k*growK(id);
      g.tr[o.param]=(g.tr[o.param]||0)+1;
      if(e.sp)g.se+=e.sp*G0.sp.train*k;
    }
    if(e.link){
      const xi=squadXi(S);
      for(let a=0;a<xi.length;a++)for(let b=a+1;b<xi.length;b++)
        linkExp(S,xi[a],xi[b],e.link*k,compatOf(xi[a],xi[b]));
    }
    if(e.set)S.g.set=Math.min(G0.set.max,S.g.set+G0.set.per*e.set*k);
    for(const a of t.up)graphAdd(S,a,(all?R.upAll:R.up)*k);
    for(const a of t.down)graphAdd(S,a,-R.down*k);
  }
  for(const id of ids){
    const g=S.g.pl[id];
    g.fat=Math.min(N.fatMax,g.fat+N.fat[lv]);
    checkSp(S,id,out);
  }
  if(N.fat[lv]>0)out.push("疲労 +"+Math.round(N.fat[lv]*100)+"%(試合はそのぶん消耗した状態で始まる)");
  S.g.step="comm"; S.g.cn=0; S.g.done=[];
  return out;
}

/* ---------- ② コミュニケーション(最大3回) ---------- */

const commLeft=S=>S.g.step==="comm"?TUNING.grow.comm.max-S.g.cn:0;
/** コミュニケーションを1回使う。使い切ったら試合へ */
function useComm(S,kind){
  S.g.cn++; S.g.done.push(kind);
  if(S.g.cn>=TUNING.grow.comm.max)S.g.step="ready";
}
const canComm=S=>S.g.step==="comm"&&S.g.cn<TUNING.grow.comm.max;

/** 個人練習。1人を呼び出して個別に指導する。個人能力の経験が入る(★は試合のあとに上がる) */
function doIndTrain(S,id){
  const C=TUNING.grow.comm, g=S.g.pl[id], out=[];
  if(!canComm(S)||!g)return { res:-1, lines:out };
  g.ie+=C.ind*growK(id);
  g.bond++;
  out.push(nameOf(CARDS[id])+" に個別指導(個人能力の経験 +"+C.ind+")");
  useComm(S,"ind");
  return { res:1, lines:out };
}
/** 声かけ。調子の落ちた選手を立て直す。モチベーションが上がる */
function doTalk(S,id){
  const C=TUNING.grow.comm, g=S.g.pl[id], out=[];
  if(!canComm(S)||!g)return { res:-1, lines:out };
  const was=g.mot;
  g.mot=Math.min(4,g.mot+(g.mot<=2?C.talkLow:C.talk));
  g.bond++;
  out.push(nameOf(CARDS[id])+" に声をかけた("+MOT_LABEL[was]+" → "+MOT_LABEL[g.mot]+")");
  useComm(S,"talk");
  return { res:1, lines:out };
}
function loungeInfo(S,a,b){
  const c=compatOf(a,b), l=linkOf(S,a,b);
  return { compat:c, hint:LOUNGE_HINT[c], lv:l.lv, gold:l.gold, choices:LOUNGE_CHOICE };
}
/**
 * ラウンジ。2人を呼び出して3択に答える。結果は 0=大成功 / 1=成功 / 2=失敗。
 * 相性に合う手ほど大成功しやすい。太線の2人が大成功すると、黄金線の兆しが出る。
 */
function doLounge(S,a,b,choice){
  const L=TUNING.grow.link, out=[];
  if(!canComm(S)||a===b||!S.g.pl[a]||!S.g.pl[b])return { res:-1, lines:out };
  const c=compatOf(a,b), best=LOUNGE_BEST[c];
  const p=choice===best?L.pFit:choice===(best+1)%3?L.pMid:L.pBad;
  const r=mulberry32((S.seed^hashStr("lg:"+S.term+":"+S.played+":"+S.g.cn+":"+lkey(a,b)+":"+choice))>>>0)();
  const res=r<p[0]?0:r<p[0]+p[1]?1:2, l=linkSet(S,a,b);
  out.push(["大成功！","成功","失敗…"][res]);
  if(res<2){
    // 太線の2人は、**大成功のときだけ**黄金線の兆しが出る。ラウンジは相性に関係なく太線まで育てられる
    if(l.lv===2){ if(res===0&&!l.gold){ l.gold=true; out.push("フレンドリーマッチで新たな連携が生まれそうだ"); } }
    else{ linkExp(S,a,b,L.lounge[res],2); out.push("連携の経験 +"+L.lounge[res]+"(試合のあとに太くなる)"); }
    S.g.pl[a].bond++; S.g.pl[b].bond++;
  }
  useComm(S,"lounge");
  return { res, lines:out };
}
function meetInfo(S,id){
  const g=S.g.pl[id];
  return { ready:spReady(S,id), pers:PERS_LABEL[persOf(id)], choices:MEET_CHOICE, mot:g.mot, ss:g.ss, se:g.se,
    need:g.ss<4?TUNING.grow.sp.need[g.ss]:TUNING.grow.sp.awake };
}
/**
 * ミーティング。1人を呼び出す。特殊能力の経験がたまる。
 * 経験が満ちていれば★突破の3択が出る(choice)。性格に合う言い方ほど成功しやすい。
 */
function doMeeting(S,id,choice){
  const P=TUNING.grow.sp, g=S.g.pl[id], out=[];
  if(!canComm(S)||!g)return { res:-1, lines:out };
  let res=1;
  if(spReady(S,id)){
    const p=choice===persOf(id)?P.qOk:P.qNg;
    const r=mulberry32((S.seed^hashStr("mt:"+S.term+":"+S.played+":"+S.g.cn+":"+id+":"+choice))>>>0)();
    if(r<p){
      g.se-=P.need[g.ss]; g.ss++; res=0;
      out.push(nameOf(CARDS[id])+" 特殊能力 ★"+g.ss);
    }else{
      g.se=Math.floor(g.se*P.failKeep); res=2;
      g.mot=Math.max(1,g.mot-1);
      out.push(nameOf(CARDS[id])+" の心に響かなかった…(やる気が下がった)");
    }
  }else{
    g.se+=P.meet;
    out.push(nameOf(CARDS[id])+" と戦術の話をした(特殊能力の経験 +"+P.meet+")");
  }
  g.bond+=2;
  checkSp(S,id,out);
  useComm(S,"meet");
  return { res, lines:out };
}
/** 残りのコミュニケーションを使わずに試合へ */
function skipComm(S){ if(S.g.step==="comm")S.g.step="ready"; }
/** 選手の上に「！」が出るか(★突破の3択が待っている / やる気が落ちている / 疲れている) */
function hasSign(S,id){ const g=S.g.pl[id]; return spReady(S,id)||g.mot<=1||g.fat>=TUNING.grow.int.tiredSign; }

/* ---------- ③ 試合のあと ---------- */

/** 覚醒。能力が最大3項目、各+1(どれが上がるかは不定。1つは必ず上がる) */
function awaken(S,id,rng,out){
  const I=TUNING.grow.ind, g=S.g.pl[id], card=CARDS[id], got=[];
  const pool=STATS.filter(k=>card[k]+(g.up[k]||0)<STAT_MAX&&card[k]>TUNING.grow.startKeep);
  for(let n=0;n<3&&pool.length;n++){
    if(n>0&&rng()>=I.awakeUp[n])break;
    const k=pool.splice(Math.floor(rng()*pool.length),1)[0];
    g.up[k]=(g.up[k]||0)+1; got.push(STAT_LABEL[k]);
  }
  g.is=5; g.q=false; g.ie=0;
  out.push("⭐ "+nameOf(card)+" が覚醒！("+got.join("・")+" +1)");
}
/**
 * 試合の結果を育成に反映する。**★の上昇・覚醒・連携の変化はここで起きる**。
 *   res.played  … その試合に出た選手 / res.onPitch … 最後に盤面に居た選手 / res.win
 * フレンドリーマッチに勝つと、兆しのある選手・連携が開花する(必ずではない)。
 */
function afterMatchGrowth(S,fx,res){
  const G0=TUNING.grow, I=G0.ind, L=G0.link, Mo=G0.mot, N=G0.int, out=[];
  const rng=mulberry32((S.seed^hashStr("gr:"+S.term+":"+S.played))>>>0);
  const played=res.played.filter(id=>S.g.pl[id]), on=res.onPitch.filter(id=>S.g.pl[id]);
  for(const id of played)S.g.pl[id].ie+=I.match*growK(id);
  for(let a=0;a<on.length;a++)for(let b=a+1;b<on.length;b++)
    linkExp(S,on[a],on[b],L.match,compatOf(on[a],on[b]));
  for(const id in S.g.pl)checkInd(S,id,out);
  settleLinks(S,out);
  if(fx.kind==="friendly"&&res.win){
    for(const id of on){
      const g=S.g.pl[id];
      if(g.q&&rng()<I.awakeP)awaken(S,id,rng,out);
      if(g.sq&&rng()<G0.sp.star5P){ g.ss=5; g.sq=false; g.se=0; out.push("⭐ "+nameOf(CARDS[id])+" の特殊能力が ★5 に(スタイルが極まる)"); }
    }
    // 黄金線は1試合に1本まで(兆しのある組のうち、たねで1つ選ぶ)
    const cand=Object.keys(S.g.links).filter(k=>{ const l=S.g.links[k], p=k.split("|");
      return l.gold&&l.lv===2&&on.includes(p[0])&&on.includes(p[1]); });
    if(cand.length&&rng()<L.goldP){
      const k=cand[Math.floor(rng()*cand.length)], l=S.g.links[k], p=k.split("|");
      l.lv=3; l.gold=false;
      out.push("✨ "+nameOf(CARDS[p[0]])+" と "+nameOf(CARDS[p[1]])+" の連携が黄金の輝きに");
    }
  }
  // 疲労: 出た選手は試合のぶん溜まり、全員が次までに半分ほど抜ける
  for(const id in S.g.pl){
    const g=S.g.pl[id];
    g.fat=Math.min(N.fatMax,(g.fat+(played.includes(id)?N.matchLoad:0))*N.recover);
  }
  // モチベーション: 出て勝てば上がり、負ければ下がる。出番が無いと下がる
  for(const id in S.g.pl){
    const g=S.g.pl[id];
    const sw=motSwing(id);                    // 若いほどむらがある
    if(played.includes(id)){
      if(res.win&&rng()<Mo.winUp*sw)g.mot=Math.min(4,g.mot+1);
      else if(res.lose&&rng()<Mo.loseDown*sw)g.mot=Math.max(1,g.mot-1);
      else if(!res.win&&!res.lose&&rng()<Mo.drawSwing*sw)g.mot=clamp(g.mot+(rng()<0.5?1:-1),1,4);
    }else if(rng()<Mo.benchDown*sw)g.mot=Math.max(1,g.mot-1);
  }
  S.g.step="train"; S.g.opts=null; S.g.cn=0; S.g.done=[];
  return out;
}
