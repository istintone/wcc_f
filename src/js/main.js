/* =========================================================================
   wcc_f — 進行。エンジンを1ステップずつ解き、解けたイベントを順に再生する。
   再生速度を変えても、止めても、結果は変わらない(描画は読むだけ)。
   ========================================================================= */

const G={ M:null, seed:1, playing:false, speed:1, queue:[], cur:null, curT:0, hold:0,
  flash:false, last:0, stopAt:0, onOv:null, ins:{}, info:null, kpMode:false,
  rec:[], replay:null };                     // rec … 得点に向かうボールの動き(リプレイ用)
const $=id=>document.getElementById(id);
const SPEEDS=[1,2,4];

/**
 * 試合を始める。クラブハウスからは両クラブの定義と大会の条件が渡る。
 * 何も渡さなければ、その場かぎりの練習試合(検証用の ?quick=1)。
 */
function newMatch(homeDef,awayDef,seed,opts,meta){
  G.seed=seed>>>0;
  G.meta=meta||{ title:"KICK OFF", career:false };
  G.M=createMatch(homeDef||makeTeamDef("azr",false),awayDef||makeTeamDef("ros",true),G.seed,opts);
  G.queue=[]; G.cur=null; G.hold=0; G.playing=false; G.rec=[]; endReplay();
  G.ins={}; G.kpMode=false; G.cutDone=false;
  RV.vis.clear(); RV.ball=[0.5,0.5];
  BD.pendingIn.clear(); BD.kp=null;
  const M=G.M;
  $("hudH").textContent=M.home.short; $("hudA").textContent=M.away.short;
  $("hudHc").innerHTML=emblemSvg(M.home,22); $("hudAc").innerHTML=emblemSvg(M.away,22);
  $("hudComp").textContent=G.meta.career?G.meta.title:"FRIENDLY";
  setHud(0,0,"0'");
  say(teamNameOf(M.home)+" vs "+teamNameOf(M.away));
  hideInfo();
  buildBoard(M);
  updateCtl();
  overlay("KICK OFF",'<small>'+G.meta.title+'</small>'+
    (G.M.opts.agg?'<small>第1試合 '+G.M.opts.agg[0]+' - '+G.M.opts.agg[1]+'</small>':'')+(G.M.opts.ko?'<small>同点なら PK 戦</small>':''),
    TUNING.play.capKick,()=>setPlaying(true));
}

/* ---- 表示まわり ---- */
function setHud(hg,ag,clock){
  $("hudScore").textContent=hg+" - "+ag;
  $("hudClock").textContent=clock;
}
function say(text,goal){
  const t=$("ticker"); t.textContent=text; t.classList.toggle("goal",!!goal);
}
function updateCtl(){
  if(G.M&&$("btnShoot"))$("btnShoot").classList.toggle("armed",G.M.home.shootOrder>0);
  $("btnSpeed").textContent="×"+G.speed;
  $("subInfo").textContent="交代 "+(G.M.home.subs+BD.pendingIn.size)+"/"+TUNING.squad.subMax;
  $("btnKp").classList.toggle("on",G.kpMode);
  $("board").classList.toggle("kpmode",G.kpMode);
  for(const [id,k] of INS_BTN)$(id).classList.toggle("on",!!G.ins[k]);
  updateStyleBar();
}
/** いま有効なスタイルを両チームぶん出す(映像の下の帯) */
function styleText(T,pendingKp){
  const id=pendingKp||T.kp, c=id?CARDS[id]:null, st=c?styleOfCard(c):null;
  if(!st)return "KP なし";
  const rank=pendingKp?rankOf(axisVal(T,st.axis)):T.rank||rankOf(axisVal(T,st.axis));
  return "KP "+nameOf(c)+"｜"+st.name+" <b class=\"rk rk"+rank+"\">"+rank+"</b>";
}
function updateStyleBar(){
  $("styH").innerHTML=styleText(G.M.home,BD.kp);
  $("styA").innerHTML=styleText(G.M.away,null);
}
function setPlaying(v){ G.playing=v; updateCtl(); if(v){ sndCrowd(true); wakeLock(true); } }
/** 試合が始まってから終わるまで画面を消さない(止めて考えている間も)。対応していない端末では何もしない */
const WL={ s:null, want:false };
function wakeLock(on){
  WL.want=on;
  try{
    if(on&&!WL.s&&navigator.wakeLock)navigator.wakeLock.request("screen").then(s=>{
      if(!WL.want){ s.release().catch(()=>{}); return; }
      WL.s=s; s.addEventListener("release",()=>{ if(WL.s===s)WL.s=null; });
    }).catch(()=>{});
    else if(!on&&WL.s){ const s=WL.s; WL.s=null; s.release().catch(()=>{}); }
  }catch(e){}
}
/**
 * 試合の区切りの字幕(→docs/07 §7.11)。モニターの上に中継の字幕として出し、ms ミリ秒で自動で消えて fn を呼ぶ(本家と同じく強制で進む)。
 * 出ているあいだ試合は止まる。盤面のカードは触れる
 */
function overlay(title,body,ms,fn){
  const c=$("cap");
  c.innerHTML='<b>'+title+'</b>'+(body?'<div>'+body+'</div>':'');
  c.className="on"; G.onOv=fn; G.capT=ms;
}
const capOn=()=>$("cap").classList.contains("on");
/** 指示の軸を短く(例: OFE・奪取↑ スピード↓) */
const HT_AX={ O:"攻", D:"守", R:"支", C:"奪", S:"速", P:"力" };
const htAxTxt=h=>h.up.split("").map(a=>HT_AX[a]).join("")+"↑"+(h.down?" "+h.down.split("").map(a=>HT_AX[a]).join("")+"↓":"");
function closeOverlay(){
  $("cap").className=""; G.capT=0;
  const fn=G.onOv; G.onOv=null;
  if(fn)fn();
}
function onSubQueued(){ updateCtl(); say("交代を指示(次のプレーで入る)"); }
/** KP を替える。エンジンには次のステップで渡り、それまでは盤面に仮の印を出す */
function pickKp(id){
  if(G.M.over||!G.M.home.players.some(p=>p.id===id))return;
  orderMatch(G.M,"H",{ type:"kp", id });
  BD.kp=id; G.kpMode=false;
  const st=styleOfCard(CARDS[id]);
  say("KP "+nm(id)+(st?" ▶ "+st.name:""),true);
  syncBoard(G.M); updateCtl();
}
/** 盤面のカードをタップしたとき。KP ボタンを押したあとなら KP に。詳細は長押し(→board.js) */
function tapCard(id){ if(G.kpMode)pickKp(id); else if(G.info===id)hideInfo(); else say("長押しでカードの裏を見る ・ KP ボタン → タップで KP"); }
/** 十字の戦術ボタン + キーパー(→docs/04 §4.9b)。どれも同時に点けられ、もう一度押すと消える */
const INS_BTN=[["btnCenter","center"],["btnLeft","left"],["btnRight","right"],["btnCounter","counter"],["btnPress","press"],["btnKeeper","keeper"]];
function toggleIns(key){
  if(!G.M||G.M.over)return;
  G.ins[key]=!G.ins[key];
  orderMatch(G.M,"H",Object.assign({ type:"ins" },{ [key]:G.ins[key] }));
  updateCtl();
}

/* ---- カードの詳細(タップで開く) ---- */
function showInfo(id){
  const M=G.M, p=M.home.players.find(q=>q.id===id);
  // 育成を反映したカード(盤面の選手か控え)を見せる。無ければ元のカード
  const c=(p&&p.c)||M.home.bench.find(b=>b.id===id)||CARDS[id];
  if(!c)return;
  const sk=c.skill?SKILLS[c.skill]:null;
  const kp=(BD.kp||M.home.kp)===id, st=styleOfCard(c);
  const rank=st?rankOf(axisVal(M.home,st.axis)):null;
  const bar=k=>'<span class="st"><i>'+STAT_LABEL[k]+'</i><b>'+(Math.round(c[k]*10)/10)+'</b><em><u style="width:'+
    (c[k]/STAT_MAX*100)+'%"></u></em></span>';
  $("infoBody").innerHTML=
    '<h2><span class="pos '+c.pos.toLowerCase()+'">'+c.pos+'</span>'+c.no+' '+nameOf(c)+
      (kp?' <span class="kpt">KP</span>':'')+(p&&p.yc?' <span class="yct">警告</span>':'')+
      (c.is!=null?' <small class="stars">個'+"★".repeat(c.is)+' 特'+"★".repeat(c.ss)+'</small>':'')+'</h2>'+
    '<div class="roles">'+(c.age?c.age+'歳 ・ ':'')+'得意: '+c.roles.join(" / ")+(p?'　いま: '+p.role+'(適性 '+Math.round(p.apt*100)+'%)'+
      '　体力 <b class="'+(p.stam<0.4?"lo":p.stam<0.6?"md":"hi")+'">'+Math.round(p.stam*100)+'%</b>':'　控え')+'</div>'+
    '<div class="sts">'+STATS.map(bar).join("")+'</div>'+
    '<div class="skl">'+(sk?'<b>★'+sk.label+'</b> '+sk.desc+'(常時)':'スキルなし')+'</div>'+
    (st?'<div class="sty"><b>KP スタイル: '+st.name+'</b> <i>'+(st.scope==="team"?"全体":"個人")+'・'+
      AXIS_LABEL[st.axis]+'</i> <b class="rk rk'+rank+'">ランク'+rank+'</b><br>'+
      '<span class="get">○ '+st.get+'</span>'+(st.lose?'<br><span class="lose">× '+st.lose+'</span>':'')+'</div>':'');
  const b=$("infoKp");
  b.style.display=p?"":"none";
  b.disabled=kp||M.over;
  b.textContent=kp?"KP に指定中":"KP にする";
  updateStyleBar();
  G.info=id;
  $("info").classList.add("on");
}
function hideInfo(){ $("info").classList.remove("on"); G.info=null; }

const nm=id=>{ const c=CARDS[id]; return c?nameOf(c):""; };
const tag=ev=>"["+teamOf(G.M,ev.side).short+"] ";
const skt=s=>s?" ★"+s:"";
function sayStart(ev){
  if(ev.type==="kickoff")return say(tag(ev)+"キックオフ");
  if(ev.type==="shot")
    return say(tag(ev)+(ev.nk?"指名キッカーの":"")+nm(ev.by)+(ev.sp==="pk"?"のPK！":ev.sp==="fk"?"が直接狙う！":ev.sp==="hdr"?"のヘディング！":"のシュート！"));
  if(ev.type==="offside")return say(tag(ev)+nm(ev.by)+"の"+ev.label+" → "+nm(ev.to)+"はオフサイド");
  if(ev.type==="cross")
    return say(tag(ev)+nm(ev.by)+"の"+ev.label+(ev.ok?" → "+nm(ev.to)+"が競り勝つ":"は"+nm(ev.vs)+"がはね返す"));
  const tail=ev.foul?"(反則)":ev.ck?"、コーナーへ":ev.out?"、タッチを割る":"";
  if(ev.type==="pass")
    return say(tag(ev)+(ev.ok?nm(ev.by)+" "+ev.label+" → "+nm(ev.to)+skt(ev.sk)
      :nm(ev.by)+"の"+ev.label+"を"+nm(ev.vs)+"がカット"+skt(ev.dsk)+tail));
  if(ev.type==="carry")
    return say(tag(ev)+(ev.ok?nm(ev.by)+"の"+ev.label+skt(ev.sk)
      :nm(ev.vs)+"が"+nm(ev.by)+"を止める"+skt(ev.dsk)+tail));
}
function sayShotEnd(ev){
  if(ev.res==="goal")return say("⚽ GOAL! "+tag(ev)+nm(ev.by)+skt(ev.sk),true);
  if(ev.res==="save")
    return say(tag(ev)+nm(ev.by)+"のシュートは"+nm(ev.gk)+"がセーブ"+skt(ev.dsk)+(ev.ck?"、コーナーへ":ev.reb?"、こぼれ球！":""));
  if(ev.res==="miss")return say(tag(ev)+nm(ev.by)+"のシュートは枠の外");
  if(ev.res==="block")
    return say(tag(ev)+nm(ev.by)+"のシュートは"+(ev.wall?"壁に当たる":nm(ev.vs)+"がブロック"+skt(ev.dsk))+
      (ev.foul?"…反則！":ev.ck?"、コーナーへ":""));
}
function sayFoul(ev){
  const card=ev.card==="r"?" 🟥一発退場":ev.card==="yr"?" 🟨🟥2枚目で退場":ev.card==="y"?" 🟨警告":"";
  const set=ev.set==="pk"?" → PK！":ev.set==="fk"?" → フリーキック":"";
  say(tag(ev)+nm(ev.by)+"が"+nm(ev.on)+"に反則"+card+set,ev.set==="pk");
}
function statsHtml(){
  const H=G.M.home, A=G.M.away, tot=H.st.steps+A.st.steps||1;
  const pct=(a,b)=>b?Math.round(a/b*100)+"%":"-";
  const row=(a,l,b)=>"<tr><td>"+a+"</td><td>"+l+"</td><td>"+b+"</td></tr>";
  return "<b>"+H.score+" - "+A.score+"</b><table>"+
    row(H.st.shots,"シュート",A.st.shots)+row(H.st.onT,"枠内",A.st.onT)+
    row(pct(H.st.steps,tot),"支配率",pct(A.st.steps,tot))+
    row(pct(H.st.passOk,H.st.pass),"パス成功",pct(A.st.passOk,A.st.pass))+
    row(H.st.ck,"コーナー",A.st.ck)+row(H.st.fouls,"反則",A.st.fouls)+
    row(H.st.yc+" / "+H.st.rc,"警告 / 退場",A.st.yc+" / "+A.st.rc)+
    row(H.st.off,"オフサイド",A.st.off)+"</table>";
}

/* ---- 再生 ---- */
function startEvent(ev){
  const P=TUNING.play;
  if(ev.type==="sub"){
    if(ev.side==="H"){ BD.pendingIn.delete(ev.in); buildBoard(G.M); updateCtl(); }
    say("["+teamOf(G.M,ev.side).short+"] 交代 "+nm(ev.out)+" → "+nm(ev.in));
    G.hold=350;
    return;
  }
  if(ev.type==="posture"){
    const T=teamOf(G.M,ev.side);
    say("["+T.short+"] "+(ev.mode==="attack"?"前がかりになった":ev.mode==="defend"?"中央を固めてきた":"構えを戻した"));
    G.hold=500;
    return;
  }
  if(ev.type==="kp"){
    const st=styleOfCard(CARDS[ev.id]);
    say(tag(ev)+"KP "+nm(ev.id)+(ev.rare?" ▶ ★"+ev.rare:st?" ▶ "+st.name:""),true);
    syncBoard(G.M); updateStyleBar(); G.hold=ev.side==="H"?500:900;
    if(ev.rare){ const p=playerOf(teamOf(G.M,ev.side),ev.id); G.hold=TUNING.rare.cutMs; cutIn(p?p.c:CARDS[ev.id],ev.side); }   // レアKP(→docs/11)
    return;
  }
  if(ev.type==="shootCall"){
    if(ev.side==="H"){ const f=$("flash"); f.innerHTML='<b>SHOOT!</b>'; f.className="on mine sh"; G.flash=true; G.hold=420; }
    return;
  }
  if(ev.type==="injury"){
    say(tag(ev)+nm(ev.by)+"が負傷(このまま出ると能力が落ちる)"+(ev.side==="H"?" ・ 控えと交代できる":""),ev.side==="H");
    sndAww(); syncBoard(G.M); G.hold=ev.side==="H"?1100:500;
    return;
  }
  if(ev.type==="tired"){
    say(tag(ev)+nm(ev.by)+"の足が止まった");
    syncBoard(G.M); G.hold=ev.side==="H"?700:300;
    return;
  }
  if(ev.type==="shape"){                     // 相手監督の陣形の変更(→docs/13)。実況の1行で知らせる
    say(tag(ev)+(ev.shape==="pp"?"パワープレー！ 前線に人数をかけてきた":ev.shape==="shield"?"守備固め。前の選手を下げて逃げ切りを図る":"陣形を元に戻した"),ev.shape!=="none");
    G.hold=ev.shape==="none"?400:800;
    return;
  }
  if(ev.type==="ins"){
    if(ev.side==="H")return;                 // 自分の指示はボタンに出ている
    const a=[["center","中央突破"],["left","左サイド"],["right","右サイド"],["counter","カウンター"],["press","プレス"],["keeper","キーパー"]]
      .filter(k=>ev[k[0]]).map(k=>k[1]);
    say(tag(ev)+"指示: "+(a.join("・")||"解除"));
    G.hold=500;
    return;
  }
  if(ev.type==="foul"){
    sndWhistle(1);
    sayFoul(ev);
    if(ev.card==="r"||ev.card==="yr"){ if(ev.side==="H")buildBoard(G.M); G.hold=P.cardHold; }
    else G.hold=ev.card||ev.set!=="re"?P.foulHold:P.foulHold*0.5;
    syncBoard(G.M);
    return;
  }
  if(ev.type==="pso"){
    if(ev.ok)sndGoal(ev.side==="H"); else sndAww();
    say(tag(ev)+"PK戦 "+nm(ev.by)+(ev.ok?" 決めた":" 失敗")+"("+ev.h+" - "+ev.a+")",ev.ok);
    G.hold=P.psoHold;
    return;
  }
  if(ev.type==="halftime"){
    sndWhistle(2,true);
    setPlaying(false);
    setHud(ev.hg,ev.ag,"HT");
    const H=G.M.home.st, A=G.M.away.st, all=(H.steps+A.steps)||1;
    // ハーフタイムの指示(→docs/10 §10.8): 登録した3つ + 「このまま維持しろ」(何も変えない)。時間が来たら維持のまま後半へ
    const set=(CL&&CL.S&&CL.S.ht&&G.meta.career?CL.S.ht.set:["b1","b2","b3"]).map(htOf).filter(Boolean);
    const btns=set.map(h=>'<button class="htb" data-ht="'+h.id+'">'+h.name+'<i>'+htAxTxt(h)+'</i></button>').join("")+'<button class="htb none" data-ht="">このまま維持しろ<i>変化なし</i></button>';
    overlay("HALF TIME",'<span class="sc">'+ev.hg+' - '+ev.ag+'</span><small>シュート '+H.shots+' - '+A.shots+' ・ 支配率 '+
      Math.round(H.steps/all*100)+'% - '+Math.round(A.steps/all*100)+'%</small><div class="ht-btns">'+btns+'</div>',TUNING.ht.timer,()=>setPlaying(true));
    return;
  }
  if(ev.type==="fulltime"){
    sndWhistle(3,true);
    setPlaying(false); wakeLock(false);
    setHud(ev.hg,ev.ag,"FT");
    const H=G.M.home, A=G.M.away, pso=G.M.pso;
    const d=pso?pso[0]-pso[1]:H.score-A.score;
    // 試合の結果は結果の画面で出すので、ここは短い字幕だけ。数秒で結果へ(練習試合は次の試合へ)
    overlay("FULL TIME",'<span class="sc">'+H.score+' - '+A.score+'</span>'+(pso?'<small>PK '+pso[0]+' - '+pso[1]+'</small>':''),TUNING.play.capEnd,
      ()=>{ if(G.meta.career)finishFixture(G.M); else newMatch(null,null,G.seed+1); });
    return;
  }
  if(!ev.from)return;                        // 知らない種類のイベントは読み飛ばす
  if(ev.type==="kickoff")sndWhistle(1);
  // 試合の初めのキックオフ: レアKP が発動しているチームはカットイン(→docs/11 §11.6)
  if(ev.type==="kickoff"&&ev.min===0&&!G.cutDone){
    G.cutDone=true;
    const q=[G.M.home,G.M.away].filter(T=>T.rare).map(T=>({ T, p:T.players.find(x=>x.kp) })).filter(o=>o.p);
    if(q.length){ G.hold=TUNING.rare.cutMs*q.length;
      const nx=i=>{ if(i<q.length)cutIn(q[i].p.c,q[i].T.side,TUNING.rare.cutMs-60,()=>nx(i+1)); }; nx(0); }
  }
  if(ev.type==="shot"&&ev.mv&&ev.mv!==RARE_MOVES.godsave.label)mvFlash(ev);      // ロングシュート・オーバーヘッドは撃つ前に
  if(ev.type==="shot")sndKick();
  ev.dur=ev.type==="shot"?P.shotMs:ev.type==="kickoff"?P.kickMs:ev.type==="cross"?P.stepMs*1.3:P.stepMs;
  const lr=G.rec[G.rec.length-1];
  if(ev.type==="kickoff"||(lr&&lr.side!==ev.side))G.rec=[];
  G.rec.push(ev); if(G.rec.length>P.replayN)G.rec.shift();
  G.cur=ev; G.curT=0;
  $("hudClock").textContent=ev.min+(ev.at?"+":"'");
  sayStart(ev);
}
function endEvent(ev){
  const P=TUNING.play;
  if(ev.type==="offside"){ G.hold=P.foulHold; return; }
  if(ev.type!=="shot"){ if(ev.mv)mvFlash(ev); return; }
  sayShotEnd(ev);
  if(ev.res==="save"&&ev.mv===RARE_MOVES.godsave.label){ mvFlash(ev); return; }   // 神セーブ
  if(ev.res==="goal"){
    setHud(ev.hg,ev.ag,ev.min+(ev.at?"+":"'"));
    const f=$("flash"); f.innerHTML='<b>GOAL!</b><i>'+nm(ev.by)+'</i><small>'+teamOf(G.M,ev.side).short+'</small>';
    f.className="on"+(ev.side==="H"?" mine":""); G.flash=true;
    sndGoal(ev.side==="H");
    G.hold=P.goalHold;
    if(G.speed===1&&G.rec.length)G.replay={ list:G.rec.slice(), i:0 };   // 倍速のときは流さない
    G.rec=[];
  }else{ G.hold=P.shotHold; if(ev.res==="save"||ev.res==="miss")sndAww(); }
}
/** 技の名前をモニターに大きく出す(→docs/11 §11.6) */
function mvFlash(ev){
  const f=$("flash"), T=teamOf(G.M,ev.side), mine=(ev.mvBy&&playerOf(G.M.home,ev.mvBy))?" mine":"";
  f.innerHTML='<b>'+ev.mv+'！</b><i>'+nm(ev.mvBy)+'</i><small>RARE KP</small>';
  f.className="on mv"+mine; G.flash=true; G.hold=Math.max(G.hold||0,TUNING.rare.mvHold);
  if(typeof sndShimmer==="function")sndShimmer(false);
}
function advance(dt){
  if(G.hold>0){
    G.hold-=dt;
    if(G.hold<=0&&G.flash){ $("flash").className=""; G.flash=false; }
    return;
  }
  if(G.replay){ stepReplay(dt); return; }
  if(G.cur){
    G.curT+=dt;
    if(G.curT>=G.cur.dur){ const ev=G.cur; G.cur=null; endEvent(ev); syncBoard(G.M); }
    return;
  }
  if(!G.queue.length){
    if(G.M.over)return;
    if(G.stopAt&&matchMin(G.M)>=G.stopAt){ G.stopAt=0; setPlaying(false); return; }
    G.queue=stepMatch(G.M);
    $("btnShoot").classList.toggle("armed",G.M.home.shootOrder>0);
    BD.kp=null;                              // KP の指定はエンジンに渡った
    updateStyleBar();
    syncBoard(G.M);
  }
  const ev=G.queue.shift();
  if(ev)startEvent(ev);
}
/* ---- ゴールのリプレイ(→docs/07 §7.12)。記録したイベントを遅く描き直すだけで、試合は進めない ---- */
function stepReplay(dt){
  const R=G.replay, P=TUNING.play;
  if(!R.on){ R.on=true; $("replay").classList.add("on"); G.cur=null; }
  if(G.cur){
    G.curT+=dt*P.replaySlow;
    if(G.curT>=G.cur.dur)G.cur=null;
    return;
  }
  const ev=R.list[R.i++];
  if(!ev){ endReplay(); G.hold=P.replayEnd; return; }
  G.cur=ev; G.curT=0;
}
function endReplay(){
  if(G.replay&&G.replay.on)G.cur=null;
  G.replay=null; const b=$("replay"); if(b)b.classList.remove("on");
}
function skipReplay(){ if(!G.replay)return; endReplay(); G.hold=200; sndUi("tap"); }
function frame(ts){
  const dt=Math.min(100,ts-(G.last||ts)); G.last=ts;
  if(G.capT>0){ G.capT-=dt; if(G.capT<=0)closeOverlay(); }   // 字幕は実時間で数える(倍速に関わらず数秒)
  if(G.playing&&!capOn())advance(dt*G.speed);
  // 監督室や場面に隠れている間は描かない(電池)。試合の画面が見えている間だけ
  const hidden=document.getElementById("club").classList.contains("on")||document.getElementById("scene").classList.contains("on");
  if(!hidden)drawFrame(G,dt);
  // 攻め込むほど歓声が大きい(どちらのゴールに近いか)
  if(G.playing&&G.M&&G.M.ball)sndCrowdLevel(Math.max(0,(G.M.ball.h-0.62)/0.38));
  requestAnimationFrame(frame);
}

/* ---- 起動 ---- */
function boot(){
  initView(); initBoard();
  $("btnSpeed").addEventListener("click",()=>{
    G.speed=SPEEDS[(SPEEDS.indexOf(G.speed)+1)%SPEEDS.length]; updateCtl();
    if(G.speed>1&&G.replay){ endReplay(); G.hold=200; }   // 倍速にしたらリプレイは飛ばす
  });
  // SHOOT(→docs/08 §8.12): 押すと「撃て」が残り、光っている間にもう一度押すと取り消し
  $("btnShoot").addEventListener("click",()=>{
    const armed=G.M.home.shootOrder>0||$("btnShoot").classList.contains("armed");
    orderMatch(G.M,"H",{ type:armed?"shootCancel":"shoot" });
    $("btnShoot").classList.toggle("armed",!armed);
    say(armed?"シュートの指示を取り消した":"シュートを狙え(敵陣の深い所で撃つ)");
  });
  $("btnKp").addEventListener("click",()=>{
    if(G.M.over)return;
    G.kpMode=!G.kpMode; hideInfo();
    if(G.kpMode)say("KP にする選手のカードをタップ(もう一度 KP ボタンで取り消し)");
    updateCtl();
  });
  for(const [id,k] of INS_BTN)$(id).addEventListener("click",()=>toggleIns(k));
  $("replay").addEventListener("click",skipReplay);
  // ハーフタイムの指示を選ぶ(字幕の中のボタン)
  $("cap").addEventListener("click",e=>{
    const b=e.target.closest("[data-ht]"); if(!b)return;
    const h=htOf(b.dataset.ht);
    if(h){ orderMatch(G.M,"H",{ type:"htPlan", up:h.up, down:h.down, k:h.k, name:h.name }); say("ハーフタイムの指示: 「"+h.name+"」"); }
    else say("ハーフタイムの指示: 「このまま維持しろ」");
    sndUi("ok"); closeOverlay();
  });
  // 「TOUCH で再開」の字幕(時間で消えない)は、画面のどこを触っても再開する
  document.addEventListener("pointerdown",()=>{ if(capOn()&&G.capT<=0&&G.onOv)closeOverlay(); },true);
  $("infoClose").addEventListener("click",hideInfo);
  $("info").addEventListener("click",e=>{ if(e.target===$("info"))hideInfo(); });
  $("subYes").addEventListener("click",()=>answerSub(true));
  $("subNo").addEventListener("click",()=>answerSub(false));
  $("infoKp").addEventListener("click",()=>{
    if(!G.info||G.M.over)return;
    const id=G.info;
    pickKp(id); showInfo(id);
  });
  document.addEventListener("visibilitychange",()=>{
    // 裏に回ったら止め、戻ったら中継の字幕「TOUCH で再開」を出す(一時停止ボタンは無いので、ここで必ず戻れるようにする)
    if(document.hidden&&G.playing){ setPlaying(false); G.resume=true; }
    if(!document.hidden&&G.resume&&!G.M.over&&!capOn())overlay("中継再開",'<small>TOUCH で再開</small>',0,()=>{ G.resume=false; setPlaying(true); });
    sndSuspend(document.hidden);               // 裏に回ったら音を止め、戻ったら鳴らせる状態に戻す
  });
  // iOS のピンチ・ダブルタップ拡大を止める
  document.addEventListener("gesturestart",e=>e.preventDefault());
  document.addEventListener("touchmove",e=>{ if(e.touches.length>1)e.preventDefault(); },{ passive:false });

  document.getElementById("club").addEventListener("click",onClubClick);
  applyTheme(storedTheme());                   // テーマ(→settings.js)
  sceneInit();
  // 押したら必ず音が返る(→docs/07 §7.3)
  // 音は離したとき(click)に鳴らす。pointerdown だと、一覧をなでてスクロールしただけで鳴る
  document.addEventListener("click",e=>{ if(e.target.closest&&e.target.closest(".btn,.tab,.tr,.chipb,.kc,.cd"))sndUi("tap"); },true);
  // iPhone は電話・通知・裏に回ったあと音が止まる(interrupted)。触ったら戻す
  document.addEventListener("pointerdown",()=>{ if(SND.ctx&&SND.ctx.state!=="running")sndUnlock(); },true);
  // 監督ライセンス・監督契約の入力欄は、打つたびに下書き(CL.draft)へ。日付・決定のときは画面を作り直してプレビューを更新
  document.getElementById("club").addEventListener("input",e=>{
    const f=e.target.dataset&&e.target.dataset.f; if(!f)return;
    const d=CL.draft||(CL.draft={}), v=e.target.value;
    if(f==="mname"||f==="birth")d[f]=v; else if(d.c){ if(f==="cname")d.c.name=v; else if(f==="cshort")d.c.short=v; }
  });
  document.getElementById("club").addEventListener("change",e=>{
    const f=e.target.dataset&&e.target.dataset.f; if(f==="birth"||f==="cname"){ showClub(true); return; } if(e.target.dataset&&e.target.dataset.file)onSettingsFile(e.target); });
  loadStoredPack();                           // 端末に保存した実名パック(→settings.js)
  // ホーム画面に追加した版(http/https で配ったとき)はオフラインでも動くようにする。file:// では何もしない
  if(/^https?:$/.test(location.protocol)&&"serviceWorker" in navigator)
    navigator.serviceWorker.register("sw.js").catch(()=>{});
  // 検証用: ?quick=1&seed=7&auto=1&speed=8&stopat=30&ff=1 (quick = クラブハウスを通さず1試合だけ)
  const q=new URLSearchParams(location.search);
  const seed0=+q.get("seed")||(Date.now()&0x7fffffff);
  if(!q.get("quick")){
    newMatch(null,null,seed0);                // 盤面と映像を先に作っておく(クラブハウスの下に隠れる)
    closeOverlay(); setPlaying(false);
    initCareer(seed0);
    if(!q.get("notitle"))sceneTitle(()=>sceneHide());
    updateCtl();
    requestAnimationFrame(frame);
    if(!document.documentElement.dataset.boot)document.documentElement.dataset.boot="ok";
    return;
  }
  newMatch(null,null,seed0);
  if(q.get("speed"))G.speed=+q.get("speed");
  if(q.get("stopat"))G.stopAt=+q.get("stopat");
  if(q.get("auto"))closeOverlay();
  if(q.get("ff")){                            // 描画を待たずに stopat まで進める(スクリーンショット用)
    for(let i=0;i<200000;i++){
      if(!G.playing){
        if(q.get("auto")&&!G.M.over&&capOn())closeOverlay(); else break;
      }
      advance(100);
    }
  }
  updateCtl();
  requestAnimationFrame(frame);
}
boot();
