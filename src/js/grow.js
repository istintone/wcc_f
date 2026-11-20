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
const INT_LABEL=["軽め","普通","ハード"];
const COMM_LABEL={ ind:"個人練習", meet:"ミーティング", lounge:"ラウンジ", talk:"ケア" };
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
  return { pl, links:{}, graph:{ O:0, D:0, R:0, C:0, S:0, P:0 }, gold:{}, golden:0, set:0,
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
  // 成長グラフ(→docs/15)。前の戦力グラフ(−2〜+3 の上乗せ)とは目盛りが違うので 0 から
  if(!g.gold){ g.gold={}; g.golden=0; for(const a in g.graph)g.graph[a]=0; }
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
function trainLabel(o){ return o.sp>=0?TRAIN_SP[o.sp].name:STAT_LABEL[o.param]+"の練習"; }
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
    if(graphGoldN(S)>=3&&!S.g.golden){
      S.g.golden=R.golden; S.g.goldenAt=S.played;
      for(const id in S.g.pl)if(S.g.pl[id].mot>0)S.g.pl[id].mot=4;
      out.push("👑 黄金期が到来！ 成長グラフが黄金に。"+R.golden+"試合のあいだ全員が絶好調");
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
  if(l.lv<Math.min(l.cap,2))l.exp+=v*facK(S,"lounge");
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
      g.ie+=(I.train+(top.includes(o.param)?I.trainFit:0))*k*growK(id,S)*facK(S,"train");
      g.tr[o.param]=(g.tr[o.param]||0)+1;
    }
    graphAdd(S,PARAM_AXIS[o.param],R.basic*k*gk); ups=[PARAM_AXIS[o.param]];
  }else{
    const t=TRAIN_SP[o.sp], e=t.eff, all=t.up.length===6;
    for(const id of ids){
      const g=S.g.pl[id];
      g.ie+=(I.spTrain+(e.ind||0))*k*growK(id,S)*facK(S,"train");
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
  const k=spReady(S,id)?"ready":(g.q||g.sq)?"awake":g.mot<=1?"low":g.fat>=G0.int.tiredSign*1.5?"tired"
    :(g.bench||0)>=G0.mot.benchGrace?"bench":(indProgress(g)>=0.8&&g.is<5)?"near":g.mot>=4?"high"
    :trustLv(g)>=2?"trust":(g.bond||0)===0?"new":c.age<=21?"young":c.age>=31?"vet":"plain";
  const list=VOICE[k], r=hashStr("v:"+S.term+":"+S.played+":"+id)%list.length;
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
  const t=REACT[kind]||REACT.ind, list=t[Math.max(0,Math.min(2,res))], r=hashStr("r:"+S.term+":"+S.played+":"+id+":"+kind)%list.length;
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
  g.ie+=C.ind*growK(id,S)*facK(S,"train")*(spBoost(S,"indExp")||1)*(1+TUNING.grow.dup.indK*dupOf(S,id))*(tsetOf(S,"indK")||1);
  g.bond++;
  out.push(nameOf(CARDS[id])+" に個別指導(個人能力の経験 +"+C.ind+")");
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
  const p=[p0[0]+ok,p0[1],Math.max(0,p0[2]-ok)];   // スポンサーの効果: 失敗のぶんが大成功に回る
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
    const p=(choice===persOf(id)?P.qOk:P.qNg)+(tsetOf(S,"qOk")||0);   // 名将: ★突破が成功しやすい
    const r=mulberry32((S.seed^hashStr("mt:"+S.term+":"+S.played+":"+S.g.cn+":"+id+":"+choice))>>>0)();
    if(r<p){
      g.se-=P.need[g.ss]; g.ss++; res=0;
      out.push(nameOf(CARDS[id])+" 特殊能力 ★"+g.ss);
    }else{
      g.se=Math.floor(g.se*P.failKeep); res=2;
      if(g.mot>0)g.mot=Math.max(1,g.mot-1);
      out.push(nameOf(CARDS[id])+" の心に響かなかった…(やる気が下がった)");
    }
  }else{
    g.se+=P.meet*facK(S,"tact")*(tsetOf(S,"meetK")||1);
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
  for(const id of played)S.g.pl[id].ie+=I.match*growK(id,S)*facK(S,"train");
  for(let a=0;a<on.length;a++)for(let b=a+1;b<on.length;b++)
    linkExp(S,on[a],on[b],L.match*linkBonusK(on[a],on[b]),linkCap(on[a],on[b]));
  for(const id in S.g.pl)checkInd(S,id,out);
  settleLinks(S,out);
  if(fx.kind==="friendly"&&res.win){
    for(const id of on){
      const g=S.g.pl[id];
      if(g.q&&rng()<I.awakeP)awaken(S,id,rng,out);
      if(g.sq&&rng()<G0.sp.star5P){ g.ss=5; g.sq=false; g.se=0; out.push("⭐ "+nameOf(CARDS[id])+" の特殊能力が ★5 に(スタイルが極まる)"); newsOf("star5",[id],out); }
    }
    // 黄金線は1試合に1本まで(兆しのある組のうち、たねで1つ選ぶ)
    const cand=Object.keys(S.g.links).filter(k=>{ const l=S.g.links[k], p=k.split("|");
      return l.gold&&l.lv===2&&on.includes(p[0])&&on.includes(p[1]); });
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
    g.fat=Math.min(N.fatMax,(g.fat+(played.includes(id)?N.matchLoad*(spBoost(S,"noFat")||1):0))*N.recover*medFat(S));
  }
  // ケガ(→docs/08 §8.8): 試合の中でケガをした選手は「ケガ」に。前からのケガは確率で治る(続いても maxN 試合で治る)
  const J=TUNING.inj, newInj=(res.inj||[]).filter(id=>S.g.pl[id]);
  for(const id in S.g.pl){
    const g=S.g.pl[id];
    if(newInj.includes(id)){ g.mot=0; g.injN=1; out.push("🩹 "+nameOf(CARDS[id])+" がケガ(治るまで能力が落ちる。ケアで手当てできる)"); newsOf("inj",[id],out); }
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
      if(res.win&&rng()<Mo.winUp*sw*(tsetOf(S,"winUpK")||1))g.mot=Math.min(4,g.mot+1);
      else if(res.win&&giant&&rng()<giant)g.mot=Math.min(4,g.mot+1);   // 刺客: 格上に勝つと上がりやすい
      else if(res.lose&&rng()<Mo.loseDown*sw*(spBoost(S,"keepForm")??1)*(fx.kind==="cup"?(tsetOf(S,"cupKeep")||1):1))g.mot=Math.max(1,g.mot-1);
      else if(!res.win&&!res.lose&&rng()<Mo.drawSwing*sw)g.mot=clamp(g.mot+(rng()<0.5?1:-1),1,4);
    }else{
      g.bench=(g.bench||0)+1;
      if(g.bench>=Mo.benchGrace&&rng()<Mo.benchDown*sw*(spBoost(S,"bench")??1)*(tsetOf(S,"benchK")||1))g.mot=Math.max(1,g.mot-1);
      else if(res.win&&rng()<Mo.teamWinUp)g.mot=Math.min(4,g.mot+1);
    }
    if(g.mot===was&&g.mot!==Mo.start&&rng()<Mo.revert)g.mot+=g.mot<Mo.start?1:-1;
  }
  // 黄金期(→docs/15 §15.3): 残りの試合のあいだ、ケガ以外の全員が絶好調のまま。終わっても金色のグラフは残る
  if(S.g.golden>0){
    S.g.golden--;
    if(S.g.golden>0){ for(const id in S.g.pl)if(S.g.pl[id].mot>0)S.g.pl[id].mot=4; }
    else out.push("黄金期がひと区切り(金色の成長グラフはそのまま)");
  }
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
  { id:"s1", name:"日向 夏美", desc:"元気で明るい" },
  { id:"s2", name:"氷室 玲",   desc:"クールで分析的" },
  { id:"s3", name:"春野 静香", desc:"おっとりした年上" }
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
    hurt:"{n} がケガをしています。SQUAD で控えと入れ替えるか、ケアで手当てしましょう。",
    termOver:"任期が終わりました。お疲れさまでした。",
    win:["お疲れさまでした。見事な勝利です。","お疲れさまでした。監督の采配、見事でした。"],
    lose:["お疲れさまでした。切り替えて次へ行きましょう。","悔しいですね……。でも監督なら大丈夫です。次へ行きましょう。"],
    draw:"お疲れさまでした。引き分けでした。",
    follow:"{n} には私から話しておきました。少し落ち着いたようです。",
    lvup:"監督……これからも、そばで支えさせてください。" },
  s1:{ hello:"日向夏美です！ 秘書として全力でサポートしますね、監督！",
    welcome:["監督、はじめましょう！ まずは次の試合の準備から！","監督！ 今日もいっしょに頑張りましょう！"],
    next:["次の試合、準備していきましょう！","よーし監督、次もいっちゃいましょう！"],
    comm:"練習おわりました！ コミュニケーションはあと {n} 回できますよ！",
    tired:"みんなヘトヘトみたいです……。今日は軽めにしませんか？",
    sign:"「！」の付いた選手が {n} 人いますよ！ 話を聞いてあげてください！",
    omen:"フレンドリーマッチです！ 兆しのある選手を出して勝てば、きっと開花します！",
    final:"{c}の決勝ですよ！ 勝てばタイトルです、ドキドキしますね！",
    hurt:"{n} がケガしちゃってます！ 控えと入れ替えるか、ケアしてあげてください！",
    termOver:"任期おわりましたー！ 監督、おつかれさまでした！",
    win:["やりましたね監督！ 勝ちましたー！","さっすがボス！ 最高の試合でした！"],
    lose:["うう、くやしい……。でも次こそ勝ちましょう！","ボス、落ち込まないで！ 次はぜったい勝てます！"],
    draw:"引き分けかぁ……。次は勝ちきりましょう！",
    follow:"{n} にはわたしから声かけときました！ 元気出たみたいです！",
    lvup:"ボス、これからもずーっといっしょに頑張りましょうね！" },
  s2:{ hello:"氷室です。データの整理と報告は任せてください。",
    welcome:["監督。まずは次の試合の準備を。","監督、準備はできています。始めましょう。"],
    next:["次の試合の準備を。","次の相手の資料はまとめてあります。準備を始めましょう。"],
    comm:"練習は完了。コミュニケーションの残りは {n} 回です。",
    tired:"チームの疲労が溜まっています。今日の練習は軽めが合理的です。",
    sign:"「！」の付いた選手が {n} 人。対応を推奨します。",
    omen:"フレンドリーマッチです。兆しのある選手を出して勝てば、開花の確率があります。",
    final:"{c}の決勝です。勝てばタイトル。",
    hurt:"{n} が負傷中。控えとの入れ替えか、ケアでの処置を推奨します。",
    termOver:"任期終了です。お疲れさまでした。",
    win:["勝利です。内容も悪くありません。","勝利です。……監督の判断は、正しかったと思います。"],
    lose:["敗戦です。原因は分析しておきます。","敗戦です。でも、修正点は見えています。監督なら立て直せます。"],
    draw:"引き分けです。決定力に課題が残りました。",
    follow:"{n} の件は処理しておきました。問題ありません。",
    lvup:"……監督の隣で仕事をするのは、悪くないです。" },
  s3:{ hello:"春野静香です。ふふ、監督のお手伝い、のんびりやらせてもらいますね。",
    welcome:["あら監督、いらっしゃい。まずは次の試合の準備からね。","監督、今日も来てくれたのね。さ、準備しましょうか。"],
    next:["次の試合の準備、始めましょうか。","次の試合も、監督らしくいきましょうね。"],
    comm:"練習はおしまい。コミュニケーションはあと {n} 回できるわよ。",
    tired:"みんな少しお疲れみたい。今日は軽めにしてあげたら？",
    sign:"「！」の付いた子が {n} 人いるわ。お話、聞いてあげて。",
    omen:"フレンドリーマッチね。兆しのある子を出して勝てば、花が開くかも。",
    final:"{c}の決勝ね。勝てばタイトルよ。",
    hurt:"{n} がケガをしてるの。控えと替えるか、ケアしてあげてね。",
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
  return { v, line:secOf(S).name+"「"+SEC_EV_REPLY[Math.min(3,v)]+"」", up };
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
