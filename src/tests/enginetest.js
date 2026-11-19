// 試合エンジンの検証。 node enginetest.js [試合数]
//   ① 決定性      同じたね → 同じ試合 / 違うたね → 別の試合
//   ② 指示の不変  指示より前のイベントは1つも変わらない
//   ③ 水準        得点・シュート・パス成功率が現実の帯に入っている
//   ④ 盤面の効き  カードの置き方が結果を動かす(これが本作の核)
const E=require("./_setup.js").load();
const N=+process.argv[2]||600;
let fail=0;
const check=(name,ok,detail)=>{
  console.log((ok?"  ok   ":"  FAIL ")+name+(detail?"  "+detail:""));
  if(!ok)fail++;
};
const f2=v=>v.toFixed(2), pc=v=>(v*100).toFixed(1)+"%";

const home=()=>E.makeTeamDef("azr",false), away=()=>E.makeTeamDef("ros",false);
const sig=M=>JSON.stringify(M.events);

// ---------- ① 決定性 ----------
console.log("① 決定性");
{
  const a=E.simulateMatch(home(),away(),12345), b=E.simulateMatch(home(),away(),12345);
  const c=E.simulateMatch(home(),away(),54321);
  check("同じたね → 同じイベント列",sig(a)===sig(b));
  check("違うたね → 別の試合",sig(a)!==sig(c));
  const s=E.createMatch(home(),away(),12345);
  let n=0; while(!s.over&&n++<2000)E.stepMatch(s);
  check("1ステップずつでも一気にでも同じ",sig(s)===sig(a),"("+n+"ステップ)");
}

// ---------- ② 指示の不変 ----------
console.log("② 指示");
{
  const base=E.simulateMatch(home(),away(),777);
  const M=E.createMatch(home(),away(),777);
  while(M.ix<100)E.stepMatch(M);
  const cut=M.events.length;
  E.orderMatch(M,"H",{ type:"move", id:"h10", h:0.2, x:50 });
  E.orderMatch(M,"H",{ type:"sub", out:"h08", in:"h14" });
  E.finishMatch(M);
  check("指示より前のイベントは変わらない",
    JSON.stringify(M.events.slice(0,cut))===JSON.stringify(base.events.slice(0,cut)));
  check("指示のあとは別の試合になる",sig(M)!==sig(base));
  check("交代が記録される",M.events.some(e=>e.type==="sub"&&e.in==="h14"));
  const p=M.home.players.find(q=>q.id==="h10");
  check("動かしたカードの役割が変わる",p.role==="CB"&&p.apt<1,p.role+" 適性"+p.apt);
  const M2=E.createMatch(home(),away(),778);
  for(const id of ["h13","h14","h15","h16"])
    E.orderMatch(M2,"H",{ type:"sub", out:M2.home.players[5].id, in:id });
  E.stepMatch(M2); E.stepMatch(M2);
  check("交代は3人まで",M2.home.subs<=3,M2.home.subs+"人");
}

// ---------- 集計 ----------
function run(n,seed0,prep,cpu,hcpu){
  const R={ n, hg:0, ag:0, hw:0, dr:0, aw:0, shots:0, onT:0, pass:0, passOk:0,
    hSteps:0, steps:0, hSh:0, aSh:0, aBlk:0, aOnT:0, hPass:0, hPassOk:0, aPass:0, aPassOk:0, aOff:0, hOff:0, wide:0, wideN:0, sx:0, kpRecv:0, hStam:0, long:0, gkStam:0,
    fouls:0, yc:0, rc:0, ck:0, fk:0, pk:0, off:0, pkGoal:0, pkShot:0, spGoal:0, goals:0, short:0, res:{ goal:0, save:0, miss:0, block:0 }, subs:0 };
  for(let i=0;i<n;i++){
    const M=E.createMatch(E.makeTeamDef("azr",!!hcpu),E.makeTeamDef("ros",!!cpu),seed0+i*7919);
    if(prep)prep(M);
    E.finishMatch(M);
    const H=M.home, A=M.away;
    R.hg+=H.score; R.ag+=A.score;
    if(H.score>A.score)R.hw++; else if(H.score<A.score)R.aw++; else R.dr++;
    R.shots+=H.st.shots+A.st.shots; R.hSh+=H.st.shots; R.aSh+=A.st.shots; R.onT+=H.st.onT+A.st.onT;
    R.pass+=H.st.pass+A.st.pass; R.passOk+=H.st.passOk+A.st.passOk;
    R.hSteps+=H.st.steps; R.steps+=H.st.steps+A.st.steps; R.subs+=A.subs;
    for(const T of [H,A])for(const k of ["fouls","yc","rc","ck","fk","pk","off"])R[k]+=T.st[k];
    if(H.players.length<11||A.players.length<11)R.short++;
    R.hPass+=H.st.pass; R.hPassOk+=H.st.passOk; R.aPass+=A.st.pass; R.aPassOk+=A.st.passOk; R.aOff+=A.st.off; R.hOff+=H.st.off; R.aOnT+=A.st.onT;
    R.hStam+=H.players.reduce((s,p)=>s+p.stam,0)/H.players.length;
    R.gkStam+=(H.players.find(p=>p.gk)||{stam:1}).stam;
    for(const e of M.events)if(e.side==="H"&&(e.type==="pass"||e.type==="carry")&&e.ok){
      R.wide+=Math.abs(e.dest[1]-50); R.sx+=e.dest[1]; R.wideN++;
      if(e.type==="pass"&&e.from&&e.dest[0]-e.from[0]>0.3)R.long++;   // 縦に長いパス(カウンター)
      if(e.type==="pass"&&e.to===H.kp)R.kpRecv++;
    }
    for(const e of M.events)if(e.type==="shot"){
      R.res[e.res]++; if(e.side==="A"&&e.res==="block")R.aBlk++;
      if(e.res==="goal"){ R.goals++; if(e.sp)R.spGoal++; }
      if(e.sp==="pk"){ R.pkShot++; if(e.res==="goal")R.pkGoal++; }
    }
  }
  return R;
}
const line=(tag,R)=>console.log("    "+tag.padEnd(22)+
  " 得点 "+f2(R.hg/R.n)+" - "+f2(R.ag/R.n)+
  "  勝/分/敗 "+pc(R.hw/R.n)+" "+pc(R.dr/R.n)+" "+pc(R.aw/R.n)+
  "  支配 "+pc(R.hSteps/R.steps)+
  "  シュート "+f2(R.hSh/R.n)+"/"+f2(R.aSh/R.n)+"  被ブロック率 "+pc(R.aBlk/(R.aSh||1)));

// ---------- ③ 水準 ----------
console.log("③ 水準("+N+"試合)");
const base=run(N,1000);
{
  const g=(base.hg+base.ag)/N, sh=base.shots/N, tot=base.shots;
  line("基準",base);
  console.log("    シュート "+f2(sh)+"本/試合  枠内 "+f2(base.onT/N)+
    "  内訳 block "+pc(base.res.block/tot)+" miss "+pc(base.res.miss/tot)+
    " save "+pc(base.res.save/tot)+" goal "+pc(base.res.goal/tot)+
    "  パス成功 "+pc(base.passOk/base.pass));
  check("平均得点が 2.2〜3.3",g>=2.2&&g<=3.3,f2(g));
  check("シュートが 18〜30本",sh>=18&&sh<=30,f2(sh));
  check("引き分けが 18〜32%",base.dr/N>=0.18&&base.dr/N<=0.32,pc(base.dr/N));
  check("パス成功率が 65〜88%",base.passOk/base.pass>=0.65&&base.passOk/base.pass<=0.88,
    pc(base.passOk/base.pass));
  // 物差しのノイズ床: 同じ条件を別のたねで回した差
  const again=run(N,900000);
  console.log("    ノイズ床: 得失点差 "+f2(Math.abs((base.hg-base.ag)-(again.hg-again.ag))/N)+
    " / 合計得点 "+f2(Math.abs((base.hg+base.ag)-(again.hg+again.ag))/N));
}

// ---------- ③b 反則とセットプレー ----------
console.log("③b 反則とセットプレー(1試合あたり・両チーム計)");
{
  const R=base, v=k=>R[k]/N;
  console.log("    反則 "+f2(v("fouls"))+"  警告 "+f2(v("yc"))+"  退場 "+f2(v("rc"))+
    "  FK "+f2(v("fk"))+"  CK "+f2(v("ck"))+"  PK "+f2(v("pk"))+"  オフサイド "+f2(v("off")));
  console.log("    PK決定率 "+pc(R.pkGoal/(R.pkShot||1))+"("+R.pkShot+"本)  セットプレーからの得点 "+
    pc(R.spGoal/R.goals)+"  退場者の出た試合 "+pc(R.short/N));
  check("反則が 9〜20(試合を約225アクションに圧縮しているぶん少ない)",v("fouls")>=9&&v("fouls")<=20,f2(v("fouls")));
  check("警告が 2〜5枚",v("yc")>=2&&v("yc")<=5,f2(v("yc")));
  check("退場が 0.05〜0.35人",v("rc")>=0.05&&v("rc")<=0.35,f2(v("rc")));
  check("コーナーが 6〜13本",v("ck")>=6&&v("ck")<=13,f2(v("ck")));
  check("オフサイドが 2〜7回",v("off")>=2&&v("off")<=7,f2(v("off")));
  check("PKが 0.1〜0.5本",v("pk")>=0.1&&v("pk")<=0.5,f2(v("pk")));
  check("PK決定率が 68〜85%",R.pkGoal/R.pkShot>=0.68&&R.pkGoal/R.pkShot<=0.85,pc(R.pkGoal/R.pkShot));
  check("セットプレーからの得点が全体の 15〜35%",R.spGoal/R.goals>=0.15&&R.spGoal/R.goals<=0.35,
    pc(R.spGoal/R.goals));
  let ok=true;
  for(let i=0;i<200&&ok;i++){
    const M=E.simulateMatch(home(),away(),70000+i);
    for(const T of [M.home,M.away])
      if(T.players.length<8||!T.players.some(p=>p.gk)||T.players.some(p=>p.yc>=2))ok=false;
  }
  check("退場しても8人を割らず、GKは残り、警告2枚の選手は盤面に居ない",ok);
}

// ---------- ④ 盤面の効き ----------
console.log("④ 盤面の効き(ホームだけカードを動かす)");
{
  const moveAll=dh=>M=>M.home.players.forEach(p=>{
    if(!p.gk)E.orderMatch(M,"H",{ type:"move", id:p.id, h:p.h+dh, x:p.x });
  });
  const up=run(N,1000,moveAll(+0.06)), down=run(N,1000,moveAll(-0.06));
  const cfBack=run(N,1000,M=>E.orderMatch(M,"H",{ type:"move", id:"h10", h:0.2, x:50 }));
  const narrow=run(N,1000,M=>M.home.players.forEach(p=>{
    if(!p.gk)E.orderMatch(M,"H",{ type:"move", id:p.id, h:p.h, x:50+(p.x-50)*0.35 });
  }));
  line("全体を上げる(+0.06)",up);
  line("全体を下げる(-0.06)",down);
  line("CFを最終ラインへ",cfBack);
  line("中央に密集",narrow);
  const gd=R=>(R.hg-R.ag)/R.n;
  check("ラインを上げると得点が増える",up.hg>base.hg,f2(base.hg/N)+" → "+f2(up.hg/N));
  check("ラインを上げると失点も増える",up.ag>base.ag,f2(base.ag/N)+" → "+f2(up.ag/N));
  // 下げるだけでは失点は減らない(既知の歪み →docs/02 §2.9)。増えないことだけを見る
  check("ラインを下げても失点は増えない(+0.15 以内)",down.ag/N<base.ag/N+0.15,
    f2(base.ag/N)+" → "+f2(down.ag/N));
  check("中央に人を集めると失点が減る",narrow.ag<base.ag,f2(base.ag/N)+" → "+f2(narrow.ag/N));
  check("ラインを下げると得点も減る",down.hg<base.hg,f2(base.hg/N)+" → "+f2(down.hg/N));
  check("CFを下げると得点が減る",cfBack.hg<base.hg*0.9,f2(base.hg/N)+" → "+f2(cfBack.hg/N));
  // 「これだけやっておけば勝てる」置き方が無いこと。基準からの上積みで見る
  const best=Math.max(...[up,down,cfBack,narrow].map(R=>gd(R)-gd(base)));
  check("一方的に得をする置き方が無い(得失点差の上積み < 0.5)",best<0.5,"最大 "+(best>=0?"+":"")+f2(best));
  // GK(→docs/02 §2.3a)。定位置が基準で、動かすと得と損の両方が出る
  const gkTo=(h,x)=>M=>E.orderMatch(M,"H",{ type:"move", id:"h01", h, x });
  const gkOutR=run(N,1000,gkTo(0.15,50)), gkSide=run(N,1000,gkTo(0.05,28));
  line("GKを前へ(エリアの端)",gkOutR);
  line("GKを片側へ寄せたまま",gkSide);
  {
    const M=E.createMatch(home(),away(),5);
    E.orderMatch(M,"H",{ type:"move", id:"h01", h:0.6, x:95 });
    E.stepMatch(M);
    const g=M.home.players[0];
    check("GKはペナルティエリアの外へ出られない",g.h<=E.TUNING.gk.maxH&&g.x<=E.TUNING.gk.maxX&&g.role==="GK",
      "h="+g.h+" x="+g.x);
  }
  check("GKを片側へ寄せたままだと失点が増える",gkSide.ag>base.ag,f2(base.ag/N)+" → "+f2(gkSide.ag/N));
  check("GKを出しっぱなしにしても得をしない(得失点差の上積み < 0.15)",
    gd(gkOutR)-gd(base)<0.15,(gd(gkOutR)-gd(base)>=0?"+":"")+f2(gd(gkOutR)-gd(base)));
}

// ---------- ⑤ 相手監督 ----------
console.log("⑤ 相手監督(カードを動かす・交代する)");
{
  const cpu=run(N,1000,null,true), both=run(N,1000,null,true,true);
  line("相手だけ監督あり",cpu);
  line("両方に監督あり",both);
  console.log("    交代: "+f2(cpu.subs/N)+"人/試合");
  check("相手監督が交代を使う",cpu.subs/N>0.5);
  const gd=R=>(R.hg-R.ag)/R.n, g=(both.hg+both.ag)/N;
  check("監督が居るぶん相手は手強くなる",gd(cpu)<gd(base),f2(gd(base))+" → "+f2(gd(cpu)));
  check("ただし別の競技にはならない(得失点差の変化 < 0.6)",gd(base)-gd(cpu)<0.6);
  check("両方に監督が居ても水準が保たれる(2.2〜3.3点)",g>=2.2&&g<=3.3,f2(g));
  const a=E.simulateMatch(E.makeTeamDef("azr",true),E.makeTeamDef("ros",true),4242);
  const b=E.simulateMatch(E.makeTeamDef("azr",true),E.makeTeamDef("ros",true),4242);
  check("監督が居ても同じたねなら同じ試合",sig(a)===sig(b));
  // 構え: 負けている終盤は隊列が上がり、勝っている終盤は幅が狭まる
  let upN=0,upSum=0,narN=0,narSum=0,gkMoved=0,post=0,kpEv=0,upLine=0;
  for(let i=0;i<300;i++){
    const M=E.createMatch(home(),E.makeTeamDef("ros",true),50000+i*31);
    while(!M.over){
      E.stepMatch(M);
      if(M.away.players[0].x!==50)gkMoved=1;
    }
    post+=M.events.filter(e=>e.type==="posture").length;
    kpEv+=M.events.filter(e=>e.type==="kp"&&e.side==="A").length;
    if(M.away.posture==="attack"&&M.away.ins.center)upLine++;
    const A=M.away, of=A.players.filter(p=>!p.gk);
    const dh=of.reduce((s,p)=>s+(p.h-p.b.h),0)/of.length;
    const w=of.reduce((s,p)=>s+Math.abs(p.x-50),0)/of.reduce((s,p)=>s+Math.abs(p.b.x-50),0);
    if(A.posture==="attack"){ upN++; upSum+=dh; }
    if(A.posture==="defend"){ narN++; narSum+=w; }
  }
  console.log("    構えの切り替え "+f2(post/300)+"回/試合  終了時: 前がかり "+upN+" / 固める "+narN+" / 300");
  check("負けて終わる試合ではラインを上げる指示が出ている",upN>0&&upLine===upN,upLine+"/"+upN);
  check("構えに合わせて KP も替えている",kpEv>0,f2(kpEv/300)+"回/試合");
  check("勝って終わる試合では幅が狭まっている",narN>0&&narSum/narN<0.9,"×"+f2(narSum/(narN||1)));
  check("相手のGKがボールに合わせて動く",gkMoved===1);
}

// ---------- ⑥ 監督の指示 ----------
console.log("⑥ 監督の指示(ホームだけ出す。相手は動かさない)");
const gdOf=R=>(R.hg-R.ag)/R.n;
const show=(tag,R)=>console.log("    "+tag.padEnd(14)+" 得点 "+f2(R.hg/R.n)+" - "+f2(R.ag/R.n)+
  "  支配 "+pc(R.hSteps/R.steps)+"  パス 自"+pc(R.hPassOk/R.hPass)+" 相"+pc(R.aPassOk/R.aPass)+
  "  シュート "+f2(R.hSh/R.n)+"/"+f2(R.aSh/R.n)+"  幅 "+f2(R.wide/R.wideN)+
  "  オフサイド 自"+f2(R.hOff/R.n)+" 相"+f2(R.aOff/R.n)+"  KPが受ける "+f2(R.kpRecv/R.n));
{
  // 十字の戦術ボタン + キーパー(→docs/04 §4.9b)
  const ins=o=>M=>E.orderMatch(M,"H",Object.assign({ type:"ins" },o));
  const center=run(N,1000,ins({ center:true })), left=run(N,1000,ins({ left:true })), right=run(N,1000,ins({ right:true }));
  const both=run(N,1000,ins({ left:true, right:true })), counter=run(N,1000,ins({ counter:true }));
  const press=run(N,1000,ins({ press:true })), keeper=run(N,1000,ins({ keeper:true }));
  const wd=R=>R.wide/R.wideN, mx=R=>R.sx/R.wideN, lg=R=>R.long/R.n;
  show("指示なし",base); show("中央突破",center); show("左サイド攻撃",left); show("右サイド攻撃",right);
  show("左右両方",both); show("カウンター",counter); show("プレス",press); show("キーパー",keeper);
  console.log("    中央からの離れ "+["指示なし","中央突破","左右両方"].map((t,i)=>t+" "+f2(wd([base,center,both][i]))).join(" / ")+
    "   縦に長いパス/試合 指示なし "+f2(lg(base))+" → カウンター "+f2(lg(counter))+"   GK の終了時スタミナ "+pc(base.gkStam/N)+" → "+pc(keeper.gkStam/N));
  check("中央突破でボールが真ん中を通る",wd(center)<wd(base)-1.5,f2(wd(base))+" → "+f2(wd(center)));
  check("サイド攻撃でボールがそちらを通る(左は x が小さい)",mx(left)<mx(base)-3&&mx(right)>mx(base)+3,
    f2(mx(left))+" < "+f2(mx(base))+" < "+f2(mx(right)));
  check("左右両方で幅を使う",wd(both)>wd(base)+1.5,f2(wd(base))+" → "+f2(wd(both)));
  check("カウンターで縦に長いパスが増え、相手のオフサイドが減る",lg(counter)>lg(base)*1.1&&counter.aOff<base.aOff,
    f2(lg(base))+" → "+f2(lg(counter))+" / オフサイド "+f2(base.aOff/N)+" → "+f2(counter.aOff/N));
  check("プレスは相手のパスを通さず、スタミナを使う",
    press.aPassOk/press.aPass<base.aPassOk/base.aPass&&press.hStam<base.hStam,
    "相手のパス "+pc(base.aPassOk/base.aPass)+" → "+pc(press.aPassOk/press.aPass)+
    " / 終了時スタミナ "+pc(base.hStam/N)+" → "+pc(press.hStam/N));
  check("キーパーは GK のスタミナを使う",keeper.gkStam<base.gkStam,pc(base.gkStam/N)+" → "+pc(keeper.gkStam/N));
  const best=Math.max(...[center,left,right,both,counter,press,keeper].map(R=>gdOf(R)-gdOf(base)));
  check("どの指示も出しっぱなしでは勝ち筋にならない(得失点差の上積み < 0.3)",best<0.3,
    "最大 "+(best>=0?"+":"")+f2(best));
  const M=E.createMatch(home(),away(),3);
  E.orderMatch(M,"H",{ type:"ins", center:true }); E.orderMatch(M,"H",{ type:"ins", left:true });
  E.stepMatch(M);
  check("指示は項目ごとに独立して残る(同時に点けられる)",M.home.ins.center&&M.home.ins.left&&!M.home.ins.press&&M.home.ins.side===-1);
}

// ---------- ⑦ スキル・スタイル・連携 ----------
console.log("⑦ スキル → スタイル + バフ");
{
  const ids=Object.keys(E.CARDS), skills=Object.keys(E.SKILLS), styles=Object.keys(E.STYLES);
  check("全カードがスキルを持ち、そのスキルが定義済み",ids.every(id=>E.SKILLS[E.CARDS[id].skill]));
  check("全スキルがスタイル・バフ・名前・説明を持つ",
    skills.every(k=>{ const v=E.SKILLS[k]; return E.STYLES[v.style]&&v.buff&&v.label&&v.desc; }));
  const used=new Set(Object.values(E.CHANNELS).flat().map(c=>c.id));
  const chOk=o=>!o||!o.ch||o.ch.every(c=>used.has(c));
  check("スキルとスタイルが指す手札はすべて実在する",
    skills.every(k=>chOk(E.SKILLS[k].buff))&&styles.every(k=>chOk(E.STYLES[k].fx)&&
      (!E.STYLES[k].gain||!E.STYLES[k].gain.chW||Object.keys(E.STYLES[k].gain.chW).every(c=>used.has(c)))));
  const reach=new Set(skills.map(k=>E.SKILLS[k].style));
  check("41種のスタイルすべてに、それを引くスキルがある",styles.length===41&&styles.every(k=>reach.has(k)),
    styles.length+"種 / 引けないもの: "+(styles.filter(k=>!reach.has(k)).join(" ")||"なし"));
  check("全体スタイルは失うものを持つ(ファイティングスピリッツを除く)",
    styles.filter(k=>E.STYLES[k].scope==="team"&&k!=="T17").every(k=>Object.keys(E.STYLES[k].cost).length>0));
  check("全体 17 / 個人 24",styles.filter(k=>E.STYLES[k].scope==="team").length===17&&
    styles.filter(k=>E.STYLES[k].scope==="solo").length===24);

  // ---- KP の指定 = スタイルの発動 ----
  const M=E.createMatch(home(),away(),5);
  check("既定の KP のスキルが引くスタイルが発動している",M.home.style==="K08"&&!!M.home.rank,
    M.home.style+" ランク"+M.home.rank);
  for(let i=0;i<5;i++)E.stepMatch(M);
  E.orderMatch(M,"H",{ type:"kp", id:"h07" }); E.stepMatch(M);
  check("試合中に KP を替えるとスタイルが替わる",M.home.kp==="h07"&&M.home.style==="T01"&&
    M.home.players.filter(p=>p.kp).length===1&&M.events.some(e=>e.type==="kp"&&e.id==="h07"),M.home.style);
  E.orderMatch(M,"H",{ type:"kp", id:"h16" }); E.stepMatch(M);
  check("盤面に居ない選手は KP にできない",M.home.kp==="h07");
  E.orderMatch(M,"H",{ type:"sub", out:"h07", in:"h14" }); E.stepMatch(M);
  check("KP を交代で下げるとスタイルが消える",M.home.kp===null&&M.home.style===null);

  // ---- スタイルを1つずつ測る。ランクは A に固定して比べる ----
  const th0=E.TUNING.rank.th;
  const setRank=r=>{ E.TUNING.rank.th=r==="C"?[99,99,99]:r==="S"?[0,0,0]:[0,0,99]; };
  const skillFor={}; skills.forEach(k=>{ if(!skillFor[E.SKILLS[k].style])skillFor[E.SKILLS[k].style]=k; });
  // そのスタイルを持たせる選手(役割が合う場所)
  const who=id=>{
    const st=E.STYLES[id];
    if(st.scope==="team")return "h07";
    return ({ K03:"h10", K08:"h10", K10:"h10", K17:"h10", K05:"h09", K06:"h09", K11:"h06", K19:"h06",
      K12:"h02", K15:"h03", K16:"h03", K18:"h03", K21:"h01", K22:"h01", K23:"h01", K24:"h01" })[id]||"h08";
  };
  const withStyle=id=>M=>{
    const p=M.home.players.find(q=>q.id===who(id));
    p.c=Object.assign({},p.c,{ skill:skillFor[id] });
    E.orderMatch(M,"H",{ type:"kp", id:p.id });
  };
  const noKp=M=>{ M.home.players.forEach(p=>p.kp=false); M.home.kp=null; };
  const N2=Math.min(N,600);
  setRank("A");
  const none=run(N2,1000,noKp), r={};
  console.log("  全体スタイル(KP なしとの差。ランク A・"+N2+"試合)");
  show("KP なし",none);
  for(const id of styles){
    r[id]=run(N2,1000,withStyle(id));
    if(E.STYLES[id].scope==="team")show(id+" "+E.STYLES[id].name.slice(0,9),r[id]);
  }
  console.log("  個人スタイル(得失点差の変化)");
  console.log("    "+styles.filter(k=>E.STYLES[k].scope==="solo")
    .map(k=>E.STYLES[k].name+" "+(gdOf(r[k])-gdOf(none)>=0?"+":"")+f2(gdOf(r[k])-gdOf(none))).join(" / "));
  const d=id=>gdOf(r[id])-gdOf(none), pr=R=>R.hPassOk/R.hPass, po=R=>R.hSteps/R.steps;
  check("ショートパスワーク: パスが通り支配率が上がるが、シュートが減る",
    pr(r.T01)>pr(none)&&po(r.T01)>po(none)&&r.T01.hSh<none.hSh);
  check("ダイレクトプレイ: パスが通りにくい",pr(r.T02)<pr(none),pc(pr(none))+" → "+pc(pr(r.T02)));
  check("スルーパス重視: 自分のオフサイドが増える",r.T05.hOff>none.hOff*1.15,
    f2(none.hOff/N2)+" → "+f2(r.T05.hOff/N2));
  const teamIds=styles.filter(k=>E.STYLES[k].scope==="team"&&k!=="T08");
  const avgRecv=teamIds.reduce((s,k)=>s+r[k].kpRecv,0)/teamIds.length;
  check("キープレイヤーアタック: KP が受ける回数が増える(ほかの全体スタイルの平均の1.4倍以上)",
    r.T08.kpRecv>avgRecv*1.4,f2(avgRecv/N2)+" → "+f2(r.T08.kpRecv/N2));
  check("プレッシング: 相手のパスが通らず、スタミナを使う",
    r.T11.aPassOk/r.T11.aPass<none.aPassOk/none.aPass&&r.T11.hStam<none.hStam);
  check("リトリート: 相手の枠内シュートが減る",r.T12.aOnT<none.aOnT,
    f2(none.aOnT/N2)+" → "+f2(r.T12.aOnT/N2));
  check("ラインコントロール: 相手のオフサイドが増える",r.T13.aOff>none.aOff*1.3,
    f2(none.aOff/N2)+" → "+f2(r.T13.aOff/N2));
  const worst=styles.reduce((a,k)=>d(k)<d(a)?k:a), top=styles.reduce((a,k)=>d(k)>d(a)?k:a);
  console.log("    得失点差の変化: 最大 "+E.STYLES[top].name+" "+f2(d(top))+" / 最小 "+E.STYLES[worst].name+" "+f2(d(worst)));
  check("どのスタイルも単独では勝ち筋にならない(上積み < 0.45)",d(top)<0.45,E.STYLES[top].name+" +"+f2(d(top)));
  check("どのスタイルも選ぶと大損にはならない(> -0.35)",d(worst)>-0.35,E.STYLES[worst].name+" "+f2(d(worst)));

  // ---- ランク: 得るものにだけ掛かる ----
  setRank("C"); const lo=run(N2,1000,withStyle("T01"));
  setRank("S"); const hi=run(N2,1000,withStyle("T01"));
  check("ランクが高いほどスタイルが効く(ショートパスワークのパス成功率)",pr(hi)>pr(r.T01)&&pr(r.T01)>pr(lo),
    "C "+pc(pr(lo))+" / A "+pc(pr(r.T01))+" / S "+pc(pr(hi)));
  check("失うものはランクが低くても満額(シュートは C でも減る)",lo.hSh<none.hSh,
    f2(none.hSh/N2)+" → "+f2(lo.hSh/N2));

  // ---- アンチキープレイヤー: 相手の KP を抑える ----
  setRank("A");
  const oppRecv=prep=>{ let n=0;
    for(let i=0;i<300;i++){
      const M=E.createMatch(home(),away(),40000+i); prep(M); E.finishMatch(M);
      n+=M.events.filter(e=>e.side==="A"&&e.type==="pass"&&e.ok&&e.to===M.away.kp).length;
    }
    return n/300; };
  const a0=oppRecv(noKp), a1=oppRecv(withStyle("T16"));
  check("アンチキープレイヤー: 相手の KP が受ける回数が減る",a1<a0*0.85,f2(a0)+" → "+f2(a1));
  { const M=E.createMatch(home(),away(),9); withStyle("T16")(M); E.stepMatch(M);
    check("アンチキープレイヤー: 相手のスタイルの効きが落ちる",M.away.rk<M.away.rk0,
      f2(M.away.rk0)+" → "+f2(M.away.rk)); }
  E.TUNING.rank.th=th0;

  // ---- 実際のランク(固定を外して) ----
  { const M=E.createMatch(home(),away(),1);
    const ax=T=>Object.keys(E.AXIS_LABEL).map(a=>{ const sk=skills.find(k=>E.STYLES[E.SKILLS[k].style].axis===a);
      const p=T.players[5]; const keep=p.c; p.c=Object.assign({},keep,{ skill:sk });
      T.players.forEach(q=>q.kp=q===p); E.stepMatch(M); const s=a+" "+f2(T.axis)+"("+T.rank+")"; p.c=keep; return s; }).join(" ");
    console.log("    戦力グラフ  AZR: "+ax(M.home)+"  /  ROS: "+ax(M.away)); }

  // ---- バフと連携 ----
  const strip=T=>{ T.players.forEach(p=>p.c=Object.assign({},p.c,{ skill:null }));
    T.bench=T.bench.map(c=>Object.assign({},c,{ skill:null })); };
  const noSk=run(N,1000,M=>strip(M.home)), noLink=run(N,1000,M=>{ M.home.links=[]; });
  line("基準",base); line("ホームのスキル無し",noSk); line("ホームの KP 無し",none); line("ホームの連携無し",noLink);
  check("スキルを外すと弱くなる(バフとスタイルの両方が消える)",gdOf(noSk)<gdOf(base)-0.1,
    f2(gdOf(base))+" → "+f2(gdOf(noSk)));
  check("ただしスキルだけで決まらない(差 < 0.8)",gdOf(base)-gdOf(noSk)<0.8);
  // 固定の線(合計18)は満点(50)の3分の1ほどなので、差は誤差に近い。**強くならない**ことだけを見る
  check("連携を外しても強くはならない(誤差 0.1 以内)。差は小さい(< 0.4)",
    gdOf(noLink)<gdOf(base)+0.1&&gdOf(base)-gdOf(noLink)<0.4,
    f2(gdOf(base))+" → "+f2(gdOf(noLink)));
  const fired=E.simulateMatch(home(),away(),12).events.filter(e=>e.sk||e.dsk).length;
  check("スキルの発動がイベントに残る",fired>5,fired+"回/試合");
}

// ---------- ⑧ スタミナ ----------
console.log("⑧ スタミナ(消耗が見えること・交代が効くこと)");
{
  const gd=R=>(R.hg-R.ag)/R.n;
  let end=[], at60=[], tired=0, ht=0;
  for(let i=0;i<200;i++){
    const M=E.createMatch(home(),away(),61000+i);
    let s60=false, before=0;
    while(!M.over){
      if(!s60&&E.matchMin(M)>=60){ s60=true; M.home.players.forEach(p=>{ if(!p.gk)at60.push(p.stam); }); }
      if(M.ix===M.len1&&!M.ht)before=M.home.players[5].stam;
      const was=M.ht; E.stepMatch(M);
      if(!was&&M.ht)ht+=M.home.players[5].stam-before;
    }
    M.home.players.forEach(p=>{ if(!p.gk)end.push(p.stam); });
    tired+=M.events.filter(e=>e.type==="tired").length;
  }
  const avg=a=>a.reduce((s,v)=>s+v,0)/a.length;
  end.sort((a,b)=>a-b);
  console.log("    60分 平均 "+pc(avg(at60))+"  終了時 平均 "+pc(avg(end))+" / 最も消耗 "+pc(end[0])+
    " / 最も余力 "+pc(end[end.length-1])+"  「足が止まった」 "+f2(tired/200)+"人/試合  HTの回復 +"+pc(ht/200));
  check("終了時の平均が 35〜55%",avg(end)>=0.35&&avg(end)<=0.55,pc(avg(end)));
  check("選手によって差が出る(最大と最小の差 > 20pt)",end[end.length-1]-end[0]>0.2);
  check("足が止まる選手が1試合に 2〜10人",tired/200>=2&&tired/200<=10,f2(tired/200));
  // 交代の価値: 60分に、いちばん消耗した3人を同じポジションの控えと替える
  const subs=M=>{ while(!M.over&&E.matchMin(M)<60)E.stepMatch(M);
    const T=M.home, used=new Set();
    T.players.filter(p=>!p.gk).sort((a,b)=>a.stam-b.stam).slice(0,4).forEach(p=>{
      const c=T.bench.find(b=>b.pos===p.c.pos&&!used.has(b.id));
      if(c&&used.size<3){ used.add(c.id); E.orderMatch(M,"H",{ type:"sub", out:p.id, in:c.id }); }
    }); };
  const withSub=run(N,1000,subs);
  line("60分に3人交代",withSub);
  check("交代すると勝ちやすくなる(得失点差 +0.10 以上)",gd(withSub)>gd(base)+0.10,
    f2(gd(base))+" → "+f2(gd(withSub)));
  check("ただし交代だけで決まらない(+0.6 未満)",gd(withSub)<gd(base)+0.6);
}

// ⑨ 試合の採点(→docs/07 §7.12)。記録から数える。10点満点・0.5刻み
{
  console.log("\n⑨ 試合の採点");
  let sum=0, n=0, hi=0, goals=0, asst=0, mvpGoal=0, bad=0, poss=0;
  const tm=Object.keys(E.TEAMS).filter(k=>E.TEAMS[k].real);
  for(let i=0;i<200;i++){
    const M=E.simulateMatch(E.makeTeamDef("azr",false),E.makeTeamDef(tm[i%tm.length],true),5000+i);
    const R=E.matchRatings(M), S=E.matchStats(M);
    poss+=S.H.poss+S.A.poss;
    for(const x of R.list){ sum+=x.r; n++; if(x.r>=8)hi++; if(x.r*2!==Math.round(x.r*2)||x.r<3.5||x.r>10)bad++; goals+=x.g; asst+=x.a; }
    const m=R.list.find(x=>x.id===R.mvp); if(m&&m.g)mvpGoal++;
    if(R.list.reduce((s,x)=>s+x.g,0)!==M.home.score+M.away.score)bad++;
  }
  console.log("    平均 "+f2(sum/n)+"  8.0以上 "+pc(hi/n)+"  アシスト/得点 "+pc(asst/goals)+"  MVPが得点者 "+pc(mvpGoal/200));
  check("採点は 0.5 刻みで 3.5〜10、得点は記録と一致",bad===0,bad+"件");
  check("平均が 6.0〜6.8",sum/n>=6&&sum/n<=6.8,f2(sum/n));
  check("8.0 以上は珍しい(3〜12%)",hi/n>=0.03&&hi/n<=0.12,pc(hi/n));
  check("支配率は両チームで100%",Math.abs(poss/200-100)<=1,f2(poss/200));
}

// ⑩ 監督能力(→docs/10 §10.2 C)。最高ランクで3つ付けても、軽い上積みにとどまる
{
  console.log("\n⑩ 監督能力");
  const M=E.TUNING.mab, run=mab=>{ let gd=0; for(let i=0;i<N;i++){ const d=E.makeTeamDef("azr",false); d.cpu=true; d.mab=mab;
    const m=E.simulateMatch(d,E.makeTeamDef("ros",true),61000+i); gd+=m.home.score-m.away.score; } return gd/N; };
  const o={}; ["dfc","center","half"].forEach(k=>o[k]=M.base[k]*M.rankK[3]);
  const b=run({}), t=run(o);
  console.log("    なし "+f2(b)+" → マスター3つ "+f2(t));
  check("監督能力は3つ・最高ランクでも上積みが小さい(得失点差 +0.35 未満)",t-b<0.35&&t-b>-0.1,"+"+f2(t-b));
}
// ⑪ ハーフタイムの指示(→docs/10 §10.8)。どの指示も後半の上積みは小さい
{
  console.log("\n⑪ ハーフタイムの指示");
  const run=h=>{ let gd=0; for(let i=0;i<N;i++){ const d=E.makeTeamDef("azr",false); d.cpu=true;
    const M=E.createMatch(d,E.makeTeamDef("ros",true),71000+i); while(!M.ht&&!M.over)E.stepMatch(M);
    if(h)E.orderMatch(M,"H",{ type:"htPlan", up:h.up, down:h.down, k:h.k }); E.finishMatch(M); gd+=M.home.score-M.away.score; } return gd/N; };
  const b=run(null), a=run(E.htOf("t47")), c=run(E.htOf("t8"));   // すべて上がる(非公開練習)/ 守りに寄せる(カテナチオ)
  console.log("    なし "+f2(b)+" ・ 相手の裏をかけ "+f2(a)+" ・ ゴール前に鍵をかけろ "+f2(c));
  check("ハーフタイムの指示の上積みは小さい(±0.25 以内)",Math.abs(a-b)<0.25&&Math.abs(c-b)<0.25);
}
console.log(fail?"\n"+fail+" 件 失敗":"\nすべて通過");
process.exit(fail?1:0);
