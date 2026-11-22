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
  const p51=vs(5,1,600), p31=vs(3,1,120), p53=vs(5,3,120), p33=vs(3,3,120);
  console.log("    1試合あたりの勝点  段5対段1 "+f2(p51)+" / 段3対段1 "+f2(p31)+" / 段5対段3 "+f2(p53)+" / 段3対段3 "+f2(p33));
  check("段が上のクラブほど勝つ",p51>p31&&p31>p33&&p53>p33);
  check("ただし番狂わせは起きる(段5対段1でも勝点 2.95 未満。実測はおよそ 2.90)",p51<2.95);
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
// 検証用の方針(→docs/08 §8.5 の遊び方): 育てる選手を絞って集中させる。
//   ★突破の話 → ミーティング / 先発の絶不調 → 声かけ / 3回目は連携(ラウンジ) / それ以外は「育てる選手」に集中
const FOCUS=["h10","h08","h04","h07","h02"];
// 兆しが出たら(あとはフレンドリーマッチで勝つのを待つだけなので)次の選手へ移る
const waiting=g=>(g.is===5||g.q)&&(g.ss===5||g.sq);
const focusOf=S=>FOCUS.find(id=>S.g.pl[id]&&!waiting(S.g.pl[id]));
function commOnce(S,log){
  const xi=E.squadXi(S), out=log||[];
  const ready=Object.keys(S.g.pl).find(id=>E.spReady(S,id));
  if(ready){ out.push(...E.doMeeting(S,ready,E.persOf(ready)).lines); return; }
  const low=xi.find(id=>S.g.pl[id].mot<=1);
  if(low){ out.push(...E.doTalk(S,low).lines); return; }
  if(S.g.cn===2){
    // 太線の組は黄金線の兆しを、そうでなければ相性が悪くて自然には育たない組を育てる
    let pair=null;
    for(let a=0;a<xi.length&&!pair;a++)for(let b=a+1;b<xi.length&&!pair;b++){
      const l=E.linkOf(S,xi[a],xi[b]); if(l.lv===2&&!l.gold)pair=[xi[a],xi[b]]; }
    for(let a=0;a<xi.length&&!pair;a++)for(let b=a+1;b<xi.length&&!pair;b++){
      const l=E.linkOf(S,xi[a],xi[b]); if(l.lv<2&&E.compatOf(xi[a],xi[b])<2)pair=[xi[a],xi[b]]; }
    if(pair){ out.push(...E.doLounge(S,pair[0],pair[1],E.LOUNGE_BEST[E.compatOf(pair[0],pair[1])]).lines); return; }
  }
  const id=focusOf(S)||xi.slice().sort((a,b)=>S.g.pl[a].is-S.g.pl[b].is)[0], g=S.g.pl[id];
  if(g.is<4||(g.is===4&&!g.q))out.push(...E.doIndTrain(S,id).lines);
  else if(g.ss<5&&!g.sq)out.push(...E.doMeeting(S,id,E.persOf(id)).lines);
  else out.push(...E.doIndTrain(S,id).lines);
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
    played, onPitch, starters, subs:M.home.subs, kpCh:M.events.filter(e=>e.type==="kp"&&e.side==="H").length,
    inj:M.events.filter(e=>e.type==="injury"&&e.side==="H").map(e=>e.by) });
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
  // 資金は任期ごとに元に戻る(本家と同じく別のクラブへ移る。→docs/08 §8.12)。稼いだ額は歴代の記録に残る
  const earned=S.career.map(c=>c.money||0);
  check("タイトルが積み上がり、稼いだ資金は任期ごとに歴代へ残る",S.titles.length>0&&earned.length>0&&earned.every(v=>v>0),S.titles.length+"個 / 任期ごと "+earned.join("・")+"億");
  const wr=tot.w/(tot.w+tot.d+tot.l);
  check("監督まかせの勝率が 35〜75%(簡単すぎず、勝てなさすぎない)",wr>=0.35&&wr<=0.75,pc(wr));
}

{ // クラブオファー(→docs/16): 3つ・地域は重ならない・格は監督の格に見合う・選ぶとクラブの状態が決まる・期待と指令が年俸に効く
  console.log("  クラブオファー");
  const S=E.newCareer(606), W=E.worldOf(S), L=E.offersOf(S);
  check("オファーは3つ、地域は重ならず、同じ任期なら同じ",L.length===3&&new Set(L.map(o=>o.region)).size===3&&
    JSON.stringify(E.makeOffers(E.newCareer(606)))===JSON.stringify(L),L.map(o=>o.name).join(" / "));
  let lvs=[], rare=0;
  for(let i=0;i<400;i++){ const T=E.newCareer(7000+i); E.offersOf(T).forEach(o=>{ lvs.push(o.lv); if(o.rare)rare++; }); }
  const avg=lvs.reduce((s,x)=>s+x,0)/lvs.length, hi=lvs.filter(x=>x>=4).length/lvs.length;
  check("1任期目のオファーは弱小〜中堅が中心(格の平均 1〜2、格4以上は 5% 未満。レアを除く)",avg>=1&&avg<=2.3&&hi<0.05,"平均 "+avg.toFixed(2)+" / 格4以上 "+(hi*100).toFixed(1)+"%");
  check("レアオファーはまれ(1任期目は3択のうち1つが 5% ほど)",rare/400>0.02&&rare/400<0.09,(rare/400*100).toFixed(1)+"%");
  const mk=(lv,reg,rare,seed)=>{ let a=seed||1; return E.mkOffer(S,()=>{ a=(a*1103515245+12345)%2147483648; return a/2147483648; },lv,reg,rare); };
  const eu=mk(3,"eu"), sa=mk(3,"sa");
  check("地域の特色: 欧州はスタジアム、南米は練習場が育ち、得意な軸(OFE・TEC)が高い",
    eu.stad>sa.stad&&sa.fac.train>eu.fac.train&&eu.graph.O>=eu.graph.R&&sa.graph.R>=sa.graph.O,"欧州 "+eu.name+" / 南米 "+sa.name);
  const mega=mk(6,"eu"), weak=mk(1,"as");
  check("規模: メガは1部・ファンと資金が多く・期待も指令も多い",mega.div===1&&mega.fans>weak.fans*3&&mega.money>weak.money&&mega.target>weak.target&&mega.misP>weak.misP,
    mega.name+" ファン "+mega.fans+" / "+weak.name+" ファン "+weak.fans);
  const ri=mk(4,"af","rising"), tr=mk(2,"eu","trad");
  check("新興クラブは1部級で期待が低く、伝統的クラブは2〜3部級で期待が高い",ri.div===1&&ri.expLv<ri.lv&&tr.div>=2&&tr.expLv>tr.lv);
  check("成長グラフの初めは対の器に収まり、MAX・金色からは始まらない",[eu,sa,mega,weak,ri,tr].every(o=>Object.keys(o.graph).every(a=>o.graph[a]>=0&&o.graph[a]<100&&o.graph[a]+o.graph[E.AXIS_PAIR[a]]<=E.graphCap(S))));
  S.coffers=[mega]; E.pickOffer(S,W,0);
  check("選ぶと、リーグの格・ファン・資金・スタジアム・施設・成長グラフがそのクラブのものになる",
    S.grade===3&&S.biz.fans===mega.fans&&S.money===mega.money&&S.money0===mega.money&&S.biz.stad===mega.stad&&S.g.graph.O===mega.graph.O&&!!S.biz.offers&&S.league.clubs.length===8);
  // 1任期を回して、期待と指令が年俸に入る
  S.club=E.defaultClub();
  while(!S.termOver)playOne(S,W);
  const e=S.tend;
  check("任期の終わりに、獲得賞金と期待を比べ、指令の結果を年俸に足す",e.exp&&e.exp.target===mega.target&&Math.abs(e.exp.prize-S.ts.prize)<1&&
    e.mis.length>0&&e.misSal===e.mis.reduce((s,m)=>s+m.v,0),
    "獲得 "+e.exp.prize+" / 期待 "+e.exp.target+" ・ 指令 "+e.mis.map(m=>(m.ok?"○":"×")+m.v).join(" ")+" ・ 年俸 "+e.salary+"億");
  E.startNextTerm(S,W);
  check("次の任期はクラブを選び直す(オファーが届く)",!S.cprof&&!S.club&&E.offersOf(S).length===3);
  const M=E.migrate(JSON.parse(JSON.stringify(Object.assign({},S,{ cprof:undefined, club:E.defaultClub() }))));
  check("古いセーブ(途中の任期)は、オファーを出さずに続ける",M.cprof&&M.cprof.legacy===true);
}

{ // Div 制(→docs/19): 最終節で昇格・降格を知らせ、周の終わりに反映。優勝は Div ごと
  console.log("  Div 制");
  const S=E.newCareer(515), W=E.worldOf(S); S.grade=2; S.league=E.newLeague(S,W); S.cups=E.newCups();
  let lines=[], n=0; const on=S.sq.slice(0,11);
  // 最終節はその周の最後の試合(結果のあと次の周に切り替わる)ので、知らせの行で見る
  while(S.cyc===1&&n<80){ const fx=E.nextFixture(S,W); const r=E.applyResult(S,W,fx,{ hg:0, ag:3, played:on, onPitch:on, starters:on }); if(r.some(x=>/^(⬆|⬇|🛡|➡) /.test(x)))lines=r; n++; }
  check("最下位で終えた最終節に降格の知らせ",lines.some(x=>/^⬇ 降格/.test(x)),lines.filter(x=>/^(⬆|⬇|🛡|➡)/.test(x)).join(" "));
  check("周の終わりに 2nd Div へ下がる",S.grade===1&&E.COMPS.LG.name.includes("2nd Div"),E.COMPS.LG.name);
  const T=E.newCareer(516), TW=E.worldOf(T); T.grade=3; T.league=E.newLeague(T,TW);
  const prem=T.league.clubs.filter(c=>c!=="me").map(c=>E.tierOf(c));
  check("Premier Div はメガクラブ(段4・5)ばかり",prem.every(x=>x>=4)&&prem.filter(x=>x===5).length>=5,prem.join(","));
}

{ // トーナメント(→docs/20): 組み合わせは出場が決まった時点で全部。勝ち上がったクラブが次の相手
  console.log("  トーナメント");
  const S=E.newCareer(717), W=E.worldOf(S); E.drawCup(S,W,"PRE"); const c=S.cups.PRE, R0=c.br.rounds[0];
  check("勝ち抜き戦(3ラウンド)は8クラブの山を抽選の時点で全部組む",R0.length===4&&new Set(R0.flatMap(p=>[p.a,p.b])).size===8&&R0[0].a==="me"&&c.opp[0]===R0[0].b);
  E.brAdvance(S,"PRE",0,true,[2,1]);
  const R1=c.br.rounds[1], mine=R1.find(p=>p.a==="me"||p.b==="me");
  check("自分が勝つと、ほかの試合も決まり、隣の山の勝者が次の相手",R1.length===2&&R0.every(p=>p.w)&&mine&&c.opp[1]===(mine.a==="me"?mine.b:mine.a)&&c.opp[1]===R0[1].w);
  E.brAdvance(S,"PRE",1,false,[0,1]);
  check("負けると残りのラウンドも決めて山を最後まで埋める",c.br.rounds.length===3&&c.br.rounds[2][0].w,c.br.rounds.map(r=>r.length).join("-"));
  const T=E.newCareer(718), TW=E.worldOf(T); E.drawCup(T,TW,"ICC"); const ic=T.cups.ICC;
  check("グループ戦のある大会は、もう1つのグループも作る",ic.grp.clubs.length===3&&ic.grp2.clubs.length===4&&ic.opp[0]===ic.grp.clubs[0]);
  ["me"].concat(ic.grp.clubs).forEach((k,i)=>{ ic.grp.table[k].pts=10-i*3; });
  E.brAfterGroups(T,"ICC",true);
  const sf=ic.br.rounds[0];
  check("ICC: グループの1位は相手グループの2位と準決勝",sf.length===2&&sf[0].a==="me"&&ic.grp2.clubs.includes(sf[0].b)&&ic.opp[3]===sf[0].b);
}

{ // 日程(→docs/22): 出ない・出られないカップの枠は休んで節を進められる(任期の試合は減らない)。リーグは飛ばせない
  console.log("  日程");
  const S=E.newCareer(919), W=E.worldOf(S), on=S.sq.slice(0,11);
  let fx=E.nextFixture(S,W); while(fx.kind!=="league"){ E.applyResult(S,W,fx,{ hg:0, ag:1, played:on, onPitch:on, starters:on }); fx=E.nextFixture(S,W); }
  check("リーグの節は飛ばせない",E.skipSlot(S,W)===null);
  let n=0; fx=E.nextFixture(S,W);
  while(!(fx.kind==="friendly"&&fx.missed)&&n<50){ E.applyResult(S,W,fx,{ hg:0, ag:1, played:on, onPitch:on, starters:on }); fx=E.nextFixture(S,W); n++; }
  const p0=S.played, s0=S.slot, r=E.skipSlot(S,W);
  check("出ないカップの枠は休める(節は進み、試合数は増えない)",!!r&&S.played===p0&&S.slot===s0+1,r&&r[0]);
}

// ---------- ⑤ 棄権と保存 ----------
console.log("⑤ 棄権と保存");
{
  const S=E.newCareer(77), W=E.worldOf(S);
  const fx=E.nextFixture(S,W);
  check("最初の試合はプレシーズンカップの1回戦",fx.kind==="cup"&&fx.comp==="PRE"&&fx.ko&&fx.canDecline,fx.comp+" "+fx.label);
  check("1戦目はエントリー受付(選ぶまで ask)",fx.ask===true,String(fx.ask));
  { const S2=E.newCareer(77), W2=E.worldOf(S2); E.nextFixture(S2,W2); E.enterCup(S2,"PRE"); const fe=E.nextFixture(S2,W2);
    check("エントリーすると対戦の札(ask が消える)",fe.kind==="cup"&&!fe.ask,String(fe.ask)); }
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
  check("配置と KP が次の試合に引き継がれる",Object.keys(S.layout).length>=10&&!!S.kp,"配置 "+Object.keys(S.layout).length+"人(退場があれば10人)");
  box.v="{壊れたデータ"; check("壊れたセーブは無視する",E.loadCareer(box)===null);
  // 読めないセーブは上書きせず退避する(→clubui.js initCareer)
  const ms=E.memStore(); ms.setItem(E.SAVE_KEY,"{壊れたデータ");
  check("読めないセーブを退避できる",E.loadCareer(ms)===null&&E.backupSave(ms,E.rawSave(ms))&&ms.getItem(E.SAVE_BAD_KEY)==="{壊れたデータ");
  const nv=JSON.parse(JSON.stringify(S)); nv.ver=2; ms.setItem(E.SAVE_KEY,JSON.stringify(nv));
  check("新しい版のセーブも読めないものとして扱う(上書きしない前提)",E.loadCareer(ms)===null&&E.rawSave(ms).length>100);
  { // 1つ前の世代と、退避3件(→docs/09 第1弾)
    const st=E.memStore(), A=JSON.parse(JSON.stringify(S));
    E.saveCareer(st,A); A.played++; E.saveCareer(st,A);
    st.setItem(E.SAVE_KEY,"{壊れた");
    const P=E.loadCareer(st);
    check("最新が読めなければ、1つ前の世代から戻す",!!P&&P.fromPrev===true&&P.played===A.played-1);
    const bs=E.memStore(); ["a","b","c","d"].forEach(x=>E.backupSave(bs,x));
    check("退避は新しい順に3件まで持つ",bs.getItem(E.SAVE_BAD_KEY)==="d"&&bs.getItem(E.SAVE_BAD_KEY+".1")==="c"&&bs.getItem(E.SAVE_BAD_KEY+".2")==="b");
  }
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
  { // 休憩: 練習の代わりに1手使う。経験は入らず、疲労が抜け、調子が戻る
    const T=E.newCareer(77); for(const id in T.g.pl){ T.g.pl[id].fat=0.1; T.g.pl[id].mot=1; }
    const ie=T.g.pl.h10.ie; E.doRest(T);
    const pl=Object.values(T.g.pl);
    check("休憩は経験が入らず、疲労が抜け、調子が戻る",T.g.pl.h10.ie===ie&&pl.every(g=>g.fat<0.05)&&pl.some(g=>g.mot>1)&&T.g.step==="comm",
      pl.filter(g=>g.mot>1).length+"人が戻る");
    check("選手の言葉が状態に応じて出る",E.voiceOf(T,"h10").length>0);
  }
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
    // 強度の効きは「育てる選手以外」(練習だけで経験がたまる選手)の累計の経験で見る
    const need=E.TUNING.grow.ind.need, cum=g=>need.slice(0,Math.min(g.is,4)).reduce((a,b)=>a+b,0)+g.ie;
    const rest=Object.keys(T.g.pl).filter(id=>!FOCUS.includes(id)).map(id=>T.g.pl[id]);
    return { fat:E.teamFatigue(T), is:Object.values(T.g.pl).reduce((s,g)=>s+g.is,0)/16,
      exp:rest.reduce((s,g)=>s+cum(g),0)/rest.length, rec:T.rec }; };
  const r1=fatRun(1), r2=fatRun(2), r0=fatRun(0);
  console.log("    40試合で  軽め: ★"+f2(r0.is)+" 疲労"+pc(r0.fat)+" "+r0.rec.w+"勝"+r0.rec.l+"敗 / 普通: ★"+f2(r1.is)+" 疲労"+pc(r1.fat)+" "+r1.rec.w+"勝"+r1.rec.l+"敗 / ハード: ★"+
    f2(r2.is)+" 疲労"+pc(r2.fat)+" "+r2.rec.w+"勝"+r2.rec.l+"敗");
  check("ハードを続けると経験は早くたまるが、疲労が高止まりする",r2.exp>r1.exp&&r1.exp>r0.exp&&r2.fat>r1.fat*1.5,
    "育てる選手以外の経験 "+[r0,r1,r2].map(r=>f2(r.exp)).join(" / "));
  // 3択の当たり外れ
  const cnt=(fn,n)=>{ const c=[0,0,0]; for(let i=0;i<n;i++){ const T=E.newCareer(5000+i); T.g.step="comm"; c[fn(T)]++; } return c.map(v=>v/n); };
  const good=cnt(T=>E.doLounge(T,"h07","h08",E.LOUNGE_BEST[E.compatOf("h07","h08")]).res,600);
  const bad=cnt(T=>E.doLounge(T,"h07","h08",(E.LOUNGE_BEST[E.compatOf("h07","h08")]+2)%3).res,600);
  console.log("    ラウンジ(大成功/成功/失敗)  合う手 "+good.map(pc).join(" ")+"  /  合わない手 "+bad.map(pc).join(" "));
  check("相性に合う手は大成功しやすく、合わない手は失敗しやすい",good[0]>0.5&&bad[2]>0.5);
  const mt=ok=>cnt(T=>{ T.g.pl.h10.se=99; return E.doMeeting(T,"h10",ok?E.persOf("h10"):(E.persOf("h10")+1)%3).res; },600);
  const mOk=mt(true), mNg=mt(false);
  check("ミーティングの★突破は、性格に合う言い方で成功しやすい",mOk[0]>0.75&&mNg[0]<0.45,pc(mOk[0])+" / "+pc(mNg[0]));
  { // ミーティングは周りにも効く(→docs/08 §8.3): 盤面で近い先発に経験。控えを呼んでも周りはいない
    const T=E.newCareer(88); T.g.step="comm";
    const near=E.meetNear(T,"h10"), far=T.sq.slice(0,11).filter(x=>x!=="h10"&&!near.includes(x));
    const se0={}; for(const x of T.sq)se0[x]=T.g.pl[x].se;
    const r=E.doMeeting(T,"h10",0);
    const gotNear=near.every(x=>T.g.pl[x].se>se0[x]), gotFar=far.some(x=>T.g.pl[x].se>se0[x]);
    check("ミーティングは盤面で近い先発(1〜3人)にも経験が入り、遠い選手には入らない",
      near.length>=1&&near.length<=3&&gotNear&&!gotFar, near.join(",")+" ・ "+r.lines.slice(-1)[0]);
    check("控えを呼んだときは、連携のある選手がいなければ周りに効かない",E.meetNear(T,T.sq[13]).length===0);
    { const U=E.newCareer(88), b=U.sq[13], a=U.sq[2]; U.g.links[[a,b].sort().join("|")]={ lv:2, exp:0, gold:false };
      check("連携のある選手は、控えでも盤面が遠くても周りに入る(先頭)",E.meetNear(U,b)[0]===a,E.meetNear(U,b).join(",")); }
    // ★突破の成否が周りのやる気に響く(多くの任期で数える)
    let up=0, down=0;
    for(let i=0;i<300;i++){
      for(const ok of [true,false]){
        const U=E.newCareer(9000+i); U.g.step="comm"; U.g.pl.h10.se=99;
        const nr=E.meetNear(U,"h10"), m0=nr.map(x=>U.g.pl[x].mot);
        const res=E.doMeeting(U,"h10",ok?E.persOf("h10"):(E.persOf("h10")+1)%3).res;
        nr.forEach((x,k)=>{ const d=U.g.pl[x].mot-m0[k]; if(res===0&&d>0)up++; if(res===2&&d<0)down++; });
      }
    }
    check("★突破が成功すると周りのやる気が上がり、失敗すると下がることがある",up>0&&down>0,"上がった "+up+" / 下がった "+down);
  }
  { // 経営(→docs/05 §5.13): 入場料・ファン・スタジアム改修・施設
    const T=E.newCareer(71), TW=E.worldOf(T), on=T.sq.slice(0,11);
    let home=0, away=0, gateH=0, gateA=0;
    for(let i=0;i<12;i++){ const fx=E.nextFixture(T,TW), m0=T.money;
      const L=E.applyResult(T,TW,fx,{ hg:2, ag:0, played:on, onPitch:on, starters:on });
      const g=L.some(x=>/入場料/.test(x)); if(fx.home){ home++; if(g)gateH++; } else { away++; if(g)gateA++; } }
    check("入場料はホームの試合だけに入る",gateH===home&&gateA===0,"ホーム "+home+" / アウェイ "+away);
    check("勝てばファンが増える",T.biz.fans>E.TUNING.biz.fans0,E.TUNING.biz.fans0+" → "+T.biz.fans);
    check("年俸に使う額は、施設やスタジアムに使っても減らない",(()=>{ const e=T.biz.earn; T.money+=100; E.buildFac(T,"train"); return T.biz.earn===e&&T.biz.fac.train===1; })());
    T.money=500; T.biz.offer={ lv:2, cost:40, why:"資金" };
    const r=E.answerStadium(T,true);
    check("改修すると資金を払い、スタジアムが上がり、収容人数が増える",r.ok&&T.biz.stad===2&&T.money===460&&E.stadOf(T).cap>E.TUNING.biz.stad[0].cap);
    T.biz.offer={ lv:3, cost:90, why:"資金" }; E.answerStadium(T,false);
    check("見送るとしばらく知らせが出ない",T.biz.offer===null&&T.biz.cool===E.TUNING.biz.cool);
    // 施設の効き目: 練習場があると個人練習で入る経験が多い
    const A=E.newCareer(72), B=E.newCareer(72); B.biz.fac.train=3; A.g.step=B.g.step="comm";
    E.doIndTrain(A,"h10"); E.doIndTrain(B,"h10");
    check("練習場 Lv3 は個人能力の経験を ×1.3",Math.abs(B.g.pl.h10.ie/A.g.pl.h10.ie-1.3)<1e-9,f2(A.g.pl.h10.ie)+" → "+f2(B.g.pl.h10.ie));
  }
  { // コミュニケーションの「！」は種類ごと(その指示を求めている選手だけ)
    const T=E.newCareer(4242), P=T.g.pl;
    P.h10.ie=E.TUNING.grow.ind.need[0]*0.9; P.h08.se=E.TUNING.grow.sp.need[0]; P.h05.mot=0;
    T.g.links[["h02","h03"].sort().join("|")]={ lv:2, exp:0, gold:true, cap:2 };
    const who=k=>Object.keys(P).filter(id=>E.commSign(T,id,k)).sort().join(",");
    check("「！」は種類ごと: 個人=★が近い / ミーティング=★突破 / ラウンジ=黄金線の兆し / ケア=ケガ",
      who("ind")==="h10"&&who("meet")==="h08"&&who("lounge")==="h02,h03"&&who("talk")==="h05",["ind","meet","lounge","talk"].map(who).join(" / "));
  }
  { // ハーフタイムの指示(→docs/10 §10.8)
    const T=E.newCareer(101);
    check("初めは3つの指示が使えて、登録済み",E.htAvail(T).length===3&&T.ht.set.length===3);
    let n=0, got=null;
    for(let i=0;i<200&&!got;i++){ T.g.step="train"; T.g.opts=null; const o=E.trainOptions(T); const j=o.findIndex(x=>x.sp>=0);
      if(j>=0){ const L=E.doTraining(T,j,0); n++; if(L.some(x=>/を覚えた/.test(x)))got=L.find(x=>/を覚えた/.test(x)); } T.played++; }
    check("同じ特殊練習を2回すると、その指示を覚える",!!got&&E.htAvail(T).length>3,got||"");
    check("登録は3つまで(外してから入れ替える)",!E.toggleHt(T,E.htAvail(T)[3])&&E.toggleHt(T,"b1")&&E.toggleHt(T,E.htAvail(T)[3]));
  }
  { // 監督能力(→docs/10 §10.2 C)
    const T=E.newCareer(99), TW=E.worldOf(T), on=T.sq.slice(0,11);
    check("監督能力は3つまでセットでき、もう一度押すと外れる",E.toggleMab(T,"center")&&E.toggleMab(T,"half")&&E.toggleMab(T,"dfc")&&!E.toggleMab(T,"duel")&&E.toggleMab(T,"half")&&T.mab.set.join()==="center,dfc");
    for(let i=0;i<10;i++)E.applyResult(T,TW,E.nextFixture(T,TW),{ hg:1, ag:0, played:on, onPitch:on, starters:on });
    check("セットして10試合でランク II、試合に効き目が渡る",E.mabRank(T,"center")===1&&E.playerDef(T).mab.center>E.TUNING.mab.base.center,JSON.stringify(E.playerDef(T).mab));
    E.toggleMab(T,"center"); T.played=100; T.termOver=true; E.endTerm(T); E.startNextTerm(T,TW);
    check("熟練度は任期をまたいで残る(監督のデータ)",T.mab.xp.center===10);
  }
  { // 称号のセット(→docs/10 §10.2 B)
    const T=E.newCareer(97); T.career=[{ term:1, title:"factory" },{ term:2, title:"rookie" }];
    check("獲った称号(効き目のあるもの)だけセットできる",!E.setTitle(T,"heir")&&E.setTitle(T,"factory")&&E.earnedTitles(T).join()==="factory");
    // 特殊練習の出方: 覚醒工場は個人能力の特殊練習が出やすい
    const share=tset=>{ let hit=0, n=0;
      for(let i=0;i<400;i++){ const U=E.newCareer(4000+i); U.fac=5; U.tset=tset;
        for(const o of E.trainOptions(U))if(o.sp>=0){ n++; if(E.TRAIN_SP[o.sp].eff.ind)hit++; } }
      return hit/n; };
    const s0=share(null), s1=share("factory");
    check("覚醒工場をセットすると、個人能力の特殊練習が出やすい",s1>s0+0.08,(s0*100).toFixed(0)+"% → "+(s1*100).toFixed(0)+"%");
    const A=E.newCareer(98), B=E.newCareer(98); B.tset="factory"; A.g.step=B.g.step="comm";
    E.doIndTrain(A,"h10"); E.doIndTrain(B,"h10");
    check("覚醒工場: 個人練習の経験 ×1.1",Math.abs(B.g.pl.h10.ie/A.g.pl.h10.ie-1.1)<1e-9);
    const TW=E.worldOf(T); T.played=100; T.termOver=true; E.endTerm(T); E.startNextTerm(T,TW);
    check("新しい任期では称号を選び直す",T.tsetChosen===false);
  }
  { // 監督ライセンスと監督契約(→docs/10 §10.2 A)
    const T=E.newCareer(95), TW=E.worldOf(T);
    check("監督名は一度だけ登録でき、あとから変えられない",E.registerManager(T,"山田 太郎","1990-04-01")&&!E.registerManager(T,"別人",null)&&T.mgr.name==="山田 太郎"&&T.mgr.ani!=null);
    check("監督契約で決めたクラブ名・略称・色で試合に出る",E.signClub(T,{ name:"ミナト・ブルーズ", color:"#128A3E" })&&E.playerDef(T).name==="ミナト・ブルーズ"&&E.playerDef(T).short==="MIN"&&E.playerDef(T).color==="#128A3E");
    T.played=100; T.termOver=true; E.endTerm(T); E.startNextTerm(T,TW);
    check("新しい任期ではクラブを決め直し、監督は引き継ぐ",T.club===null&&T.mgr.name==="山田 太郎");
  }
  { // 重なったカード(→docs/08 §8.12): 個別指導 +10%/枚(最大5枚)、覚醒の上がり幅 1〜3 が大きくなりやすい
    const A=E.newCareer(91), B=E.newCareer(91); B.coll.h10=4; A.g.step=B.g.step="comm";
    E.doIndTrain(A,"h10"); E.doIndTrain(B,"h10");
    check("重なり3枚で個別指導の経験 ×1.3、数えるのは5枚まで",Math.abs(B.g.pl.h10.ie/A.g.pl.h10.ie-1.3)<1e-9&&(()=>{ const C=E.newCareer(1); C.coll.h10=20; return E.dupOf(C,"h10")===5; })());
    const avg=n=>{ const T=E.newCareer(92); T.coll.h10=1+n; let s=0; const r=(()=>{ let a=12345; return ()=>{ a=(a*1103515245+12345)%2147483648; return a/2147483648; }; })();
      for(let i=0;i<4000;i++)s+=E.awakeGain(T,"h10",r); return s/4000; };
    const a0=avg(0), a5=avg(5);
    check("覚醒の上がり幅は、重なりなしで平均1.35前後、5枚で2前後",Math.abs(a0-1.35)<0.06&&Math.abs(a5-2.0)<0.08,a0.toFixed(2)+" → "+a5.toFixed(2));
  }
  { // スポンサーとミッション(→docs/05 §5.14・docs/08 §8.9): マスタ = 業種 × ☆1〜5
    check("マスタは11業種 × ☆5(報酬の名前が5つずつ)",E.SP_IND.length===11&&E.SP_IND.every(x=>x.items.length===5));
    const T=E.newCareer(81), TW=E.worldOf(T), on=T.sq.slice(0,11), o=T.biz.offers;
    check("任期の始めに3社の候補(業種は重ならない)",o&&o.length===3&&new Set(o.map(x=>x.ind)).size===3&&o.every(x=>x.rank>=1&&x.rank<=5)&&!T.biz.sp,
      o.map(x=>E.spIndOf(x.ind).name+"☆"+x.rank).join(" / "));
    const i=o.findIndex(x=>E.spIndOf(x.ind).eff!=="injury"); E.signSponsor(T,i);
    const sp=T.biz.sp, ind=E.spIndOf(sp.ind);
    sp.ms=[{ t:"win", n:1, m:5, p:0, st:0, done:false, fail:false }];
    const m0=T.money, L=E.applyResult(T,TW,E.nextFixture(T,TW),{ hg:2, ag:0, played:on, onPitch:on, starters:on });
    check("試合のたびにスポンサー収入が入る",L.some(x=>/スポンサー収入/.test(x))&&T.money>m0);
    check("ミッションを達成すると、業種の効果が☆で決まる試合数だけ始まる",sp.ms[0].done&&T.biz.boost[ind.eff]===E.spDur(ind,sp.rank)&&L.some(x=>x.includes(ind.items[sp.rank-1])),
      L.filter(x=>/ミッション/.test(x)).join(" / "));
    const on5=U=>{ U.biz.boost={ indExp:3, noFat:3 }; U.biz.boostRank={ indExp:5, noFat:5 }; };
    const A=E.newCareer(82), B=E.newCareer(82); on5(B); A.g.step=B.g.step="comm";
    E.doIndTrain(A,"h10"); E.doIndTrain(B,"h10");
    check("食品☆5: 個人練習の経験 ×1.4",Math.abs(B.g.pl.h10.ie/A.g.pl.h10.ie-1.4)<1e-9);
    const C=E.newCareer(84), D=E.newCareer(84); on5(D);
    for(const X of [C,D]){ const W2=E.worldOf(X); X.g.step="ready"; E.applyResult(X,W2,E.nextFixture(X,W2),{ hg:1, ag:1, played:on, onPitch:on, starters:on }); }
    check("飲料☆5: 試合の疲労がたまりにくい",D.g.pl.h10.fat<C.g.pl.h10.fat*0.5,(C.g.pl.h10.fat*100).toFixed(1)+"% → "+(D.g.pl.h10.fat*100).toFixed(1)+"%");
    const G=E.newCareer(85); G.biz.boost={ injury:3 }; G.biz.boostRank={ injury:5 };
    check("医療☆5: 試合に渡すケガの起きやすさ ×0.2",E.playerDef(G).injK===0.2&&E.playerDef(E.newCareer(85)).injK===1);
    E.spRenew(T);
    check("区切りで候補が出直し、終わっていないミッションは期限切れになる",T.biz.offers.length===3&&T.biz.sp.ms.every(m=>m.done||m.fail));
    const U=E.newCareer(83); U.biz.fans=80000;
    check("ファンが増えると上のランクのスポンサーが届く",E.spRankMax(E.newCareer(83))===1&&E.spRankMax(U)===5);
  }
  { // 秘書(→docs/08 §8.7): 選べる4人・親密度・フォロー
    const T=E.newCareer(61), TW=E.worldOf(T);
    check("新しい任期では秘書を選ぶ(初めは未選択)",T.sec&&!T.sec.chosen&&E.chooseSec(T,"s2")&&T.sec.chosen&&E.secOf(T).id==="s2");
    const on=T.sq.slice(0,11);
    for(let i=0;i<6;i++)E.applyResult(T,TW,E.nextFixture(T,TW),{ hg:1, ag:0, played:on, onPitch:on, starters:on });
    check("試合のたびに親密度が上がる",T.sec.bond.s2>=6&&E.secLv(T)>=1,"親密度 "+T.sec.bond.s2+" 段 "+E.secLv(T));
    E.chooseSec(T,"s1"); const b1=T.sec.bond.s1||0; E.chooseSec(T,"s2");
    check("秘書を替えても、元の秘書との親密度は消えない",b1===0&&T.sec.bond.s2>=6);
    check("口調は秘書ごとに違う",E.secSay(T,"tired")!==(E.chooseSec(T,"s1"),E.secSay(T,"tired")));
    // フォローの率: 親密度が高いほど起きる(ラウンジの失敗で数える)
    const rate=bond=>{ let n=0, hit=0;
      for(let i=0;i<400;i++){ const U=E.newCareer(30000+i); U.sec.bond.s0=bond; U.g.step="comm";
        for(const id in U.g.pl)U.g.pl[id].mot=2;
        const pick=(E.LOUNGE_BEST[E.compatOf("h07","h08")]+2)%3, r=E.doLounge(U,"h07","h08",pick);
        if(r.res===2){ n++; if(r.lines.some(x=>/秘書のフォロー/.test(x)))hit++; } }
      return hit/n; };
    const lo=rate(0), hi=rate(99);
    check("フォローは親密度が高いほど起きやすい(他人行儀 15% → 相棒 50% 前後)",lo>0.07&&lo<0.25&&hi>0.4&&hi<0.6,pc(lo)+" → "+pc(hi));
    const M=E.migrate(JSON.parse(JSON.stringify(Object.assign({},T,{ sec:undefined }))));
    check("古いセーブは秘書を補い、途中なら選び直しを求めない",M.sec&&M.sec.chosen===true);
  }
  { // 連携が付きやすくなるボーナス(→docs/08 §8.6): 国籍・同じ実在クラブ・動物占い
    const C=E.CARDS;
    check("動物は生年月日から出す(gen_cards.py と同じ決まり)",E.aniOfDate(1999,2,25)===C.mcb01.ani&&E.aniOfDate(1900,1,13)===0,
      "mcb01 → "+E.ANIMALS[C.mcb01.ani].name);
    check("相性は動物の群れで決まる(同じ群れ 良い / 向かい 張り合う)",E.aniCompat(0,4)===2&&E.aniCompat(0,2)===0&&E.aniCompat(0,1)===1);
    const ids=Object.keys(C), pair=f=>{ for(const a of ids)for(const b of ids)if(a<b&&f(a,b))return [a,b]; };
    const nat=pair((a,b)=>C[a].nat===C[b].nat&&C[a].team!==C[b].team&&C[a].ani!==C[b].ani);
    const club=pair((a,b)=>C[a].team&&C[a].team===C[b].team&&C[a].nat!==C[b].nat&&C[a].ani!==C[b].ani&&E.compatOf(a,b)===0);
    check("同じ国籍は ×1.5、同じクラブは張り合う相性でも薄線まで育つ",E.linkBonusK(nat[0],nat[1])===1.5&&E.linkCap(club[0],club[1])===1,
      nat.join("・")+" / "+club.join("・"));
    check("アズーロFC の初めの16人には、クラブのボーナスが付かない",!E.linkBonusOf("h01","h02").includes("club"));
  }
  { // ケガ(→docs/08 §8.8): 試合の中のケガ → 「ケガ」に。1〜3試合で治る。ケアで手当てできる
    const T=E.newCareer(55), TW=E.worldOf(T), J=E.TUNING.inj;
    const fx=E.nextFixture(T,TW), on=T.sq.slice(0,11);
    E.applyResult(T,TW,fx,{ hg:1, ag:0, played:on, onPitch:on, starters:on, inj:["h10"] });
    check("試合の中でケガをした選手は「ケガ」になる",T.g.pl.h10.mot===0,T.last.gl.filter(x=>/ケガ/.test(x)).join(" "));
    let n=0;
    while(T.g.pl.h10.mot===0&&n<10){ n++; const f=E.nextFixture(T,TW); E.applyResult(T,TW,f,{ hg:0, ag:0, played:on, onPitch:on, starters:on }); }
    check("ケガは maxN 試合のうちに治る",n>=1&&n<=J.maxN&&T.g.pl.h10.mot===J.healTo,n+"試合で治った");
    const U=E.newCareer(56); U.g.step="comm"; U.g.pl.h07.mot=0; U.g.pl.h07.injN=1;
    E.doTalk(U,"h07");
    check("ケガの選手はケアで手当てでき、「不調」以上に戻る",U.g.pl.h07.mot>=2,E.MOT_LABEL[U.g.pl.h07.mot]);
    // 頻度(試合の中で、自チーム)
    let hurt=0; const N=600, tm=Object.keys(E.TEAMS).filter(k=>E.TEAMS[k].real);
    for(let i=0;i<N;i++){ const M=E.simulateMatch(E.makeTeamDef("azr",false),E.makeTeamDef(tm[i%tm.length],true),8100+i);
      hurt+=M.events.filter(e=>e.type==="injury"&&e.side==="H").length; }
    check("ケガは自チームで 9〜18 試合に1回",N/hurt>=9&&N/hurt<=18,"1回/"+f2(N/hurt)+"試合");
  }

  // 育てる前の強さ(段4の相手に300試合)
  const strength=T=>{ let gd=0; const N=300, opp=W.clubs.filter(c=>E.tierOf(c)===4)[0];
    for(let i=0;i<N;i++){ const d=E.playerDef(T); d.cpu=true;
      const M=E.simulateMatch(d,E.makeTeamDef(opp,true),333000+i); gd+=M.home.score-M.away.score; }
    return gd/N; };
  const before=strength(S);
  const log=[]; let ok=true;
  while(!S.termOver){
    playOne(S,W,null,{ log });
    for(const id in S.g.pl){ const g=S.g.pl[id]; if(g.mot<0||g.mot>4||g.is>5||g.ss>5)ok=false; }
    for(const a in S.g.graph)if(S.g.graph[a]<-1e-9||S.g.graph[a]>G0.graph.max+1e-9||S.g.graph[a]+S.g.graph[E.AXIS_PAIR[a]]>E.graphCap(S)+1e-9)ok=false;
  }
  const after=strength(S);
  const pl=Object.values(S.g.pl), xi=E.squadXi(S), avg=f=>pl.reduce((s,g)=>s+f(g),0)/pl.length;
  const awake=pl.filter(g=>g.is===5).length, sp5=pl.filter(g=>g.ss===5).length, spMax=Math.max(...pl.map(g=>g.ss));
  const lv=[0,0,0,0]; Object.values(S.g.links).forEach(l=>lv[l.lv]++);
  const def=E.playerDef(S), maxStat=Math.max(...def.xi.map(x=>Math.max(...E.STATS.map(k=>x.card[k]))));
  console.log("    個人能力 ★平均 "+f2(avg(g=>g.is))+" / 覚醒 "+awake+"人   特殊能力 最高 ★"+spMax+" / ★5 "+sp5+"人");
  console.log("    連携  薄線 "+lv[1]+" / 太線 "+lv[2]+" / 黄金線 "+lv[3]+"(盤面の11人で合計 "+
    def.links.filter(l=>xi.includes(l[0])&&xi.includes(l[1])).reduce((s,l)=>s+l[2],0)+")");
  console.log("    成長グラフ "+Object.keys(S.g.graph).map(a=>E.AXIS_ABBR[a]+" "+Math.round(S.g.graph[a])+(S.g.gold[a]?"(金)":"")).join(" ")+"   セットプレイ +"+pc(S.g.set));
  console.log("    モチベーション "+[0,1,2,3,4].map(m=>E.MOT_LABEL[m]+" "+pl.filter(g=>g.mot===m).length).join(" / "));
  console.log("    成績 "+S.rec.w+"勝"+S.rec.d+"分"+S.rec.l+"敗   段4の相手との得失点差 "+f2(before)+" → "+f2(after));
  check("値が範囲を出ない(★0〜5・モチベーション0〜4(0=ケガ)・成長グラフ 0〜100 と対角の器・能力20以下)",ok&&maxStat<=20,"能力の最大 "+maxStat);
  { // チームの成長グラフ(→docs/15)
    const R=G0.graph, U=E.newCareer(77), cap=E.graphCap(U);
    E.graphAdd(U,"O",80); E.graphAdd(U,"D",80);
    check("対角の2軸は器を分け合う(伸ばすと対角が下がる)",U.g.graph.O+U.g.graph.D<=cap+1e-9&&U.g.graph.D===80&&U.g.graph.O===cap-80,"OFE "+U.g.graph.O+" DEF "+U.g.graph.D+" 器 "+cap);
    E.graphAdd(U,"O",200); U.g.gold.O=true; E.graphAdd(U,"O",-50); E.graphAdd(U,"D",50);
    check("金色の軸は下がらず、対角は「器 − 100」まで",U.g.graph.O===R.max&&U.g.graph.D===cap-R.max,"OFE "+U.g.graph.O+" DEF "+U.g.graph.D);
    const T={ graph:{ O:100, D:0, R:45, C:0, S:80, P:0, gold:{ O:true } } }, st=id=>E.STYLES[id];
    check("ランク: 必要な軸(2つなら低いほう)が 40 で A・75 で S、すべて金色で G",
      E.styleRank(T,st("T05"))==="G"&&E.styleRank(T,st("T10"))==="S"&&E.styleRank(T,st("T01"))==="A"&&E.styleRank(T,st("T12"))==="B"&&E.styleRank({ graph:null },st("T05"))===E.TUNING.rank.none,
      ["T05","T10","T01","T12"].map(k=>k+" "+E.styleRank(T,st(k))).join(" "));
    // 狙って育てる(3軸 OFE・SPE・TEC を伸ばす練習を選ぶ)と、60〜80試合で黄金期
    const aim=["O","S","R"], at=[];
    for(let seed=1;seed<=12;seed++){
      const V=E.newCareer(seed*7), VW=E.worldOf(V); let n=0, hit=null, mot=true;
      while(!V.termOver&&n<100){
        const G=V.g.graph, gold=V.g.gold, want=a=>aim.includes(a)&&!gold[a];
        let bi=0, bs=-1e9;
        E.trainOptions(V).forEach((o,i)=>{ let sc=0;
          if(o.sp<0){ const a=E.PARAM_AXIS[o.param]; if(want(a))sc+=R.basic*(G[a]>=R.max?2:1); }
          else{ const t=E.TRAIN_SP[o.sp], all=t.up.length===6; for(const a of t.up)if(want(a))sc+=(all?R.upAll:R.up)*(G[a]>=R.max?2:1); for(const a of t.down)if(want(a))sc-=R.down; }
          if(sc>bs){ bs=sc; bi=i; } });
        E.doTraining(V,bi,E.teamFatigue(V)>0.08?0:1); V.g.step="comm";
        if(V.g.tags.some(t=>t.id==="golden")&&Object.values(V.g.pl).some(g=>g.mot>0&&g.mot<4))mot=false;
        const fx=E.nextFixture(V,VW), on=V.sq.slice(0,11);
        E.applyResult(V,VW,fx,{ hg:0, ag:2, played:on, onPitch:on, starters:on });
        n++; if(hit==null&&E.graphGoldN(V)>=3)hit=n;
      }
      at.push(hit==null?999:hit);
      if(seed===1)check("黄金期のあいだは、負けても全員が絶好調のまま",mot);
    }
    at.sort((a,b)=>a-b); const med=at[at.length>>1];
    check("狙って育てると、およそ 60〜80 試合で黄金期(金色が3つ)",med>=60&&med<=80&&at[0]>=50,"中央 "+med+"試合(最短 "+at[0]+" / 最長 "+at[at.length-1]+")");
  }
  // 集中育成の釣り合い(→docs/08 §8.5)
  const fo=FOCUS.slice(0,3).map(id=>S.g.pl[id]), never=Object.keys(S.g.pl).filter(id=>!FOCUS.includes(id)&&!xi.includes(id)).map(id=>S.g.pl[id]);
  const nevAvg=never.reduce((s,g)=>s+g.is,0)/(never.length||1);
  check("集中して育てた3人は、個人・特殊とも★5(または★5の兆し)に届く",fo.every(g=>(g.is===5||g.q)&&(g.ss===5||g.sq)),fo.map(g=>"★"+g.is+(g.q?"兆":"")+"/"+g.ss+(g.sq?"兆":"")).join(" "));
  check("覚醒は狙った選手が中心で、全員ではない(3〜8人)",awake>=3&&awake<=8,awake+"人");
  check("関わらなかった選手は★2以下にとどまる",nevAvg<=2,"控えの★平均 "+f2(nevAvg));
  check("特殊能力は KP に絞れば ★4 以上まで届く",spMax>=4,"★"+spMax);
  check("連携が育ち、黄金線も生まれる",lv[2]>=5&&lv[3]>=1,"太線 "+lv[2]+" / 黄金線 "+lv[3]);
  // 集中育成(→docs/08 §8.5)では覚醒するのは3人ほどなので、チーム全体の伸びは控えめ(2026-11-18 に +0.3 から改めた)
  check("育てると強くなる(得失点差 +0.2 以上)",after>before+0.2,f2(before)+" → "+f2(after));
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
    check("称号は条件どおり(負け越し → 迷将 / 両方 ★5 が5人 → 覚醒工場 / S3つ+勝率7割 → レジェンド)",
      pick({ w:30, l:40 })==="迷将"&&pick({ dual:5, w:50, l:30 })==="覚醒工場"&&pick({ dual:4, w:50, l:30 })!=="覚醒工場"&&pick({ sWins:3, wr:0.72 })==="レジェンド");
    // 取りにくい称号が先。一度取った称号は後回し(→docs/21 §21.5)
    const both=Object.assign({},f,{ dual:5, w:50, l:30, used:12 });
    const P=(career)=>E.pickTitle(Object.assign({},T,{ career }),both).name;
    check("取りにくい称号が先(覚醒工場と生え抜きの両方を満たせば覚醒工場)・一度取った称号は後回し",
      P([])==="覚醒工場"&&P([{ title:"factory" }])==="生え抜き"&&P([{ title:"factory" },{ title:"native" }])==="覚醒工場",P([])+" / "+P([{ title:"factory" }]));
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

// 最適配置(→docs/14): 崩した並びから、陣形の枠に合う11人に戻す
{
  // 強さは適性込み(枠の細かいポジションで slotValue を足す。→docs/17)
  const fit=T=>{ const f=E.FORMS[T.form]; return T.sq.slice(0,11).reduce((s,id,i)=>s+E.slotValue(T,id,i===0?"GK":E.posAt(f[i][0],f[i][1])),0); };
  const S=E.newCareer(3), base=fit(S); E.fillLayout(S);
  const sq=S.sq; [sq[0],sq[11]]=[sq[11],sq[0]]; [sq[3],sq[12]]=[sq[12],sq[3]]; S.layout={}; E.fillLayout(S);
  const bad=fit(S); E.autoSquad(S);
  check("最適配置: 崩した並びから強さ(適性込み)が戻り、GK が枠の先頭、16人が重ならない",fit(S)>=base-1e-9&&fit(S)>bad&&E.CARDS[S.sq[0]].pos==="GK"&&new Set(S.sq).size===16,
    f2(bad)+" → "+f2(fit(S)));
}
// タグ(→docs/23): 連勝で勢い・連敗でスランプ・打ち消し・上限・効き目・任期でクリア
{
  console.log("\n■ タグ");
  const S=E.newCareer(4242), out=[], run=r=>E.tagsAfterMatch(S,{ kind:"friendly" },{ win:r==="w", lose:r==="l" },out);
  const has=id=>S.g.tags.some(t=>t.id===id);
  "ww".split("").forEach(run); const before=has("momentum"); run("w");
  check("3連勝で「勢い」が付き、調子の上がりやすさが上がる",!before&&has("momentum")&&E.tagK(S,"motUp")>1,E.tagK(S,"motUp"));
  run("l"); check("負けると「勢い」は消える",!has("momentum"));
  "ll".split("").forEach(run);
  check("3連敗で「スランプ」(勝つまで続く)",has("slump")&&E.tagK(S,"motDown")>1&&S.g.tags.find(t=>t.id==="slump").n==null);
  run("w"); check("勝つと「スランプ」は消える",!has("slump"));
  E.addTeamTag(S,"promo",out); E.addTeamTag(S,"releg",out);
  check("反対のタグは打ち消す(昇格の勢い → 降格の重圧)",has("releg")&&!has("promo"));
  E.addTeamTag(S,"momentum",out); E.addTeamTag(S,"releg",out);
  check("同じタグは重ねず、期限を延ばす",S.g.tags.filter(t=>t.id==="releg").length===1&&S.g.tags.find(t=>t.id==="releg").n===E.TAGS.releg.dur);
  E.addTeamTag(S,"slump",out); E.addTeamTag(S,"promo",out);
  check("チームの汎用は "+E.TUNING.tag.teamMax+" つまで",S.g.tags.length<=E.TUNING.tag.teamMax,S.g.tags.map(t=>t.id).join(","));
  for(let i=0;i<12;i++)run("d");
  check("期限が来たタグは消える(10試合)",!has("promo"),S.g.tags.map(t=>t.id+":"+t.n).join(","));
  if(S.biz)S.biz.boost={ indExp:3 };
  check("スポンサーの報酬は「施設充実」のタグとして見える",!S.biz||E.teamTagsView(S).some(t=>t.id==="facTrain"));
  check("任期ごとの育成が新しくなると、タグは空(任期の終わりで全部クリア)",E.newGrowth(S.sq).tags.length===0);
  // 黄金期もタグ(「黄金期到来」)。上限の数に入らず押し出されない。付いた時点で全員が絶好調、期限で消える
  { const V=E.newCareer(77), o=[]; V.g.pl[V.sq[2]].mot=1;
    E.addTeamTag(V,"slump",o); E.addTeamTag(V,"releg",o); E.addTeamTag(V,"golden",o,true); E.addTeamTag(V,"momentum",o);
    const g0=V.g.tags.some(t=>t.id==="golden"), lock=V.g.pl[V.sq[2]].mot===4;
    for(let k=0;k<E.TUNING.grow.graph.golden;k++)E.tagsAfterMatch(V,{ kind:"friendly" },{ win:false, lose:false },o);
    check("黄金期もタグ: 押し出されず、付いた時点で全員が絶好調、"+E.TUNING.grow.graph.golden+"試合で消える",g0&&lock&&!V.g.tags.some(t=>t.id==="golden"),V.g.tags.map(t=>t.id).join(",")); }
}
console.log(fail?"\n"+fail+" 件 失敗":"\nすべて通過");
process.exit(fail?1:0);
