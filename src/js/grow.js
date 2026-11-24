/* =========================================================================
   wcc_f — 育成(DOM非依存)→docs/05 §5.3〜5.6
   1試合ごとに:
     ① チーム練習  メニューを1つ + 強度(軽め / 普通 / ハード)。強いほど伸びるが、疲労がたまる
     ② コミュニケーション  最大3回。個人練習 / ミーティング / ラウンジ / ケア
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
// ラウンジで見せる2人の関係(線の段の物語の言い方。→docs/14 §14.88)。信頼 = 黄金線
const REL_LABEL=["無関心","関心","理解","信頼"];
const INT_LABEL=["軽め","普通","ハード"];
const COMM_LABEL={ ind:"個人練習", meet:"ミーティング", lounge:"ラウンジ", talk:"メディカル" };   // 施設の名前にそろえる(→docs/14 §14.93)
/** ラウンジの3択。相性(2=良い / 1=ふつう / 0=悪い)ごとに、いちばん合う手が違う */
const LOUNGE_CHOICE=["連携の練習をさせる","食事に行かせる","競わせる"];
const LOUNGE_HINT=["ふたりは張り合っているようだ","ふたりはまだよそよそしい","ふたりは気が合うようだ"];
const LOUNGE_BEST=[2,0,1];                   // 相性 0/1/2 のときにいちばん合う手
/** ミーティングの3択。選手の性格ごとに、響く言い方が違う */
const MEET_CHOICE=["褒めて伸ばす","厳しく求める","本人に任せる"];
const PERS_LABEL=["褒められて伸びる","負けず嫌い","マイペース"];

const persOf=id=>hashStr("pers:"+id)%3;
/** 年齢の区切り(0 = 21歳以下 〜 4 = 32歳以上) */
const ageBand=id=>{ const a=CARDS[id].age||26, b=TUNING.grow.age.band; let i=0; while(i<b.length&&a>b[i])i++; return i; };
/**
 * 伸びやすさ = 年齢 × 能力。若いほど・能力が低いほど育ちやすい(→docs/05 §5.4)。
 * 全員が同じ時期に★4へ揃わないのは、これと「選んだ練習」「個人練習で呼んだ回数」の差による
 */
function growK(id,S){
  const G0=TUNING.grow, c=CARDS[id], A=G0.abil, yk=S&&c.age<=21?(tsetOf(S,"youngK")||1):1;   // 生え抜き: 若手が伸びやすい
  const top=STATS.map(k=>c[k]).sort((a,b)=>b-a), best=(top[0]+top[1])/2;
  return G0.age.grow[ageBand(id)]*clamp(1-(best-A.ref)*A.k,A.lo,A.hi)*yk;
}
/** やる気の上下の起きやすさ。若いほどむらがある */
const motSwing=id=>TUNING.grow.age.swing[ageBand(id)];
/**
 * 2人の相性(→docs/08 §8.6)。**動物占いの群れ**で決まる。2=良い(試合に出るだけで太線まで)/ 1=ふつう(薄線まで)/ 0=張り合う(ラウンジでしか育たない)。
 * ラウンジの合う手もこれで決まる
 */
const compatOf=(a,b)=>aniCompat(CARDS[a].ani,CARDS[b].ani);
/** 同じ実在クラブか(アズーロFC の初めの16人には付けない。全員に付くと最初から連携が育ちすぎる) */
const sameClub=(a,b)=>{ const x=CARDS[a], y=CARDS[b]; return !!x.team&&x.team===y.team; };
/** 連携が付きやすくなる理由(画面にも出す): 同じ国籍 / 同じクラブ / 同じ動物 */
function linkBonusOf(a,b){
  const x=CARDS[a], y=CARDS[b], out=[];
  if(x.nat&&x.nat===y.nat)out.push("nat");
  if(sameClub(a,b))out.push("club");
  if(x.ani===y.ani)out.push("ani");
  return out;
}
/** 試合で入る連携の経験の倍率(重なる) */
const linkBonusK=(a,b)=>linkBonusOf(a,b).reduce((k,t)=>k*TUNING.grow.link.bonus[t],1);
/** 試合だけで育つ上限。相性で決まり、国籍かクラブが同じなら少なくとも薄線(1) */
function linkCap(a,b){ const c=compatOf(a,b), bo=linkBonusOf(a,b); return Math.max(c,(bo.includes("nat")||bo.includes("club"))?1:0); }
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
  return { pl, links:{}, graph:{ O:0, D:0, R:0, C:0, S:0, P:0 }, gold:{}, set:0,
    step:"train", cn:0, done:[], opts:null, tags:[], streak:0 };
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
  // 成長グラフ(→docs/15)。前の戦力グラフ(−2〜+3 の上乗せ)とは目盛りが違うので 0 から
  if(!g.gold){ g.gold={}; for(const a in g.graph)g.graph[a]=0; }
  if(!g.tags){ g.tags=[]; g.streak=0; }        // タグ(→docs/23)
  if(g.golden>0){ if(!g.tags.some(t=>t.id==="golden"))g.tags.push({ id:"golden", n:g.golden }); }
  delete g.golden;                              // 黄金期はタグ「黄金期到来」に寄せた
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
  c.gs=g.is; c.gm=g.mot;                     // 盤面に出す★とやる気(見た目だけ)
  c.buffK=(1+G0.sp.buff*g.ss)*playerTagK(S,card.id,"kp");   // 戦略家(→docs/23)
  c.injK=pTagOn(S,card.id,"noInj")?0:playerTagK(S,card.id,"inj");   // ケガに強い・ケガがち・MVP
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
    if(rng()<G0.spChance*(S.fac||1)*(tsetOf(S,"spK")||1)){   // 監督ランク(累計の年俸 →term.js)と、セットした称号(レジェンド)
      const pool=TRAIN_SP.map((t,i)=>i).filter(i=>TRAIN_SP[i].slot===param||TRAIN_SP[i].slot==="any");
      // セットした称号の系統に合う特殊練習ほど出やすい(→docs/10 §10.2 B)
      const w=pool.map(i=>trainWeight(S,TRAIN_SP[i])), tot=w.reduce((a,b)=>a+b,0);
      if(pool.length){ let r=rng()*tot; for(let j=0;j<pool.length;j++){ if(r<w[j])return { param, sp:pool[j] }; r-=w[j]; } return { param, sp:pool[pool.length-1] }; }
    }
    return { param, sp:-1 };
  });
  return S.g.opts;
}
/** 基本の練習の名前(能力ごと) */
const TRAIN_NAME={ off:"攻撃練習", def:"守備練習", spd:"速攻練習", tec:"パス練習", pow:"奪取練習", sta:"走行練習" };
function trainLabel(o){ return o.sp>=0?TRAIN_SP[o.sp].name:TRAIN_NAME[o.param]||STAT_LABEL[o.param]+"の練習"; }
/** 練習の中身を、選ぶ前に見せる文にする */
function trainDesc(o){
  const ax=s=>s.split("").map(a=>AXIS_ABBR[a]).join("・");
  if(o.sp<0)return "個人能力 ・ グラフ: "+AXIS_ABBR[PARAM_AXIS[o.param]]+" ↑";
  const t=TRAIN_SP[o.sp], e=t.eff, nm={ ind:"個人", link:"連携", sp:"特殊", set:"セットプレイ" };
  return Object.keys(e).map(k=>nm[k]+"★".repeat(e[k])).join(" ")+" ・ グラフ: "+
    (t.up?ax(t.up)+" ↑":"")+(t.down?" / "+ax(t.down)+" ↓":"");
}
/* ---------- チームの成長グラフ(→docs/15) ----------
 * 6軸 0〜100。対角の2軸(AXIS_PAIR)は合計が器(graphCap)を超えない。伸ばして超えたぶんは対角が下がる。
 * 100 は MAX。MAX の軸をさらに伸ばす練習で、breakP の率で限界突破 → 金色(固定)。金色の対角は「器 − 100」まで。
 * 金色が3つ(各対に1つ)そろうと黄金期: golden 試合のあいだ全員が絶好調 */
const graphCap=S=>{ const R=TUNING.grow.graph; return R.cap+(S.biz?R.capFac[S.biz.fac.tact||0]||0:0); };
const graphGoldN=S=>Object.keys(S.g.gold).filter(a=>S.g.gold[a]).length;
function graphAdd(S,a,v){
  const R=TUNING.grow.graph, g=S.g.graph, gold=S.g.gold, b=AXIS_PAIR[a], cap=graphCap(S);
  if(gold[a]||!v)return;
  if(v<0){ g[a]=Math.max(0,g[a]+v); return; }
  g[a]=Math.min(gold[b]?cap-R.max:R.max,g[a]+v);
  const over=g[a]+g[b]-cap;
  if(over>0)g[b]=Math.max(0,g[b]-over);
}
/** 練習で伸ばした軸のうち、練習の前から MAX だったものが限界突破するか見る。3つそろえば黄金期 */
function graphBreak(S,axes,out){
  const R=TUNING.grow.graph, rng=mulberry32((S.seed^hashStr("gb:"+S.term+":"+S.played))>>>0);
  for(const a of axes){
    if(S.g.gold[a]||S.g.gold[AXIS_PAIR[a]]||rng()>=R.breakP)continue;
    S.g.gold[a]=true; S.g.graph[a]=R.max;
    out.push("🌟 成長グラフの "+AXIS_ABBR[a]+" が限界突破！ 金色に輝いた(もう下がらない)");
    if(graphGoldN(S)>=3&&S.g.goldenAt==null){
      // 黄金期はタグ「黄金期到来」(→docs/23)。付いた時点で全員が絶好調、期限はタグの仕組みで減る
      S.g.goldenAt=S.played;
      out.push("👑 黄金期が到来！ 成長グラフが黄金に。"+R.golden+"試合のあいだ全員が絶好調");
      addTeamTag(S,"golden",out,true);
      // クラブの称号(→docs/23 §23.3): 金色の3軸の組み合わせで1つ。任期の終わりまで
      const ct=clubTitleOf(S.g.gold); addTeamTag(S,ct,out,true);
      out.push("🏷 クラブの称号「"+TAGS[ct].name+"」 ― "+tagStatTxt(TAGS[ct].stat));
    }
  }
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
    newsOf("star",[id],out);
  }
  if(g.is===4&&!g.q&&g.ie>=I.awake){ g.q=true; out.push(nameOf(card)+" に覚醒の兆し(フレンドリーマッチで勝てば覚醒)"); newsOf("q",[id],out); }
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
  if(l.lv<Math.min(l.cap,2))l.exp+=v*facK(S,"lounge")*playerTagK(S,a,"link")*playerTagK(S,b,"link");
}
/** 試合のあと、たまった経験で連携の段を上げる(黄金線=3 はここでは上がらない) */
function settleLinks(S,out){
  const L=TUNING.grow.link; let thin=0;
  for(const k in S.g.links){
    const l=S.g.links[k], p=k.split("|"), cap=Math.min(l.cap||0,2);
    while(l.lv<cap&&l.exp>=L.need[l.lv]){
      l.exp-=L.need[l.lv]; l.lv++;
      if(l.lv===1){ thin++; continue; }       // 薄線はまとめて1行にする(知らせが埋もれないように)
      out.push(nameOf(CARDS[p[0]])+" と "+nameOf(CARDS[p[1]])+" の連携が"+LINK_LABEL[l.lv]+"に");
      newsOf("link",[p[0],p[1]],out);
    }
  }
  if(thin)out.push("新しい連携(薄線)が "+thin+" 組できた");
}
/** いま盤面に並べている11人(前の試合の最後の配置。無ければクラブの既定) */
function squadXi(S){
  return (S.sq||startSquad()).slice(0,11);
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
  const gk=facK(S,"tact"), maxed=Object.keys(S.g.graph).filter(a=>S.g.graph[a]>=R.max-1e-9&&!S.g.gold[a]);   // 練習の前から MAX の軸(戦術室で伸びやすい)
  let ups=[];
  if(o.sp<0){
    for(const id of ids){
      const g=S.g.pl[id], top=STATS.slice().sort((a,b)=>CARDS[id][b]-CARDS[id][a]).slice(0,2);
      g.ie+=(I.train+(top.includes(o.param)?I.trainFit:0))*k*growK(id,S)*facK(S,"train")*tagK(S,"exp");
      g.tr[o.param]=(g.tr[o.param]||0)+1;
    }
    graphAdd(S,PARAM_AXIS[o.param],R.basic*k*gk); ups=[PARAM_AXIS[o.param]];
  }else{
    const t=TRAIN_SP[o.sp], e=t.eff, all=t.up.length===6;
    for(const id of ids){
      const g=S.g.pl[id];
      g.ie+=(I.spTrain+(e.ind||0))*k*growK(id,S)*facK(S,"train")*tagK(S,"exp");
      g.tr[o.param]=(g.tr[o.param]||0)+1;
      // 練習で入る特殊能力の経験は、★突破の話(！)の手前で止める。話はミーティングで経験を足して出す(印が増えすぎないように)
      if(e.sp){ const add=e.sp*G0.sp.train*k*facK(S,"tact"); g.se=g.ss<4&&g.se<G0.sp.need[g.ss]?Math.min(g.se+add,G0.sp.need[g.ss]-1):g.se+add; }
    }
    if(e.link){
      const xi=squadXi(S);
      for(let a=0;a<xi.length;a++)for(let b=a+1;b<xi.length;b++)
        linkExp(S,xi[a],xi[b],e.link*k*linkBonusK(xi[a],xi[b]),linkCap(xi[a],xi[b]));
    }
    if(e.set)S.g.set=Math.min(G0.set.max,S.g.set+G0.set.per*e.set*k*(tsetOf(S,"setK")||1));
    for(const a of t.down)graphAdd(S,a,-R.down*k);
    for(const a of t.up)graphAdd(S,a,(all?R.upAll:R.up)*k*gk);
    ups=[...t.up];
    // ハーフタイムの指示を覚える(同じ特殊練習を unlock 回。→docs/10 §10.8)
    if(S.ht){ const n=S.ht.cnt[o.sp]=(S.ht.cnt[o.sp]||0)+1; if(n===TUNING.ht.unlock)out.push("📋 ハーフタイムの指示「"+htName(TRAIN_SP[o.sp].name)+"」を覚えた(SQUAD で登録できる)"); }
  }
  for(const id of ids){
    const g=S.g.pl[id];
    g.fat=Math.min(N.fatMax,g.fat+N.fat[lv]);
    checkSp(S,id,out);
  }
  graphBreak(S,ups.filter(a=>maxed.includes(a)),out);
  if(N.fat[lv]>0)out.push("疲労 +"+Math.round(N.fat[lv]*100)+"%(試合はそのぶん消耗した状態で始まる)");
  S.g.step="comm"; S.g.cn=0; S.g.done=[];
  return out;
}

/**
 * 休憩。チーム練習の代わりに1手使う。経験は入らないが、疲労が大きく抜け、調子の落ちた選手が戻る
 */
function doRest(S){
  const G0=TUNING.grow, out=[];
  if(S.g.step!=="train")return out;
  const rng=mulberry32((S.seed^hashStr("rest:"+S.term+":"+S.played))>>>0);
  let up=0;
  for(const id in S.g.pl){
    const g=S.g.pl[id];
    g.fat*=G0.rest.keep;
    if(g.mot<G0.mot.start&&g.mot>=1&&rng()<G0.rest.motUp){ g.mot++; up++; }
  }
  out.push("休憩: 疲労が抜けた"+(up?"("+up+"人の調子が戻った)":""));
  S.g.step="comm"; S.g.cn=0; S.g.done=[];
  return out;
}

/* ---------- 進み具合(見える化) ---------- */

/** 個人能力の次の★までの進み(0〜1)。★4なら覚醒の兆しまで */
function indProgress(g){
  const I=TUNING.grow.ind;
  if(g.is>=5||g.q)return 1;
  return Math.min(1,g.ie/(g.is<4?I.need[g.is]:I.awake));
}
function spProgress(g){
  const P=TUNING.grow.sp;
  if(g.ss>=5||g.sq)return 1;
  return Math.min(1,g.se/(g.ss<4?P.need[g.ss]:P.awake));
}
/** 2人の連携の次の段までの進み(0〜1)。太線なら黄金線の兆しが出ているか */
function linkProgress(S,a,b){
  const L=TUNING.grow.link, l=linkOf(S,a,b);
  if(l.lv>=2)return l.gold?1:0;
  return Math.min(1,l.exp/L.need[l.lv]);
}
/** 信頼度(絆)の段 0〜3 */
const trustLv=g=>{ const t=TUNING.grow.trust; let i=0; while(i<t.length&&(g.bond||0)>=t[i])i++; return i; };
const TRUST_LABEL=["まだ遠い","打ち解けてきた","信頼している","心酔している"];

/* ---------- 選手の言葉(→docs/05 §5.3) ----------
 * 疲労・調子・成長・信頼度・出番から、いま一番言いたいことを1つ選ぶ。
 * 同じ試合の同じ選手なら毎回同じ言葉(たねで選ぶ)。 */
const VOICE={
  ready:  ["監督、少しお話ししたいことがあります。","自分の型がつかめそうなんです。聞いてもらえますか。"],
  awake:  ["体が軽い。次の試合で何かが起きそうです。","今なら何でもできる気がします。フレンドリーマッチで試させてください。"],
  near:   ["もう少しで何かつかめそうです。","練習の手応えが変わってきました。"],
  tired:  ["脚が重いです……少し休みたい。","正直、疲れがたまっています。"],
  low:    ["最近うまくいかなくて……。","自信をなくしかけています。"],
  bench:  ["そろそろ試合に出たいです。","ベンチから見ているだけなのはつらいです。"],
  high:   ["今日は調子がいいです！","絶好調です。任せてください！"],
  young:  ["もっと上手くなりたいです！","先輩たちに追いつきたいです。"],
  vet:    ["若い連中の手本にならないとな。","経験なら負けませんよ。"],
  trust:  ["監督の言うことなら信じてやります。","監督のためなら走れます。"],
  new:    ["よろしくお願いします。","まだ監督のことがよく分からなくて……。"],
  plain:  ["はい、なんでしょう。","次の試合も頑張ります。"]
};
function voiceOf(S,id){
  const g=S.g.pl[id], c=CARDS[id], G0=TUNING.grow;
  if(!g)return "";
  // 性格で話し方が変わる。成長期・反抗期などのタグの影響も言葉に出す(→docs/14 §14.108)
  const ck=playerTagK(S,id,"comm"), ek=playerTagK(S,id,"exp");
  const k=spReady(S,id)?"ready":(g.q||g.sq)?"awake":g.mot<=1?"low":g.fat>=G0.int.tiredSign*1.5?"tired"
    :ck<1?"rebel":(ck>1||ek>1)?"grow"
    :(g.bench||0)>=G0.mot.benchGrace?"bench":(indProgress(g)>=0.8&&g.is<5)?"near":g.mot>=4?"high"
    :c.age<=21?"young":c.age>=31?"vet":"plain";   // 信頼の深さは trustSay で添える(→docs/14 §14.109)
  const list=(VOICE_P[persOf(id)]||{})[k]||VOICE[k]||VOICE.plain, r=hashStr("v:"+S.term+":"+S.played+":"+id)%list.length;
  return list[r];
}
/** 手を打ったあとの返事。res: 0=大成功 / 1=成功 / 2=失敗(個人練習・ケアは成功) */
const REACT={
  ind:   [["ありがとうございます！手応えがありました。"],["勉強になりました。"],["……はい。"]],
  talk:  [["気持ちが楽になりました！"],["ありがとうございます。切り替えます。"],["……分かりました。"]],
  meet:  [["監督、やってみます！","目が覚めました！"],["分かりました。考えてみます。"],["それは……少し違う気がします。"]],
  lounge:[["あいつとは息が合いそうです！"],["悪くない時間でした。"],["……どうも噛み合わないな。"]]
};
function reactOf(S,id,kind,res){
  const t=REACT_P[persOf(id)]||REACT[kind]||REACT.ind, list=t[Math.max(0,Math.min(2,res))], r=hashStr("r:"+S.term+":"+S.played+":"+id+":"+kind)%list.length;   // 性格で返事が変わる(→docs/14 §14.108)
  return nameOf(CARDS[id])+"「"+list[r]+"」";
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
  // 重なったカード1枚ごとに +10%(→docs/08 §8.12)
  g.ie+=C.ind*growK(id,S)*facK(S,"train")*(spBoost(S,"indExp")||1)*(1+TUNING.grow.dup.indK*dupOf(S,id))*(tsetOf(S,"indK")||1)*playerTagK(S,id,"exp");
  g.bond++;
  out.push(nameOf(CARDS[id])+" に個別指導(個人能力の経験 +"+C.ind+")");
  // 選手からの提案(→docs/23 §23.2 の 5): 信頼の深い選手が、まれに育成の方針を3択で出す。1人につき任期に1回
  const TP=TUNING.tag.player;
  if(trustLv(g)>=TP.propTrust&&!g.propDone&&mulberry32((S.seed^hashStr("pp:"+S.term+":"+S.played+":"+S.g.cn+":"+id))>>>0)()<TP.propP){
    const opts=traitOptions(S,id);
    if(opts.length){ g.propDone=true; S.g.prop={ id, opts }; out.push("💡 "+nameOf(CARDS[id])+" から、育成の方針の提案があった"); }
  }
  // スポンサーの効果: 秘書がもう1人の先発にも経験の半分を入れる
  const si=spBoost(S,"indSec");
  if(si&&mulberry32((S.seed^hashStr("isec:"+S.term+":"+S.played+":"+S.g.cn))>>>0)()<si){
    const o=S.sq.slice(0,11).filter(x=>x!==id&&S.g.pl[x]&&S.g.pl[x].is<5).sort((a,b)=>S.g.pl[a].is-S.g.pl[b].is)[0];
    if(o){ S.g.pl[o].ie+=C.ind*0.5*growK(o,S)*facK(S,"train"); out.push("💬 "+secOf(S).name+"が "+nameOf(CARDS[o])+" の練習も見てくれた(経験の半分)"); }
  }
  useComm(S,"ind");
  return { res:1, lines:out };
}
/** ケア。調子の落ちた選手を立て直す。モチベーションが上がる。**ケガの選手は手当てで「不調」まで戻る**(→docs/08 §8.8) */
function doTalk(S,id){
  const C=TUNING.grow.comm, g=S.g.pl[id], out=[];
  if(!canComm(S)||!g)return { res:-1, lines:out };
  const was=g.mot;
  g.mot=Math.min(4,g.mot+(g.mot<=2?C.talkLow:C.talk));
  g.bond++;
  // スポンサーの効果: もう1段上がることがある / 秘書がもう1人の落ちた先発もケアする
  const rc=mulberry32((S.seed^hashStr("care:"+S.term+":"+S.played+":"+S.g.cn+":"+id))>>>0);
  const ca=spBoost(S,"care"); if(ca&&was>0&&g.mot<4&&rc()<ca)g.mot++;
  const cs=spBoost(S,"careSec");
  if(cs&&rc()<cs){
    const o=S.sq.slice(0,11).filter(x=>x!==id&&S.g.pl[x]&&S.g.pl[x].mot>0&&S.g.pl[x].mot<=2).sort((a,b)=>S.g.pl[a].mot-S.g.pl[b].mot)[0];
    if(o){ const q=S.g.pl[o], w=q.mot; q.mot=Math.min(4,q.mot+1); out.push("💬 "+secOf(S).name+"が "+nameOf(CARDS[o])+" もケアしてくれた("+MOT_LABEL[w]+" → "+MOT_LABEL[q.mot]+")"); }
  }
  if(was===0)g.injN=0;
  out.push(nameOf(CARDS[id])+(was===0?" のケガを手当てした(":" をケアした(")+MOT_LABEL[was]+" → "+MOT_LABEL[g.mot]+")");
  if(++pCnt(g).care>=TUNING.tag.player.careN&&!pHas(S,id,"injRes"))addPlayerTag(S,id,"injRes",out);   // ケアを重ねた選手はケガに強い(→docs/23)
  useComm(S,"talk");
  return { res:1, lines:out };
}
/**
 * ラウンジで見える2人の様子。相性の組そのものは見せない。
 * 様子の文は相性を映すが、hintNoise の率で隣の相性の文になる(見れば答えが決まる当て物にしない)。
 * 同じ試合の同じ2人なら毎回同じ文
 */
function loungeInfo(S,a,b){
  const c=compatOf(a,b), l=linkOf(S,a,b);
  const r=mulberry32((S.seed^hashStr("lh:"+S.term+":"+S.played+":"+lkey(a,b)))>>>0);
  let h=c;
  if(r()<TUNING.grow.link.hintNoise)h=c===0?1:c===2?1:(r()<0.5?0:2);
  return { compat:c, hint:LOUNGE_HINT[h], lv:l.lv, gold:l.gold, choices:LOUNGE_CHOICE };
}
/**
 * ラウンジ。2人を呼び出して3択に答える。結果は 0=大成功 / 1=成功 / 2=失敗。
 * 相性に合う手ほど大成功しやすい。太線の2人が大成功すると、黄金線の兆しが出る。
 */
function doLounge(S,a,b,choice){
  const L=TUNING.grow.link, out=[];
  if(!canComm(S)||a===b||!S.g.pl[a]||!S.g.pl[b])return { res:-1, lines:out };
  const c=compatOf(a,b), best=LOUNGE_BEST[c];
  const p0=choice===best?L.pFit:choice===(best+1)%3?L.pMid:L.pBad, ok=(spBoost(S,"loungeOk")||0)+(tsetOf(S,"loungeOk")||0);
  const ck=playerTagK(S,a,"comm")*playerTagK(S,b,"comm"), f=Math.min(1,Math.max(0,p0[2]-ok)*(ck>0?1/ck:1));   // 反抗期は失敗しやすく、成長期は失敗しにくい
  const p=[Math.max(0,p0[0]+ok-(f-Math.max(0,p0[2]-ok))),p0[1],f];   // スポンサーの効果: 失敗のぶんが大成功に回る
  const tr=Math.min(p[2],L.trustK*(trustLv(S.g.pl[a])+trustLv(S.g.pl[b]))/2); p[2]-=tr; p[1]+=tr;   // 信頼が深い2人は失敗しにくい(→docs/14 §14.108)
  const r=mulberry32((S.seed^hashStr("lg:"+S.term+":"+S.played+":"+S.g.cn+":"+lkey(a,b)+":"+choice))>>>0)();
  const res=r<p[0]?0:r<p[0]+p[1]?1:2, l=linkSet(S,a,b);
  out.push(["大成功！","成功","失敗…"][res]);
  if(res<2){
    // 太線の2人は、**大成功のときだけ**黄金線の兆しが出る。ラウンジは相性に関係なく太線まで育てられる
    if(l.lv===2){ if(res===0&&!l.gold){ l.gold=true; out.push("フレンドリーマッチで新たな連携が生まれそうだ"); } }
    else{ linkExp(S,a,b,L.lounge[res]*(spBoost(S,"loungeExp")||1),2); out.push("連携の経験 +"+L.lounge[res]+"(試合のあとに太くなる)"); }
    S.g.pl[a].bond++; S.g.pl[b].bond++;
  }else secFollow(S,[],[a,b],out,"lg:"+lkey(a,b),spBoost(S,"loungeSec")||0);
  useComm(S,"lounge");
  return { res, lines:out };
}
/**
 * ミーティングが一緒に効く「周り」の選手(→docs/08 §8.3: 仲のよい選手など)。合わせて near.max 人まで:
 *   ① 呼んだ選手と連携のある登録選手(太い順)
 *   ② 呼んだ選手が先発なら、SQUAD の盤面(S.layout の [h, x])で近い先発(距離 near.r 以内。距離は h と x/100 の直線)
 */
function meetNear(S,id){
  fillLayout(S);                              // 先発の位置が無ければ陣形の枠で埋める(何度呼んでも同じ)
  const N=TUNING.grow.sp.near, on=S.sq.slice(0,11), me=S.layout[id];
  const linked=S.sq.filter(x=>x!==id&&S.g.pl[x]&&linkOf(S,id,x).lv>0).sort((a,b)=>linkOf(S,id,b).lv-linkOf(S,id,a).lv);
  const close=on.includes(id)&&me?on.filter(x=>x!==id&&S.layout[x]&&S.g.pl[x]&&!linked.includes(x))
    .map(x=>({ x, d:Math.hypot(S.layout[x][0]-me[0],(S.layout[x][1]-me[1])/100) }))
    .filter(o=>o.d<=N.r).sort((a,b)=>a.d-b.d).map(o=>o.x):[];
  return linked.concat(close).slice(0,N.max);
}
function meetInfo(S,id){
  const g=S.g.pl[id];
  return { ready:spReady(S,id), pers:PERS_LABEL[persOf(id)], choices:MEET_CHOICE, mot:g.mot, ss:g.ss, se:g.se,
    need:g.ss<4?TUNING.grow.sp.need[g.ss]:TUNING.grow.sp.awake, near:meetNear(S,id) };
}
/**
 * ミーティング。1人を呼び出す。特殊能力の経験がたまる。
 * 経験が満ちていれば★突破の3択が出る(choice)。性格に合う言い方ほど成功しやすい。
 */
function doMeeting(S,id,choice){
  const P=TUNING.grow.sp, g=S.g.pl[id], out=[];
  if(!canComm(S)||!g)return { res:-1, lines:out };
  const mot0=g.mot;
  let res=1;
  if(spReady(S,id)){
    // 性格に合う言い方は成功しやすいが外れることもある。合わなくても、信頼が深い・監督と動物の相性がよいと通ることがある(→docs/14 §14.108)
    const ma=S.mgr&&S.mgr.ani!=null&&ANIMALS[S.mgr.ani]&&ANIMALS[CARDS[id].ani]?aniCompat(S.mgr.ani,CARDS[id].ani):1;
    const p=clamp(((choice===persOf(id)?P.qOk:P.qNg)+P.qTrust[trustLv(g)]+P.qAni[ma]+(tsetOf(S,"qOk")||0))*playerTagK(S,id,"comm"),P.qMin,P.qMax);   // 名将 / 反抗期・成長期
    const r=mulberry32((S.seed^hashStr("mt:"+S.term+":"+S.played+":"+S.g.cn+":"+id+":"+choice))>>>0)();
    if(r<p){
      g.se-=P.need[g.ss]; g.ss++; res=0;
      (S.persSeen||(S.persSeen={}))[id]=true;   // 性格が分かった(カードの裏面に載る。任期をまたいで残る。→docs/24 G3)
      out.push(nameOf(CARDS[id])+" 特殊能力 ★"+g.ss);
    }else{
      g.se=Math.floor(g.se*P.failKeep); res=2;
      if(g.mot>0)g.mot=Math.max(1,g.mot-1);
      out.push(nameOf(CARDS[id])+" の心に響かなかった…(やる気が下がった)");
    }
  }else{
    g.se+=P.meet*facK(S,"tact")*(tsetOf(S,"meetK")||1)*playerTagK(S,id,"exp");
    out.push(nameOf(CARDS[id])+" と戦術の話をした(特殊能力の経験 +"+P.meet+")");
  }
  g.bond+=2;
  checkSp(S,id,out);
  // 周りにも効く: 話を聞いていた近くの選手にも経験が入る。★突破の成否は周りのやる気にも響く
  const N=P.near, near=meetNear(S,id);
  if(near.length){
    const rn=mulberry32((S.seed^hashStr("mn:"+S.term+":"+S.played+":"+S.g.cn+":"+id))>>>0);
    const add=Math.round(P.meet*N.se), up=[], down=[];
    for(const x of near){
      const q=S.g.pl[x];
      if(q.ss<5){ q.se+=add; checkSp(S,x,out); }
      q.bond++;
      if(res===0&&rn()<N.up&&q.mot>0&&q.mot<4){ q.mot++; up.push(x); }
      else if(res===2&&rn()<N.down&&q.mot>1){ q.mot--; down.push(x); }
    }
    out.push("周りの "+near.map(x=>nameOf(CARDS[x])).join("・")+" も聞いていた(特殊能力の経験 +"+add+")");
    if(up.length)out.push(up.map(x=>nameOf(CARDS[x])).join("・")+" も奮い立った(やる気が上がった)");
    if(down.length)out.push(down.map(x=>nameOf(CARDS[x])).join("・")+" にも動揺が広がった(やる気が下がった)");
    if(res===2)secFollow(S,[[id,mot0]].concat(down.map(x=>[x,S.g.pl[x].mot+1])),[],out,"mt:"+id);
  }else if(res===2)secFollow(S,[[id,mot0]],[],out,"mt:"+id);
  useComm(S,"meet");
  return { res, lines:out };
}
/** 残りのコミュニケーションを使わずに試合へ */
function skipComm(S){ if(S.g.step==="comm")S.g.step="ready"; }
/**
 * 選手の上に「！」が出るか(★突破の3択が待っている / やる気が絶不調)。
 * **疲労では出さない**(練習のたびに全員に付いて、印の意味が無くなるため。疲労は選手一覧と秘書が伝える)
 */
/** 「！」の印。★突破の話がある選手と、先発で絶不調の選手だけ(控えにまで付けると印の意味が薄れる) */
function hasSign(S,id){ const g=S.g.pl[id]; return spReady(S,id)||(g.mot<=1&&S.sq.indexOf(id)<11); }

/* ---------- ③ 試合のあと ---------- */

/** 重なったカードの枚数(持っている枚数 − 1。数えるのは dup.max まで) */
const dupOf=(S,id)=>Math.min(TUNING.grow.dup.max,Math.max(0,((S.coll&&S.coll[id])||1)-1));
/** 覚醒で1項目に上がる値(1〜3 = 無地 / ＋ / ＋＋)。重なりが多いほど大きい値が出やすい */
function awakeGain(S,id,rng){
  const D=TUNING.grow.dup, n=dupOf(S,id), p=D.awakeP.map((v,i)=>Math.max(0,v+D.awakeStep[i]*n)), t=p.reduce((a,b)=>a+b,0);
  let r=rng()*t; for(let i=0;i<3;i++){ if(r<p[i])return i+1; r-=p[i]; } return 1;
}
const GAIN_MARK=["","","＋","＋＋"];
/** 覚醒。能力が最大3項目、各+1〜3(どれが上がるか・いくつ上がるかは不定。1つは必ず上がる。重なりで大きくなりやすい) */
function awaken(S,id,rng,out){
  const I=TUNING.grow.ind, g=S.g.pl[id], card=CARDS[id], got=[];
  const pool=STATS.filter(k=>card[k]+(g.up[k]||0)<STAT_MAX&&card[k]>TUNING.grow.startKeep);
  for(let n=0;n<3&&pool.length;n++){
    if(n>0&&rng()>=I.awakeUp[n])break;
    const k=pool.splice(Math.floor(rng()*pool.length),1)[0];
    const v=Math.min(awakeGain(S,id,rng),STAT_MAX-card[k]-(g.up[k]||0));
    g.up[k]=(g.up[k]||0)+v; got.push(STAT_LABEL[k]+" +"+v+GAIN_MARK[v]);
  }
  g.is=5; g.q=false; g.ie=0;
  out.push("⭐ "+nameOf(card)+" が覚醒！("+got.join("・")+")");
  if(S.ts&&S.ts.awake!=null)S.ts.awake++;
  newsOf("awake",[id],out);
}
/**
 * 試合の結果を育成に反映する。**★の上昇・覚醒・連携の変化はここで起きる**。
 *   res.played  … その試合に出た選手 / res.onPitch … 最後に盤面に居た選手 / res.win
 * フレンドリーマッチに勝つと、兆しのある選手・連携が開花する(必ずではない)。
 */
/* 試合のあとの知らせ(誰に何が起きたか)。ロッカールームで話す選手を選ぶのに使う(→docs/07 §7.12)。
 * 試合のあとだけ集める(練習・コミュニケーションの最中は集めない) */
let GROW_NEWS=null;
function newsOf(kind,ids,out){ if(GROW_NEWS)GROW_NEWS.push({ kind, ids, line:out[out.length-1] }); }
function afterMatchGrowth(S,fx,res){
  const G0=TUNING.grow, I=G0.ind, L=G0.link, Mo=G0.mot, N=G0.int, out=[];
  GROW_NEWS=res.news=[];
  const rng=mulberry32((S.seed^hashStr("gr:"+S.term+":"+S.played))>>>0);
  const played=res.played.filter(id=>S.g.pl[id]), on=res.onPitch.filter(id=>S.g.pl[id]);
  const st0={}; for(const id in S.g.pl)st0[id]=S.g.pl[id].is+S.g.pl[id].ss;   // 成長期の判定(試合の前の★)
  for(const id of played)S.g.pl[id].ie+=I.match*growK(id,S)*facK(S,"train")*playerTagK(S,id,"exp");
  for(let a=0;a<on.length;a++)for(let b=a+1;b<on.length;b++)
    linkExp(S,on[a],on[b],L.match*linkBonusK(on[a],on[b]),linkCap(on[a],on[b]));
  for(const id in S.g.pl)checkInd(S,id,out);
  settleLinks(S,out);
  // フレンドリーマッチの勝利で開花: **その試合に出場していれば**(途中出場・途中交代も可。スーパーサブの KP も。→docs/21 §21.5)
  if(fx.kind==="friendly"&&res.win){
    for(const id of played){
      const g=S.g.pl[id];
      if(g.q&&rng()<I.awakeP)awaken(S,id,rng,out);
      if(g.sq&&rng()<G0.sp.star5P){ g.ss=5; g.sq=false; g.se=0; out.push("⭐ "+nameOf(CARDS[id])+" の特殊能力が ★5 に(スタイルが極まる)"); newsOf("star5",[id],out); }
    }
    // 黄金線は1試合に1本まで(兆しのある組のうち、たねで1つ選ぶ)
    const cand=Object.keys(S.g.links).filter(k=>{ const l=S.g.links[k], p=k.split("|");
      return l.gold&&l.lv===2&&played.includes(p[0])&&played.includes(p[1]); });
    if(cand.length&&rng()<L.goldP){
      const k=cand[Math.floor(rng()*cand.length)], l=S.g.links[k], p=k.split("|");
      l.lv=3; l.gold=false;
      out.push("✨ "+nameOf(CARDS[p[0]])+" と "+nameOf(CARDS[p[1]])+" の連携が黄金の輝きに");
      if(S.ts&&S.ts.gold!=null)S.ts.gold++;
      newsOf("gold",[p[0],p[1]],out);
    }
  }
  // 疲労: 出た選手は試合のぶん溜まり、全員が次までに半分ほど抜ける
  for(const id in S.g.pl){
    const g=S.g.pl[id];
    g.fat=Math.min(N.fatMax,(g.fat+(played.includes(id)?N.matchLoad*(spBoost(S,"noFat")||1)*playerTagK(S,id,"fat")*tagK(S,"fat"):0))*N.recover*medFat(S));
  }
  // ケガ(→docs/08 §8.8): 試合の中でケガをした選手は「ケガ」に。前からのケガは確率で治る(続いても maxN 試合で治る)
  const J=TUNING.inj, newInj=(res.inj||[]).filter(id=>S.g.pl[id]);
  for(const id in S.g.pl){
    const g=S.g.pl[id];
    if(newInj.includes(id)){ g.mot=0; g.injN=1; out.push("🩹 "+nameOf(CARDS[id])+" がケガ(治るまで能力が落ちる。メディカルで手当てできる)"); newsOf("inj",[id],out); }
    else if(g.mot===0){
      if((g.injN||0)>=J.maxN||rng()<J.heal+medHeal(S)){ g.mot=J.healTo; g.injN=0; out.push(nameOf(CARDS[id])+" のケガが治った"); }
      else{ g.injN=(g.injN||0)+1; out.push(nameOf(CARDS[id])+" のケガが続いている"); }
    }
  }
  const giant=tsetOf(S,"giant")&&fx.opp&&TEAMS[fx.opp]&&tierOf(fx.opp)>=S.grade+2?tsetOf(S,"giant"):0;   // 刺客(格上 = 強さの段がリーグの格より2つ以上上)
  // モチベーション(→docs/08 §8.4): 出て勝てば上がり、負ければ下がる。
  // 控えは出番の無い試合が続くと下がり始めるが、ゆるやか。勝てば控えも少し上がる。何も起きなければ普通へ戻る
  for(const id in S.g.pl){
    const g=S.g.pl[id], was=g.mot;
    if(g.mot===0||newInj.includes(id)){ if(!played.includes(id))g.bench=(g.bench||0)+1; else g.bench=0; continue; }
    const sw=motSwing(id);                    // 若いほどむらがある
    if(played.includes(id)){
      g.bench=0;
      if(res.win&&rng()<Mo.winUp*sw*(tsetOf(S,"winUpK")||1)*tagK(S,"motUp")*playerTagK(S,id,"motUp"))g.mot=Math.min(4,g.mot+1);
      else if(res.win&&giant&&rng()<giant)g.mot=Math.min(4,g.mot+1);   // 刺客: 格上に勝つと上がりやすい
      else if(res.lose&&rng()<Mo.loseDown*sw*(spBoost(S,"keepForm")??1)*(fx.kind==="cup"?(tsetOf(S,"cupKeep")||1):1)*tagK(S,"motDown")*playerTagK(S,id,"motDown"))g.mot=Math.max(1,g.mot-1);
      else if(!res.win&&!res.lose&&rng()<Mo.drawSwing*sw)g.mot=clamp(g.mot+(rng()<0.5?1:-1),1,4);
    }else{
      g.bench=(g.bench||0)+1;
      if(g.bench>=Mo.benchGrace&&rng()<Mo.benchDown*sw*(spBoost(S,"bench")??1)*(tsetOf(S,"benchK")||1)*tagK(S,"motDown")*playerTagK(S,id,"motDown"))g.mot=Math.max(1,g.mot-1);
      else if(res.win&&rng()<Mo.teamWinUp)g.mot=Math.min(4,g.mot+1);
    }
    if(g.mot===was&&g.mot!==Mo.start&&rng()<Mo.revert)g.mot+=g.mot<Mo.start?1:-1;
  }
  // タグ(→docs/23)。期限を減らし、付く・消えるを判定する。付いたタグは次の試合から効く。
  // 黄金期(タグ「黄金期到来」。→docs/15 §15.3)の残りのあいだは、ケガ以外の全員が絶好調のまま
  tagsAfterMatch(S,fx,res,out);
  playerTagsAfterMatch(S,fx,res,out,st0);      // 選手のタグ(→docs/23 §23.4)
  fameAfterMatch(S,res,out);                    // スター選手(→docs/23 §23.11)
  motLockApply(S);
  S.g.step="train"; S.g.opts=null; S.g.cn=0; S.g.done=[];
  GROW_NEWS=null;
  return out;
}

/* ---------- 秘書(→docs/08 §8.7・docs/05 §5.12) ----------
 * 4人から選ぶ。**能力の差はなく、口調だけが違う**。親密度は秘書ごとに持つ(替えても消えない)。
 * 親密度: 試合のたびに +1、大会の優勝で +3、監督室の短い会話で +0〜3。段(0〜3)で話し方が少し変わり、フォローが起きやすくなる。
 * フォロー: ミーティングの★突破・ラウンジが失敗したとき、秘書が入ってやる気を戻す(段ごとの率 TUNING.sec.follow)
 * 状態は S.sec = { id, bond:{ 秘書id: 親密度 }, chosen:その任期に選んだか, ev:待っている会話の番号 | null } */
const SECS=[
  { id:"s0", name:"白石 葵",   desc:"丁寧で落ち着いた" },
  { id:"s1", name:"ゾーイ・カーター",   desc:"元気で明るい" },
  { id:"s2", name:"エリカ・ハートマン", desc:"クールで分析的" },
  { id:"s3", name:"フィオナ・オコナー", desc:"おっとりした年上" }
];
const SEC_LV_LABEL=["他人行儀","打ち解けた","信頼","相棒"];
/** 秘書の言葉。値が [段0〜1, 段2〜3] の組なら親密度で替わる。{n} {c} は差し込み */
const SEC_LINES={
  s0:{ hello:"白石です。今日から監督の秘書を務めます。よろしくお願いいたします。",
    welcome:["ようこそ、監督。まずは次の試合に向けて準備を始めましょう。","監督、今日もよろしくお願いします。準備を始めましょうか。"],
    next:["次の試合の準備を始めましょう。","監督、次の試合の準備をいたしましょう。私もお手伝いします。"],
    comm:"練習は済みました。コミュニケーションがあと {n} 回使えます。",
    tired:"選手が疲れています。今日の練習は軽めにしてはいかがでしょう。",
    sign:"「！」の付いた選手が {n} 人います。話を聞いてあげてください。",
    omen:"フレンドリーマッチです。兆しのある選手を出して勝てば、開花します。",
    final:"{c}の決勝です。ここで勝てばタイトルです。",
    hurt:"{n} がケガをしています。SQUAD で控えと入れ替えるか、メディカルで手当てしましょう。",
    termOver:"任期が終わりました。お疲れさまでした。",
    win:["お疲れさまでした。見事な勝利です。","お疲れさまでした。監督の采配、見事でした。"],
    lose:["お疲れさまでした。切り替えて次へ行きましょう。","悔しいですね……。でも監督なら大丈夫です。次へ行きましょう。"],
    draw:"お疲れさまでした。引き分けでした。",
    follow:"{n} には私から話しておきました。少し落ち着いたようです。",
    lvup:"監督……これからも、そばで支えさせてください。" },
  s1:{ hello:"ゾーイです！ 秘書として全力でサポートしますね、監督！",
    welcome:["監督、はじめましょう！ まずは次の試合の準備から！","監督！ 今日もいっしょに頑張りましょう！"],
    next:["次の試合、準備していきましょう！","よーし監督、次もいっちゃいましょう！"],
    comm:"練習おわりました！ コミュニケーションはあと {n} 回できますよ！",
    tired:"みんなヘトヘトみたいです……。今日は軽めにしませんか？",
    sign:"「！」の付いた選手が {n} 人いますよ！ 話を聞いてあげてください！",
    omen:"フレンドリーマッチです！ 兆しのある選手を出して勝てば、きっと開花します！",
    final:"{c}の決勝ですよ！ 勝てばタイトルです、ドキドキしますね！",
    hurt:"{n} がケガしちゃってます！ 控えと入れ替えるか、メディカルで手当てしてあげてください！",
    termOver:"任期おわりましたー！ 監督、おつかれさまでした！",
    win:["やりましたね監督！ 勝ちましたー！","さっすがボス！ 最高の試合でした！"],
    lose:["うう、くやしい……。でも次こそ勝ちましょう！","ボス、落ち込まないで！ 次はぜったい勝てます！"],
    draw:"引き分けかぁ……。次は勝ちきりましょう！",
    follow:"{n} にはわたしから声かけときました！ 元気出たみたいです！",
    lvup:"ボス、これからもずーっといっしょに頑張りましょうね！" },
  s2:{ hello:"ハートマンです。データの整理と報告は任せてください。",
    welcome:["監督。まずは次の試合の準備を。","監督、準備はできています。始めましょう。"],
    next:["次の試合の準備を。","次の相手の資料はまとめてあります。準備を始めましょう。"],
    comm:"練習は完了。コミュニケーションの残りは {n} 回です。",
    tired:"チームの疲労が溜まっています。今日の練習は軽めが合理的です。",
    sign:"「！」の付いた選手が {n} 人。対応を推奨します。",
    omen:"フレンドリーマッチです。兆しのある選手を出して勝てば、開花の確率があります。",
    final:"{c}の決勝です。勝てばタイトル。",
    hurt:"{n} が負傷中。控えとの入れ替えか、メディカルでの処置を推奨します。",
    termOver:"任期終了です。お疲れさまでした。",
    win:["勝利です。内容も悪くありません。","勝利です。……監督の判断は、正しかったと思います。"],
    lose:["敗戦です。原因は分析しておきます。","敗戦です。でも、修正点は見えています。監督なら立て直せます。"],
    draw:"引き分けです。決定力に課題が残りました。",
    follow:"{n} の件は処理しておきました。問題ありません。",
    lvup:"……監督の隣で仕事をするのは、悪くないです。" },
  s3:{ hello:"フィオナよ。ふふ、監督のお手伝い、のんびりやらせてもらいますね。",
    welcome:["あら監督、いらっしゃい。まずは次の試合の準備からね。","監督、今日も来てくれたのね。さ、準備しましょうか。"],
    next:["次の試合の準備、始めましょうか。","次の試合も、監督らしくいきましょうね。"],
    comm:"練習はおしまい。コミュニケーションはあと {n} 回できるわよ。",
    tired:"みんな少しお疲れみたい。今日は軽めにしてあげたら？",
    sign:"「！」の付いた子が {n} 人いるわ。お話、聞いてあげて。",
    omen:"フレンドリーマッチね。兆しのある子を出して勝てば、花が開くかも。",
    final:"{c}の決勝ね。勝てばタイトルよ。",
    hurt:"{n} がケガをしてるの。控えと替えるか、メディカルで手当てしてあげてね。",
    termOver:"任期はおしまい。本当にお疲れさま。",
    win:["お疲れさま。いい試合だったわね。","ふふ、さすが監督。みんな誇らしそうよ。"],
    lose:["お疲れさま。負けた日は、ゆっくり休むのも大事よ。","大丈夫。監督が下を向かなければ、みんなついてくるわ。"],
    draw:"お疲れさま。引き分けね、惜しかったわ。",
    follow:"{n} とは私がお茶でもしながら話しておいたわ。もう大丈夫よ。",
    lvup:"監督と一緒にいると、なんだか楽しいわ。これからもよろしくね。" }
};
/** 監督室の短い会話(親密度のイベント)。答えごとに親密度が上がる量 */
const SEC_EVENTS=[
  { q:"差し入れを持ってきました。どれにしますか？", ch:[["コーヒーを頼む",2],["紅茶がいいな",2],["今はいらない",0]] },
  { q:"次の相手の資料、まとめておきましょうか？", ch:[["頼む。助かるよ",3],["自分でやるよ",1]] },
  { q:"今日のスタジアム、すごい歓声でしたね。", ch:[["君の支えのおかげだ",3],["選手たちのおかげだ",2],["まだまだこれからだ",1]] },
  { q:"お休みの日は、何をしているんですか？", ch:[["試合の研究だ",1],["街を散歩している",2],["それは秘密だ",2]] },
  { q:"選手たちの写真、クラブの広報に使ってもいいですか？", ch:[["いい写真を頼む",2],["任せるよ",3],["試合に集中させたい",1]] }
];
const SEC_EV_REPLY=["……そうですか。","はい！","ふふ、ありがとうございます。","監督……うれしいです。"];
const secOf=S=>SECS.find(x=>x.id===(S.sec&&S.sec.id))||SECS[0];
const secBond=S=>(S.sec&&S.sec.bond[secOf(S).id])||0;
function secLv(S){ const t=TUNING.sec.lv, b=secBond(S); let i=0; while(i<t.length&&b>=t[i])i++; return i; }
function newSec(){ return { id:"s0", bond:{}, chosen:false, ev:null }; }
/** 秘書の言葉。key の言葉を、いまの秘書の口調と親密度で返す */
function secSay(S,key,vars){
  const L=SEC_LINES[secOf(S).id]||SEC_LINES.s0;
  let t=L[key]!=null?L[key]:SEC_LINES.s0[key];
  if(Array.isArray(t))t=t[secLv(S)>=2?1:0];
  t=t||"";
  for(const k in (vars||{}))t=t.split("{"+k+"}").join(vars[k]);
  return t;
}
/** 親密度を上げる。段が上がったら秘書の一言を返す */
function secGain(S,v){
  if(!S.sec||v<=0)return null;
  const id=secOf(S).id, lv0=secLv(S);
  S.sec.bond[id]=(S.sec.bond[id]||0)+v;
  const lv=secLv(S);
  return lv>lv0?"💬 "+secOf(S).name+"との仲が「"+SEC_LV_LABEL[lv]+"」に"+(lv===SEC_LV_LABEL.length-1?"。「"+secSay(S,"lvup")+"」":""):null;
}
function chooseSec(S,id){ if(!SECS.some(x=>x.id===id))return false; S.sec.id=id; S.sec.chosen=true; return true; }
/** 監督室の会話に答える。親密度が上がる量を返す */
function answerSecEvent(S,i){
  const ev=SEC_EVENTS[S.sec.ev]; if(!ev||!ev.ch[i])return null;
  const v=ev.ch[i][1]; S.sec.ev=null;
  const up=secGain(S,v);
  const rp=(SEC_LINES[secOf(S).id]||{}).reply||SEC_EV_REPLY;
  return { v, line:secOf(S).name+"「"+rp[Math.min(3,v)]+"」", up };
}
/**
 * 秘書のフォロー。コミュニケーションが失敗したときに呼ぶ。起きたら下がったやる気を戻す(drops: [[id, 元のやる気]])、
 * ups の選手はやる気を1段上げる。起きたかどうかを返す
 */
function secFollow(S,drops,ups,out,salt,plus){
  if(!S.sec)return false;
  const p=TUNING.sec.follow[secLv(S)]+(plus||0);   // plus … スポンサーの効果(旅行・航空)
  const r=mulberry32((S.seed^hashStr("sf:"+S.term+":"+S.played+":"+S.g.cn+":"+salt))>>>0)();
  if(r>=p)return false;
  const names=[];
  for(const [id,was] of drops){ const g=S.g.pl[id]; if(g&&g.mot>0&&g.mot<was){ g.mot=was; names.push(nameOf(CARDS[id])); } }
  for(const id of ups){ const g=S.g.pl[id]; if(g&&g.mot>0&&g.mot<4){ g.mot++; if(!names.includes(nameOf(CARDS[id])))names.push(nameOf(CARDS[id])); } }
  if(!names.length)return false;
  out.push("💬 秘書のフォロー: "+secOf(S).name+"「"+secSay(S,"follow",{ n:names.join("・") })+"」(やる気が戻った)");
  return true;
}

/** チーム力 = 先発11人の、育成を反映した能力の合計の平均(→docs/09 第2弾)。任期の始めからの伸びを見せる */
/* OVR = 選手 + 成長(→docs/14 §14.129)。選手 = 先発11人の6能力の合計の平均(teamPower)、成長 = 成長グラフ6軸の合計 ÷ ovrDiv(最大 +約20)。
 * 表示の物差し。試合の強さの計算は変えない */
const graphOvr=g=>g?["O","D","R","C","S","P"].reduce((s,a)=>s+(+g[a]||0),0)/TUNING.grow.graph.ovrDiv:0;
const teamOvr=S=>teamPower(S)+graphOvr(S.g&&S.g.graph);
function teamPower(S){
  const xi=S.sq.slice(0,11); let t=0;
  for(const id of xi){ const c=growCard(S,CARDS[id]); t+=STATS.reduce((a,k)=>a+c[k],0); }
  return t/xi.length;
}

/* ---------- ハーフタイムの指示(→docs/10 §10.8) ----------
 * S.ht = { cnt:{ 特殊練習の番号: した回数 }, set:[登録した指示の id(最大3)] }。監督の覚えた作戦なので任期をまたいで残る。
 * 指示の id: 初めから使えるものは "b1"〜"b3"、特殊練習から覚えたものは "t" + 特殊練習の番号 */
const htName=n=>HT_PHRASE[n]||n+"を思い出せ";
function htOf(id){
  const b=HT_BASIC.find(x=>x.id===id); if(b)return Object.assign({ k:TUNING.ht.basicK },b);
  const i=/^t(\d+)$/.exec(id||""); const t=i&&TRAIN_SP[+i[1]];
  return t?{ id, name:htName(t.name), up:t.up, down:t.down, k:1, train:t.name }:null;
}
/** 使える指示(初めからの3つ + 覚えたもの) */
function htAvail(S){ const out=HT_BASIC.map(b=>b.id); if(S&&S.ht)for(const i in S.ht.cnt)if(S.ht.cnt[i]>=TUNING.ht.unlock)out.push("t"+i); return out; }
function toggleHt(S,id){
  const set=S.ht.set, i=set.indexOf(id);
  if(i>=0){ set.splice(i,1); return true; }
  if(!htAvail(S).includes(id)||set.length>=TUNING.ht.max)return false;
  set.push(id); return true;
}

/**
 * コミュニケーションの種類ごとの「！」(→docs/05 §5.3)。その指示を求めている選手だけに付ける
 *   ind   … 個人能力の★が近い(次の★まで commSignK 以上)/ meet … ★突破の話がある / lounge … 黄金線の兆しか、連携の段が近い / talk … ケガか、絶不調の先発
 */
function commSign(S,id,kind){
  const g=S.g.pl[id], K=TUNING.grow.commSignK; if(!g)return false;
  if(kind==="ind")return g.is<4&&!g.q&&indProgress(g)>=K;
  if(kind==="meet")return spReady(S,id);
  if(kind==="talk")return g.mot===0||(g.mot<=1&&S.sq.indexOf(id)<11);
  if(kind==="lounge")return Object.keys(S.g.links).some(k=>{ const p=k.split("|"); return p.includes(id)&&linkSign(S,p[0],p[1]); });
  return false;
}
/** 2人の連携が強くなる前兆(黄金線の兆しか、次の段が近い)。ラウンジで1人目を選んだあとの「！」はこれで付ける */
function linkSign(S,a,b){
  const l=linkOf(S,a,b);
  return !!l.gold||(l.lv<2&&linkProgress(S,a,b)>=TUNING.grow.commSignK);
}

/*
 * 秘書ごとの口調の続き(→docs/05 §5.12)。視察レポート(sc*)・スタジアム改修の知らせ(stad*)・会話の返事(reply)。
 *   視察レポートの差し込み: {s} チームの色 / {w} 上回る軸 / {a} 勧める動き(言い切りの形)/ {p} 相手監督の人となり /
 *   {g} KP のやること / {n} 選手 / {x} 柱の選手 / {c} まとめ役 / {k} キッカー
 */
Object.assign(SEC_LINES.s0,{
  cmInd:"今日は誰の練習を見ましょうか？",
  cmMeet:"誰とミーティングしましょうか？",
  cmMeetSign:"誰とミーティングしましょうか？ 話をしたそうな選手がいます。",
  cmLounge:"選手同士で話をさせてみましょう。誰と誰にしますか？",
  cmLounge2:"{n} と、もう1人は誰にしますか？",
  cmTalk:"誰の様子を見ましょうか？ 調子を落としている選手ほど効きます。",
  cmTalkHurt:"{n} がケガをしています。手当てしてあげてください。",
  cmDone:"今回の個別指導はここまでです。視察に進みましょう。",
  tiredMany:"選手の多くが疲れを訴えています。今日は休憩か、軽めの練習がよさそうです。",
  chProp:"{n} が自分の育て方を相談してきました。選んだ道が、その選手の特性になります。",
  chLink:"{a} と {b}、いまは「{l}」です。", chNear:"周りで {n} も聞いています。",
  chReady:"★突破の話を切り出してきました。性格は「{p}」です。", chMot:"いま {m} ・ 疲労 {f}%です。",
  scStyle:"{s}が得意なチームです。",
  scAdv:"{w}はこちらのほうが上ですので、{a}のがよいと思います。",
  scNoAdv:"どの面でも相手が一枚上手のようです。KP と指示で揺さぶりましょう。",
  scPers:"相手監督は{p}のようです。",
  scKpTeam:"相手はチームで「{g}」戦い方をしてきそうです。",
  scKpOne:"相手の {n} の{g}に警戒しましょう。",
  scRare:"{n} は特別な力を秘めているようです。目を離さないでください。",
  scPillar:"{x} がチームの柱のようです。",
  scRoles:"まとめ役は {c}。セットプレーは {k} が蹴りそうです。",
  scUp:"全体の力はこちらが上回っています。落ち着いていけば勝てるはずです。",
  scDown:"相手は強豪です。粘り強く、チャンスを待ちましょう。",
  scEven:"力は互角です。細かい采配が勝負を分けそうです。",
  stadMoney:"資金がたまりました。", stadRep:"{r}で、クラブの評価が上がっています。",
  stad:"スタジアムを「{nm}」(収容 {cap}万人)に改修しませんか。費用は {c}億です{d}。",
  reply:["……そうですか。","はい！","ふふ、ありがとうございます。","監督……うれしいです。"] });
Object.assign(SEC_LINES.s1,{
  cmInd:"今日は誰の練習を見てあげます？",
  cmMeet:"誰を呼び出しますか？",
  cmMeetSign:"誰を呼び出しますか？ 話したそうにしてる子がいますよ！",
  cmLounge:"選手同士でおしゃべりさせちゃいましょう！ 誰と誰にします？",
  cmLounge2:"{n} と、もう1人は誰にします？",
  cmTalk:"誰の様子を見に行きます？ 元気がない子ほど効きますよ！",
  cmTalkHurt:"{n} がケガしてます！ 手当てしてあげてください！",
  cmDone:"今回の個別指導はおしまいです！ 視察に行きましょう！",
  tiredMany:"みんなヘトヘトだって言ってます！ 今日は休ませてあげませんか？",
  chProp:"{n} が育て方の相談に来ましたよ！ 選んだ道が特性になります！",
  chLink:"{a} と {b}、いまは「{l}」ですよ！", chNear:"周りで {n} も聞き耳たててます！",
  chReady:"★突破の話、切り出してきましたよ！ 性格は「{p}」です！", chMot:"いま {m} ・ 疲労 {f}% です！",
  scStyle:"{s}が得意なチームみたいです！",
  scAdv:"{w}はこっちが上です！ {a}作戦でいきましょう！",
  scNoAdv:"うーん、どこを見ても相手のほうが上かも……。KP と指示でかき回しちゃいましょう！",
  scPers:"相手の監督は{p}みたいですよ！",
  scKpTeam:"相手はチームで「{g}」戦い方をしてきそうです！",
  scKpOne:"相手の {n} の{g}、要注意です！",
  scRare:"{n}、なんだかただ者じゃない感じがします……！ 目を離さないでくださいね！",
  scPillar:"{x} がチームの柱です！",
  scRoles:"まとめ役は {c}！ セットプレーは {k} が蹴ってきそうです！",
  scUp:"全体の力はこっちが上です！ いつもどおりいけば勝てますよ！",
  scDown:"相手は強豪です！ でも粘ればチャンスは来ます、ファイトです！",
  scEven:"力は互角です！ 監督の采配の見せどころですね！",
  stadMoney:"資金がたまりましたよ！", stadRep:"{r}で、クラブの評判が上がってます！",
  stad:"スタジアムを「{nm}」(収容 {cap}万人)にしちゃいませんか！ 費用は {c}億です{d}！",
  reply:["そっかぁ……。","はい！","えへへ、ありがとうございます！","監督……すっごくうれしいです！"] });
Object.assign(SEC_LINES.s2,{
  cmInd:"個人練習の対象を指名してください。",
  cmMeet:"面談の対象を指名してください。",
  cmMeetSign:"面談の対象を指名してください。相談を希望する選手がいます。",
  cmLounge:"選手間の交流を設定します。2名を指名してください。",
  cmLounge2:"{n} と組ませる、もう1名を指名してください。",
  cmTalk:"ケアの対象を指名してください。不調の選手ほど効果が高いです。",
  cmTalkHurt:"{n} が負傷中。処置を推奨します。",
  cmDone:"個別指導は終了です。視察へ進んでください。",
  tiredMany:"疲労を訴える選手が多数。休憩か軽めの練習を推奨します。",
  chProp:"{n} から育成方針の相談です。選択がそのまま特性になります。",
  chLink:"{a} と {b}、現在「{l}」。", chNear:"{n} も周りで聞いています。",
  chReady:"★突破の話を切り出してきました。性格は「{p}」。", chMot:"状態は {m}、疲労 {f}%。",
  scStyle:"{s}を得意とするチームです。",
  scAdv:"{w}はこちらが上回っています。{a}のが合理的です。",
  scNoAdv:"すべての面で相手が上回っています。KP と指示で揺さぶる以外に手はありません。",
  scPers:"相手監督は{p}と見ています。",
  scKpTeam:"相手はチームで「{g}」戦い方を選ぶ可能性が高いです。",
  scKpOne:"警戒すべきは {n} の{g}。",
  scRare:"{n} には、データでは測れない力があります。注意を。",
  scPillar:"{x} が相手の軸です。",
  scRoles:"まとめ役は {c}。セットプレーは {k} が担当する見込みです。",
  scUp:"総合力はこちらが上。冷静に進めれば勝てます。",
  scDown:"総合力は相手が上。耐えて、好機を待つべきです。",
  scEven:"総合力は互角。采配の差が結果を分けます。",
  stadMoney:"資金が改修の目安に達しました。", stadRep:"{r}により、クラブの評価が上昇しています。",
  stad:"スタジアムを「{nm}」(収容 {cap}万人)に改修する提案です。費用は {c}億{d}。",
  reply:["……了解です。","はい。","……ありがとうございます。","……監督。うれしい、です。"] });
Object.assign(SEC_LINES.s3,{
  cmInd:"今日は誰の練習を見てあげる？",
  cmMeet:"誰を呼んで話をする？",
  cmMeetSign:"誰を呼んで話をする？ 話したそうな子がいるわよ。",
  cmLounge:"選手同士で話をさせてみましょ。誰と誰にする？",
  cmLounge2:"{n} と、もう1人は誰にする？",
  cmTalk:"誰の様子を見てあげる？ 元気のない子ほど効くわ。",
  cmTalkHurt:"{n} がケガをしてるの。手当てしてあげて。",
  cmDone:"今回の個別指導はここまでね。視察に行きましょ。",
  tiredMany:"みんな疲れたって言ってるわ。今日はゆっくりさせてあげて。",
  chProp:"{n} が育て方の相談に来たわ。選んだ道が、あの子の特性になるのよ。",
  chLink:"{a} と {b}、いまは「{l}」ね。", chNear:"周りで {n} も聞いているわ。",
  chReady:"★突破の話を切り出してきたわ。性格は「{p}」よ。", chMot:"いま {m} ・ 疲労 {f}% ね。",
  scStyle:"{s}が得意なチームみたいね。",
  scAdv:"{w}はこちらのほうが上よ。{a}のがいいと思うわ。",
  scNoAdv:"どこを見ても相手のほうが少し上手みたい。KP と指示で揺さぶってみましょうか。",
  scPers:"相手の監督は{p}みたいよ。",
  scKpTeam:"相手はチームで「{g}」戦い方をしてきそうね。",
  scKpOne:"相手の {n} の{g}には気をつけてね。",
  scRare:"{n} は、何か特別なものを持っている気がするの。よく見ておいてね。",
  scPillar:"{x} がチームの柱みたいね。",
  scRoles:"まとめ役は {c}。セットプレーは {k} が蹴りそうよ。",
  scUp:"全体の力はこちらが上ね。落ち着いていけば大丈夫よ。",
  scDown:"相手は強豪ね。焦らず、チャンスを待ちましょう。",
  scEven:"力は互角ね。監督の采配次第よ。",
  stadMoney:"資金がたまったわね。", stadRep:"{r}で、クラブの評判が上がっているわ。",
  stad:"スタジアムを「{nm}」(収容 {cap}万人)にしてみない？ 費用は {c}億よ{d}。",
  reply:["あら、そう。","ええ。","ふふ、ありがとう。","監督……うれしいわ。"] });
/** 監督室の会話の問いかけ(秘書ごと。無ければ SEC_EVENTS の q) */
const SEC_EV_Q=[
  { s1:"差し入れ持ってきました！ どれにします？", s2:"差し入れです。どれにしますか。", s3:"差し入れを持ってきたの。どれがいい？" },
  { s1:"次の相手の資料、まとめちゃいましょうか？", s2:"次の相手の資料、まとめておきますか。", s3:"次の相手の資料、まとめておきましょうか？" },
  { s1:"今日のスタジアム、すっごい歓声でしたね！", s2:"今日の歓声は、今季でいちばん大きかったです。", s3:"今日のスタジアム、すごい歓声だったわね。" },
  { s1:"監督ってお休みの日、なにしてるんですか？", s2:"休日は何をしているんですか。……参考までに。", s3:"お休みの日は、何をしているの？" },
  { s1:"選手たちの写真、広報に使っていいですか？ いいのが撮れたんです！", s2:"選手の写真を広報に使う許可をください。", s3:"選手たちの写真、クラブの広報に使ってもいいかしら？" }
];
const secEvQ=(S,ev)=>{ const i=SEC_EVENTS.indexOf(ev), q=SEC_EV_Q[i]; return (q&&q[secOf(S).id])||ev.q; };

/* ---------- タグ(→docs/23) ----------
 * チームのタグは S.g.tags = [{ id, n:残りの試合 | null }]。育成と同じく任期ごと(newGrowth で空になる = 任期の終わりで全部クリア)
 * 選手のタグは S.g.pl[id].tags(第3段から付く)。効き目は tagK で1か所から読む */
const tagFxK=v=>{ const sg=v[0]==="-"?-1:1, k=TUNING.tag.str[v.slice(1)]||0; return 1+sg*k; };
/** タグの期限(数か、TUNING.grow の項目名 "graph.golden" など) */
const tagDur=T=>typeof T.dur==="string"?T.dur.split(".").reduce((o,k)=>o&&o[k],TUNING.grow):T.dur;
/** オンかオフの効き目(motLock など)を持つタグがあるか */
const tagOn=(S,key)=>((S.g&&S.g.tags)||[]).some(t=>TAGS[t.id]&&TAGS[t.id].fx&&TAGS[t.id].fx[key]==="on");
/** 全員を絶好調に固定するタグ(黄金期)があれば、ケガ以外の全員を絶好調に */
function motLockApply(S){ if(tagOn(S,"motLock"))for(const id in S.g.pl)if(S.g.pl[id].mot>0)S.g.pl[id].mot=4; }
/** チームのタグの効き目(掛け算)。無ければ 1 */
function tagK(S,key){
  let k=1; for(const t of (S.g&&S.g.tags)||[]){ const T=TAGS[t.id]; if(T&&T.fx&&T.fx[key]&&T.fx[key]!=="on")k*=tagFxK(T.fx[key]); }
  for(const id of S.sq||[]){
    for(const t of (S.g&&S.g.pl[id]&&S.g.pl[id].tags)||[]){ const T=TAGS[t.id]; if(T&&T.teamFx&&T.teamFx[key])k*=tagFxK(T.teamFx[key]); }
    const U=TAGS["u_"+id]; if(U&&U.teamFx&&U.teamFx[key])k*=tagFxK(U.teamFx[key]); }
  return k;
}
/** チームのタグを付ける。反対のタグは消し、同じタグは期限を延ばす。上限を超えたら残りがいちばん短いものを押し出す */
function addTeamTag(S,id,out,quiet){
  const T=TAGS[id], L=S.g.tags||(S.g.tags=[]); if(!T)return;
  if(T.opp){ const j=L.findIndex(t=>t.id===T.opp); if(j>=0){ L.splice(j,1); out.push("🏷 「"+TAGS[T.opp].name+"」が消えた"); } }
  const cur=L.find(t=>t.id===id);
  if(cur){ cur.n=tagDur(T); return; }
  // 上限は keep(黄金期)を除いて数える。押し出すのも keep 以外から
  const cnt=L.filter(t=>!TAGS[t.id].keep);
  if(!T.keep&&cnt.length>=TUNING.tag.teamMax){
    const v=cnt.reduce((b,t)=>(t.n==null?1e9:t.n)<(b.n==null?1e9:b.n)?t:b,cnt[0]);
    out.push("🏷 「"+TAGS[v.id].name+"」が消えた"); L.splice(L.indexOf(v),1);
  }
  L.push({ id, n:tagDur(T) });
  noteTag(S,id);                                // COACHING NOTE(→docs/23 §23.10)
  if(T.fx&&T.fx.motLock==="on")motLockApply(S);
  if(!quiet)out.push("🏷 チームに「"+T.name+"」 ― "+T.desc);
}
function dropTeamTag(S,id,out){
  const L=S.g.tags||[], j=L.findIndex(t=>t.id===id); if(j<0)return;
  L.splice(j,1); out.push(TAGS[id].endMsg||"🏷 「"+TAGS[id].name+"」が消えた");
}
/**
 * 試合のあとのタグ(afterMatchGrowth の最後に呼ぶ。付いたタグは次の試合から効く)
 *   ① 期限を1つ減らす ② 勝ち負けで消えるもの ③ 連勝・連敗で付くもの ④ 昇格・降格(リーグの最終節)
 */
function tagsAfterMatch(S,fx,res,out){
  const L=S.g.tags||(S.g.tags=[]);
  for(const t of L.slice()){
    const T=TAGS[t.id];
    if((T.endOn==="win"&&res.win)||(T.endOn==="lose"&&res.lose)){ dropTeamTag(S,t.id,out); continue; }
    if(t.n!=null&&--t.n<=0)dropTeamTag(S,t.id,out);
  }
  const st=S.g.streak||0;
  S.g.streak=res.win?Math.max(0,st)+1:res.lose?Math.min(0,st)-1:0;
  if(S.g.streak===TUNING.tag.streak)addTeamTag(S,"momentum",out);
  if(S.g.streak===-TUNING.tag.streak)addTeamTag(S,"slump",out);
  if(fx&&fx.kind==="league"&&S.league&&S.league.done===14&&S.divMove)addTeamTag(S,S.divMove>0?"promo":"releg",out);
  nationTitleCheck(S,res,out);                  // 国の称号(→docs/23 §23.3)
  comboCheck(S,out);                            // コンビ(→docs/23 §23.3b)
  autoTeamTags(S,fx,res,out);                   // 優勝の余韻・過密日程・サポーターの熱狂
  uniqueCheck(S,out);                           // 条件で付く固有
  tagEventRoll(S);                              // ランダムに起きる出来事(HOME で答える)
  noteSeen(S);                                  // 見えているタグも手帳に
  playerVoiceRoll(S);                           // 選手の声(→docs/14 §14.79)
}
/** 見せるためのチームのタグ: 保存しているもの + 黄金期 + スポンサーの報酬(施設充実)。{ id, name, pol, desc, left } */
function teamTagsView(S){
  const v=[], g=S.g||{};
  for(const t of g.tags||[]){ const T=TAGS[t.id]; if(!T)continue;
    v.push({ id:t.id, title:T.kind==="title", left:t.n!=null?t.n+"試合":T.endOn==="win"?"勝つまで":T.endOn==="lose"?"負けるまで":T.kind==="title"?"任期中":"" }); }
  v.sort((a,b)=>(b.title?1:0)-(a.title?1:0));   // 称号を先に
  const B=S.biz&&S.biz.boost, fac={};
  if(B)for(const e in B)if(B[e]>0&&SP_FAC_TAG[e]){ const id=SP_FAC_TAG[e], f=fac[id]||(fac[id]={ n:0, eff:[] });
    f.n=Math.max(f.n,B[e]); const ind=(typeof SP_IND!=="undefined"?SP_IND:[]).find(x=>x.eff===e); if(ind)f.eff.push(ind.effName); }
  for(const id in fac)v.push({ id, left:fac[id].n+"試合", desc:"スポンサーの報酬: "+fac[id].eff.join("・") });
  if(typeof oilMoney==="function"&&oilMoney(S))v.unshift({ id:"oil", left:"契約中" });   // レアスポンサー(→docs/23)
  const out=v.map(x=>Object.assign({ name:TAGS[x.id].name, pol:TAGS[x.id].pol, desc:TAGS[x.id].desc },x));
  for(const c of g.combos||[]){ const C=COMBOS[c.id]; if(C)out.splice(out.filter(x=>x.title).length,0,{ id:"cb:"+c.id, name:C.name, pol:1, combo:true, left:"任期中",
    desc:c.ids.map(x=>nameOf(CARDS[x])).join("・")+" の"+comboDesc(C) }); }
  return out;
}
/** 選手のタグ(見せる用)。第3段から付く */
function playerTagsView(S,id){
  const g=S.g&&S.g.pl[id]; if(!g)return [];
  const cb=((S.g&&S.g.combos)||[]).filter(c=>c.ids.includes(id)&&COMBOS[c.id]).map(c=>({ id:"cb:"+c.id, name:COMBOS[c.id].name, pol:1, combo:true,
    desc:c.ids.map(x=>nameOf(CARDS[x])).join("・")+" の"+comboDesc(COMBOS[c.id]), left:"" }));
  const U=TAGS["u_"+id], uq=U?[{ id:"u_"+id, name:U.name, pol:1, unique:true, desc:U.desc, left:"" }]:[];
  return uq.concat(cb,(g.tags||[]).filter(t=>TAGS[t.id]).map(t=>({ id:t.id, name:TAGS[t.id].name, pol:TAGS[t.id].pol, unique:TAGS[t.id].kind==="unique", desc:TAGS[t.id].desc, left:t.n!=null?t.n+"試合":"", fame:TAGS[t.id].kind==="fame", bad:!!TAGS[t.id].bad })));
}

/* ---- チームの称号(→docs/23 §23.3) ---- */
/** 金色の3軸(または軸の強さ)から、クラブの称号の id */
function clubTitleOf(gold){ return "c_"+(gold.O?"O":"D")+(gold.S?"S":"P")+(gold.R?"R":"C"); }
/** 先発11人が同じ国籍なら、その国(称号のある国だけ)。ids … カードの id */
function nationOf(ids){
  if(!ids||ids.length<11)return null;
  const n=CARDS[ids[0]]&&CARDS[ids[0]].nat;
  return n&&TAGS["n_"+n]&&ids.slice(0,11).every(id=>CARDS[id]&&CARDS[id].nat===n)?n:null;
}
/** 国の称号の判定(試合のあと)。その国の11人で戦った試合を数え、from 試合目から確率で付く */
function nationTitleCheck(S,res,out){
  const nat=nationOf(res.starters); if(!nat)return;
  const N=TUNING.tag.nation, cnt=S.g.natN||(S.g.natN={}); cnt[nat]=(cnt[nat]||0)+1;
  const id="n_"+nat; if((S.g.tags||[]).some(t=>t.id===id)||cnt[nat]<N.from)return;
  const p=Math.min(N.max,N.step*(cnt[nat]-N.from+1))*(res.win?N.winK:1);
  if(mulberry32((S.seed^hashStr("nt:"+S.term+":"+S.played))>>>0)()>=p)return;
  addTeamTag(S,id,out,true);
  const me=typeof myTeam==="function"?myTeam(S).name:"わがクラブ";
  out.push("🏷 "+me+" は代表選手をそろえて起用することで、「"+TAGS[id].name+"」の再現といわれています(国の称号。先発がこの国の11人のとき: "+tagStatTxt(TAGS[id].stat)+")");
}
/** 称号だけの能力の上乗せ(相手のクラブ。中身は applyTagStats) */
function applyTitleStats(def,tagIds){ return applyTagStats(def,tagIds,null,null); }
/** 自チームの称号の id(いま付いているもの) */
const myTitleIds=S=>((S.g&&S.g.tags)||[]).filter(t=>TAGS[t.id]&&TAGS[t.id].kind==="title").map(t=>t.id);
/**
 * 相手の称号(→docs/23 §23.7 の 4): 段4・5のクラブと Premier Div の相手は、クラブの称号を1つ持つ(先発の能力の強い側を対ごとに選ぶ)。
 * 先発11人が同じ国籍なら国の称号も
 */
function oppTitleIds(def,strong){
  const ids=[], xi=def.xi.map(s=>s.card);
  if(strong){ const av=k=>xi.reduce((a,c)=>a+c[k],0);
    ids.push(clubTitleOf({ O:av("off")>=av("def"), S:av("spd")>=av("pow"), R:av("tec")>=av("sta") })); }
  const nat=nationOf(xi.map(c=>c.id)); if(nat)ids.push("n_"+nat);
  return ids;
}

/* ---- 選手のタグ(→docs/23 §23.4) ---- */
const pTags=(S,id)=>(S.g&&S.g.pl[id]&&S.g.pl[id].tags)||[];
/** 選手のタグの効き目(掛け算) */
function playerTagK(S,id,key){
  let k=1; for(const t of pTags(S,id)){ const T=TAGS[t.id]; if(T&&T.fx&&T.fx[key]&&T.fx[key]!=="on")k*=tagFxK(T.fx[key]); }
  return k;
}
const pTagOn=(S,id,key)=>pTags(S,id).some(t=>TAGS[t.id]&&TAGS[t.id].fx&&TAGS[t.id].fx[key]==="on");
const pHas=(S,id,tid)=>pTags(S,id).some(t=>t.id===tid);
/** 選手のタグを付ける。反対のタグは消す・同じは期限を延ばす。汎用は playerMax まで、特性は1つ(付け替え) */
function addPlayerTag(S,id,tid,out){
  const T=TAGS[tid], g=S.g&&S.g.pl[id]; if(!T||!g)return;
  const L=g.tags||(g.tags=[]), nm=nameOf(CARDS[id]);
  if(T.opp){ const j=L.findIndex(t=>t.id===T.opp); if(j>=0){ L.splice(j,1); out.push("🏷 "+nm+" の「"+TAGS[T.opp].name+"」が消えた"); } }
  // ゴシップが重なると問題児(→docs/23 §23.11)。付いている間にまた付いても1回と数える
  if(tid==="gossip"&&++pCnt(g).gos>=TUNING.tag.fame.gossipN&&!pHas(S,id,"trouble"))addPlayerTag(S,id,"trouble",out);
  const cur=L.find(t=>t.id===tid);
  if(cur){ cur.n=tagDur(T); return; }
  if(T.kind==="trait"){ const j=L.findIndex(t=>TAGS[t.id]&&TAGS[t.id].kind==="trait"); if(j>=0){ out.push("🏷 "+nm+" の特性「"+TAGS[L[j].id].name+"」を付け替えた"); L.splice(j,1); } }
  else if(T.kind==="gen"){
    // 汎用は「任期まで続くもの」と「一過性(期限・条件で消える)」で別の枠。続くものは一過性に押し出されない(→docs/23 §23.1)
    const last=x=>x.dur==null&&!x.endOn, mine=L.filter(t=>TAGS[t.id]&&TAGS[t.id].kind==="gen"&&last(TAGS[t.id])===last(T));
    if(mine.length>=TUNING.tag.playerMax){
      if(last(T))return;                        // 続くものが埋まっていれば、新しい続くものは付かない(先に取ったものを残す)
      const v=mine.reduce((b,t)=>(t.n==null?1e9:t.n)<(b.n==null?1e9:b.n)?t:b,mine[0]);
      out.push("🏷 "+nm+" の「"+TAGS[v.id].name+"」が消えた"); L.splice(L.indexOf(v),1); }
  }
  L.push({ id:tid, n:tagDur(T) });
  noteTag(S,tid);                               // COACHING NOTE
  if(T.onAdd==="mot4"&&g.mot>0)g.mot=4;
  if(tid==="rebel"||tid==="gossip"||tid==="waiting")pCnt(g).bad=(pCnt(g).bad||0)+1;   // クライベイビーの判定
  out.push("🏷 "+nm+" に「"+T.name+"」 ― "+T.desc);
}
function dropPlayerTag(S,id,tid,out){
  const L=pTags(S,id), j=L.findIndex(t=>t.id===tid); if(j<0)return;
  L.splice(j,1); out.push("🏷 "+nameOf(CARDS[id])+" の「"+TAGS[tid].name+"」が消えた");
}
/** 選手の数え(この任期): 出場・先発の連続・得点・キャプテン・KP の勝ち・ケガ・ケア・好採点の連続 */
const pCnt=g=>{ const c=g.c||(g.c={ app:0, startRun:0, startGoals:0, subGoals:0, cap:0, kpW:0, inj:0, care:0, rateRun:0, scored:false }); if(c.gos==null)c.gos=0; return c; };
/** 決勝か(大会の最後の段) */
const isFinal=fx=>!!(fx&&fx.kind==="cup"&&/決勝/.test(fx.label||"")&&!/準決勝/.test(fx.label||""));
/**
 * 試合のあとの選手のタグ(afterMatchGrowth の最後)。res に goals:{id:点}・rate:{id:採点}・mvp・kpEnd があれば使う。st0 … 試合の前の★の合計
 */
/* ---- 話題のタグ(→docs/23 §23.11) ---- */
/** お金の倍率。key = "gate"(入場料: スター)/ "sp"(スポンサー収入: スターと問題児)。SQUAD にいる人数ぶん掛け算 */
function fameK(S,key){
  // スターの掛け算は上限 starCap(×4)で止め、そのあとに問題児を掛ける(→docs/24 §24.6)
  const F=TUNING.tag.fame; let k=1, tr=1;
  for(const id of S.sq||[])for(const t of pTags(S,id)){
    if(t.id==="star")k*=F.star; else if(t.id==="trouble"&&key==="sp")tr*=F.trouble; }
  return Math.min(F.starCap,k)*tr;
}
/** 大きな試合(ジャイアントキリング・大会の優勝・昇格)で活躍した選手をスターに。fame = { giant, titles, promo } */
function fameAfterMatch(S,res,out){
  const F=TUNING.tag.fame, f=res.fame;
  // スターは週刊誌に追われる: 試合のたびに starGossip の率でゴシップ(同じ任期に2回で問題児。→docs/24 §24.6)
  const rg=mulberry32((S.seed^hashStr("sg:"+S.term+":"+S.played))>>>0);
  for(const id of S.sq)if(pHas(S,id,"star")&&rg()<F.starGossip)addPlayerTag(S,id,"gossip",out);
  if(!f)return;
  const n=Math.max(f.giant?F.giantN:0,f.titles?F.titleN:0,f.promo?F.promoN:0); if(!n)return;
  const why=f.promo?"昇格":f.titles?"優勝":"ジャイアントキリング", goals=res.goals||{}, rate=res.rate||{};
  // 活躍: MVP → 得点 → 採点の順。得点も採点も無ければ(検証の試合など)出場した順
  const sc=id=>(id===res.mvp?100:0)+(goals[id]||0)*10+(rate[id]||0);
  const cand=(res.played||[]).filter(id=>S.sq.includes(id)&&S.g.pl[id]&&!pHas(S,id,"star")).sort((a,b)=>sc(b)-sc(a));
  for(const id of cand.slice(0,n)){ addPlayerTag(S,id,"star",out); out[out.length-1]+="("+why+"の立役者)"; }
}
function playerTagsAfterMatch(S,fx,res,out,st0){
  const P=TUNING.tag.player, played=res.played||[], starters=res.starters||[], goals=res.goals||{}, fin=isFinal(fx);
  for(const id of S.sq){
    const g=S.g.pl[id]; if(!g)continue;
    const c=pCnt(g), was=pTags(S,id).slice(), on=played.includes(id), st=starters.includes(id), gl=goals[id]||0;
    // ① 期限を減らす・出場で消える
    for(const t of was){ const T=TAGS[t.id]; if(!T)continue;
      if(T.endOn==="played"&&on){ dropPlayerTag(S,id,t.id,out); if(t.id==="waiting")addPlayerTag(S,id,"burst",out); continue; }
      if(t.n!=null&&--t.n<=0)dropPlayerTag(S,id,t.id,out); }
    // ② 数える
    if(on)c.app++;
    c.startRun=st?c.startRun+1:0;
    if(st)c.startGoals+=gl; else if(on)c.subGoals+=gl;
    if(st&&S.roles&&S.roles.cap===id)c.cap++;
    if(res.kpEnd===id&&res.win)c.kpW++;
    if((res.inj||[]).includes(id))c.inj++;
    // ③ 付く
    // 任期まで続くタグは、任期に1回だけ(消えたり付かなかったりしても、同じ条件でくり返し付けない)
    const got=c.got||(c.got={}), add=tid=>{ if(!got[tid]&&!pHas(S,id,tid)){ got[tid]=true; addPlayerTag(S,id,tid,out); } };
    if(c.inj>=P.injN)add("injProne");
    if((g.bench||0)===P.rebel)addPlayerTag(S,id,"rebel",out); else if((g.bench||0)===P.wait)addPlayerTag(S,id,"waiting",out);   // 出場なしがちょうどその数になった試合で
    if(st0&&CARDS[id].age<=P.rookieAge&&g.is+g.ss>st0[id])addPlayerTag(S,id,"growth",out);
    if(c.app>=P.bandiera&&!S.g.bandiera){ S.g.bandiera=id; add("bandiera"); }   // チームに1人
    if(c.subGoals>=P.superSub)add("supersub");
    if(c.startGoals>=P.ace)add("ace");
    if(c.cap>=P.pillar)add("pillar");
    if(c.kpW>=P.kpWin)add("strat");
    if(c.startRun===P.iron)addPlayerTag(S,id,"iron",out);
    if(gl>0&&c.scored)addPlayerTag(S,id,"scorer",out);
    c.scored=gl>0;
    if(fin&&gl>0)add("bigstage");
    if(fin&&res.mvp===id&&fx&&COMPS[fx.comp]&&/^[SA]$/.test(COMPS[fx.comp].grade))addPlayerTag(S,id,"mvp",out);
    // ④ 特性: そのポジションで好採点が続く
    const r=res.rate&&res.rate[id];
    c.rateRun=st&&r!=null&&r>=P.rateMin?c.rateRun+1:st?0:c.rateRun;
    if(c.rateRun>=P.rateN&&!pTags(S,id).some(t=>TAGS[t.id].kind==="trait")){
      const i=S.sq.indexOf(id), f=(FORMS[S.form]||[])[i], l=(S.layout&&S.layout[id])||f, role=i===0?"GK":l?posAt(l[0],l[1]):null;   // 盤面の位置(無ければ陣形の枠)
      const cand=Object.keys(TAGS).filter(k=>TAGS[k].kind==="trait"&&role&&TAGS[k].pos.includes(role));
      if(cand.length){ const k=cand[hashStr("tr:"+S.term+":"+S.played+":"+id)%cand.length];
        out.push("🏷 "+nameOf(CARDS[id])+" の "+role+" での動きが評判に"); addPlayerTag(S,id,k,out); c.rateRun=0; }
    }
    if(pTagOn(S,id,"motLock")&&g.mot>0)g.mot=4;
  }
}
/** 加入(SQUAD と交代で入った選手): 若手は ROOKIE、熟練はベテラン */
function joinTags(S,id,out){
  const P=TUNING.tag.player, c=CARDS[id]; if(!c||!S.g||!S.g.pl[id])return;
  if(c.age<=P.rookieAge)addPlayerTag(S,id,"rookie",out);
  else if(c.age>=P.vetAge)addPlayerTag(S,id,"veteran",out);
}
/** 選手からの提案の候補(特性を3つ): その選手のポジション → 同じグループの順 */
function traitOptions(S,id){
  const c=CARDS[id], roles=c.roles||[c.pos], have=pTags(S,id).map(t=>t.id);
  const ks=Object.keys(TAGS).filter(k=>TAGS[k].kind==="trait"&&!have.includes(k));
  const own=ks.filter(k=>TAGS[k].pos.some(p=>roles.includes(p))), grp=ks.filter(k=>!own.includes(k)&&TAGS[k].grp.includes(c.pos));
  const rng=mulberry32((S.seed^hashStr("prop:"+S.term+":"+id))>>>0), sh=a=>a.map(x=>[rng(),x]).sort((p,q)=>p[0]-q[0]).map(x=>x[1]);
  return sh(own).concat(sh(grp)).slice(0,3);
}
/** 選手からの提案に答える(i … 候補の番号。null なら見送る) */
function answerProposal(S,i){
  const P=S.g.prop; if(!P)return [];
  const out=[]; S.g.prop=null;
  if(i!=null&&P.opts[i])addPlayerTag(S,P.id,P.opts[i],out);
  else out.push(nameOf(CARDS[P.id])+" の提案は見送った");
  return out;
}
/**
 * 称号と選手のタグの能力の上乗せを、試合に渡すカードに足す(写しを作る。1つの能力は statCap、MVP がいれば statCapX まで)。
 * S … 自チームのとき(選手のタグ・特性も足す)。fx … 決勝の判定
 */
function applyTagStats(def,tagIds,S,fx,combos){
  const T=TUNING.tag, xiIds=def.xi.map(s=>s.card.id), nat=nationOf(xiIds), fin=isFinal(fx);
  // コンビ: メンバーが全員先発のとき、メンバーに(→docs/23 §23.3b)
  const cmb={}; for(const c of combos||(S&&S.g.combos)||[])if(COMBOS[c.id]&&c.ids.every(x=>xiIds.includes(x)))c.ids.forEach(x=>{ (cmb[x]=cmb[x]||[]).push(COMBOS[c.id]); });
  const team=tagIds.map(id=>TAGS[id]).filter(t=>t&&t.stat&&(t.sub!=="nation"||t.nat===nat));
  const hit=(who,pos)=>!who||who==="all"||who===pos||(who==="FM"&&(pos==="FW"||pos==="MF"))||(who==="DM"&&(pos==="DF"||pos==="MF"));
  const boost=(c,start,role)=>{ const add={}; let cap=T.statCap;
    const put=x=>{ for(const k of x.st)add[k]=(add[k]||0)+(x.neg?-1:1)*T.stat[x.k]; };
    const U=TAGS["u_"+c.id]; if(U)for(const x of U.stat)put(x);   // カードが持つ固有(どの任期でも・相手のときも)
    for(const t of team)for(const x of t.stat)if(hit(x.who,c.pos))put(x);
    if(start)for(const C of cmb[c.id]||[])for(const x of C.stat)put(x);
    if(S)for(const tg of pTags(S,c.id)){ const P=TAGS[tg.id]; if(!P||!P.stat)continue;
      if(P.kind==="trait"&&!(start&&role&&P.pos.includes(role)))continue;
      if(P.capX)cap=T.statCapX;
      for(const x of P.stat){ if(x.when==="start"&&!start)continue; if(x.when==="sub"&&start)continue; if(x.when==="final"&&!fin)continue;
        if(x.when==="hot"&&c.gm!==4)continue; if(x.when==="cold"&&!(c.gm<=2))continue; put(x); } }
    if(!Object.keys(add).length)return c;
    const o=Object.assign({},c); for(const k in add)o[k]=clamp(o[k]+Math.max(-cap,Math.min(cap,add[k])),1,STAT_MAX);
    return o; };
  def.xi.forEach((s,i)=>{ s.card=boost(s.card,true,i===0?"GK":posAt(s.h,s.x)); });
  def.bench=def.bench.map(c=>boost(c,false,null));
  return def;
}

/* ---- コンビ(→docs/23 §23.3b) ---- */
/** 先発のポジション(盤面の位置。無ければ陣形の枠) */
function xiRoles(S){
  const f=FORMS[S.form]||[], r={};
  S.sq.slice(0,11).forEach((id,i)=>{ const l=(S.layout&&S.layout[id])||f[i]; r[id]=i===0?"GK":l?posAt(l[0],l[1]):null; });
  return r;
}
/** ids の並びを、型の枠に1人ずつ当てられるか(人数は5人まで。順列で試す) */
function fitSlots(ids,slots,role){
  const go=(k,used)=>{ if(k===slots.length)return true;
    for(let i=0;i<ids.length;i++)if(!used[i]&&role[ids[i]]&&COMBO_SLOT[slots[k]].includes(role[ids[i]])){ used[i]=true; if(go(k+1,used))return true; used[i]=false; }
    return false; };
  return go(0,[]);
}
/**
 * コンビを探す。xi … 先発の id、role … id → ポジション、linked(a,b) … 2人がつながっているか、axOk(axes) … 軸が金色か、have … すでにあるコンビ
 * 特別なコンビ → 型のコンビ(人数の多い順)。1人は1つのコンビまで、全部で max まで
 */
function findCombos(xi,role,linked,axOk,have,max){
  const res=(have||[]).slice(), used=new Set(res.flatMap(c=>c.ids));
  const clique=ids=>ids.every((a,i)=>ids.slice(i+1).every(b=>linked(a,b)));
  const free=()=>xi.filter(id=>!used.has(id));
  const take=(C,ids)=>{ res.push({ id:C.id, ids }); ids.forEach(x=>used.add(x)); };
  for(const C of Object.values(COMBOS).filter(c=>c.special)){
    if(res.length>=max)break; if(res.some(r=>r.id===C.id))continue;
    if(C.ids.every(x=>xi.includes(x)&&!used.has(x))&&clique(C.ids)&&axOk(C.axes))take(C,C.ids.slice());
  }
  const kinds=Object.values(COMBOS).filter(c=>!c.special).sort((a,b)=>b.n-a.n);
  const pick=(pool,n,from,cur,C)=>{ if(cur.length===n)return clique(cur)&&fitSlots(cur,C.slots,role)?cur.slice():null;
    for(let i=from;i<pool.length;i++){ if(cur.length&&!cur.every(a=>linked(a,pool[i])))continue; cur.push(pool[i]); const r=pick(pool,n,i+1,cur,C); if(r)return r; cur.pop(); }
    return null; };
  for(const C of kinds){
    if(res.length>=max)break; if(res.some(r=>r.id===C.id)||!axOk(C.axes))continue;
    const pool=free().filter(id=>role[id]&&C.slots.some(s=>COMBO_SLOT[s].includes(role[id])));
    if(pool.length<C.n)continue;
    const got=pick(pool,C.n,0,[],C); if(got)take(C,got);
  }
  return res;
}
/** 試合のあとにコンビができたか見る(自チーム)。黄金線 + 信頼 + 軸の金色 + 型 */
function comboCheck(S,out){
  const T=TUNING.tag.combo, xi=S.sq.slice(0,11), have=S.g.combos||(S.g.combos=[]);
  if(have.length>=T.max)return;
  const trust=id=>S.g.pl[id]&&trustLv(S.g.pl[id])>=T.trust;
  const linked=(a,b)=>trust(a)&&trust(b)&&linkOf(S,a,b).lv>=3;
  const res=findCombos(xi,xiRoles(S),linked,ax=>ax.some(a=>S.g.gold[a]),have,T.max);
  for(const c of res.slice(have.length)){
    const C=COMBOS[c.id]; have.push(c); noteTag(S,"cb:"+c.id);
    out.push("🏷 "+c.ids.map(x=>nameOf(CARDS[x])).join("・")+" のコンビ「"+C.name+"」が生まれた ― "+comboDesc(C));
  }
}
/** 相手のコンビ: 特別なコンビはカードがそろえば。型のコンビは段4以上・Premier の相手が、黄金線と金色(強い側の軸)を持つとみなして */
function oppCombos(def,strong,gold){
  const xi=def.xi.map(s=>s.card.id), role={};
  def.xi.forEach((s,i)=>{ role[s.card.id]=i===0?"GK":posAt(s.h,s.x); });
  const sp=findCombos(xi,role,()=>true,()=>true,[],TUNING.tag.combo.max).filter(c=>COMBOS[c.id].special);
  if(!strong)return sp;
  return findCombos(xi,role,()=>true,ax=>ax.some(a=>gold[a]),sp,TUNING.tag.combo.max);
}

/* ---- 固有タグ(→docs/23 §23.4)---- */
/** 選手の固有(カードが持つもの → 条件で付いたもの) */
const cardUnique=id=>TAGS["u_"+id]?"u_"+id:null;
/** 条件で付く固有(試合のあと)。チームに1人ずつ。カードの固有を持つ選手には付かない */
function uniqueCheck(S,out){
  const U=TUNING.tag.unique, sq=S.sq.filter(id=>S.g.pl[id]), got=S.g.uq||(S.g.uq={});
  const has=id=>cardUnique(id)||pTags(S,id).some(t=>TAGS[t.id].kind==="unique");
  const give=(tid,id)=>{ if(got[tid]||!id||has(id))return; got[tid]=id; addPlayerTag(S,id,tid,out); };
  const gc=id=>growCard(S,CARDS[id]), tot=id=>{ const c=gc(id); return STATS.reduce((a,k)=>a+c[k],0); };
  const app=id=>pCnt(S.g.pl[id]).app;
  const top=sq.slice().sort((a,b)=>tot(b)-tot(a))[0];
  if(top&&CARDS[top].age<=U.kamiAge&&app(top)>=U.kamiApp)give("kami",top);
  const atk=sq.filter(id=>CARDS[id].pos==="FW"||CARDS[id].pos==="MF").sort((a,b)=>gc(b).tec-gc(a).tec)[0];
  if(atk&&app(atk)>=U.princeApp)give("prince",atk);
  for(const id of sq){ const c=pCnt(S.g.pl[id]);
    if((c.bad||0)>=U.crybadN&&/^[KL]$/.test(CARDS[id].rar||""))give("crybaby",id);
    if(CARDS[id].age<=U.academyAge&&S.g.pl[id].is>=5)give("academy",id); }
}
/* ---- 自動で付くチームのタグ・出来事(→docs/23 §23.2) ---- */
function autoTeamTags(S,fx,res,out){
  // 優勝の余韻: この試合で大会を取った
  const n=(S.titles||[]).length; if(S.g.titleN!=null&&n>S.g.titleN)addTeamTag(S,"afterglow",out); S.g.titleN=n;
  // 過密日程: カップの試合が続いた / カップ以外の試合で消える
  S.g.cupRun=fx&&fx.kind==="cup"?(S.g.cupRun||0)+1:0;
  if(!S.g.cupRun)dropTeamTag(S,"crowded",out);
  else if(S.g.cupRun===TUNING.tag.crowd)addTeamTag(S,"crowded",out);
  // サポーターの熱狂: ファンが節目を越えた
  if(S.biz){ const f=S.biz.fans, i=TUNING.tag.fever.filter(v=>f>=v).length; if(S.g.feverN!=null&&i>S.g.feverN)addTeamTag(S,"fever",out); S.g.feverN=i; }
}
/** 出来事を起こすか(試合のあと)。答えるまで次は起きない */
function tagEventRoll(S){
  if(S.g.tev||S.termOver)return;
  const r=mulberry32((S.seed^hashStr("tev:"+S.term+":"+S.played))>>>0);
  if(r()>=TUNING.tag.event.p)return;
  const ev=TAG_EVENTS[Math.floor(r()*TAG_EVENTS.length)], sq=S.sq.filter(id=>S.g.pl[id]&&S.g.pl[id].mot>0);
  S.g.tev={ k:ev.k, id:ev.p&&sq.length?sq[Math.floor(r()*sq.length)]:null };
}
const tagEventOf=S=>S.g&&S.g.tev?TAG_EVENTS.find(e=>e.k===S.g.tev.k):null;
const tagEventText=(S,ev)=>ev.q.split("{n}").join(S.g.tev.id?nameOf(CARDS[S.g.tev.id]):"");
/** 出来事に答える。結果の行を返す */
function answerTagEvent(S,i){
  const ev=tagEventOf(S); if(!ev||!ev.ch[i])return [];
  const id=S.g.tev.id, R=ev.ch[i][1], out=[]; S.g.tev=null;
  if(R.team)addTeamTag(S,R.team,out);
  if(R.player&&id)addPlayerTag(S,id,R.player,out);
  if(R.bet&&id){ const [p,hit,miss]=R.bet, ok=mulberry32((S.seed^hashStr("teb:"+S.term+":"+S.played+":"+id))>>>0)()<p, t=ok?hit:miss;
    if(t)addPlayerTag(S,id,t,out); else out.push(nameOf(CARDS[id])+" は落ち着いたようだ"); }
  if(R.fat&&id){ const g=S.g.pl[id]; g.fat=clamp(g.fat+R.fat,0,TUNING.grow.int.fatMax); }
  if(!out.length)out.push("いつもどおりに戻った");
  return out;
}

/* ---- COACHING NOTE(→docs/23 §23.10) ---- */
/** 手帳に書く(初めてなら記録する。数も数える)。id … タグの id か "cb:コンビの id" */
function noteTag(S,id){
  if(!S||!id)return;
  const N=S.note||(S.note={});
  if(!N[id])N[id]={ term:S.term, at:S.played, n:0 };
  N[id].n++;
}
/** 手帳の区分 */
function noteCat(id){
  if(/^cb:/.test(id))return "combo";
  if(/^mt:/.test(id))return typeof TITLES!=="undefined"&&TITLES.some(t=>t.id===id.slice(3))?"mgr":null;   // 監督称号(→docs/14 §14.147)
  const T=TAGS[id]; if(!T)return null;
  return T.kind==="title"?"title":T.kind==="trait"?"trait":T.kind==="unique"?"unique":T.scope==="team"?"team":"player";
}
/** 付き方の文 */
function noteHow(id){
  if(/^cb:/.test(id)){ const C=COMBOS[id.slice(3)]; if(!C)return "";
    const ax=C.axes.map(a=>AXIS_ABBR[a]).join(" か ");
    return C.special?"決められた選手の組("+C.ids.map(x=>nameOf(CARDS[x])).join("・")+")が全員先発で黄金線・信頼でつながり、"+ax+" が金色"
      :C.slots.length+"人("+C.slots.map(s=>COMBO_SLOT[s].join("/")).join(" + ")+")が黄金線・信頼でつながり、"+ax+" が金色"; }
  if(/^mt:/.test(id)){ const t=TITLES.find(x=>x.id===id.slice(3)); return t?"任期の終わりに: "+t.need:""; }
  const T=TAGS[id]; if(!T)return "";
  if(NOTE_HOW[id])return NOTE_HOW[id];
  if(T.sub==="nation")return "先発の11人をすべて "+(NAT_NAME[T.nat]||T.nat)+" の選手にして戦い続ける";
  if(T.sub==="club")return "黄金期に、金色の3軸が "+id.slice(2).split("").map(a=>AXIS_ABBR[a]).join("・");
  if(T.kind==="trait")return "選手からの提案で選ぶ / "+T.pos.join("・")+" で好採点(7.0 以上)が5試合続く";
  if(T.card)return "このカードを手に入れる(初めから持っている)";
  return "";
}
/** 手帳に載る全部の id(区分ごと) */
function noteAll(){
  const out={}; for(const [k] of NOTE_CAT)out[k]=[];
  for(const id in TAGS){ const c=noteCat(id); if(c)out[c].push(id); }
  for(const id in COMBOS)out.combo.push("cb:"+id);
  if(typeof TITLES!=="undefined")for(const t of TITLES)out.mgr.push("mt:"+t.id);   // 監督称号
  return out;
}
/** 試合のあとに、見えているタグ(施設充実・オイルマネー・カードの固有)も手帳に書く */
function noteSeen(S){
  for(const t of teamTagsView(S))if(TAGS[t.id])noteTag(S,t.id);
  for(const id of S.sq)if(TAGS["u_"+id])noteTag(S,"u_"+id);
}

/* ---- 選手の声(→docs/14 §14.79) ---- */
/** 疲れている先発の数(電池が1つ以上減っている) */
const tiredStarters=S=>S.sq.slice(0,11).filter(id=>S.g.pl[id]&&S.g.pl[id].fat>=TUNING.grow.int.tiredSign).length;
/** 電池の残り(3 = 満タン 〜 0 = 空)。疲れが深いほど減る(→docs/14 §14.81) */
const batteryOf=g=>!g?3:g.fat>=0.14?0:g.fat>=0.08?1:g.fat>=TUNING.grow.int.tiredSign?2:3;
/** 試合のあとに、誰かが話しかけてくるか決める。S.g.pvoice = { id, text }(次の試合まで HOME に出る) */
function playerVoiceRoll(S){
  const V=TUNING.voice, r=mulberry32((S.seed^hashStr("pv:"+S.term+":"+S.played))>>>0);
  S.g.pvoice=null;
  const sq=S.sq.filter(id=>S.g.pl[id]&&S.g.pl[id].mot>0), pick=a=>a[Math.floor(r()*a.length)];
  // 調子・疲労・出番・★突破の話(前は SQUAD の選手の窓に出ていた)。疲れた先発が多いときは、秘書がまとめて知らせるので個別には言わない
  const G0=TUNING.grow, many=tiredStarters(S)>=V.manyTired;
  const stateK=id=>{ const g=S.g.pl[id]; return spReady(S,id)?"ready":(g.q||g.sq)?"awake":g.mot<=1?"low":(!many&&g.fat>=G0.int.tiredSign*1.5)?"tired":(g.bench||0)>=G0.mot.benchGrace?"bench":null; };
  const st=sq.map(id=>[id,stateK(id)]).filter(x=>x[1]);
  if(st.length&&r()<V.pState){ const [id,k]=pick(st); S.g.pvoice={ id, text:pick(VOICE[k]), kind:k }; return; }
  if(r()>=V.p)return;
  const near=[];
  for(const id of sq){ const g=S.g.pl[id];
    if(g.is<5&&!g.q&&indProgress(g)>=V.near)near.push([id,"ind"]);
    if(g.ss<5&&!g.sq&&spProgress(g)>=V.near)near.push([id,"sp"]); }
  let id, kind, vars={};
  if(near.length&&r()>=V.ani*0.5){ [id,kind]=pick(near); }
  else if(r()<V.ani/(V.ani+V.comp)){ id=pick(sq); kind="ani"; const A=ANIMALS[CARDS[id].ani]; if(!A)return; vars.a=A.name; }
  else{ id=pick(sq); kind="comp";
    const mates=sq.filter(x=>x!==id&&compatOf(id,x)===2&&linkOf(S,id,x).lv<2); if(!mates.length)return;
    vars.n=nameOf(CARDS[pick(mates)]); }
  vars.me=PV_ME[hashStr("me:"+id)%PV_ME.length];
  let t=pick(PV_LINES[kind]); for(const k in vars)t=t.split("{"+k+"}").join(vars[k]);
  S.g.pvoice={ id, text:t, kind };
}
/* ---- 個別指導の会話(→docs/14 §14.108) ----
 * 選手は性格で話し方が変わる(0 褒められて伸びる = 素直でほめてほしい / 1 負けず嫌い = 強気 / 2 マイペース = のんびり)。
 * 性格の名前は出さない。話し方から読み取る(★突破の3択の手がかり)。どの言葉も2通り以上から、たねで選ぶ */
const VOICE_P=[
  { ready:["監督、少しだけお時間いいですか？ 聞いてほしいことがあって……。","最近、何かつかめそうなんです。監督に見てもらえたら、きっと……。"],
    awake:["なんだか体が軽いんです。次の試合、見ててくださいね！","今ならやれる気がします。監督、期待してもらえますか？"],
    near:["練習の手応えが変わってきました。……気づいてもらえてました？","もう少しで何か届きそうなんです。"],
    tired:["すみません、脚が少し重くて……。","正直、ちょっと疲れちゃいました。"],
    low:["最近うまくいかなくて……自信なくしちゃいそうです。","僕、ちゃんとやれてますか……？"],
    bench:["いつか試合に出られるように、頑張ってます。","ベンチから見てて、出たいなって思ってます。"],
    high:["今日は調子いいです！ 見ててください！","絶好調です。監督に褒めてもらえるようにがんばります！"],
    young:["もっと上手くなりたいです。教えてください！","先輩たちみたいになれるように、がんばります！"],
    vet:["若い子たちのお手本になれるよう、がんばります。","経験だけは、少しは役に立てると思います。"],
    trust:["監督の言うことなら、信じてやります。","監督に認めてもらえるのが、一番うれしいです。"],
    new:["よろしくお願いします。……ちゃんと見ててもらえると、うれしいです。","まだ緊張してます。よろしくお願いします。"],
    plain:["はい、なんでしょう？","次の試合もがんばります。見ててくださいね。"],
    rebel:["……別に、話すことなんてないです。","どうせ僕のことなんて、見てないじゃないですか。"],
    grow:["最近、練習が楽しくて仕方ないんです！","教わったこと、どんどん吸収できてる気がします！"] },
  { ready:["監督、話がある。もう一段上に行きたいんだ。","今の自分じゃ満足できない。足りないものを教えてくれ。"],
    awake:["次の試合、俺にボールを集めてくれ。何かが起きる。","今の俺なら誰にも負けない。試させてくれ。"],
    near:["もうすぐだ。あと少しで壁を越えられる。","手応えはある。あとは結果で示すだけだ。"],
    tired:["……疲れてなんかいない、と言いたいところだが、脚が重い。","休みたくはないが、正直きつい。"],
    low:["くそっ、こんなはずじゃない……。","このままで終わるつもりはない。"],
    bench:["なんで俺が出られないんだ。納得いかない。","ベンチなんて俺の居場所じゃない。"],
    high:["今日の俺は止められないぜ。","絶好調だ。全部ぶち抜いてやる。"],
    young:["先輩だろうが関係ない。ポジションは俺が取る。","若いからって甘く見ないでくれ。"],
    vet:["若い連中にはまだ負けん。","経験の差ってやつを見せてやる。"],
    trust:["監督のためなら、最後まで走る。","あんたの采配なら勝てる。信じてる。"],
    new:["実力で認めさせる。それだけだ。","どこで使ってもらっても、結果を出す。"],
    plain:["で、何の話だ？","次も勝つ。それだけだ。"],
    rebel:["話すことなんてない。試合に出せばわかる。","今の扱いには納得してない。"],
    grow:["最近、自分でも驚くくらい伸びてる。もっとやらせてくれ。","まだまだ行ける。限界なんて感じない。"] },
  { ready:["監督、少しいいですか。自分なりに考えてきたことがあります。","自分の型が見えてきました。一度、話を聞いてもらえますか。"],
    awake:["積み重ねてきたものが、形になりそうな感覚があります。","今は迷いがありません。次の試合で確かめさせてください。"],
    near:["焦らず続けてきたことが、少しずつ見えてきました。","あと一歩です。このまま自分のやり方で続けます。"],
    tired:["脚が重いので、今日は整えることを優先させてください。","疲れが残っています。しっかり休んで、また積み上げます。"],
    low:["噛み合わない時期ですが、やるべきことは分かっています。","今は我慢のときです。一つずつ立て直します。"],
    bench:["出番が来たときのために、準備はできています。","ベンチでも、自分のやることは変わりません。"],
    high:["体がよく動いています。いつも通り、自分の仕事をします。","調子はいいです。この流れを崩さずにいきます。"],
    young:["自分のペースで、確実に上手くなります。","先輩たちのいいところを、一つずつ自分のものにしています。"],
    vet:["長くやってきた分、自分の整え方は分かっています。","若い選手には、自分のペースを見つけてほしいですね。"],
    plain:["はい、なんでしょう。","いつも通り、自分のやるべきことをやります。"],
    rebel:["……今は、自分で考える時間をください。","納得できるまで、少し時間が欲しいです。"],
    grow:["最近、練習の一つ一つが身についていく感覚があります。","言われたことが、すっと自分の中に入ってきます。"] }
];
/** 手を打ったあとの返事(性格 × 0=大成功 / 1=成功 / 2=失敗) */
const REACT_P=[
  [["ほんとですか！ うれしいです、がんばります！","監督にそう言ってもらえると、力が出ます！"],["はい、やってみます。","ありがとうございます。考えてみます。"],["……すみません、ちょっとよくわからなくて。","……はい。"]],
  [["当然だ。見てろよ。","火がついた。次で証明してやる。"],["わかった。結果で返す。","悪くない話だ。"],["……納得いかないな。","それは違うだろ。"]],
  [["なるほど、腑に落ちました。自分のやり方に取り入れます。","ありがとうございます。迷いが晴れました。"],["分かりました。自分なりに試してみます。","はい。一度、持ち帰って考えます。"],["……すみません、まだ自分の中で整理がつきません。","……今は、自分のやり方を続けさせてください。"]]
];
/** 監督の言葉(選んだ手を、そのまま貼らずに話し言葉で) */
const MGR_SAY={
  ind:["よし、今日は付きっきりで見てやる。","居残りだ。基礎からもう一度やるぞ。","いい機会だ。じっくり見せてもらおう。"],
  meet:["今日は戦術の話をしよう。","相手の崩し方について、少し話そうか。","次の試合の狙いを共有しておきたい。"],
  talk:["どうした、少し話そうか。","最近どうだ。無理はしてないか。","顔色が気になってな。座れよ。"],
  heal:["まずは治すことだけ考えろ。","焦らなくていい。しっかり治してこい。"],
  lounge:[["二人で合わせてみろ。息が合えば武器になる。","今日の練習は二人一組だ。"],
          ["今日は二人で飯でも行ってこい。","たまには練習を忘れて、ゆっくり話してこい。"],
          ["どっちが上か、勝負してみろ。","負けた方が片付けだ。本気でやれ。"]]
};
/** ★突破の3択(→docs/14 §14.108)。どの型も [褒める, 厳しく, 任せる] の順。並びは毎回入れ替える */
const MEET_Q=[
  ["お前ならできる。俺は信じてるぞ。","甘えるな。壁は自分で越えるものだ。","お前の思うようにやってみろ。"],
  ["ここまでよく頑張ってきたな。自信を持て。","まだ足りない。もっと貪欲になれ。","焦らなくていい。自分のタイミングでいい。"],
  ["最近のプレー、見てるぞ。いい感じだ。","今のままじゃ通用しない。もっと上を目指せ。","答えはお前の中にある。好きにやれ。"],
  ["チームはお前を頼りにしてる。","結果を出せ。話はそれからだ。","型にはまらなくていい。自由にやってみろ。"],
  ["お前の成長が楽しみなんだ。","練習量が足りない。明日から倍だ。","俺は口を出さない。任せるよ。"]
];
/** 秘書が伝える育成の様子(秘書ごとの口調。→docs/14 §14.108)。is・ss … 段階 0〜4 の言葉 / mot … 調子 0〜4 */
const SEC_GROW={
  s0:{ is:[["{n}選手はまだ発展途上にあるようです。","{n}選手は、これからが楽しみな段階ですね。"],["{n}選手は今、成長期にあります。伸びしろですね。","{n}選手は、練習の成果がよく表れている時期です。"],
           ["{n}選手は、ひとつ大きな壁の手前まで来ているようです。","{n}選手は、もう一段上が見えてきました。"],["{n}選手に覚醒の兆しが出ています。フレンドリーマッチで試す好機です。","{n}選手、何かが目覚めかけているようです。"],
           ["{n}選手は、個人の力はもう完成の域にあります。","{n}選手は十分に仕上がっています。"]],
       ss:[["{n}選手は、戦術の理解はまだこれからのようです。","{n}選手には、もう少し戦術の話をしておきたいですね。"],["{n}選手は、戦術の飲み込みが早くなってきました。","{n}選手、ミーティングの内容がよく身についています。"],
           ["{n}選手は、特殊能力の壁の手前にいるようです。","{n}選手は、あと一歩で一段上の戦い方ができそうです。"],["{n}選手に覚醒の兆しが出ています。","{n}選手、戦い方に新しい何かが芽生えています。"],
           ["{n}選手は、特殊能力を極めています。","{n}選手の戦術理解は、もう申し分ありません。"]],
       ready:["{n}選手が、壁を越える話をしたがっています。言葉を選んであげてください。","{n}選手、一段上へのきっかけを求めているようです。"],
       expUp:"今は吸収の早い時期のようです。", expDn:"ただ、少し伸び悩んでいる様子もあります。", commUp:"今なら素直に話を聞いてくれそうです。", commDn:"最近は反抗的で、言葉が届きにくいかもしれません。",
       mot:["{n}選手はケガをしています。まずは手当てが必要です。","{n}選手はかなり落ち込んでいるようです。","{n}選手は少し元気がないようです。","{n}選手の調子は悪くありません。","{n}選手は絶好調です。"],
       tired:"疲れもたまっているようです。" },
  s1:{ is:[["{n}選手はまだまだ発展途上って感じです！","{n}選手、これからがすっごく楽しみです！"],["{n}選手、いま成長期ですよ！ 伸びしろですね！","{n}選手、練習の成果がどんどん出てます！"],
           ["{n}選手、大きな壁の手前まで来てますよ！","{n}選手、もう一段上が見えてきました！"],["{n}選手に覚醒の兆しです！ フレンドリーマッチで試しましょう！","{n}選手、何かが目覚めそうですよ！"],
           ["{n}選手、もう完成形って感じです！","{n}選手はばっちり仕上がってます！"]],
       ss:[["{n}選手は、戦術はまだまだこれからですね！","{n}選手、もっと戦術のお話が必要かもです！"],["{n}選手、戦術の飲み込みが早くなってきました！","{n}選手、ミーティングの内容しっかり覚えてますよ！"],
           ["{n}選手、特殊能力の壁の手前です！","{n}選手、あと一歩で一段上に行けそうです！"],["{n}選手に覚醒の兆しです！","{n}選手、新しい戦い方が芽生えてますよ！"],
           ["{n}選手、特殊能力はもう極めてます！","{n}選手の戦術理解、文句なしです！"]],
       ready:["{n}選手が壁を越える話をしたいみたいです！ 言葉選び、大事ですよ！","{n}選手、一段上へのきっかけを探してるみたいです！"],
       expUp:"今は吸収がすっごく早い時期みたいです！", expDn:"でも、ちょっと伸び悩んでるかもです……。", commUp:"今なら素直に聞いてくれそうですよ！", commDn:"最近ちょっと反抗的で、言葉が届きにくいかもです……。",
       mot:["{n}選手、ケガしちゃってます！ まずは手当てを！","{n}選手、かなり落ち込んでるみたいです……。","{n}選手、ちょっと元気ないです。","{n}選手、調子は悪くないですよ！","{n}選手、絶好調です！"],
       tired:"疲れもたまってるみたいです！" },
  s2:{ is:[["{n}、育成段階は初期。発展途上です。","{n}、今後の伸びに期待できる段階です。"],["{n}、現在は成長期。伸びしろは十分です。","{n}、練習の成果が表れています。"],
           ["{n}、ひとつ上の段階の手前に到達しています。","{n}、次の段階が視野に入りました。"],["{n}、覚醒の兆候あり。フレンドリーマッチでの起用を推奨します。","{n}、覚醒の兆候を確認しました。"],
           ["{n}、個人能力は完成段階です。","{n}、仕上がりは十分です。"]],
       ss:[["{n}、戦術理解は初期段階です。","{n}、戦術面の指導を継続してください。"],["{n}、戦術理解が進んでいます。","{n}、ミーティング内容の定着を確認しました。"],
           ["{n}、特殊能力の壁の手前です。","{n}、次の段階まであと一歩です。"],["{n}、覚醒の兆候あり。","{n}、新たな戦術適性が見えています。"],
           ["{n}、特殊能力は最終段階です。","{n}、戦術理解に不足はありません。"]],
       ready:["{n}から壁を越えるための相談です。言葉の選択が結果を左右します。","{n}、一段上への契機を求めています。"],
       expUp:"現在、吸収の早い時期です。", expDn:"ただし伸び悩みの傾向があります。", commUp:"現在は指導を受け入れやすい状態です。", commDn:"反抗的な傾向あり。指導が届きにくい可能性があります。",
       mot:["{n}、負傷中。処置が必要です。","{n}、精神状態は低調です。","{n}、やや不調です。","{n}、状態は良好です。","{n}、絶好調です。"],
       tired:"疲労の蓄積も見られます。" },
  s3:{ is:[["{n}はまだ発展途上ね。","{n}、これからが楽しみな子よ。"],["{n}は今、成長期よ。伸びしろたっぷりね。","{n}、練習の成果がちゃんと出てるわ。"],
           ["{n}、大きな壁の手前まで来てるわね。","{n}、もう一段上が見えてきたみたい。"],["{n}に覚醒の兆しが出てるわ。フレンドリーマッチで試してみて。","{n}、何かが目覚めかけてるわね。"],
           ["{n}はもう完成の域ね。","{n}はしっかり仕上がってるわ。"]],
       ss:[["{n}は、戦術はまだこれからね。","{n}には、もう少し戦術の話をしてあげて。"],["{n}、戦術の飲み込みが早くなってきたわ。","{n}、ミーティングの話がちゃんと身についてるわね。"],
           ["{n}、特殊能力の壁の手前にいるわ。","{n}、あと一歩で一段上に行けそうよ。"],["{n}に覚醒の兆しよ。","{n}、新しい戦い方が芽生えてるわ。"],
           ["{n}は特殊能力を極めてるわ。","{n}の戦術理解は、もう申し分ないわね。"]],
       ready:["{n}が壁を越える話をしたがってるわ。言葉は選んであげてね。","{n}、一段上へのきっかけを探してるみたい。"],
       expUp:"今は吸収の早い時期みたいね。", expDn:"でも、少し伸び悩んでるみたい。", commUp:"今なら素直に聞いてくれそうよ。", commDn:"最近ちょっと反抗的で、言葉が届きにくいかも。",
       mot:["{n}、ケガをしてるの。まずは手当てしてあげて。","{n}、かなり落ち込んでるみたい。","{n}、少し元気がないわね。","{n}の調子は悪くないわ。","{n}は絶好調よ。"],
       tired:"疲れもたまってるみたい。" }
};
/** 会話の言葉を選ぶ(同じ試合・同じ選手・同じ回なら同じ言葉) */
const talkPick=(S,a,key)=>a[hashStr("tk:"+key+":"+S.term+":"+S.played+":"+(S.g?S.g.cn:0))%a.length];
/** 段階 0〜4: 0 = ★0〜1 / 1 = ★2〜3 / 2 = ★4(兆しなし)/ 3 = 覚醒の兆し / 4 = ★5 */
const growStage=(st,sign)=>st>=5?4:sign?3:st>=4?2:st>=2?1:0;
/** 秘書が伝える育成の様子。kind = "ind" | "meet" | "talk"。タグの影響(経験・話の通りやすさ)も添える */
function growLine(S,id,kind){
  const g=S.g.pl[id]; if(!g)return "";
  const L=SEC_GROW[secOf(S).id]||SEC_GROW.s0, n=cname0(id), f=t=>t.split("{n}").join(n);
  if(kind==="talk")return f(L.mot[g.mot])+(g.fat>=TUNING.grow.int.tiredSign?L.tired:"");
  const tx=kind==="meet"&&spReady(S,id)?talkPick(S,L.ready,"r"+id):talkPick(S,L[kind==="meet"?"ss":"is"][growStage(kind==="meet"?g.ss:g.is,kind==="meet"?g.sq:g.q)],kind+id);
  const ek=playerTagK(S,id,"exp"), ck=playerTagK(S,id,"comm");
  return f(tx)+(ck<1?L.commDn:ck>1?L.commUp:"")+(ek>1&&ck<=1?L.expUp:ek<1?L.expDn:"");
}
const cname0=id=>nameOf(CARDS[id]);
/** 監督の言葉。kind と選んだ手(ラウンジは 0〜2) */
function mgrSay(S,kind,choice,id){
  if(kind==="lounge")return talkPick(S,MGR_SAY.lounge[choice]||MGR_SAY.lounge[0],"ml"+choice);
  if(kind==="talk"&&S.g.pl[id]&&S.g.pl[id].mot===0)return talkPick(S,MGR_SAY.heal,"mh"+id);
  return talkPick(S,MGR_SAY[kind]||MGR_SAY.ind,"m"+kind+id);
}
/** ★突破の3択: [{ i:言い方(0 褒める / 1 厳しく / 2 任せる), t:監督の言葉 }]。型と並びは試合と選手ごとに変わる */
function meetOpts(S,id){
  const h=hashStr("mq:"+S.term+":"+S.played+":"+id), q=MEET_Q[h%MEET_Q.length];
  const ord=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]][(h>>>4)%6];
  return ord.map(i=>({ i, t:q[i] }));
}
/* 信頼度は数字や段の名前で見せず、選手の言葉の距離感で伝える(→docs/14 §14.109)。性格 × 段(まだ遠い / 打ち解けてきた / 信頼している / 心酔している) */
const TRUST_SAY=[
  [["……まだ少し緊張しますね。","監督とは、まだあまり話せてないですよね。"],["監督と話すの、だんだん慣れてきました。","最近、話しやすくなってきました。"],
   ["監督になら、なんでも相談できます。","監督のこと、頼りにしてます。"],["監督についていきます。どこまでも！","監督のためなら、なんだってやります！"]],
  [["……まだあんたを認めたわけじゃない。","あんたの実力、見せてもらうぜ。"],["あんたの采配、悪くないと思い始めてる。","少しは話がわかるようだな。"],
   ["あんたの言うことなら聞く。","あんたとなら、上に行ける。"],["あんたのためなら、命がけで走る。","最後まであんたについていく。"]],
  [["監督のことは、これから知っていきたいと思っています。","まずは、自分のプレーで信頼を得たいです。"],["監督の考え方、少しずつ分かってきました。","監督とは、落ち着いて話せる気がします。"],
   ["監督の言うことなら、納得して取り組めます。","監督とは、同じものを見ている気がします。"],["監督となら、自分のペースのまま上を目指せます。","監督のことは、心から信頼しています。"]]
];
function trustSay(S,id){
  const g=S.g.pl[id]; if(!g)return "";
  const a=TRUST_SAY[persOf(id)][trustLv(g)];
  return a[hashStr("ts:"+S.term+":"+S.played+":"+id)%a.length];
}
