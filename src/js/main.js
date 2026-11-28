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
  if(typeof bgmPlay==="function"&&(!meta||meta.career||meta.tut))bgmPlay("match");   // 試合の BGM(クラブハウスの下に作る見本の試合では鳴らさない)
  G.seed=seed>>>0;
  G.meta=meta||{ title:"KICK OFF", career:false };
  G.M=createMatch(homeDef||makeTeamDef("azr",false),awayDef||makeTeamDef("ros",true),G.seed,opts);
  G.queue=[]; G.cur=null; G.hold=0; G.playing=false; G.rec=[]; endReplay();
  G.ins={}; G.kpMode=false; G.cutDone=false;
  viewKickoff();                                // 並び・ボール・カメラ・演出をキックオフのときに(→docs/29 §29.6)
  BD.pendingIn.clear(); BD.kp=null;
  const M=G.M;
  $("hudH").textContent=M.home.short; $("hudA").textContent=M.away.short;
  $("hudHc").innerHTML=emblemSvg(M.home,22); $("hudAc").innerHTML=emblemSvg(M.away,22);
  // 大会名と回戦は英字で2行(→docs/14 §14.163)
  const en=G.meta.career&&G.meta.en?G.meta.en:{ name:"FRIENDLY", round:"" };
  $("hudComp").innerHTML='<b>'+en.name+'</b>'+(en.round?'<i>'+en.round+'</i>':'');
  setHud(0,0,"0'");
  G.tk=[];
  say(teamNameOf(M.home)+" vs "+teamNameOf(M.away));
  hideInfo();
  buildBoard(M);
  updateCtl();
  overlay("KICK OFF",'<small class="en">'+(G.meta.en?G.meta.en.name+(G.meta.en.round?" ・ "+G.meta.en.round:""):G.meta.title)+'</small>'+
    (G.M.opts.agg?'<small>第1試合 '+G.M.opts.agg[0]+' - '+G.M.opts.agg[1]+'</small>':'')+(G.M.opts.ko?'<small class="ko">KNOCK OUT MATCH</small>':''),   // 勝ち抜き戦(→docs/14 §14.158)
    TUNING.play.capKick,()=>setPlaying(true));
}

/* ---- 表示まわり ---- */
function setHud(hg,ag,clock){
  $("hudScore").textContent=hg+" - "+ag;
  $("hudClock").textContent=clock;
}
/* ---- 実況の帯(→docs/14 §14.22): 直近の3行を出す(古い行ほど薄く)。チームの略称はチームの色の札、監督の指示は目立つ色 ---- */
const TICKER_N=3;
const escT=s=>String(s).replace(/[&<>"]/g,ch=>({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[ch]));
/** 地の色に乗せる字の色(明るい色なら黒) */
function inkOn(hex){
  const m=/^#?([0-9a-f]{6})$/i.exec(hex||""); if(!m)return "#fff";
  const n=parseInt(m[1],16), y=((n>>16)&255)*0.299+((n>>8)&255)*0.587+(n&255)*0.114;
  return y>150?"#111":"#fff";
}
function tickHtml(text){
  let h=escT(text);
  if(G.M)for(const T of [G.M.home,G.M.away]){
    const k="["+escT(T.short)+"]"; if(!h.includes(k))continue;
    const col=typeof teamColor==="function"?teamColor(T):(T.color||"#888");
    h=h.split(k).join('<b class="tk-tm" style="background:'+col+';color:'+inkOn(col)+'">'+escT(T.short)+'</b>');
  }
  return h.replace("⚽ GOAL! ",'<b class="tk-goal">GOAL</b>').replace(/^監督「/,'<b class="tk-boss">監督</b>「');
}
/** kind … "boss"(監督の指示)/ "hint"(操作の手引き)/ なし(実況) */
function say(text,goal,kind){
  const t=$("ticker"); if(!t)return;
  G.tk=G.tk||[];
  G.tk.push('<p class="'+(goal?"goal":"")+(kind?" "+kind:"")+'">'+tickHtml(text)+'</p>');
  if(G.tk.length>TICKER_N)G.tk.splice(0,G.tk.length-TICKER_N);
  t.innerHTML='<div class="tk">'+G.tk.join("")+'</div>';
  t.classList.toggle("goal",!!goal);
}
/* ---- 監督の声(→docs/14 §14.22): 自分の操作は、監督がピッチに叫ぶせりふで実況の帯に出す。言い回しは数通りから選ぶ ---- */
const BOSS_SAY={
  shoot:["シュートしろ！！","撃て！ 狙っていけ！","どんどん打っていけ！"],
  shootCancel:["シュートは待て！","無理に打つな、つなげ！"],
  center:["中央から崩せ！","真ん中を突破しろ！"], centerOff:["中央突破はもういい！"],
  left:["左サイドを使え！","左から攻めろ！"], leftOff:["左はもういい！"],
  right:["右サイドを使え！","右から攻めろ！"], rightOff:["右はもういい！"],
  both:["両サイドを使え！","幅を使って揺さぶれ！"],
  counter:["カウンターを狙え！","奪ったら一気に行け！"], counterOff:["カウンターはやめだ、落ち着け！"],
  press:["前から追い込め！","プレスをかけろ！"], pressOff:["プレスを緩めろ！"],
  keeper:["キーパーは上がれ！","GK、ラインを押し上げろ！"], keeperOff:["キーパーは下がれ！"],
  kp:["頼んだぞ、%！","%、お前が軸だ！","%、見せてやれ！"],
  sub:["交代だ！ 準備しろ！","次のプレーで代えるぞ！"]
};
function bossSay(key,name,extra){
  const a=BOSS_SAY[key]; if(!a)return;
  const line=a[Math.floor(Math.random()*a.length)].replace("%",name||"");   // 見た目だけの揺らぎ(試合の乱数は使わない)
  say("監督「"+line+"」"+(extra||""),false,"boss");
}
/** 発動中の指示を、ピッチの左上に札で出し入れする(十字のボタンは字を出さないので。→docs/14 §14.100) */
function updateInsTags(){
  const box=$("insTags"); if(!box)return;
  const I=Object.assign({},G.ins||{},{ shoot:$("btnShoot").classList.contains("armed") }), side=I.left&&I.right?"両サイド攻撃":I.left?"左サイド攻撃":I.right?"右サイド攻撃":"";   // SHOOT はボタンの光り方に合わせる
  // KP は映像の下の白い帯に両チームぶん出す(→docs/14 §14.156)
  for(const el of box.children){ const k=el.dataset.k, on=k==="side"?!!side:!!I[k];
    if(k==="side"&&side)el.textContent=side;
    el.classList.toggle("on",on); }
}
function updateCtl(){
  if(G.M&&$("btnShoot"))$("btnShoot").classList.toggle("armed",G.M.home.shootOrder>0);
  $("btnSpeed").textContent="×"+G.speed;
  $("subInfo").textContent="交代 "+(G.M.home.subs+BD.pendingIn.size)+"/"+TUNING.squad.subMax;
  $("btnKp").classList.toggle("on",G.kpMode);
  $("board").classList.toggle("kpmode",G.kpMode);
  for(const [id,k] of INS_BTN)$(id).classList.toggle("on",!!G.ins[k]);
  updateInsTags();
  updateStyleBar();
}
/**
 * いま有効な KP を両チームぶん、映像の下の白い帯に出す(→docs/14 §14.156)。
 * 左 = 自チーム、右 = 相手。同じ意匠(黒い帯に金の KP)で、切れ目は平行なスラッシュで向かい合う
 */
function kpLabel(T,pendingKp){
  const id=pendingKp||T.kp, c=id?CARDS[id]:null, st=c?styleOfCard(c):null;
  if(!st)return { key:"none", html:'<b class="kbg">KP</b><span class="nm none">なし</span>' };
  const rank=pendingKp?styleRank(T,st,ssOfP(playerOf(T,id))):T.rank||styleRank(T,st,ssOfP(playerOf(T,id)));
  return { key:id, html:'<b class="kbg">KP</b><span class="nm">'+nameOf(c)+'</span><small>'+st.name+'</small><b class="rk rk'+rank+'">'+rank+'</b>' };
}
/** KP が替わったときだけ、帯を滑り込ませる(自チームは左から、相手は右から) */
function setKpLabel(el,o,dir){
  if(el.dataset.key===o.key){ el.innerHTML=o.html; return; }
  el.dataset.key=o.key; el.innerHTML=o.html;
  el.classList.remove("in"+dir); void el.offsetWidth; el.classList.add("in"+dir);
}
function updateStyleBar(){
  setKpLabel($("styH"),kpLabel(G.M.home,BD.kp),"L");
  setKpLabel($("styA"),kpLabel(G.M.away,null),"R");
  updateInsTags();
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
  const c=$("cap"); clearTimeout(G.capOffT);
  // ms>0 の字幕には残り時間のバー(ハーフタイムの指示を読んでいる間に時間が切れても分かるように →docs/14)
  c.innerHTML='<b>'+title+'</b>'+(body?'<div>'+body+'</div>':'')+(ms>0?'<i class="cap-bar"><u></u></i>':'');
  c.className="on"; G.onOv=fn; G.capT=ms; G.capT0=ms;
}
const capOn=()=>$("cap").classList.contains("on");
/** 指示の軸を短く(例: OFE・奪取↑ スピード↓) */
const HT_AX={ O:"攻", D:"守", R:"支", C:"奪", S:"速", P:"力" };
const htAxTxt=h=>(h.pos?h.pos.join("・")+"の ":"")+h.up.split("").map(a=>HT_AX[a]).join("")+"↑"+(h.down?" "+h.down.split("").map(a=>HT_AX[a]).join("")+"↓":"")+(h.stam?" スタミナ消耗":"");
/**
 * 指示の効きを2段で(→docs/14 §14.33)。上段 = 上がる能力(青)、下段 = 下がる能力(赤)。
 * 矢印の数は1軸あたりの効きの強さ(エンジンと同じ: 上がる = k、下がる = k × downR)で 1〜3 本
 */
const htArrows=v=>v>=0.9?3:v>=0.55?2:1;
function htAxHtml(h){
  const X=TUNING.ht, ax=t=>t.split("").map(a=>AXIS_ABBR[a]).join(" ");
  return '<span class="hx"><span class="hx-up">'+(h.up?ax(h.up)+' <b>'+"↑".repeat(htArrows(h.k))+'</b>':'—')+'</span>'+
    '<span class="hx-dn">'+(h.down?ax(h.down)+' <b>'+"↓".repeat(htArrows(h.k*X.downR))+'</b>':h.stam?'スタミナ消耗 ×'+X.stamK:h.pos?h.pos.join("・")+' だけに効く':'下がる能力なし')+'</span></span>';
}
function closeOverlay(){
  // 閉じるときは、上下の赤い線が中央へ寄って1本の光の線になり、横に縮んで消える(テレビが切れるように。→docs/14 §14.160)。
  // 試合は裏ですぐ再開する(待ち時間は増えない)
  const c=$("cap"); G.capT=0; clearTimeout(G.capOffT);
  if(c.classList.contains("on")){ c.classList.remove("on"); c.classList.add("off");
    G.capOffT=setTimeout(()=>{ if(c.classList.contains("off"))c.className=""; },TUNING.play.capOff); }
  else c.className="";
  const fn=G.onOv; G.onOv=null;
  if(fn)fn();
}
function onSubQueued(){ updateCtl(); bossSay("sub"); }
/** KP を替える。エンジンには次のステップで渡り、それまでは盤面に仮の印を出す */
function pickKp(id){
  if(G.M.over||!G.M.home.players.some(p=>p.id===id))return;
  orderMatch(G.M,"H",{ type:"kp", id });
  BD.kp=id; G.kpMode=false;
  const st=styleOfCard(CARDS[id]);
  bossSay("kp",nm(id),st?"  KP ▶ "+st.name:"");
  syncBoard(G.M); updateCtl();
}
/** 盤面のカードをタップしたとき。KP ボタンを押したあとなら KP に。詳細は長押し(→board.js) */
function tapCard(id){ if(G.kpMode)pickKp(id); else if(G.info===id)hideInfo(); else say("長押しでカードの裏を見る ・ KP ボタン → タップで KP",false,"hint"); }
/** 十字の戦術ボタン + キーパー(→docs/04 §4.9b)。どれも同時に点けられ、もう一度押すと消える */
const INS_BTN=[["btnCenter","center"],["btnLeft","left"],["btnRight","right"],["btnCounter","counter"],["btnPress","press"],["btnKeeper","keeper"]];
function toggleIns(key){
  if(!G.M||G.M.over)return;
  G.ins[key]=!G.ins[key];
  orderMatch(G.M,"H",Object.assign({ type:"ins" },{ [key]:G.ins[key] }));
  bossSay(G.ins[key]?(G.ins.left&&G.ins.right&&(key==="left"||key==="right")?"both":key):key+"Off");
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
  const rank=st?styleRank(M.home,st,ssOfP({ c })):null;
  const bar=k=>'<span class="st"><i>'+STAT_LABEL[k]+'</i><b>'+(Math.round(c[k]*10)/10)+'</b><em><u style="width:'+
    (c[k]/STAT_MAX*100)+'%"></u></em></span>';
  // カードの裏の形で(→docs/14 §14.14)。いまの役割・適性・体力・KP のランクは下に
  $("infoBody").innerHTML=cardBackHtml(c,{ stars:c.is!=null?[c.is,c.ss]:null, ss:c.ss||0,
    extra:'<p class="cb-now">'+(kp?'<b class="kpt">KP</b> ':'')+(p&&p.yc?'<b class="yct">警告</b> ':'')+
      (p?'いま '+p.role+'(適性 '+Math.round(p.apt*100)+'%)・ 体力 <b class="'+(p.stam<0.4?"lo":p.stam<0.6?"md":"hi")+'">'+Math.round(p.stam*100)+'%</b>':'SUB')+
      (st?' ・ KP スタイルのランク <b class="rk rk'+rank+'">'+rank+'</b>':'')+'</p>' });
  const b=$("infoKp");
  b.style.display=p?"":"none";
  b.disabled=kp||M.over;
  b.textContent=kp?"キープレイヤーに指名中":"キープレイヤーに指名";
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
  if(ev.type==="htPlan"){                    // 相手監督のハーフタイムの指示(→docs/31 §31.4)。自分の指示は選んだときに出している
    if(ev.side==="H")return;
    say(tag(ev)+"監督「"+ev.name+"！」",false); G.hold=700;
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
    if(typeof viewKickoff==="function")viewKickoff();   // 後半はキックオフと同じ並びから(→docs/29 §29.6)
    setPlaying(false);
    setHud(ev.hg,ev.ag,"HT");
    // ハーフタイムの指示(→docs/10 §10.8・docs/14 §14.69): 監督のバストアップが、吹き出しで登録した3つの指示を出す。
    // 「このまま維持しろ」は無くした(選ばずに時間が来れば、何も変えずに後半へ)
    const set=(CL&&CL.S&&CL.S.ht&&G.meta.career?CL.S.ht.set:["b1","b2","b3"]).map(htOf).filter(Boolean);
    const btns=set.map((h,i)=>'<button class="htb" data-ht="'+h.id+'" style="--i:'+i+'">'+h.name+'<i>'+htAxTxt(h)+'</i></button>').join("");
    const av=CL&&CL.S&&CL.S.mgr&&G.meta.career?CL.S.mgr.av:0, bust=typeof mgrArt==="function"?mgrArt(av,"bust"):null;
    // モニターの中だけに出す(得点はヘッダにあるので出さない)。監督は左下から入り、指示は3つの白い吹き出し(→docs/14 §14.157)
    overlay("HALF TIME",'<div class="ht-st"><div class="ht-stbox"><h5>STATS</h5>'+resStatsHtml(G.M)+'</div></div>'+   // 前半の数字は右に棒で(結果の画面と同じ。→docs/14 §14.178)
      '<div class="ht-row">'+(bust?'<img class="ht-mgr" src="'+bust+'" alt="">':'')+'<div class="ht-opts">'+btns+'</div></div>',TUNING.ht.timer,()=>setPlaying(true));   // 監督の絵の幅は監督ごとに違うので、吹き出しは絵の右に並べる(→docs/14 §14.181)
    $("cap").classList.add("ht");
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
      ()=>{ if(G.meta.career)finishFixture(G.M); else if(G.meta.tut)tutMatchEnd(); else newMatch(null,null,G.seed+1); });   // 練習試合はクラブハウスへ(→docs/36)
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
  // セットプレー(→docs/29 §29.6): 蹴る前に帯を出し、その間(試合は止まる)に並び・ボールを置く位置を見せる
  const spk=ev.type==="cross"&&ev.sp?ev.sp:ev.type==="shot"&&(ev.sp==="fk"||ev.sp==="pk")?ev.sp:null;
  if(spk&&!G.replay){ const f=$("flash"); f.innerHTML='<b>'+(spk==="ck"?"CORNER KICK":spk==="pk"?"PENALTY KICK":"FREE KICK")+'</b>';
    f.className="on sp"+(ev.side==="H"?" mine":""); G.flash=true; G.hold=Math.max(G.hold||0,TUNING.view.sp.pre); }
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
    // 得点者のアップ(→docs/14 第4弾): 絵を大きく、名前・今季N点目・アシスト・時間。相手の得点は控えめに
    const f=$("flash"), c=CARDS[ev.by], art=c&&typeof artSrc==="function"?artSrc(c,"play"):null;
    let nth="";
    if(ev.side==="H"&&G.meta.career&&CL.S){ const before=(CL.S.tgoals&&CL.S.tgoals[ev.by])||0;
      const now=G.M.events.filter(e=>e.type==="shot"&&e.res==="goal"&&e.side==="H"&&e.by===ev.by&&e.ix<=ev.ix).length; nth="今季 "+(before+now)+" 点目"; }
    f.innerHTML=(art?'<img class="gl-art'+(ev.side==="A"?' opp':'')+'" src="'+art+'" alt="">':'')+
      '<b>GOAL!</b><i>'+nm(ev.by)+'</i><small>'+teamOf(G.M,ev.side).short+' ・ '+ev.min+(ev.at?"+":"'")+(nth?' ・ '+nth:'')+(ev.as?' ・ アシスト '+nm(ev.as):'')+'</small>';
    f.className="on gl"+(ev.side==="H"?" mine":""); G.flash=true;
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
    $("btnShoot").classList.toggle("armed",G.M.home.shootOrder>0); updateInsTags();
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
  if(G.capT>0){ G.capT-=dt; const u=$("cap").querySelector(".cap-bar u"); if(u)u.style.width=Math.max(0,G.capT/G.capT0*100)+"%"; if(G.capT<=0)closeOverlay(); }   // 字幕は実時間で数える(倍速に関わらず数秒)
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
    $("btnShoot").classList.toggle("armed",!armed); updateInsTags();
    bossSay(armed?"shootCancel":"shoot");
  });
  $("btnKp").addEventListener("click",()=>{
    if(G.M.over)return;
    G.kpMode=!G.kpMode; hideInfo();
    if(G.kpMode)say("KP にする選手のカードをタップ(もう一度 KP ボタンで取り消し)",false,"hint");
    updateCtl();
  });
  for(const [id,k] of INS_BTN)$(id).addEventListener("click",()=>toggleIns(k));
  $("replay").addEventListener("click",skipReplay);
  // ハーフタイムの指示を選ぶ(字幕の中のボタン)
  $("cap").addEventListener("click",e=>{
    const b=e.target.closest("[data-ht]"), cap=$("cap"); if(!b||cap.classList.contains("picked"))return;
    const h=htOf(b.dataset.ht);
    if(h){ orderMatch(G.M,"H",{ type:"htPlan", up:h.up, down:h.down, k:h.k, stam:h.stam, pos:h.pos, name:h.name }); say("監督「"+h.name+"！」",false,"boss"); }
    sndUi("ok");
    // 選んだ吹き出しが残り、ほかは落ちて消える。少し見せてから後半へ(→docs/14 §14.157)
    b.classList.add("sel"); cap.classList.add("picked"); G.capT=0;
    setTimeout(()=>{ if(cap.classList.contains("picked"))closeOverlay(); },TUNING.ht.pickMs);
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
  document.getElementById("club").addEventListener("change",onClubChange);
  applyTheme(storedTheme());                   // テーマ(→settings.js)
  sceneInit();
  // 押したら必ず音が返る(→docs/07 §7.3)
  // 音は離したとき(click)に鳴らす。pointerdown だと、一覧をなでてスクロールしただけで鳴る
  document.addEventListener("click",e=>{ if(e.target.closest&&e.target.closest(".btn,.tab,.tr,.chipb,.kc,.cd"))sndUi("tap"); },true);
  document.addEventListener("pointerdown",e=>{ const b=e.target.closest&&e.target.closest("button:not(:disabled),.tab"); if(b&&navigator.vibrate)try{ navigator.vibrate(8); }catch(_){} },true);   // 押したときの短い振動(→docs/33 GC1)
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
