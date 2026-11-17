// クラブ運営の検証。 node clubtest.js [任期の数]
//   ① 世界    相手クラブが毎回同じに作られ、強さの段が実際の強さになっている
//   ② 日程    43試合で1周し、本家の並びどおり
//   ③ PK戦    必ず決着が付く
//   ④ 任期    100試合を最後まで回せる。順位表と大会が壊れない
//   ⑤ 保存    書いて読んで、同じ続きになる
//   ⑥ 育成    練習・ラウンジ・ミーティング・★・覚醒・連携・モチベーション
const E=require("./_setup.js").load();
const TERMS=+process.argv[2]||6;
let fail=0;
const check=(name,ok,detail)=>{
  console.log((ok?"  ok   ":"  FAIL ")+name+(detail?"  "+detail:""));
  if(!ok)fail++;
};
const f2=v=>v.toFixed(2), pc=v=>(v*100).toFixed(1)+"%";

// ---------- ① 世界 ----------
console.log("① 世界(相手クラブ)");
const S0=E.newCareer(2026), W=E.worldOf(S0);
{
  const snap=id=>JSON.stringify([E.TEAMS[id],E.TEAMS[id].xi.map(c=>E.CARDS[c])]);
  const a=snap("c07"); E.genWorld(2026); const b=snap("c07"); E.genWorld(999); const c=snap("c07");
  E.genWorld(2026);
  check("同じたね → 同じクラブ / 違うたね → 別のクラブ",a===b&&a!==c);
  check("相手は32クラブ(架空 15 + ロッソ + 実在 16)",W.clubs.length===32,W.clubs.length+"クラブ");
  let ok=true, names=new Set(), n=0;
  for(const id of W.clubs){
    const t=E.TEAMS[id], all=t.xi.concat(t.bench);
    if(t.real)continue;                          // 実在クラブは ⑦ で見る
    if(all.length!==16||E.CARDS[t.xi[0]].pos!=="GK"||!t.xi.includes(t.kp))ok=false;
    for(const cid of all){
      const cd=E.CARDS[cid]; n++; names.add(cd.name);
      if(!cd||!E.SKILLS[cd.skill]||!E.STYLES[E.SKILLS[cd.skill].style])ok=false;
      for(const k of ["off","def","tec","pow","spd","sta"])if(!(cd[k]>=1&&cd[k]<=20))ok=false;
    }
    if(!t.links.every(l=>t.xi.includes(l[0])&&t.xi.includes(l[1])&&l[2]>=1&&l[2]<=3))ok=false;
    if(!all.some((cid,i)=>i>=11&&E.CARDS[cid].pos==="GK"))ok=false;
  }
  check("どのクラブも16枚・GK2人・スキルと KP と連携が正しい(架空クラブ)",ok,n+"枚");
  check("生成した選手名はクラブをまたいで重ならない(架空クラブ)",names.size===n,names.size+"/"+n);
  // 強さの段: 段が上のクラブが実際に勝つこと
  const byTier=t=>W.clubs.filter(id=>E.tierOf(id)===t);
  const vs=(ta,tb,N)=>{ let pts=0;
    for(let i=0;i<N;i++){
      const a=byTier(ta)[i%byTier(ta).length], b=byTier(tb)[i%byTier(tb).length];
      const M=E.simulateMatch(E.makeTeamDef(a,true),E.makeTeamDef(b,true),7000+i);
      pts+=M.home.score>M.away.score?3:M.home.score===M.away.score?1:0;
    }
    return pts/N; };
  const p51=vs(5,1,120), p31=vs(3,1,120), p53=vs(5,3,120), p33=vs(3,3,120);
  console.log("    1試合あたりの勝点  段5対段1 "+f2(p51)+" / 段3対段1 "+f2(p31)+" / 段5対段3 "+f2(p53)+" / 段3対段3 "+f2(p33));
  check("段が上のクラブほど勝つ",p51>p31&&p31>p33&&p53>p33);
  check("ただし番狂わせは起きる(段5対段1でも勝点 2.9 未満)",p51<2.9);
}

// ---------- ② 日程 ----------
console.log("② 日程");
{
  check("1周は43試合",E.SCHED.length===43,E.SCHED.length+"試合");
  check("リーグは14節",E.SCHED.filter(s=>s[0]==="LG").length===14);
  check("並びの頭は プレシーズンカップ3試合 → リーグ2節 → W4",
    E.SCHED.slice(0,6).map(s=>s[0]).join(",")==="PRE,PRE,PRE,LG,LG,W4");
  const cnt={}; E.SCHED.forEach(s=>cnt[s[0]]=(cnt[s[0]]||0)+1);
  check("どの大会も、定義した試合数だけ枠がある",E.CUP_IDS.every(id=>cnt[id]===E.COMPS[id].stages.length));
  const ids=["me","a","b","c","d","e","f","g"], seen={};
  let ok=true;
  for(let r=0;r<14;r++){
    const round=E.leagueRound(ids,r), flat=round.flat();
    if(new Set(flat).size!==8)ok=false;
    round.forEach(p=>{ const k=p[0]+">"+p[1]; seen[k]=(seen[k]||0)+1; });
  }
  check("リーグは毎節全員が1試合ずつ、どの組もホームとアウェイで1回ずつ",
    ok&&Object.keys(seen).length===56&&Object.values(seen).every(v=>v===1));
}

// ---------- ③ PK戦 ----------
console.log("③ PK戦");
{
  let n=0, bad=0, kicks=0, hw=0;
  for(let i=0;i<400;i++){
    const M=E.simulateMatch(E.makeTeamDef("azr",true),E.makeTeamDef("ros",true),90000+i,{ ko:true });
    if(M.home.score===M.away.score){
      n++; if(!M.pso||M.pso[0]===M.pso[1])bad++;
      else{ kicks+=M.events.filter(e=>e.type==="pso").length; if(M.pso[0]>M.pso[1])hw++; }
    }else if(M.pso)bad++;
  }
  check("同点の試合だけ PK 戦になり、必ず決着が付く",n>40&&bad===0,n+"試合 / 平均 "+f2(kicks/n)+"本 / ホーム勝ち "+pc(hw/n));
  const a=E.simulateMatch(E.makeTeamDef("azr",true),E.makeTeamDef("ros",true),90007,{ ko:true });
  const b=E.simulateMatch(E.makeTeamDef("azr",true),E.makeTeamDef("ros",true),90007,{ ko:true });
  check("同じたねなら PK 戦も同じ",JSON.stringify(a.pso)===JSON.stringify(b.pso));
  const c=E.simulateMatch(E.makeTeamDef("azr",true),E.makeTeamDef("ros",true),90007,{ ko:true, agg:[3,0] });
  check("2試合制は合計で見る(第1試合で差があれば PK 戦にならない)",!c.pso||c.home.score+3===c.away.score);
  const d=E.simulateMatch(E.makeTeamDef("azr",true),E.makeTeamDef("ros",true),90007);
  check("勝ち抜き戦でなければ PK 戦は無い",!d.pso);
}

// ---------- ④ 任期を回す ----------
console.log("④ 任期("+TERMS+"任期ぶん。自分のクラブも監督まかせで回す)");
/**
 * 育成の方針(検証用): 練習は順に回し、疲れていなければ普通、疲れていれば軽め。
 * コミュニケーションは3回: ★突破 > やる気の落ちた選手 > 黄金線の兆し > KP の特殊能力 > 連携 > 個人練習
 */
function develop(S,log,intensity){
  if(S.g.step==="train"){
    const lv=intensity!=null?intensity:E.teamFatigue(S)>0.08?0:1;
    (log||[]).push(...E.doTraining(S,S.played%6,lv));
  }
  for(let k=0;k<3&&S.g.step==="comm";k++)commOnce(S,log);
}
function commOnce(S,log){
  const xi=E.squadXi(S);
  const ready=Object.keys(S.g.pl).find(id=>E.spReady(S,id));
  if(ready){ (log||[]).push(...E.doMeeting(S,ready,E.persOf(ready)).lines); return; }
  const low=xi.find(id=>S.g.pl[id].mot<=1);
  if(low){ (log||[]).push(...E.doTalk(S,low).lines); return; }
  // 太線になった組は黄金線の兆しを取りに行く。次に、相性が悪くて自然には育たない組を育てる
  let pair=null;
  for(let a=0;a<xi.length&&!pair;a++)for(let b=a+1;b<xi.length&&!pair;b++){
    const l=E.linkOf(S,xi[a],xi[b]); if(l.lv===2&&!l.gold)pair=[xi[a],xi[b]];
  }
  // 2試合に1回は、KP にする選手(h10)とミーティングして特殊能力を伸ばす
  const star="h10";
  if(S.g.cn===0&&S.g.pl[star].ss<5&&!S.g.pl[star].sq){
    (log||[]).push(...E.doMeeting(S,star,E.persOf(star)).lines); return;
  }
  for(let a=0;a<xi.length&&!pair;a++)for(let b=a+1;b<xi.length&&!pair;b++){
    const l=E.linkOf(S,xi[a],xi[b]); if(l.lv<2&&E.compatOf(xi[a],xi[b])<2)pair=[xi[a],xi[b]];
  }
  if(pair){ (log||[]).push(...E.doLounge(S,pair[0],pair[1],E.LOUNGE_BEST[E.compatOf(pair[0],pair[1])]).lines); return; }
  const low2=xi.slice().sort((a,b)=>S.g.pl[a].is-S.g.pl[b].is||S.g.pl[a].ie-S.g.pl[b].ie)[0];
  (log||[]).push(...E.doIndTrain(S,low2).lines);
}
function playOne(S,W,decline,opt){
  opt=opt||{};
  if(!opt.noDev)develop(S,opt.log,opt.intensity);
  let fx=E.nextFixture(S,W);
  if(decline&&fx.canDecline&&decline(fx)){ E.declineCup(S,fx.comp); fx=E.nextFixture(S,W); }
  const m=E.fixtureMatch(S,fx);
  m.home.cpu=true;
  const starters=m.home.xi.map(x=>x.card.id);
  const M=E.simulateMatch(m.home,m.away,m.seed,m.opts);
  const layout={}; M.home.players.forEach(p=>layout[p.id]=[p.b.h,p.b.x]);
  const onPitch=M.home.players.map(p=>p.id), played=[...new Set(starters.concat(onPitch))];
  const lines=E.applyResult(S,W,fx,{ hg:M.home.score, ag:M.away.score, pso:M.pso, layout, kp:M.home.kp,
    played, onPitch, starters, subs:M.home.subs, kpCh:M.events.filter(e=>e.type==="kp"&&e.side==="H").length });
  return { fx, M, lines };
}
{
  const S=E.newCareer(2026), W=E.worldOf(S);
  const kinds={ league:0, cup:0, friendly:0 }, comps={}, tot={ w:0, d:0, l:0, titles:0, money:0 };
  let ok=true, why="", cupsSeen=new Set(), grades=[], psoN=0, tableOk=true;
  for(let term=1;term<=TERMS;term++){
    let n=0;
    while(!S.termOver){
      const cyc=S.cyc, slot=S.slot;
      const r=playOne(S,W);
      n++; kinds[r.fx.kind]++; comps[r.fx.comp]=(comps[r.fx.comp]||0)+1;
      if(r.fx.kind==="cup")cupsSeen.add(r.fx.comp);
      if(r.M.pso)psoN++;
      if(r.fx.ko&&r.M.home.score+(r.fx.agg?r.fx.agg[0]:0)===r.M.away.score+(r.fx.agg?r.fx.agg[1]:0)&&!r.M.pso){ ok=false; why="決着なし"; }
      if(r.fx.no!==n){ ok=false; why="試合番号"; }
      if(n>200){ ok=false; why="終わらない"; break; }
      // 順位表: 全クラブの試合数が揃い、勝点の合計が合う
      if(S.cyc===cyc&&r.fx.kind==="league"){
        const t=S.league.table, ps=Object.values(t);
        if(!ps.every(x=>x.p===S.league.done))tableOk=false;
        if(ps.reduce((s,x)=>s+x.gf-x.ga,0)!==0)tableOk=false;
        if(ps.reduce((s,x)=>s+x.w,0)!==ps.reduce((s,x)=>s+x.l,0))tableOk=false;
      }
    }
    if(n!==E.TUNING.club.termLen){ ok=false; why="試合数 "+n; }
    console.log("    第"+term+"任期  "+S.rec.w+"勝"+S.rec.d+"分"+S.rec.l+"敗  得失 "+S.rec.gf+"-"+S.rec.ga+
      "  リーグの格 "+S.grade+"  賞金 "+S.money.toFixed(0)+"億  タイトル "+S.titles.filter(t=>t.term===term).map(t=>t.comp).join(",") );
    tot.w+=S.rec.w; tot.d+=S.rec.d; tot.l+=S.rec.l; grades.push(S.grade);
    if(S.tend)console.log("      称号 "+E.titleOf(S.tend.title).name+"  年俸 "+S.tend.salary+"億(累計 "+S.tend.total+")  施設 "+S.tend.fac+
      "  ついてくる "+S.tend.follow.length+"人  次の格 "+S.tend.grade);
    E.startNextTerm(S,W);
  }
  console.log("    試合の内訳  リーグ "+kinds.league+" / カップ "+kinds.cup+" / フレンドリー "+kinds.friendly+
    "  PK戦 "+psoN+"回  出た大会: "+[...cupsSeen].join(" "));
  check("どの任期も100試合で終わり、決着の付かない勝ち抜き戦が無い",ok,why);
  check("順位表が壊れない(試合数が揃う・得失点の合計が0・勝ちと負けの数が同じ)",tableOk);
  check("リーグが1任期に 14節 × 2周 + 途中まで",kinds.league/TERMS>=28&&kinds.league/TERMS<=42,f2(kinds.league/TERMS)+"試合/任期");
  check("フレンドリーマッチが任期の2〜6割(覚醒と黄金連携の機会)",kinds.friendly/TERMS>=20&&kinds.friendly/TERMS<=60,
    f2(kinds.friendly/TERMS)+"試合/任期");
  check("格の高い大会にも出られる(B 以上に1つは出ている)",["W4","CONTI","CT","ICC","CSC","JT"].some(c=>cupsSeen.has(c)),
    [...cupsSeen].join(" "));
  check("タイトルと賞金が積み上がる",S.titles.length>0&&S.money>0,S.titles.length+"個 / "+S.money.toFixed(0)+"億");
  const wr=tot.w/(tot.w+tot.d+tot.l);
  check("監督まかせの勝率が 35〜75%(簡単すぎず、勝てなさすぎない)",wr>=0.35&&wr<=0.75,pc(wr));
}

// ---------- ⑤ 棄権と保存 ----------
console.log("⑤ 棄権と保存");
{
  const S=E.newCareer(77), W=E.worldOf(S);
  const fx=E.nextFixture(S,W);
  check("最初の試合はプレシーズンカップの1回戦",fx.kind==="cup"&&fx.comp==="PRE"&&fx.ko&&fx.canDecline,fx.comp+" "+fx.label);
  E.declineCup(S,"PRE");
  const f2x=E.nextFixture(S,W);
  check("棄権するとフレンドリーマッチになる",f2x.kind==="friendly"&&f2x.missed==="PRE",f2x.kind+"("+f2x.why+")");
  for(let i=0;i<3;i++)playOne(S,W);
  check("棄権した大会は残りの枠もフレンドリー",S.history.slice(0,3).every(h=>h[0]==="FR"));
  check("そのあとはリーグ戦",E.nextFixture(S,W).kind==="league");
  for(let i=0;i<20;i++)playOne(S,W);
  // 保存 → 読み込み
  const box={ v:null, setItem(k,t){ this.v=t; }, getItem(){ return this.v; }, removeItem(){ this.v=null; } };
  check("保存できる",E.saveCareer(box,S)&&box.v.length>100,(box.v.length/1024).toFixed(1)+" KB");
  const L=E.loadCareer(box), LW=E.worldOf(L);
  check("読み込むと同じ状態",JSON.stringify(L)===JSON.stringify(S));
  const a=playOne(S,W), b=playOne(L,LW);
  check("読み込んだあとの続きが、読み込まなかった場合と同じ",
    a.fx.opp===b.fx.opp&&a.M.home.score===b.M.home.score&&a.M.away.score===b.M.away.score&&JSON.stringify(S)===JSON.stringify(L));
  check("配置と KP が次の試合に引き継がれる",Object.keys(S.layout).length===11&&!!S.kp);
  box.v="{壊れたデータ"; check("壊れたセーブは無視する",E.loadCareer(box)===null);
  E.clearCareer(box); check("消せる",box.v===null);
}

// ---------- ⑥ 育成 ----------
console.log("⑥ 育成(1任期を、検証用の方針で育てながら回す)");
{
  const S=E.newCareer(2026), W=E.worldOf(S), G0=E.TUNING.grow;
  // 手順の守り: 練習 → コミュニケーション → 試合 の順でしか進まない
  check("練習の候補は6つ(能力ごとに1つ)",E.trainOptions(S).length===6&&E.trainOptions(S).every((o,i)=>o.param===E.STATS[i]));
  check("練習の前にラウンジは使えない",E.doLounge(S,"h07","h08",0).res===-1);
  E.doTraining(S,0,1);
  const ie0=S.g.pl.h10.ie; E.doTraining(S,0,1);
  check("練習は1試合に1回だけ",S.g.pl.h10.ie===ie0&&S.g.step==="comm");
  check("練習の直後は★が上がらない(試合のあとに上がる)",Object.values(S.g.pl).every(g=>g.is===0));
  E.doMeeting(S,"h10",0); E.doTalk(S,"h05"); E.doIndTrain(S,"h03");
  check("コミュニケーションは3回まで",E.doLounge(S,"h07","h08",0).res===-1&&S.g.step==="ready"&&S.g.cn===3,S.g.done.join(","));
  // 強度: ハードは伸びるが疲れる
  const T0=E.newCareer(31), T1=E.newCareer(31), T2=E.newCareer(31);
  E.doTraining(T0,0,0); E.doTraining(T1,0,1); E.doTraining(T2,0,2);
  check("強度が高いほど経験とグラフが伸び、疲労がたまる",
    T0.g.pl.h10.ie<T1.g.pl.h10.ie&&T1.g.pl.h10.ie<T2.g.pl.h10.ie&&T0.g.graph.O<T2.g.graph.O&&
    T0.g.pl.h10.fat===0&&T2.g.pl.h10.fat>T1.g.pl.h10.fat,
    "経験 "+[T0,T1,T2].map(T=>f2(T.g.pl.h10.ie)).join("/")+" 疲労 "+[T0,T1,T2].map(T=>pc(T.g.pl.h10.fat)).join("/"));
  { const d=E.playerDef(T2), M=E.createMatch(d,E.makeTeamDef("ros",true),1);
    check("練習の疲れを残したまま試合が始まる",M.home.players[9].stam<1,pc(M.home.players[9].stam)); }
  // ハードを続けた場合と、普通を続けた場合の強さ(1任期の途中まで)
  const fatRun=lv=>{ const T=E.newCareer(2026), TW=E.worldOf(T);
    for(let i=0;i<40;i++)playOne(T,TW,null,{ intensity:lv });
    return { fat:E.teamFatigue(T), is:Object.values(T.g.pl).reduce((s,g)=>s+g.is,0)/16, rec:T.rec }; };
  const r1=fatRun(1), r2=fatRun(2), r0=fatRun(0);
  console.log("    40試合で  軽め: ★"+f2(r0.is)+" 疲労"+pc(r0.fat)+" "+r0.rec.w+"勝"+r0.rec.l+"敗 / 普通: ★"+f2(r1.is)+" 疲労"+pc(r1.fat)+" "+r1.rec.w+"勝"+r1.rec.l+"敗 / ハード: ★"+
    f2(r2.is)+" 疲労"+pc(r2.fat)+" "+r2.rec.w+"勝"+r2.rec.l+"敗");
  check("ハードを続けると★は早いが、疲労が高止まりする",r2.is>r1.is&&r2.fat>r1.fat*1.5);
  // 3択の当たり外れ
  const cnt=(fn,n)=>{ const c=[0,0,0]; for(let i=0;i<n;i++){ const T=E.newCareer(5000+i); T.g.step="comm"; c[fn(T)]++; } return c.map(v=>v/n); };
  const good=cnt(T=>E.doLounge(T,"h07","h08",E.LOUNGE_BEST[E.compatOf("h07","h08")]).res,600);
  const bad=cnt(T=>E.doLounge(T,"h07","h08",(E.LOUNGE_BEST[E.compatOf("h07","h08")]+2)%3).res,600);
  console.log("    ラウンジ(大成功/成功/失敗)  合う手 "+good.map(pc).join(" ")+"  /  合わない手 "+bad.map(pc).join(" "));
  check("相性に合う手は大成功しやすく、合わない手は失敗しやすい",good[0]>0.5&&bad[2]>0.5);
  const mt=ok=>cnt(T=>{ T.g.pl.h10.se=99; return E.doMeeting(T,"h10",ok?E.persOf("h10"):(E.persOf("h10")+1)%3).res; },600);
  const mOk=mt(true), mNg=mt(false);
  check("ミーティングの★突破は、性格に合う言い方で成功しやすい",mOk[0]>0.75&&mNg[0]<0.45,pc(mOk[0])+" / "+pc(mNg[0]));

  // 育てる前の強さ(段4の相手に300試合)
  const strength=T=>{ let gd=0; const N=300, opp=W.clubs.filter(c=>E.tierOf(c)===4)[0];
    for(let i=0;i<N;i++){ const d=E.playerDef(T); d.cpu=true;
      const M=E.simulateMatch(d,E.makeTeamDef(opp,true),333000+i); gd+=M.home.score-M.away.score; }
    return gd/N; };
  const before=strength(S);
  const log=[]; let ok=true;
  while(!S.termOver){
    playOne(S,W,null,{ log });
    for(const id in S.g.pl){ const g=S.g.pl[id]; if(g.mot<1||g.mot>4||g.is>5||g.ss>5)ok=false; }
    for(const a in S.g.graph)if(S.g.graph[a]<G0.graph.min-1e-9||S.g.graph[a]>G0.graph.max+1e-9)ok=false;
  }
  const after=strength(S);
  const pl=Object.values(S.g.pl), xi=E.squadXi(S), avg=f=>pl.reduce((s,g)=>s+f(g),0)/pl.length;
  const awake=pl.filter(g=>g.is===5).length, sp5=pl.filter(g=>g.ss===5).length, spMax=Math.max(...pl.map(g=>g.ss));
  const lv=[0,0,0,0]; Object.values(S.g.links).forEach(l=>lv[l.lv]++);
  const def=E.playerDef(S), maxStat=Math.max(...def.xi.map(x=>Math.max(...E.STATS.map(k=>x.card[k]))));
  console.log("    個人能力 ★平均 "+f2(avg(g=>g.is))+" / 覚醒 "+awake+"人   特殊能力 最高 ★"+spMax+" / ★5 "+sp5+"人");
  console.log("    連携  薄線 "+lv[1]+" / 太線 "+lv[2]+" / 黄金線 "+lv[3]+"(盤面の11人で合計 "+
    def.links.filter(l=>xi.includes(l[0])&&xi.includes(l[1])).reduce((s,l)=>s+l[2],0)+")");
  console.log("    戦力グラフ "+Object.keys(S.g.graph).map(a=>a+" "+f2(S.g.graph[a])).join(" ")+"   セットプレイ +"+pc(S.g.set));
  console.log("    モチベーション "+[1,2,3,4].map(m=>E.MOT_LABEL[m]+" "+pl.filter(g=>g.mot===m).length).join(" / "));
  console.log("    成績 "+S.rec.w+"勝"+S.rec.d+"分"+S.rec.l+"敗   段4の相手との得失点差 "+f2(before)+" → "+f2(after));
  check("値が範囲を出ない(★0〜5・モチベーション1〜4・グラフの上下限・能力20以下)",ok&&maxStat<=20,"能力の最大 "+maxStat);
  check("任期の終わりに個人能力の★平均が 2.5〜4.5",avg(g=>g.is)>=2.5&&avg(g=>g.is)<=4.5,f2(avg(g=>g.is)));
  check("覚醒する選手が出るが、全員ではない(1〜10人)",awake>=1&&awake<=10,awake+"人");
  check("特殊能力は KP に絞れば ★4 以上まで届く",spMax>=4,"★"+spMax);
  check("連携が育ち、黄金線も生まれる",lv[2]>=5&&lv[3]>=1,"太線 "+lv[2]+" / 黄金線 "+lv[3]);
  check("育てると強くなる(得失点差 +0.3 以上)",after>before+0.3,f2(before)+" → "+f2(after));
  check("ただし別物にはならない(+2.0 未満)",after<before+2.0);
  check("任期の初めは段4の相手より弱い",before<0,f2(before));
  // ★と連携の段の上昇は、試合のあとの行に出る(練習の行には出ない)
  const later=[]; { const T=E.newCareer(77), TW=E.worldOf(T); for(let i=0;i<30;i++){ const r=playOne(T,TW); later.push(...r.lines); } }
  check("★の上昇と連携の変化は、試合のあとに出る",later.some(x=>/個人能力 ★/.test(x))&&later.some(x=>/連携が/.test(x))&&
    !log.some(x=>/個人能力 ★/.test(x)),later.length+"行");
  // 特殊練習は施設が良いほど出る
  const spN=fac=>{ let n=0; for(let i=0;i<200;i++){ const T=E.newCareer(8000+i); T.fac=fac; n+=E.trainOptions(T).filter(o=>o.sp>=0).length; } return n/200; };
  check("特殊練習は施設レベルが高いほど候補に出る",spN(1)>0.3&&spN(5)>spN(1)*2.5,f2(spN(1))+" → "+f2(spN(5))+" 枠/回");
  check("特殊練習48種がすべてどこかの枠に入る",E.TRAIN_SP.length===48&&E.TRAIN_SP.every(t=>["off","def","tec","pow","spd","sta","any"].includes(t.slot)));
  // 年齢: 若い選手ほど★が早く、やる気の上下が大きい
  { const ids=Object.keys(S.g.pl), young=ids.filter(id=>E.CARDS[id].age<=22), old=ids.filter(id=>E.CARDS[id].age>=30);
    const avgIs=list=>list.reduce((s,id)=>s+S.g.pl[id].is+Math.min(1,S.g.pl[id].ie/100),0)/list.length;
    console.log("    年齢  22歳以下 "+young.length+"人 ★"+f2(avgIs(young))+" / 30歳以上 "+old.length+"人 ★"+f2(avgIs(old)));
    check("若い選手ほど個人能力の★が早い",avgIs(young)>avgIs(old),f2(avgIs(young))+" > "+f2(avgIs(old))); }
  { // やる気の上下の回数(同じ試合を200回)
    const swings=id=>{ let n=0; for(let i=0;i<300;i++){ const T=E.newCareer(9100+i); const m0=T.g.pl[id].mot;
      E.applyResult(T,E.worldOf(T),E.nextFixture(T,E.worldOf(T)),{ hg:i%3===0?2:i%3===1?0:1, ag:1, played:[id], onPitch:[id] });
      if(T.g.pl[id].mot!==m0)n++; } return n/300; };
    const y=swings("h15"), o=swings("h12");
    check("若い選手ほどやる気の上下が大きい(19歳 対 34歳)",y>o*1.5,pc(y)+" / "+pc(o)); }
  // 保存と、任期またぎ
  const box={ v:null, setItem(k,t){ this.v=t; }, getItem(){ return this.v; }, removeItem(){ this.v=null; } };
  E.saveCareer(box,S);
  check("育成の状態も保存できる",JSON.stringify(E.loadCareer(box))===JSON.stringify(S),(box.v.length/1024).toFixed(1)+" KB");
  // ---- 任期の終わり(→term.js) ----
  check("任期が終わると称号・年俸・施設が決まる",!!S.tend&&!!E.titleOf(S.tend.title)&&S.tend.salary>0&&S.tend.fac>=1,
    S.tend?E.titleOf(S.tend.title).name+" / "+S.tend.salary+"億":"なし");
  const fol=S.tend.follow, keep=fol.map(id=>JSON.stringify([S.g.pl[id].is,S.g.pl[id].ss,S.g.pl[id].up]));
  check("絆の深い選手が1〜3人ついてくる",fol.length>=1&&fol.length<=3,fol.map(id=>E.CARDS[id].name+"(絆"+S.g.pl[id].bond+")").join(" "));
  const career0=S.career.length;
  E.startNextTerm(S,W);
  check("ついてきた選手は★と能力を保つ",fol.every((id,i)=>JSON.stringify([S.g.pl[id].is,S.g.pl[id].ss,S.g.pl[id].up])===keep[i]));
  check("ほかの選手は育成が初めから",Object.keys(S.g.pl).filter(id=>!fol.includes(id)).every(id=>S.g.pl[id].is===0&&S.g.pl[id].ss===0));
  check("ついてきた選手どうし以外の連携は消える",Object.keys(S.g.links).every(k=>k.split("|").every(id=>fol.includes(id))));
  check("任期の記録は新しく始まり、歴代に残る",S.ts.used.length===0&&S.career.length===career0&&S.tend===null&&S.term===2);
  // 称号: 条件の順番どおりに決まる
  { const T=E.newCareer(1), f=E.termFacts(T);
    const pick=x=>E.TITLES.find(t=>t.ok(Object.assign({},f,x))).name;
    check("称号は条件どおり(負け越し → 迷将 / 覚醒8人 → 覚醒工場 / S3つ+勝率7割 → レジェンド)",
      pick({ w:30, l:40 })==="迷将"&&pick({ awake:8, w:50, l:30 })==="覚醒工場"&&pick({ sWins:3, wr:0.72 })==="レジェンド");
    check("どれにも当てはまらなければ新米監督",pick({ w:40, l:40 })==="新米監督"); }
  check("施設は累計の年俸で上がる(0億 → 1 / 640億 → 5)",E.facLevel(0)===1&&E.facLevel(200)===3&&E.facLevel(640)===5);
}

// ---------- ⑦ カード ----------
console.log("⑦ カード(払い出し・コレクション・登録)");
{
  const P=E.POOL, rar={}; P.forEach(id=>{ const r=E.CARDS[id].rar; rar[r]=(rar[r]||0)+1; });
  console.log("    一覧 "+P.length+"枚  "+E.RAR_ORDER.map(r=>E.RARITY[r].name+" "+(rar[r]||0)).join(" / "));
  let ok=true;
  for(const id of P){ const c=E.CARDS[id];
    if(!E.SKILLS[c.skill]||!E.RARITY[c.rar]||!(c.age>=18)||!c.club)ok=false;
    for(const k of E.STATS)if(!(c[k]>=1&&c[k]<=20))ok=false; }
  check("一覧は 実在16クラブ × 16人 = 256枚。どのカードもスキル・レアリティ・年齢・クラブを持つ",P.length===256&&ok);
  check("本体の名前は偽名だけ(実名パックを読んでいない状態では PACK が空)",Object.keys(E.PACK.names).length===0);
  { const byTier=t=>E.REAL_IDS.filter(id=>E.TEAMS[id].tier===t).length;
    check("実在クラブは相手として登場する(段5 8クラブ / 段4 8クラブ)",byTier(5)===8&&byTier(4)===8&&
      E.REAL_IDS.every(id=>E.worldOf(E.newCareer(1)).clubs.includes(id)&&E.TEAMS[id].xi.length===11&&E.CARDS[E.TEAMS[id].xi[0]].pos==="GK"),
      E.REAL_IDS.filter(id=>E.TEAMS[id].tier===5).map(id=>E.TEAMS[id].short).join(" ")); }
  const avg=r=>{ const l=P.filter(id=>E.CARDS[id].rar===r); return l.reduce((s,id)=>s+E.STATS.reduce((t,k)=>t+E.CARDS[id][k],0),0)/l.length/6; };
  console.log("    能力の平均  "+E.RAR_ORDER.map(r=>E.RARITY[r].name+" "+f2(avg(r))).join(" / "));
  check("レアリティが上ほど能力が高い",avg("W")<avg("B")&&avg("B")<avg("K")&&avg("K")<avg("L"));
  // 払い出しの率(2000回)
  const cnt={W:0,B:0,K:0,L:0};
  for(let i=0;i<2000;i++){ const T=E.newCareer(1); T.played=i; cnt[E.CARDS[E.drawCard(T)].rar]++; }
  console.log("    2000回引いた内訳  "+E.RAR_ORDER.map(r=>E.RARITY[r].name+" "+pc(cnt[r]/2000)).join(" / "));
  check("払い出しの率が設定どおり(レジェンド 0.5〜3%)",cnt.L/2000>=0.005&&cnt.L/2000<=0.03&&cnt.W>cnt.B&&cnt.B>cnt.K);
  // 1任期で払い出される
  const S=E.newCareer(2026), W=E.worldOf(S);
  for(let i=0;i<30;i++)playOne(S,W);
  const n=Object.values(S.coll).reduce((s,v)=>s+v,0);
  check("試合のたびに1枚払い出される",n===16+30&&!!S.last.card,n+"枚(初めの16 + 30試合)");
  check("同じ試合を読み込み直しても同じカード",(()=>{ const T=JSON.parse(JSON.stringify(S)); T.played=5; return E.drawCard(T)===E.drawCard(Object.assign(JSON.parse(JSON.stringify(S)),{ played:5 })); })());
  // 登録の入れ替え
  const newc=Object.keys(S.coll).find(id=>!S.sq.includes(id));
  const out=S.sq[3], lay=S.layout[out], kept=JSON.stringify(S.g.pl[S.sq[0]]);
  check("登録選手と入れ替えられる",E.swapSquad(S,out,newc)&&S.sq[3]===newc&&!S.sq.includes(out),E.CARDS[out].name+" → "+E.CARDS[newc].name);
  check("入れ替えた枠の位置を引き継ぐ",!lay||JSON.stringify(S.layout[newc])===JSON.stringify(lay));
  check("外した選手の育成は消え、入った選手は初めから、ほかは保つ",!S.g.pl[out]&&S.g.pl[newc].is===0&&JSON.stringify(S.g.pl[S.sq[0]])===kept);
  check("外した選手の連携は消える",Object.keys(S.g.links).every(k=>!k.split("|").includes(out)));
  check("持っていないカードや登録済みのカードとは入れ替えられない",!E.swapSquad(S,S.sq[1],"k999")&&!E.swapSquad(S,S.sq[1],S.sq[2]));
  const d=E.playerDef(S);
  check("次の試合から使える(先発の4番目の枠に入る)",d.xi[3].card.id===newc&&d.xi.length===11&&d.bench.length===5);
  const a0=S.sq[2], b0=S.sq[12];
  check("先発と控えを入れ替えても育成は消えない",E.moveSquad(S,a0,b0)&&S.sq[2]===b0&&S.sq[12]===a0&&!!S.g.pl[a0]&&!!S.g.pl[b0]);
  const M=E.simulateMatch(d,E.makeTeamDef("ros",true),3);
  check("入れ替えたあとも試合が回る",M.over);
  // 任期をまたぐ
  const coll0=JSON.stringify(S.coll), sq0=JSON.stringify(S.sq);
  while(!S.termOver)playOne(S,W);
  E.startNextTerm(S,W);
  check("コレクションと登録選手は任期をまたいで残る",Object.keys(S.coll).length>=Object.keys(JSON.parse(coll0)).length&&
    S.sq.length===16&&S.sq.every(id=>S.g.pl[id]));
  // 古いセーブ(カード前)を読み込む
  const old=E.newCareer(9); delete old.sq; delete old.coll;
  const box={ v:JSON.stringify(old), setItem(k,t){ this.v=t; }, getItem(){ return this.v; }, removeItem(){ this.v=null; } };
  const L=E.loadCareer(box);
  check("カードを入れる前のセーブも読める",L.sq.length===16&&Object.keys(L.coll).length===16);
  // 一覧が変わる前のセーブ(架空のカード k123 を持っている)
  const o2=E.newCareer(9); o2.coll.k123=2; o2.sq[4]="k123"; o2.layout.k123=[0.3,20]; delete o2.g.pl[E.startSquad()[4]]; o2.g.pl.k123=o2.g.pl[o2.sq[0]];
  box.v=JSON.stringify(o2); const L2=E.loadCareer(box);
  check("無くなったカードは外し、登録の空きは初めの16枚で埋める",!L2.coll.k123&&!L2.sq.includes("k123")&&L2.sq.length===16&&
    L2.sq.every(id=>E.CARDS[id]&&L2.g.pl[id])&&!L2.g.pl.k123);
}

console.log(fail?"\n"+fail+" 件 失敗":"\nすべて通過");
process.exit(fail?1:0);
