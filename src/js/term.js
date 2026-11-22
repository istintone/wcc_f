/* =========================================================================
   wcc_f — 任期の終わり(DOM非依存)→docs/05 §5.8
   100試合で任期が終わると:
     ① 成績から監督称号が1つ決まる(条件は明示する。本家は非公開だった)
     ② 年俸が決まり、累計に積み上がる。累計で施設レベルが上がる(特殊練習が出やすくなる)
     ③ 絆の深い選手(最大3人)が、育成後のまま次の任期についてくる
     ④ 称号によっては、次の任期をリーグの格が高い状態から始める
   任期中の記録は S.ts に、終わりの結果は S.tend に、歴代は S.career に持つ。
   ========================================================================= */

/** 任期中の記録(称号の条件に使う) */
function newTermStats(){
  // awake・gold … この任期に起きた覚醒・黄金線の数(ついてきた選手の★・線は数えない)/ pow0 … 任期の始めのチーム力
  // prize … 獲得賞金(期待値と比べる)/ misSal・misLog … オーナーの指令の年俸の増減と記録(→docs/16 §16.3)
  return { kpCh:0, subs:0, used:[], topW:0, psoW:0, psoL:0, frW:0, awake:0, gold:0, pow0:null, prize:0, misSal:0, misLog:[] };
}

/**
 * 監督称号(→docs/05 §5.8・docs/21 §21.5)。**取りにくい称号ほど前**に並べ、上から見て条件を満たしたものが付く。
 * ただし**一度取った称号は後回し**: 条件を満たした中に、まだ取っていない称号があればそちらが付く(迷将・新米監督は除く)。
 *   名前は本家の称号から借りたもの。条件は本作で決めた。並びは通しのプレーで満たした率から(取りにくい順)
 *   grade … 監督の格に効く / bonus … 年俸の上乗せ(億)
 */
const TITLES=[
  { id:"legend",  name:"レジェンド",   grade:3, bonus:120, need:"S の大会を3つ以上制覇し、勝率 70% 以上",
    ok:x=>x.sWins>=3&&x.wr>=0.70 },
  { id:"emperor", name:"皇帝",         grade:3, bonus:90,  need:"S の大会で優勝し、リーグを2回以上制覇",
    ok:x=>x.sWins>=1&&x.lgWins>=2 },
  { id:"master",  name:"名将",         grade:3, bonus:70,  need:"タイトル8つ以上、勝率 60% 以上",
    ok:x=>x.titles>=8&&x.wr>=0.60 },
  { id:"magic",   name:"魔術師",       grade:2, bonus:50,  need:"KP を30回以上替え、勝率 55% 以上",
    ok:x=>x.kpCh>=30&&x.wr>=0.55 },
  { id:"heir",    name:"伝承者",       grade:2, bonus:40,  need:"黄金線を10本以上つないだ",
    ok:x=>x.gold>=10 },
  { id:"assassin",name:"刺客",         grade:2, bonus:40,  need:"強豪(★5)のクラブに8勝以上",
    ok:x=>x.topW>=8 },
  // 覚醒工場: 個人・特殊ともに ★5 の選手を5人以上(この任期に育てた分。→docs/21 §21.5)
  { id:"factory", name:"覚醒工場",     grade:2, bonus:50,  need:"個人・特殊ともに ★5 の選手を5人以上育てた",
    ok:x=>x.dual>=5 },
  { id:"tactician",name:"知将",        grade:2, bonus:35,  need:"勝ち抜き戦で4回以上優勝し、PK戦で負け越していない",
    ok:x=>x.koWins>=4&&x.psoW>=x.psoL },
  { id:"fickle",  name:"浮気者",       grade:1, bonus:10,  need:"16人全員を先発で使い、交代を200回以上",
    ok:x=>x.used>=16&&x.subs>=200 },
  { id:"fighter", name:"闘将",         grade:1, bonus:20,  need:"勝ち越し、賞金 100億以上",
    ok:x=>x.w>x.l&&x.money>=100 },
  { id:"native",  name:"生え抜き",     grade:1, bonus:30,  need:"先発で使った選手が13人以下で、勝ち越した",
    ok:x=>x.used<=13&&x.w>x.l },
  { id:"wander",  name:"迷将",         grade:1, bonus:0,   need:"負け越した",
    ok:x=>x.w<x.l },
  { id:"rookie",  name:"新米監督",     grade:1, bonus:0,   need:"(どれにも当てはまらない)",
    ok:()=>true }
];
/** 付く称号: 条件を満たした中で、まだ取っていないもの(迷将・新米監督を除く)を優先。無ければ一番上 */
function pickTitle(S,x){
  const ok=TITLES.filter(t=>t.ok(x)), had=new Set((S.career||[]).map(c=>c.title));
  return ok.find(t=>!had.has(t.id)&&t.id!=="wander"&&t.id!=="rookie")||ok[0];
}

/** 称号の条件に使う数字を集める */
function termFacts(S){
  const t=S.titles.filter(x=>x.term===S.term), pl=Object.values(S.g.pl), r=S.rec, n=r.w+r.d+r.l;
  return { w:r.w, d:r.d, l:r.l, wr:n?r.w/n:0, titles:t.length,
    sWins:t.filter(x=>COMPS[x.comp].grade==="S").length,
    lgWins:t.filter(x=>x.comp==="LG").length,
    koWins:t.filter(x=>x.comp!=="LG"&&x.comp!=="W4").length,
    // この任期に起きた数で数える(前の任期からついてきた覚醒済みの選手や黄金線は入れない。→docs/09 第2弾)
    awake:S.ts.awake!=null?S.ts.awake:pl.filter(g=>g.is>=5).length,
    dual:pl.filter(g=>g.is>=5&&g.ss>=5&&!g.d55).length,   // 個人・特殊ともに ★5(ついてきた時点で両方 ★5 だった選手は数えない)
    gold:S.ts.gold!=null?S.ts.gold:Object.values(S.g.links).filter(l=>l.lv>=3).length,
    money:S.biz?S.biz.earn:S.money-S.money0,   // 稼いだ額(施設やスタジアムに使っても減らない)
    kpCh:S.ts.kpCh, subs:S.ts.subs, used:S.ts.used.length, topW:S.ts.topW, psoW:S.ts.psoW, psoL:S.ts.psoL };
}
/** 絆の深い選手(次の任期についてくる候補)。絆が mono 以上で、深い順に max 人 */
function followers(S){
  const T=TUNING.term;
  return Object.keys(S.g.pl).filter(id=>S.g.pl[id].bond>=T.bondMin)
    .sort((a,b)=>S.g.pl[b].bond-S.g.pl[a].bond||(a<b?-1:1)).slice(0,T.follow);
}
/** 施設レベル。累計の年俸で上がる */
function facLevel(total){
  const th=TUNING.term.facAt; let lv=1;
  while(lv<=th.length&&total>=th[lv-1])lv++;
  return lv;
}
/** 任期が終わった瞬間に呼ぶ。結果を S.tend に置き、歴代に積む */
function endTerm(S){
  const T=TUNING.term, x=termFacts(S), title=pickTitle(S,x);
  // 任期の終わりで決着しなかった指令は「打ち切り」(年俸は動かない。→docs/22)
  if(S.mis){ (S.ts.misLog||(S.ts.misLog=[])).push({ text:S.mis.text, ok:null, v:0 }); S.mis=null; }
  // クラブの期待(→docs/16 §16.3): 獲得賞金が期待値に届けば上乗せ。オーナーの指令の増減も足す
  const cp=S.cprof&&!S.cprof.legacy?S.cprof:null, O=TUNING.offer;
  const exp=cp?{ target:cp.target, prize:Math.round(S.ts.prize||0), ok:(S.ts.prize||0)>=cp.target, bonus:0 }:null;
  if(exp&&exp.ok)exp.bonus=O.targetSal*cp.expLv;
  const misSal=S.ts.misSal||0;
  const salary=Math.max(0,Math.round(T.salaryBase+x.money*T.salaryK+title.bonus+(exp?exp.bonus:0)+misSal));
  const before=facLevel(S.salary);
  S.salary+=salary;
  S.fac=facLevel(S.salary);
  S.tend={ term:S.term, title:title.id, salary, total:S.salary, fac:S.fac, facUp:S.fac>before,
    grade:title.grade, follow:followers(S), facts:x, club:cp?cp.name:null, exp, mis:(S.ts.misLog||[]).slice(), misSal };
  S.career.push({ term:S.term, title:title.id, w:x.w, d:x.d, l:x.l, titles:x.titles, salary, money:Math.round(x.money) });   // money … その任期に稼いだ資金(最高額を競う)
  return S.tend;
}
/**
 * 次の任期を始める。ついてくる選手は★・能力・特殊能力を保ったまま。
 * 互いの連携(線)も残る。やる気は好調、疲労は0から。
 */
function startNextTerm(S,W){
  const end=S.tend, keep=end?end.follow:[], old=S.g;
  newTerm(S,W);
  if(!end)return;
  S.grade=Math.max(1,end.grade);
  if(S.biz)spRenew(S);                         // 引き継いだ格でスポンサーの候補を出し直す
  S.league=newLeague(S,W);
  for(const id of keep){
    const o=old.pl[id], g=S.g.pl[id];        // 登録を外れていればついてこない
    if(!o||!g)continue;
    Object.assign(g,{ is:o.is, ss:o.ss, d55:o.is>=5&&o.ss>=5, up:Object.assign({},o.up), ie:0, se:0, q:false, sq:false,
      bond:Math.floor(o.bond/2), followed:true });
  }
  for(const k in old.links){
    const p=k.split("|");
    if(keep.includes(p[0])&&keep.includes(p[1])&&old.links[k].lv>0)
      S.g.links[k]={ lv:old.links[k].lv, exp:0, gold:false, cap:old.links[k].cap||0 };
  }
  S.tend=null;
}
const titleOf=id=>TITLES.find(t=>t.id===id)||TITLES[TITLES.length-1];

/* ---------- 称号のセット(監督能力の継承。→docs/10 §10.2 B) ----------
 * 任期の始めに、これまでに獲った称号から1つを選んでセットする。その任期のあいだ:
 *   favor … 出やすくなる特殊練習(eff = 伸びるもの / axis = 上がる戦力グラフの軸)。spK … 特殊練習が出る率の倍率
 *   ほかは小さな効き目(数値は TUNING.tset)
 * S.tset = 称号の id | null、S.tsetChosen = その任期に選んだか */
const TITLE_FX={
  legend:   { favor:null,              desc:"特殊練習がどの系統も出やすい" },
  emperor:  { favor:{ axis:"ORDCSP" }, desc:"戦力グラフを伸ばす特殊練習 ・ 大会の試合で負けてもやる気が下がりにくい" },
  master:   { favor:{ eff:"sp" },      desc:"特殊能力の特殊練習 ・ ミーティングの★突破が成功しやすい" },
  factory:  { favor:{ eff:"ind" },     desc:"個人能力の特殊練習 ・ 個人練習の経験 +10%" },
  magic:    { favor:{ eff:"sp" },      desc:"特殊能力の特殊練習 ・ ミーティングの経験 +10%" },
  heir:     { favor:{ eff:"link" },    desc:"連携の特殊練習 ・ ラウンジが大成功しやすい" },
  assassin: { favor:{ axis:"DC" },     desc:"守備・奪取の特殊練習 ・ 強豪に勝つとやる気が上がりやすい" },
  tactician:{ favor:{ eff:"set" },     desc:"セットプレイの特殊練習 ・ セットプレイの伸び +20%" },
  native:   { favor:{ eff:"ind" },     desc:"個人能力の特殊練習 ・ 21歳以下の伸びやすさ +10%" },
  fickle:   { favor:{ axis:"S" },      desc:"スピードの特殊練習 ・ 控えのやる気が下がりにくい" },
  fighter:  { favor:{ axis:"O" },      desc:"攻撃の特殊練習 ・ 勝つとやる気が上がりやすい" }
};
/** これまでに獲った称号のうち、セットできるもの(効き目のあるもの。新しい順) */
function earnedTitles(S){ const out=[]; for(let i=S.career.length-1;i>=0;i--){ const id=S.career[i].title; if(TITLE_FX[id]&&!out.includes(id))out.push(id); } return out; }
/** いまセットしている称号の数値(TUNING.tset)。セットしていなければ null */
const tsetOf=(S,k)=>S&&S.tset&&TUNING.tset[S.tset]&&TUNING.tset[S.tset][k]!=null?TUNING.tset[S.tset][k]:null;
function setTitle(S,id){ if(id&&!earnedTitles(S).includes(id))return false; S.tset=id||null; S.tsetChosen=true; return true; }
/** 特殊練習の重み。セットした称号の系統に合うものは favorW 倍 */
function trainWeight(S,t){
  const f=S&&S.tset&&TITLE_FX[S.tset]&&TITLE_FX[S.tset].favor; if(!f)return 1;
  const hit=(f.eff&&t.eff[f.eff])||(f.axis&&t.up&&f.axis.split("").some(a=>t.up.includes(a)));
  return hit?TUNING.tset.favorW:1;
}
