/* =========================================================================
   wcc_f — クラブ運営(DOM非依存。Node でそのまま回せる)→docs/05
   1本の流れ: 次の試合を決める → 試合 → 結果を反映 → …(100試合で任期終了)
   ここが持つのは「試合の外」だけ。試合の中身は engine.js に任せる。
     ・世界(相手クラブ)は**たねから毎回同じものを作る**。セーブには入れない
     ・セーブ(S)は JSON にそのまま落とせる素の値だけで持つ
   ========================================================================= */

/* ---------- 大会(→docs/05 §5.7) ---------- */

/**
 * 大会の定義。stages の種類:
 *   ko   … 1試合で決着(同点なら PK 戦)
 *   leg1 … 2試合制の第1試合 / leg2 … 第2試合(2試合の合計。同点なら PK 戦)
 *   grp  … 4クラブの総当たりの1試合。最後の grp のあと、順位が adv 以内なら次へ
 * tiers … 出てくる相手の強さ(1=弱い 〜 5=強い)
 */
const COMPS={
  LG:   { name:"レギュラーリーグ", grade:"-" },
  FR:   { name:"フレンドリーマッチ", grade:"-" },
  PRE:  { name:"プレシーズンカップ", grade:"E", tiers:[1,2],
          stages:[["ko","1回戦"],["ko","準決勝"],["ko","決勝"]] },
  ENT:  { name:"エンタープライズカップ", grade:"D", tiers:[2,3],
          stages:[["ko","1回戦"],["ko","準決勝"],["ko","決勝"]] },
  KINGS:{ name:"キングスクラブカップ", grade:"C", tiers:[2,3,4],
          stages:[["ko","1回戦"],["ko","準決勝"],["ko","決勝"]] },
  NSC:  { name:"ナショナルスーパーカップ", grade:"C", tiers:[3,4],
          stages:[["ko","決勝"]] },
  W4:   { name:"W4タイトルホルダーズカップ", grade:"B", tiers:[3,4], adv:1,
          stages:[["grp","リーグ戦 第1試合"],["grp","リーグ戦 第2試合"],["grp","リーグ戦 第3試合"],["ko","決勝"]] },
  CONTI:{ name:"コンチネンタルカップ", grade:"A", tiers:[4,5],
          stages:[["leg1","1回戦 第1試合"],["leg2","1回戦 第2試合"],["ko","決勝"]] },
  CSC:  { name:"コンチネンタルスーパーカップ", grade:"A", tiers:[4,5],
          stages:[["ko","決勝"]] },
  CT:   { name:"チャンピオンズトロフィー", grade:"S", tiers:[4,5],
          stages:[["leg1","1回戦 第1試合"],["leg2","1回戦 第2試合"],
                  ["leg1","準決勝 第1試合"],["leg2","準決勝 第2試合"],["ko","決勝"]] },
  JT:   { name:"ジャパントロフィー", grade:"S", tiers:[5],
          stages:[["ko","決勝"]] },
  ICC:  { name:"インターナショナルクラブチャンピオンシップ", grade:"S", tiers:[5], adv:2,
          stages:[["grp","1回戦 第1試合"],["grp","1回戦 第2試合"],["grp","1回戦 第3試合"],
                  ["ko","準決勝"],["ko","決勝"]] }
};
const CUP_IDS=["PRE","W4","KINGS","NSC","CT","JT","ENT","CONTI","CSC","ICC"];

/** 1周 43試合の並び(本家のスケジュール)。[大会, その大会の何番目の試合か] */
const SCHED=(()=>{
  const out=[], lg=n=>{ for(let i=0;i<n;i++)out.push(["LG",out.filter(s=>s[0]==="LG").length]); };
  const cup=id=>COMPS[id].stages.forEach((_,i)=>out.push([id,i]));
  cup("PRE"); lg(2); cup("W4"); lg(2); cup("KINGS"); cup("NSC"); lg(2); cup("CT"); cup("JT"); lg(2);
  cup("ENT"); lg(2); cup("CONTI"); cup("CSC"); lg(2); cup("ICC"); lg(2);
  return out;
})();

/* ---------- 世界(相手クラブ)の生成 ---------- */

/** 役割ごとの能力のひな形 [off,def,tec,pow,spd,sta] と、付けるスキルの候補 */
const GEN_ROLE={
  GK: { st:[3,16,10,14,9,10],   pos:"GK", sk:["stopper","stopper","pkstop","sweeper","feeder"] },
  CB: { st:[6,16,10,15,11,12],  pos:"DF", sk:["leader","wall","line","cover","mark","manmark","killer","libero","tower"] },
  SB: { st:[9,13,12,10,15,15],  pos:"DF", sk:["over","over","cross","allout","dynamo"] },
  DMF:{ st:[8,14,13,13,11,16],  pos:"MF", sk:["hunt","maker","cover","captain","dynamo","passer"] },
  CMF:{ st:[12,10,15,11,12,14], pos:"MF", sk:["passer","thru","maker","counter","combo","longp","area","team"] },
  OMF:{ st:[14,8,16,10,13,12],  pos:"MF", sk:["chance","fanta","drib","middle","kicker","thru"] },
  SMF:{ st:[13,8,14,9,16,13],   pos:"MF", sk:["wing","cross","counter","dynamo"] },
  WG: { st:[15,6,15,9,16,12],   pos:"FW", sk:["wing","cross","fanta","sprint"] },
  CF: { st:[16,5,13,15,13,11],  pos:"FW", sk:["hunter","runner","post","target","tower","ace","chase","sprint"] }
};
const GEN_BENCH=["GK","CB","CMF","SMF","CF"];
const GEN_NO=[1,2,5,4,3,6,8,10,7,9,11,12,15,14,17,19];
const GEN_SYL=["ア","イ","ウ","エ","オ","カ","キ","ク","ケ","コ","サ","シ","ス","セ","ソ","タ","チ","ト","ナ","ニ",
  "ノ","ハ","ヒ","フ","ヘ","ホ","マ","ミ","ム","メ","モ","ラ","リ","ル","レ","ロ","ガ","ギ","グ","ゴ","ザ","ジ","ズ",
  "ダ","デ","ド","バ","ビ","ブ","ベ","ボ","パ","ピ","ポ","ヴァ","ヴィ","ジョ","シャ","チェ","ファ","フィ","フェ"];
const GEN_END=["","","","ス","ン","ル","ノ","ニ","ッチ","ーロ","ーニ","ソン","ック","ート"];
const GEN_CLUB=[["ノルド","NOR"],["ヴェルデ","VER"],["アウレア","AUR"],["カステル","CAS"],["リオ","RIO"],
  ["ポルト","POR"],["グラン","GRA"],["ネロ","NER"],["ビアンコ","BIA"],["エスト","EST"],["モンテ","MON"],
  ["ラーゴ","LAG"],["フェロ","FER"],["ソル","SOL"],["ルナ","LUN"],["ステラ","STE"],["マーレ","MAR"],
  ["ティエラ","TIE"],["シエロ","CIE"],["フォルテ","FOR"],["オリゾン","ORI"],["ブルーム","BLU"],["ガレオン","GAL"]];
const GEN_SUF=["FC","ユナイテッド","シティ","SC","アスレティック","ローヴァーズ"];
const GEN_COL=["#e0483a","#e08a2f","#d8c23a","#58b04a","#2fa8a0","#7a5fe0","#c94fb0","#8a8f9c","#b0522d","#3f9be0"];
const GEN_FORM=["4-3-3","4-4-2","4-2-3-1","3-5-2"];
/** 強さの段ごとのクラブ数(生成ぶん)。ロッソ・ユナイテッドは段3として別に加わる */
/** 生成する架空クラブの段。段4・5は実在の16クラブ(→pool.js) */
const GEN_TIERS=[1,1,1,1, 2,2,2,2,2,2, 3,3,3,3,3];

function genWorld(seed){
  const C=TUNING.club, rng=mulberry32((seed^hashStr("world"))>>>0);
  const pick=a=>a[Math.floor(rng()*a.length)], used=new Set(), clubs=[];
  const name=()=>{
    for(let k=0;k<50;k++){
      let s=""; const n=2+Math.floor(rng()*2);
      for(let i=0;i<n;i++)s+=pick(GEN_SYL);
      s+=pick(GEN_END);
      if(!used.has(s)){ used.add(s); return s; }
    }
    return "ナナシ"+used.size;
  };
  GEN_TIERS.forEach((tier,ci)=>{
    const id="c"+String(ci+1).padStart(2,"0"), nm=GEN_CLUB[ci], form=pick(GEN_FORM), slots=FORMS[form];
    const roles=slots.map((s,i)=>i===0?"GK":roleAt(s[0],s[1])).concat(GEN_BENCH);
    const cards=roles.map((role,i)=>{
      const g=GEN_ROLE[role], off=C.tierStat[tier-1];
      const age=18+Math.floor(rng()*17), ageOff=age<=21?-0.8:age>=31?0.4:0;
      const st=g.st.map((v,k)=>clamp(Math.round(v+(v<=6?off*0.3:off+ageOff)+(rng()*2-1)*C.statNoise),1,STAT_MAX));
      const cid=id+"p"+String(i+1).padStart(2,"0");
      const two=role==="CMF"?["CMF",rng()<0.5?"DMF":"OMF"]:role==="SMF"?["SMF","WG"]:role==="WG"?["WG","SMF"]
        :role==="OMF"?["OMF","CMF"]:role==="DMF"?["DMF","CMF"]:[role];
      CARDS[cid]={ id:cid, no:GEN_NO[i], name:name(), pos:g.pos, roles:two,
        off:st[0], def:st[1], tec:st[2], pow:st[3], spd:st[4], sta:st[5], skill:pick(g.sk), age };
      return cid;
    });
    const xi=cards.slice(0,11), links=[], nLink=C.linkBase+C.linkTier*tier;
    for(let k=0;k<nLink*3&&links.length<nLink;k++){
      const a=xi[1+Math.floor(rng()*10)], b=xi[1+Math.floor(rng()*10)];
      if(a===b||links.some(l=>(l[0]===a&&l[1]===b)||(l[0]===b&&l[1]===a)))continue;
      links.push([a,b,clamp(Math.round(tier/2+rng()*1.2),1,3)]);
    }
    TEAMS[id]={ id, name:nm[0]+" "+pick(GEN_SUF), short:nm[1], color:GEN_COL[ci%GEN_COL.length], form,
      kp:xi[7+Math.floor(rng()*4)], xi, bench:cards.slice(11), links, tier };
    clubs.push(id);
  });
  TEAMS.ros.tier=3; clubs.push("ros");
  REAL_IDS.forEach(id=>clubs.push(id));       // 実在の16クラブ(段4・5)
  return { seed, clubs };
}
const tierOf=id=>TEAMS[id].tier||3;

/* ---------- セーブの形 ---------- */

function newLeague(S,W){
  const want=TUNING.club.leagueTiers[S.grade-1].slice(), rng=mulberry32((S.seed^hashStr("lg"+S.term+":"+S.cyc))>>>0);
  const pool=W.clubs.slice(), ids=[];
  for(const t of want){
    const c=pool.filter(id=>tierOf(id)===t&&!ids.includes(id));
    if(c.length)ids.push(c[Math.floor(rng()*c.length)]);
  }
  const clubs=["me"].concat(ids), table={};
  clubs.forEach(id=>table[id]={ p:0, w:0, d:0, l:0, gf:0, ga:0, pts:0 });
  return { clubs, table, done:0 };
}
function newCups(){
  const c={};
  CUP_IDS.forEach(id=>c[id]={ st:"wait", opp:[], leg:null, grp:null });
  return c;
}
function newCareer(seed){
  const S={ ver:1, seed:seed>>>0, term:1, played:0, slot:0, cyc:1, grade:1, money:0, money0:0,
    rec:{ w:0, d:0, l:0, gf:0, ga:0 }, titles:[], prev:null, league:null, cups:null,
    layout:{}, form:TEAMS.azr.form, kp:TEAMS.azr.kp, last:null, termOver:false, history:[], g:newGrowth(),
    ts:newTermStats(), tend:null, career:[], salary:0, fac:1,
    sq:startSquad(), coll:newCollection(), sec:newSec(), biz:newBiz(), mgr:null, club:null, tset:null, tsetChosen:true, mab:{ set:[], xp:{} }, ht:{ cnt:{}, set:["b1","b2","b3"] } };
  const W=genWorld(S.seed);
  S.league=newLeague(S,W); S.cups=newCups();
  spRenew(S);                                  // 最初のスポンサーの候補
  return S;
}
/** 読み込んだセーブに世界を作り直して返す(世界はたねから決まる) */
function worldOf(S){ return genWorld(S.seed); }

/* ---------- リーグ ---------- */

/** 8クラブの2回総当たり。r(0〜13)節の対戦を [ホーム, アウェイ] の配列で返す */
function leagueRound(clubs,r){
  const n=clubs.length, half=n-1, k=r%half, arr=clubs.slice(1), out=[];
  const rot=arr.slice(k).concat(arr.slice(0,k)), list=[clubs[0]].concat(rot);
  for(let i=0;i<n/2;i++){
    const a=list[i], b=list[n-1-i];
    // 前半(7節)で決めた向きを、後半はそっくり裏返す → どの組もホームとアウェイが1回ずつ
    const fwd=(i+k)%2===0;
    out.push(fwd===(r<half)?[a,b]:[b,a]);
  }
  return out;
}
function addTable(table,h,a,hg,ag){
  const H=table[h], A=table[a];
  H.p++; A.p++; H.gf+=hg; H.ga+=ag; A.gf+=ag; A.ga+=hg;
  if(hg>ag){ H.w++; A.l++; H.pts+=3; }
  else if(hg<ag){ A.w++; H.l++; A.pts+=3; }
  else{ H.d++; A.d++; H.pts++; A.pts++; }
}
function sortTable(table){
  return Object.keys(table).sort((a,b)=>{
    const x=table[a], y=table[b];
    return y.pts-x.pts||(y.gf-y.ga)-(x.gf-x.ga)||y.gf-x.gf||(a<b?-1:1);
  });
}
/** 相手どうしの試合を解く。どちらも監督つき */
function simCpu(a,b,seed){
  const M=simulateMatch(makeTeamDef(a,true),makeTeamDef(b,true),seed);
  return [M.home.score,M.away.score];
}

/* ---------- 次の試合 ---------- */

/** その大会に出られるか(→docs/05 §5.7)。prev は前の周の成績 */
function entryOk(S,id){
  const p=S.prev, won=S.cups, wonNow=x=>won[x].st==="won", wonPrev=x=>!!p&&p.won.includes(x);
  switch(id){
    case "PRE": case "ENT": case "KINGS": return true;
    case "NSC":   return wonNow("PRE")||wonNow("KINGS");
    case "W4":    return !!p&&p.rank<=4;
    case "CONTI": return !!p&&(p.rank<=2||["ENT","KINGS","NSC","W4"].some(wonPrev));
    case "CSC":   return wonNow("CONTI");
    case "CT":    return !!p&&(p.rank===1||wonPrev("CONTI")||wonPrev("W4"));
    case "JT":    return wonNow("CT");
    case "ICC":   return wonNow("CT")||wonNow("CONTI")||wonPrev("CT");
  }
  return false;
}
function cupRng(S,id,tag){ return mulberry32((S.seed^hashStr(id+":"+S.term+":"+S.cyc+":"+tag))>>>0); }
/** 大会の相手を決める。勝ち進むほど強い相手が出る */
function drawCup(S,W,id){
  const comp=COMPS[id], cup=S.cups[id], rng=cupRng(S,id,"draw");
  const pool=W.clubs.filter(c=>comp.tiers.includes(tierOf(c))).sort((a,b)=>tierOf(a)-tierOf(b)||(a<b?-1:1));
  const take=q=>{
    const i=clamp(Math.floor(q*pool.length+(rng()-0.5)*2),0,pool.length-1);
    return pool.length?pool.splice(i,1)[0]:W.clubs[Math.floor(rng()*W.clubs.length)];
  };
  const st=comp.stages, n=st.length;
  cup.opp=[];
  if(st[0][0]==="grp"){
    const g=[take(0.3),take(0.5),take(0.7)], table={};
    ["me"].concat(g).forEach(c=>table[c]={ p:0, w:0, d:0, l:0, gf:0, ga:0, pts:0 });
    cup.grp={ clubs:g, table };
  }
  for(let i=0;i<n;i++){
    if(st[i][0]==="grp")cup.opp.push(cup.grp.clubs[i]);
    else if(st[i][0]==="leg2")cup.opp.push(cup.opp[i-1]);
    else cup.opp.push(take(n>1?0.2+0.75*i/(n-1):0.6));
  }
  cup.st="in"; cup.leg=null;
}
/**
 * 次の試合。kind: league / cup / friendly
 *   ko  … 同点なら PK 戦で決める / agg … 2試合制の第1試合のスコア [自分, 相手]
 *   canDecline … カップを棄権してフレンドリーにできる
 */
function nextFixture(S,W){
  if(S.termOver)return null;
  const [cid,ix]=SCHED[S.slot], base={ slot:S.slot, no:S.played+1 };
  if(cid==="LG"){
    const pair=leagueRound(S.league.clubs,ix).find(p=>p[0]==="me"||p[1]==="me");
    return Object.assign(base,{ kind:"league", comp:"LG", label:"第"+(ix+1)+"節",
      opp:pair[0]==="me"?pair[1]:pair[0], home:pair[0]==="me", ko:false, agg:null, canDecline:false });
  }
  const cup=S.cups[cid], comp=COMPS[cid];
  if(cup.st==="wait"&&ix===0&&entryOk(S,cid))drawCup(S,W,cid);
  if(cup.st==="in"){
    const type=comp.stages[ix][0];
    return Object.assign(base,{ kind:"cup", comp:cid, label:comp.stages[ix][1], opp:cup.opp[ix],
      home:type!=="leg2", ko:type==="ko"||type==="leg2", agg:type==="leg2"?cup.leg:null,
      type, canDecline:true });
  }
  // 出られない・負けた・棄権した枠はフレンドリーマッチ
  const rng=mulberry32((S.seed^hashStr("fr:"+S.term+":"+S.played))>>>0);
  const lg=S.league.clubs.filter(c=>c!=="me"), want=clamp(S.grade+Math.floor(rng()*3),1,5);
  const cand=W.clubs.filter(c=>tierOf(c)===want);
  const opp=(cand.length?cand:lg)[Math.floor(rng()*(cand.length||lg.length))];
  return Object.assign(base,{ kind:"friendly", comp:"FR", label:"", opp, home:true, ko:false, agg:null,
    canDecline:false, missed:cid, why:cup.st==="wait"?"条件を満たしていない":cup.st==="out"?"敗退":cup.st==="quit"?"棄権":"終了" });
}
/** カップを棄権する。その大会の残りの枠はフレンドリーマッチになる */
function declineCup(S,id){ if(S.cups[id]&&S.cups[id].st==="in")S.cups[id].st="quit"; }

/** 自分のクラブの定義。前の試合の最後の配置と KP を引き継ぐ(カードは盤面に置いたまま) */
function playerDef(S){
  // 登録選手(S.sq)から作る。先頭11枚が先発で、並びは陣形の枠の順(→pool.js)
  const def=makeTeamDef("azr",false), f=FORMS[S.form]||FORMS[TEAMS.azr.form], sq=S.sq||startSquad();
  def.xi=sq.slice(0,11).map((id,i)=>({ card:CARDS[id], h:f[i][0], x:f[i][1] }));
  def.bench=sq.slice(11).map(id=>CARDS[id]);
  def.xi.forEach(s=>{ const l=S.layout[s.card.id]; if(l){ s.h=l[0]; s.x=l[1]; } });
  // 育成を反映する: 能力・モチベーション・特殊能力はカードに、連携・グラフ・セットプレイはクラブに
  def.xi.forEach(s=>{ s.card=growCard(S,s.card); });
  def.bench=def.bench.map(c=>growCard(S,c));
  def.links=growLinks(S); def.graph=Object.assign({},S.g.graph); def.setplay=S.g.set;
  if(S.kp&&def.xi.some(s=>s.card.id===S.kp))def.kp=S.kp;
  def.injK=spBoost(S,"injury")??1;           // スポンサーの効果(医療): ケガの起きやすさ
  if(S.club){ def.name=S.club.name; def.short=S.club.short; def.color=S.club.color; }   // 監督契約で決めたクラブ
  def.mab=mabOf(S);                              // 監督能力(→docs/10 §10.2 C)
  return def;
}
/** 試合を作る材料。自分は常にホーム側(右へ攻める)に置く */
function fixtureMatch(S,fx){
  return { home:playerDef(S), away:makeTeamDef(fx.opp,true),
    seed:(S.seed^hashStr("m:"+S.term+":"+S.played))>>>0,
    opts:{ ko:fx.ko, agg:fx.agg } };
}

/* ---------- 結果の反映 ---------- */

/**
 * 試合の結果を反映して、次の枠へ進む。
 *   res: { hg, ag, pso:null|[h,a], layout:{id:[h,x]}, kp, played:[id], onPitch:[id],
 *          starters:[id], kpCh:KPを替えた回数, subs:交代の数 }
 * 返り値は「何が起きたか」の行(画面に出す)。
 */
function applyResult(S,W,fx,res){
  const C=TUNING.club, out=[], hg=res.hg, ag=res.ag;
  const win=hg>ag||(hg===ag&&res.pso&&res.pso[0]>res.pso[1]);
  S.rec.gf+=hg; S.rec.ga+=ag;
  if(hg>ag)S.rec.w++; else if(hg<ag)S.rec.l++; else S.rec.d++;
  if(res.layout)S.layout=res.layout;
  if(res.kp)S.kp=res.kp;
  const grade=COMPS[fx.comp].grade, prize=x=>{ S.money+=x; return x; };
  let got=0;
  if(fx.kind==="league"){
    const ix=SCHED[fx.slot][1], L=S.league;
    for(const [h,a] of leagueRound(L.clubs,ix)){
      if(h==="me")addTable(L.table,h,a,hg,ag);
      else if(a==="me")addTable(L.table,h,a,ag,hg);
      else{
        const r=simCpu(h,a,(S.seed^hashStr("lg:"+S.term+":"+S.cyc+":"+ix+":"+h))>>>0);
        addTable(L.table,h,a,r[0],r[1]);
      }
    }
    L.done=ix+1;
    if(hg>ag)got+=prize(C.prize.league);
    const rank=sortTable(L.table).indexOf("me")+1;
    out.push("リーグ "+rank+"位("+L.table.me.pts+"点)");
    if(L.done===14){
      got+=prize(C.prize.leagueRank[rank-1]||0);
      if(rank===1){ S.titles.push({ term:S.term, cyc:S.cyc, comp:"LG" }); out.push("🏆 レギュラーリーグ 優勝"); }
    }
  }else if(fx.kind==="cup"){
    const cup=S.cups[fx.comp], comp=COMPS[fx.comp], ix=SCHED[fx.slot][1], last=ix===comp.stages.length-1;
    const type=fx.type, pw=C.prize.cup[grade];
    let through=false;
    if(type==="grp"){
      const g=cup.grp, me=fx.opp, others=g.clubs.filter(c=>c!==me);
      addTable(g.table,"me",me,hg,ag);
      const r=simCpu(others[0],others[1],(S.seed^hashStr("grp:"+fx.comp+":"+S.term+":"+S.cyc+":"+ix))>>>0);
      addTable(g.table,others[0],others[1],r[0],r[1]);
      if(hg>ag)got+=prize(pw);
      const end=comp.stages[ix+1][0]!=="grp";
      if(end){
        const rank=sortTable(g.table).indexOf("me")+1;
        through=rank<=comp.adv;
        out.push(comp.name+" グループ "+rank+"位 → "+(through?"突破":"敗退"));
        if(!through)cup.st="out";
      }else through=true;
    }else if(type==="leg1"){
      cup.leg=[hg,ag]; through=true;
      if(hg>ag)got+=prize(pw);
      out.push(comp.name+" "+fx.label+" 終了(第2試合へ)");
    }else{
      const th=hg+(fx.agg?fx.agg[0]:0), ta=ag+(fx.agg?fx.agg[1]:0);
      through=th>ta||(th===ta&&!!res.pso&&res.pso[0]>res.pso[1]);
      cup.leg=null;
      if(through)got+=prize(pw);
      if(fx.agg)out.push("2試合合計 "+th+" - "+ta+(res.pso?"(PK "+res.pso[0]+"-"+res.pso[1]+")":""));
      if(!through){ cup.st="out"; out.push(comp.name+" 敗退"); }
      else if(!last)out.push(comp.name+" "+fx.label+" 突破");
    }
    if(through&&last){
      cup.st="won"; got+=prize(pw*C.prize.titleK);
      S.titles.push({ term:S.term, cyc:S.cyc, comp:fx.comp });
      out.push("🏆 "+comp.name+" 優勝");
    }
  }else if(win||hg>ag)got+=prize(C.prize.friendly);
  if(got)out.push("賞金 +"+got.toFixed(1)+"億");
  // 育成(→grow.js)。フレンドリーマッチの勝利で、覚醒・★5・黄金線が開花する
  const gr={ played:res.played, onPitch:res.onPitch||res.played, win:hg>ag, lose:hg<ag, inj:res.inj||[] };
  const gl=res.played?afterMatchGrowth(S,fx,gr):[];
  gl.forEach(x=>out.push(x));
  // 経営(→docs/05 §5.13): 入場料・ファン・スタジアム改修の知らせ
  // (昇格のファンと改修の知らせは、1周の終わり endCycle で足す)
  if(S.biz){
    const titles=out.filter(x=>/^🏆 /.test(x)).length;
    bizAfterMatch(S,fx,{ win:hg>ag||win, lose:hg<ag&&!win, titles, prize:got },out);
    S.biz.earn+=spAfterMatch(S,fx,{ hg, ag, winPso:win&&hg===ag, titles },out);
  }
  // 秘書の親密度(→docs/08 §8.7): 試合のたびと大会の優勝で上がる。ときどき監督室で短い会話が起きる
  if(S.sec){
    const n=out.filter(x=>/^🏆 /.test(x)).length, up=secGain(S,TUNING.sec.match+n*TUNING.sec.title);
    if(up)out.push(up);
    if(S.sec.ev==null&&mulberry32((S.seed^hashStr("sev:"+S.term+":"+S.played))>>>0)()<TUNING.sec.eventP)
      S.sec.ev=hashStr("sevk:"+S.term+":"+S.played)%SEC_EVENTS.length;
  }
  // 監督能力の熟練度: セットして試合をした能力に +1(ランクが上がったら知らせる)
  if(S.mab)for(const k of S.mab.set){ const r0=mabRank(S,k); S.mab.xp[k]=(S.mab.xp[k]||0)+1; const r1=mabRank(S,k);
    if(r1>r0)out.push("🎖 監督能力「"+MAB.find(x=>x.id===k).name+"」がランク "+MAB_RANK[r1]+" に"); }
  // カードの払い出し(→pool.js)。試合のたびに1枚
  const card=payout(S);
  out.unshift("カード: "+RARITY[CARDS[card.id].rar].name+" "+nameOf(CARDS[card.id])+(card.isNew?"(NEW)":""));

  // 称号の条件に使う記録(→term.js)
  const ts=S.ts;
  ts.kpCh+=res.kpCh||0; ts.subs+=res.subs||0;
  (res.starters||[]).forEach(id=>{ if(!ts.used.includes(id))ts.used.push(id); });
  if(win&&tierOf(fx.opp)>=5)ts.topW++;
  if(res.pso){ if(res.pso[0]>res.pso[1])ts.psoW++; else ts.psoL++; }
  // gl … 育成の行(ロッカールームで出す) / news … 誰に何が起きたか(→grow.js の newsOf)
  S.last={ no:fx.no, comp:fx.comp, label:fx.label, opp:fx.opp, hg, ag, pso:res.pso||null, lines:out,
    gl, news:gr.news||[], card:card.id, cardNew:card.isNew };
  S.history.push([fx.comp,fx.opp,hg,ag]);
  if(S.history.length>TUNING.club.historyMax)S.history.shift();
  S.played++; S.slot++;
  if(S.slot>=SCHED.length)endCycle(S,W,out);
  if(S.played>=C.termLen&&!S.termOver){ S.termOver=true; endTerm(S); }
  return out;
}
/** 1周(43試合)の終わり。前の周の成績を残し、リーグと大会を作り直す */
function endCycle(S,W,out){
  const rank=sortTable(S.league.table).indexOf("me")+1;
  const won=CUP_IDS.filter(id=>S.cups[id].st==="won");
  if(rank===1)won.push("LG");
  S.prev={ rank, won };
  if(rank<=TUNING.club.promoteRank&&S.grade<TUNING.club.leagueTiers.length){
    S.grade++; out.push("リーグの格が上がった(格 "+S.grade+")");
    if(S.biz){ S.biz.fans+=TUNING.biz.fansPromo; const nx=TUNING.biz.stad[S.biz.stad], disc=nx?Math.round(nx.cost*TUNING.biz.chanceK):0;
      if(!S.biz.offer&&nx&&S.money>=disc)S.biz.offer={ lv:S.biz.stad+1, cost:disc, why:"昇格" }; }
  }
  S.cyc++; S.slot=0;
  S.league=newLeague(S,W); S.cups=newCups();
  if(S.biz&&S.played+1<TUNING.club.termLen)spRenew(S);   // リーグの1周ごとにスポンサーを選び直す(任期の最後は除く)
}
/** 任期が終わったあと、次の任期を始める(称号・年俸・引き継ぎは 3c で足す) */
function newTerm(S,W){
  S.term++; S.played=0; S.slot=0; S.cyc=1; S.prev=null; S.termOver=false;
  S.grade=1;                                  // 育成が初めに戻るので、リーグの格も戻す(称号による上積みは 3c)
  S.rec={ w:0, d:0, l:0, gf:0, ga:0 }; S.last=null; S.layout={};
  S.g=newGrowth(S.sq);                        // 育成は任期ごと(絆の深い選手は startNextTerm が引き継ぐ)
  // 本家と同じく、任期が終わると別のクラブへ移る(→docs/08 §8.12)。クラブの持ち物(資金・ファン・スタジアム・施設)は元に戻す。
  // 残るのは監督の情報(称号・年俸・監督ランク・歴代)・ついてくる選手・カード・秘書との親密度
  S.money=0; S.ts=newTermStats(); S.money0=0;
  S.league=newLeague(S,W); S.cups=newCups();
  if(S.sec){ S.sec.chosen=false; S.sec.ev=null; }   // 任期の始めに秘書を選び直す(親密度は残る)
  if(S.biz){ S.biz=newBiz(); spRenew(S); }      // クラブの持ち物は元に戻す。スポンサーは選び直す
  S.tsetChosen=false;                           // 任期の始めに称号をセットし直す(→docs/10 §10.2 B)
  S.club=null;                                  // 新しい任期は新しいクラブ。監督契約で決め直す(→docs/10 §10.2 A)
}

/* ---------- 保存 ---------- */

const SAVE_KEY="wcc_f.save.v1";
const SAVE_BAD_KEY="wcc_f.save.bad";        // 読めなかったセーブの退避先(上書きで失わないため)
/** 保存の中身をそのまま返す(読めるかどうかは見ない) */
function rawSave(store){ try{ return store.getItem(SAVE_KEY); }catch(e){ return null; } }
/** 読めなかったセーブを退避する。退避できたら true */
function backupSave(store,raw){
  // 前に退避したものを押し出して、新しいものを先頭に置く(最大3件。SAVE_BAD_KEY が最新)
  try{
    const b1=store.getItem(SAVE_BAD_KEY+".1");
    if(b1!=null)store.setItem(SAVE_BAD_KEY+".2",b1);
    const b0=store.getItem(SAVE_BAD_KEY);
    if(b0!=null&&b0!==raw)store.setItem(SAVE_BAD_KEY+".1",b0);
    store.setItem(SAVE_BAD_KEY,raw); return store.getItem(SAVE_BAD_KEY)===raw;
  }catch(e){ return false; }
}
/** 端末に書かない保存先(保存できない環境・退避できなかったとき) */
function memStore(){ return { m:{}, setItem(k,v){ this.m[k]=v; }, getItem(k){ return k in this.m?this.m[k]:null; }, removeItem(k){ delete this.m[k]; } }; }
/** 保存する。直前のセーブは1つ前の世代(SAVE_KEY.prev)に回してから書く */
function saveCareer(store,S){
  try{
    const old=store.getItem(SAVE_KEY);
    if(old)store.setItem(SAVE_KEY+".prev",old);
    store.setItem(SAVE_KEY,JSON.stringify(S)); return true;
  }catch(e){ return false; }
}
function parseSave(t){ try{ const S=t?JSON.parse(t):null; return S&&S.ver===1?migrate(S):null; }catch(e){ return null; } }
/** 読む。読めなければ1つ前の世代から(S.fromPrev が付く) */
function loadCareer(store){
  let t=null, p=null;
  try{ t=store.getItem(SAVE_KEY); p=store.getItem(SAVE_KEY+".prev"); }catch(e){ return null; }
  const S=parseSave(t);
  if(S||!t)return S;
  const P=parseSave(p);
  if(P)P.fromPrev=true;
  return P;
}
/**
 * 古いセーブに、あとから増えた項目を補う。**項目を足したら、ここにも足す**。
 *   g … 育成(3b で追加)。無ければ任期の途中でも育成なしの状態から始める
 */
function migrate(S){
  if(!S.sq)S.sq=startSquad();
  if(!S.coll)S.coll=newCollection();
  // カードの一覧が変わって存在しなくなったカードを外す(登録の空きは初めの16枚で埋める)
  for(const id of Object.keys(S.coll))if(!CARDS[id])delete S.coll[id];
  const spare=startSquad().filter(id=>!S.sq.includes(id));
  S.sq=S.sq.map(id=>CARDS[id]?id:spare.shift());
  for(const id of Object.keys(S.layout||{}))if(!CARDS[id])delete S.layout[id];
  if(S.kp&&!CARDS[S.kp])S.kp=null;
  if(S.last&&S.last.card&&!CARDS[S.last.card])S.last.card=null;
  S.g=S.g?migrateGrowth(S.g,S.sq):newGrowth(S.sq);
  if(!S.ts)S.ts=newTermStats();
  if(S.ts.awake===undefined){ S.ts.awake=null; S.ts.gold=null; S.ts.pow0=null; }   // 途中の任期は前の数え方のまま
  if(S.money0==null)S.money0=0;
  if(!S.career)S.career=[];
  if(S.salary==null)S.salary=0;
  if(S.fac==null)S.fac=1;
  if(S.tend===undefined)S.tend=null;
  if(S.termOver&&!S.tend)endTerm(S);
  if(!S.layout)S.layout={};
  if(!FORMS[S.form])S.form=TEAMS.azr.form;
  if(!S.history)S.history=[];
  if(!S.sec){ S.sec=newSec(); S.sec.chosen=S.played>0; }   // 途中のセーブは今の秘書のまま
  if(S.tset===undefined){ S.tset=null; S.tsetChosen=true; }
  if(!S.mab)S.mab={ set:[], xp:{} };
  if(!S.ht)S.ht={ cnt:{}, set:["b1","b2","b3"] };
  if(S.mgr===undefined)S.mgr=null;                 // 監督ライセンスは次に開いたときに登録する
  if(S.club===undefined)S.club=S.played>0||S.term>1?defaultClub():null;   // 途中の任期は今までのクラブのまま
  if(!S.biz){ S.biz=newBiz(); S.biz.earn=Math.max(0,S.money-(S.money0||0)); }   // それまでの賞金は稼いだ額に数える
  if(!S.biz.boostRank||(S.biz.sp&&!S.biz.sp.ind)){ S.biz.boost={}; S.biz.boostRank={}; S.biz.sp=null; S.biz.offers=null; }   // 前の形のスポンサーは選び直す
  if(!S.biz.sp&&!S.biz.offers&&!S.termOver)spRenew(S);
  return S;
}
function clearCareer(store){ try{ store.removeItem(SAVE_KEY); }catch(e){} }

/* ---------- クラブの経営(→docs/08 §8.9・docs/05 §5.13) ----------
 * クラブ資金(S.money)には 賞金・入場料(ホームの試合)・スポンサー収入(2回目)が入り、施設とスタジアム改修に使う。
 * 年俸は任期中に**稼いだ額**(S.biz.earn)で決まる(使っても減らない)。
 * ファン数がクラブの格: 勝利・優勝・昇格・スタジアムで増え、負けで少し減る。観客の数を決める。
 * S.biz = { fans, stad:スタジアムの段(1〜), fac:{ train, tact, lounge, med }(各 0〜3), earn, offer:改修の知らせ | null, cool:知らせを出さない残り試合 } */
const FAC_KEYS=["train","tact","lounge","med"];
const FAC_INFO={
  train: { name:"練習場",     eff:"個人能力が育ちやすい" },
  tact:  { name:"戦術室",     eff:"特殊能力が育ちやすい" },
  lounge:{ name:"ラウンジ",   eff:"連携がつながりやすい" },
  med:   { name:"メディカル", eff:"疲労が抜けやすく、ケガが治りやすい" }
};
function newBiz(){ return { fans:TUNING.biz.fans0, stad:1, fac:{ train:0, tact:0, lounge:0, med:0 }, earn:0, offer:null, cool:0, att:0,
  sp:null, offers:null, boost:{}, boostRank:{} }; }
const stadOf=S=>TUNING.biz.stad[(S.biz?S.biz.stad:1)-1];
/** 施設の効き目(育成に掛ける倍率)。建てていなければ 1 */
const facK=(S,k)=>S&&S.biz?TUNING.biz.facK[S.biz.fac[k]||0]:1;
const medFat=S=>S&&S.biz?TUNING.biz.medFat[S.biz.fac.med||0]:1;
const medHeal=S=>S&&S.biz?TUNING.biz.medHeal[S.biz.fac.med||0]:0;
const facCost=(S,k)=>{ const lv=S.biz.fac[k]||0; return lv<TUNING.biz.facCost.length?TUNING.biz.facCost[lv]:null; };
/** 施設を建てる・上げる。資金が足りなければ false */
function buildFac(S,k){
  const c=facCost(S,k);
  if(c==null||S.money<c)return false;
  S.money-=c; S.biz.fac[k]++;
  return true;
}
/** 観客の数。ホームの試合だけ。収容人数が上限 */
function attendanceOf(S,fx,rng){
  const B=TUNING.biz, cap=stadOf(S).cap;
  const big=fx.kind==="friendly"?B.friendlyK:fx.kind==="cup"?(fx.ko&&/決勝/.test(fx.label||"")?B.finalK:B.cupK):1;
  return Math.min(cap,Math.round(S.biz.fans*B.fill*big*(0.9+0.2*rng())/100)*100);
}
/**
 * 試合のあとの経営。入場料・ファン数・改修の知らせ(資金が費用に届いたとき。優勝・昇格のときは割り引いた費用に届けば)。行(画面に出す)を out に足す。
 * res: { win, lose, titles:優勝した数, prize:この試合の賞金 }
 */
function bizAfterMatch(S,fx,res,out){
  const B=TUNING.biz, Z=S.biz, rng=mulberry32((S.seed^hashStr("biz:"+S.term+":"+S.played))>>>0);
  let gate=0;
  if(fx.home){
    Z.att=attendanceOf(S,fx,rng); gate=Math.round(Z.att*B.price*10)/10;
    S.money+=gate;
    out.push("観客 "+(Z.att/10000).toFixed(1)+"万人(入場料 +"+gate.toFixed(1)+"億)");
  }else Z.att=0;
  Z.earn+=(res.prize||0)+gate;
  // ファン: 勝てば増え(スタジアムが大きいほど多く)、負ければ少し減る。優勝・昇格で大きく増える
  const f0=Z.fans, sk=1+B.fansStadK*(Z.stad-1);
  Z.fans+=res.win?B.fansWin*sk:res.lose?B.fansLose:B.fansDraw*sk;
  Z.fans+=(res.titles||0)*B.fansTitle;
  Z.fans=Math.max(B.fansMin,Math.round(Z.fans));
  if(Math.floor(Z.fans/10000)>Math.floor(f0/10000))out.push("ファンが "+Math.floor(Z.fans/10000)+"万人を超えた");
  // スタジアム改修の知らせ: 資金が費用に届いたとき、または優勝・昇格のとき(少し安く)
  if(Z.cool>0)Z.cool--;
  const nx=B.stad[Z.stad];
  if(nx&&!Z.offer){
    const disc=Math.round(nx.cost*B.chanceK);
    if((res.titles||0)>0&&S.money>=disc)Z.offer={ lv:Z.stad+1, cost:disc, why:"優勝" };
    else if(Z.cool<=0&&S.money>=nx.cost)Z.offer={ lv:Z.stad+1, cost:nx.cost, why:"資金" };
  }
}
/** 改修の知らせに答える。yes なら払って改修、no なら見送り(しばらく知らせない) */
function answerStadium(S,yes){
  const Z=S.biz, o=Z.offer; if(!o)return null;
  Z.offer=null;
  if(!yes){ Z.cool=TUNING.biz.cool; return { ok:false }; }
  if(S.money<o.cost){ Z.cool=TUNING.biz.cool; return { ok:false, short:true }; }
  S.money-=o.cost; Z.stad=o.lv; Z.fans+=TUNING.biz.fansStad;
  return { ok:true, lv:o.lv };
}

/* ---------- スポンサーとミッション(→docs/08 §8.9・docs/05 §5.14) ----------
 * **マスタ**: 業種(11)× ランク(☆1〜5)。業種が報酬の効果の系統を、ランクが 収入・ミッションの難しさ・効果の大きさ・続く試合数 を決める。
 * 任期の始めとリーグの1周の終わりに、3社の候補(すべて架空の企業)から選ぶ。契約はその次の選び直しまで。
 * 報酬は持ち物にしない。ミッションを達成すると、その業種・ランクの報酬の名前で効果が始まり、決まった試合数だけ続く(重なると長い方)。
 * S.biz.sp = { ind:業種, rank:1〜5, name, pay, ms:[ミッション], at } | null、S.biz.offers = [候補] | null、S.biz.boost = { 効果: 残り試合 } */
const SP_IND=[
  { id:"kaden",  name:"家電",       eff:"care",     effName:"ケアの効果アップ",               dur:[3,7], items:["家電製品","最新家電","高級家電","全自動掃除機","IoT家電"],
    pre:["ミナト","ヒカリ","アオバ","シンセイ","ユメノ"], suf:["電機","家電","エレクトリック"] },
  { id:"car",    name:"自動車",     eff:"careSec",  effName:"ケアで秘書が手伝う",             dur:[3,7], items:["軽自動車","自動車","高級車","EV車","AI搭載車"],
    pre:["カゼミチ","ハヤブサ","ミライ","アークス","ソウマ"], suf:["自動車","モーターズ","オート"] },
  { id:"food",   name:"食品",       eff:"indExp",   effName:"個人練習の経験アップ",           dur:[3,7], items:["健康食品","サプリメント","プロテイン","最新アスリートフード","専属カリスマ栄養士"],
    pre:["ミノリ","アサヒノ","ユタカ","ハルカ","ミドリ"], suf:["食品","フーズ","ニュートリション"] },
  { id:"sports", name:"スポーツ用品", eff:"indSec", effName:"個人練習で秘書が手伝う",         dur:[3,7], items:["ウォーターボトル","サッカーウェア","サッカーボール","高級サッカーウェア","最高級サッカースパイク"],
    pre:["ストライダ","ハヤテ","ジンバ","アスリオ","トップス"], suf:["スポーツ","アスレチック"] },
  { id:"it",     name:"IT機器",     eff:"loungeOk", effName:"ラウンジが成功しやすい",         dur:[3,7], items:["最新モバイル","高性能PC","次世代ツール","スマートウォッチ","AIスピーカー"],
    pre:["ネクサ","ルミナ","カナタ","ソラ","ゼニス"], suf:["テック","デバイス","システムズ"] },
  { id:"game",   name:"ゲーム",     eff:"loungeExp",effName:"ラウンジの連携の経験アップ",     dur:[3,7], items:["人気ゲーム機","最新ゲーム機","次世代ゲーム機","VRヘッドセット","ARゴーグル"],
    pre:["ピクセル","スターリ","ノヴァ","ワンダ","ミラージュ"], suf:["ゲームス","エンタテインメント"] },
  { id:"travel", name:"旅行・航空", eff:"loungeSec",effName:"ラウンジの失敗に秘書のフォロー", dur:[3,7], items:["往復航空券","国内旅行","海外旅行","世界一周旅行","宇宙旅行"],
    pre:["ツバサ","アオゾラ","セレスタ","オリオン","カモメ"], suf:["トラベル","エアラインズ","ツーリスト"] },
  { id:"drink",  name:"飲料",       eff:"noFat",    effName:"試合の疲労がたまりにくい",       dur:[2,6], items:["スポーツドリンク","エナジードリンク","栄養ドリンク","フレッシュジュース","最高級ミネラルウォーター"],
    pre:["シズク","イズミ","ミナモ","サワ","アクア"], suf:["飲料","ビバレッジ","ウォーター"] },
  { id:"medic",  name:"医療",       eff:"injury",   effName:"ケガに強くなる",                 dur:[2,6], items:["テーピングセット","リハビリグッズ","専属フィジオセラピスト","スポーツ人間ドック","専属スポーツドクター"],
    pre:["ケンセイ","ヤスラギ","ミマモリ","ユウキ","サクラ"], suf:["メディカル","製薬","ヘルスケア"] },
  { id:"finance",name:"金融",       eff:"bench",    effName:"控えの不満がたまりにくい",       dur:[3,7], items:["宝くじ","有価証券","ゴールドバー","プラチナバー","仮想通貨"],
    pre:["ヤマト","コガネ","アストラ","グランデ","ホクト"], suf:["銀行","証券","フィナンシャル"] },
  { id:"media",  name:"放送・芸能", eff:"keepForm", effName:"好調を維持しやすい",             dur:[2,5], items:["ラジオ番組出演オファー","テレビ番組出演オファー","CM出演オファー","ドラマ出演オファー","映画出演オファー"],
    pre:["ステラ","ヒノデ","アカツキ","ミライ","ルクス"], suf:["放送","エンタープライズ","プロダクション"] }
];
const spIndOf=id=>SP_IND.find(x=>x.id===id)||SP_IND[0];
const spDur=(ind,rank)=>Math.round(ind.dur[0]+(ind.dur[1]-ind.dur[0])*(rank-1)/4);
const spItem=(ind,rank)=>ind.items[rank-1];
/** 効果の大きさ(☆1〜5)。effTxt は画面の説明 */
const spEffK=(eff,rank)=>TUNING.biz.sp.eff[eff][rank-1];
function spEffTxt(eff,rank){
  const v=spEffK(eff,rank), pc=x=>Math.round(x*100)+"%";
  return eff==="care"?"ケアで やる気がもう1段上がる率 "+pc(v):eff==="careSec"?"ケアのあと秘書がもう1人ケアする率 "+pc(v)
    :eff==="indExp"?"個人練習の経験 ×"+v:eff==="indSec"?"個人練習のあと秘書がもう1人に経験の半分を入れる率 "+pc(v)
    :eff==="loungeOk"?"ラウンジの大成功 +"+pc(v):eff==="loungeExp"?"ラウンジの連携の経験 ×"+v:eff==="loungeSec"?"ラウンジの失敗に秘書のフォロー +"+pc(v)
    :eff==="noFat"?"試合の疲労 ×"+v:eff==="injury"?"ケガの起きやすさ ×"+v:eff==="bench"?"控えのやる気が下がる率 ×"+v:"負けてやる気が下がる率 ×"+v;
}
/** いま効いている効果の大きさ(効いていなければ null) */
const spBoost=(S,eff)=>S&&S.biz&&S.biz.boost&&S.biz.boost[eff]>0?spEffK(eff,S.biz.boostRank[eff]||1):null;
/** その時点で届くランク(1〜5)。ファン数と実績(リーグの格・今の任期の優勝) */
function spRankMax(S){
  const B=TUNING.biz.sp, Z=S.biz, t=S.titles.filter(x=>x.term===S.term).length;
  let r=1;
  for(let i=0;i<B.rankFans.length;i++)if(Z.fans>=B.rankFans[i]||(Z.fans>=B.rankFans[i]*0.7&&(S.grade>=B.rankGrade[i]||t>=B.rankTitles[i])))r=i+2;
  return r;
}
/** ミッションを1つ作る。ランクが上がるほど難しい */
function mkMission(rng,rank){
  const k=rank-1, r=rng();
  const m=r<0.3?{ t:"win", n:[3,4,5,6,7][k], m:[8,8,9,10,10][k] }
    :r<0.5?{ t:"cs", n:[1,2,2,3,4][k] }
    :r<0.65?{ t:"goals", n:[10,12,15,18,22][k], m:10 }
    :r<0.8?{ t:"unb", n:[3,4,5,6,8][k] }
    :r<0.9?{ t:"att", n:[6000,10000,18000,30000,45000][k] }
    :{ t:"title" };
  m.p=0; m.st=0; m.done=false; m.fail=false;
  return m;
}
const missionTxt=m=>m.t==="win"?m.m+"試合以内に"+m.n+"勝":m.t==="cs"?"無失点の試合を"+m.n+"回":m.t==="goals"?m.m+"試合以内に"+m.n+"得点"
  :m.t==="unb"?m.n+"試合負けなし":m.t==="att"?"ホームの観客 "+(m.n/10000).toFixed(1)+"万人":"大会で優勝";
const missionProg=m=>m.done?"達成":m.fail?"期限切れ":m.t==="win"||m.t==="goals"?m.p+"/"+m.n+"(残り "+Math.max(0,m.m-m.st)+"試合)"
  :m.t==="att"||m.t==="title"?"まだ":m.p+"/"+m.n;
/** 報酬の説明(例: 最高級ミネラルウォーター — 試合の疲労 ×0.35 を6試合) */
const spRewardTxt=sp=>{ const ind=spIndOf(sp.ind); return spItem(ind,sp.rank)+" — "+spEffTxt(ind.eff,sp.rank)+" を"+spDur(ind,sp.rank)+"試合"; };
/** 3社の候補を作る。業種は重ならない。1社は届くいちばん上のランク、残りはその1つ下まで */
function spOffers(S){
  const top=spRankMax(S), rng=mulberry32((S.seed^hashStr("spo:"+S.term+":"+S.cyc+":"+S.played))>>>0), out=[], used=new Set();
  for(let i=0;i<3;i++){
    let ind; do{ ind=SP_IND[Math.floor(rng()*SP_IND.length)]; }while(used.has(ind.id)); used.add(ind.id);
    const rank=Math.max(1,i===0?top:top-(rng()<0.5?1:0));
    const name=ind.pre[Math.floor(rng()*ind.pre.length)]+ind.suf[Math.floor(rng()*ind.suf.length)];
    const pay=Math.round(TUNING.biz.sp.pay[rank-1]*(0.9+0.2*rng())*100)/100;
    const n=rank>=4?3:2, ms=[]; for(let j=0;j<n;j++)ms.push(mkMission(rng,rank));
    out.push({ ind:ind.id, rank, name, pay, ms });
  }
  return out;
}
/** 契約する(i = 候補の番号)。keep なら今の社と、ミッションを新しくして続ける */
function signSponsor(S,i,keep){
  const Z=S.biz;
  if(keep&&Z.sp){ const rng=mulberry32((S.seed^hashStr("spk:"+S.term+":"+S.played))>>>0);
    Z.sp.ms=Z.sp.ms.map(()=>mkMission(rng,Z.sp.rank)); Z.sp.at=S.played; Z.offers=null; return true; }
  const o=Z.offers&&Z.offers[i]; if(!o)return false;
  Z.sp=Object.assign({},o,{ at:S.played }); Z.offers=null;
  return true;
}
/** 契約の区切り(任期の始め・リーグの1周の終わり)。終わっていないミッションは期限切れにして、候補を出す */
function spRenew(S){
  const Z=S.biz;
  if(Z.sp)Z.sp.ms.forEach(m=>{ if(!m.done)m.fail=true; });
  Z.offers=spOffers(S);
}
/** 試合のあと: スポンサー収入・ミッションの進み・報酬の効果・効果の残り。行を out に足す。収入を返す */
function spAfterMatch(S,fx,r,out){
  const Z=S.biz, sp=Z.sp;
  for(const k in Z.boost)if(Z.boost[k]>0)Z.boost[k]--;
  if(!sp)return 0;
  const pay=sp.pay; S.money+=pay;
  out.push("スポンサー収入 +"+pay.toFixed(2)+"億("+sp.name+")");
  const won=r.hg>r.ag||r.winPso, lost=r.hg<r.ag&&!r.winPso, ind=spIndOf(sp.ind);
  for(const m of sp.ms){
    if(m.done||m.fail)continue;
    m.st++;
    if(m.t==="win"&&won)m.p++;
    else if(m.t==="cs"&&r.ag===0)m.p++;
    else if(m.t==="goals")m.p+=r.hg;
    else if(m.t==="unb")m.p=lost?0:m.p+1;
    const ok=m.t==="att"?Z.att>=m.n:m.t==="title"?r.titles>0:m.p>=m.n;
    if(ok){
      m.done=true;
      const d=spDur(ind,sp.rank);
      // 同じ効果が重なったら、残りは長い方・大きさは高い☆の方
      const on=(Z.boost[ind.eff]||0)>0;
      Z.boostRank[ind.eff]=Math.max(on?(Z.boostRank[ind.eff]||1):1,sp.rank); Z.boost[ind.eff]=Math.max(Z.boost[ind.eff]||0,d);
      out.push("📣 ミッション達成「"+missionTxt(m)+"」→ "+spItem(ind,sp.rank)+"("+spEffTxt(ind.eff,sp.rank)+"、"+d+"試合)");
    }else if((m.t==="win"||m.t==="goals")&&m.st>=m.m){ m.fail=true; out.push("ミッション「"+missionTxt(m)+"」は期限切れ"); }
  }
  return pay;
}

/* ---------- 監督ライセンスと監督契約(→docs/10 §10.2 A) ----------
 * 監督ライセンス S.mgr = { name, birth:"YYYY-MM-DD" | null, ani:動物 | null }。初回だけ登録し、**あとから変えられない**(本家と同じ)
 * 監督契約 S.club = { name, short, town, color, emblem:{ shape, field, crest, orn, lay, text, home, away } | null }。初回と新しい任期の始めに決める */
const TOWNS=["ミナト市","ホクト市","アオバ市","カザミ市","セト市","ソラノ市","アカネ市","シラユキ市","ハヤテ市","ミドリ市","コガネ市","ツバサ市"];
/** 監督契約の前の、今までのクラブ(古いセーブ・途中の任期) */
function defaultClub(){ return { name:"アズーロFC", short:"AZR", town:TOWNS[0], color:TEAMS.azr.color, emblem:null }; }
/** 監督ライセンスを登録する。名前は必須、生年月日は任意。登録したら変えられない */
function registerManager(S,name,birth){
  const nm=String(name||"").trim().slice(0,12);
  if(!nm||S.mgr)return false;
  let ani=null;
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(birth||"");
  if(m)ani=aniOfDate(+m[1],+m[2],+m[3]);
  S.mgr={ name:nm, birth:m?birth:null, ani };
  return true;
}
/** 監督契約を結ぶ。クラブ名は必須。略称は英字3字(無ければクラブ名から作る) */
function signClub(S,o){
  const name=String(o.name||"").trim().slice(0,10);
  if(!name)return false;
  const short=(String(o.short||"").toUpperCase().replace(/[^A-Z]/g,"")||clubAbbr(name)).slice(0,3).padEnd(3,"X");
  S.club={ name, short, town:TOWNS.includes(o.town)?o.town:TOWNS[0], color:/^#[0-9a-fA-F]{6}$/.test(o.color||"")?o.color:TEAMS.azr.color,
    emblem:o.emblem||null };
  return true;
}
/** 自分のクラブ(試合以外の画面で使う)。監督契約の前はアズーロFC */
const myTeam=S=>Object.assign({},TEAMS.azr,S&&S.club?{ name:S.club.name, short:S.club.short, color:S.club.color }:{});

/* ---------- 監督能力(→docs/10 §10.2 C) ----------
 * S.mab = { set:[セットした能力の id(最大3)], xp:{ id: 使った試合数 } }。監督のデータなので任期をまたいで残る */
function mabRank(S,k){ const t=TUNING.mab.rankAt, x=(S.mab&&S.mab.xp[k])||0; let r=0; while(r+1<t.length&&x>=t[r+1])r++; return r; }
const mabVal=(S,k)=>TUNING.mab.base[k]*TUNING.mab.rankK[mabRank(S,k)];
/** 試合に渡す効き目 { id: 値 } */
function mabOf(S){ const o={}; for(const k of (S.mab&&S.mab.set)||[])if(TUNING.mab.base[k]!=null)o[k]=mabVal(S,k); return o; }
/** セットを入れ替える(最大 max まで。もう一度押すと外す) */
function toggleMab(S,k){
  const set=S.mab.set, i=set.indexOf(k);
  if(i>=0){ set.splice(i,1); return true; }
  if(!MAB.some(x=>x.id===k)||set.length>=TUNING.mab.max)return false;
  set.push(k); return true;
}
