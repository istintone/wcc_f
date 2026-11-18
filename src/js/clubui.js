/* =========================================================================
   wcc_f — クラブハウス(試合の外の画面)。中身の計算は club.js / grow.js、ここは見せるだけ。
   流れ: チーム練習 → コミュニケーション(最大3回)→ 試合 → 結果を反映して保存 → …
   ========================================================================= */

/**
 * 監督室の状態(→docs/07 §7.9)
 *   tab  … 下のタブ(home / squad / cards / season / club)
 *   flow … 準備の手順を開いているか(null / "prep")。開いている間はタブを出さない
 *   msg=育成で起きたこと / comm=開いている場所 / pick=指名中の選手 / int=練習の強度(0 軽め / 1 普通 / 2 ハード)
 *   cf=コレクションの絞り込み / sel=選んだカード / sqSel=並べ替えで選んだ登録選手 / set=設定を開いている
 */
const CL={ alert:"", S:null, W:null, fx:null, store:null, armReset:false,
  tab:"home", flow:null,
  msg:[], comm:null, pick:[], int:1,
  cf:"ALL", sel:null, sqSel:null,
  set:false, setMsg:"", copyText:"" };          // set=設定・データを開いている(→settings.js)            // cf=コレクションの絞り込み / sel=選んだカード / sqSel=並べ替えで選んだ登録選手                // msg=育成で起きたこと / comm=開いている場所 / pick=指名中の選手

/** localStorage が使えない環境(プライベートブラウズなど)では、その場かぎりの入れ物で動かす */
function careerStore(){
  try{
    localStorage.setItem("wcc_f.probe","1"); localStorage.removeItem("wcc_f.probe");
    return localStorage;
  }catch(e){
    CL.alert="この端末では保存できません(プライベートブラウズなど)。閉じると進み具合が消えます";
    return memStore();
  }
}
function initCareer(seed){
  CL.store=careerStore();
  let S=loadCareer(CL.store);
  if(!S){
    // 読めないセーブ(壊れた・新しい版で作られた)は上書きしない。退避してから新しく始める
    const raw=rawSave(CL.store);
    if(raw){
      if(backupSave(CL.store,raw))CL.alert="前のセーブを読めなかったので、消さずに退避しました。CLUB の「設定・データ」から書き出せます";
      else{ CL.store=memStore(); CL.alert="前のセーブを読めず、退避もできませんでした。前のセーブを守るため、この任期は保存しません"; }
    }
    S=newCareer(seed);
  }
  CL.S=S; CL.W=worldOf(S);
  persist(S);
  // iPhone はしばらく開かないとサイトのデータを消すことがある。消さないよう頼む(断られても動く)
  try{ if(navigator.storage&&navigator.storage.persist)navigator.storage.persist().catch(()=>{}); }catch(e){}
  showClub();
}
/** 保存する。失敗したら秘書が知らせる */
function persist(S){
  const ok=saveCareer(CL.store,S||CL.S);
  if(!ok)CL.alert="保存できませんでした(空き容量やブラウザの設定を確認してください)。CLUB の「設定・データ」から書き出しておくと安全です";
  return ok;
}
function showClub(keepScroll){
  const el=document.getElementById("club"), old=el.querySelector(".cl-main"), y=old?old.scrollTop:0;
  CL.fx=nextFixture(CL.S,CL.W);
  el.innerHTML=clubHtml();
  el.classList.add("on");
  const main=el.querySelector(".cl-main");
  if(main)main.scrollTop=keepScroll?y:0;
  const pitch=document.getElementById("sqPitch");
  if(pitch)sqBind(pitch);
}
function hideClub(){ document.getElementById("club").classList.remove("on"); }

const clubName=id=>id==="me"?teamNameOf(TEAMS.azr):teamNameOf(TEAMS[id]);
const clubShort=id=>id==="me"?TEAMS.azr.short:TEAMS[id].short;
const stars=n=>"★".repeat(n)+"☆".repeat(5-n);
const gradeTag=g=>g==="-"?"":'<b class="gr gr'+g+'">'+g+'</b>';
const cname=id=>nameOf(CARDS[id]);

/* ---- 育成の札 ---- */

/** 選手を指名するための札の並び。on = 選択中。info = 札の下段に出す情報。act = 押したときの動き */
function chipsHtml(ids,on,info,act){
  const S=CL.S;
  return '<div class="chips">'+ids.map(id=>{
    const c=CARDS[id];
    return '<button class="chipb '+c.pos.toLowerCase()+(on.includes(id)?' on':'')+'" data-act="'+(act||"pick")+'" data-id="'+id+'">'+
      '<i>'+c.no+'</i>'+nameOf(c)+(hasSign(S,id)?'<b class="sign">！</b>':'')+
      '<small>'+info(S.g.pl[id],id)+'</small></button>'; }).join("")+'</div>';
}
/** コミュニケーションの種類ごとの、札の見せ方と問いかけ */
const COMM_UI={
  // 札には次の★までの進み(%)と兆しを出す(→docs/05 §5.3 見える化)
  ind:   { sub:"個人能力", n:1, hint:"1人を選ぶ(個人能力の経験 +"+TUNING.grow.comm.ind+" × 伸びやすさ。★は試合のあとに上がる)",
           info:(g,id)=>g.is>=5?"個★5 覚醒":g.q?"個★4 覚醒の兆し":"個★"+g.is+" "+Math.floor(indProgress(g)*100)+"%" },
  meet:  { sub:"特殊能力", n:1, hint:"1人を選ぶ(！ = ★突破の話がある)",
           info:g=>g.ss>=5?"特★5":g.sq?"特★4 極みの兆し":"特★"+g.ss+" "+Math.floor(spProgress(g)*100)+"%" },
  // 相性の組は見せない(→docs/08)。1人目を選んだら、その人との今の連携を出す
  lounge:{ sub:"2人の連携", n:2, hint:"2人を選ぶ", info:(g,id)=>{ const a=CL.pick[0];
    if(!a||a===id)return ""; const l=linkOf(CL.S,a,id);
    return LINK_LABEL[l.lv]+(l.lv>=2?(l.gold?"・兆し":""):" "+Math.floor(linkProgress(CL.S,a,id)*100)+"%"); } },
  talk:  { sub:"やる気", n:1, hint:"1人を選ぶ(落ちている選手ほど大きく戻る)", info:g=>MOT_LABEL[g.mot] }
};
/** 育成で起きたことの帯(手順の上に出す) */
function msgHtml(){
  return CL.msg.length?'<div class="msgs">'+CL.msg.map(x=>'<span>'+x+'</span>').join("")+'</div>':"";
}
/** ① チーム練習 */
function trainStepHtml(){
  const S=CL.S, N=TUNING.grow.int, fat=teamFatigue(S);
  return '<div class="step-h"><b>チーム練習</b><small>全員に効く。強いほど伸びるが、疲れて試合に入る</small></div>'+
    '<div class="ints i4"><button class="tab rest'+(CL.int===-1?' on':'')+'" data-act="int" data-i="-1">休憩<small>疲労が抜ける</small></button>'+
      INT_LABEL.map((t,i)=>'<button class="tab'+(CL.int===i?' on':'')+'" data-act="int" data-i="'+i+'">'+t+
      '<small>伸び ×'+N.k[i]+(N.fat[i]?' ・ 疲労 +'+Math.round(N.fat[i]*100)+'%':' ・ 疲れない')+'</small></button>').join("")+'</div>'+
    '<p class="dim">いまの疲労 <b class="'+(fat>=N.tiredSign?'warn':'')+'">'+Math.round(fat*100)+'%</b>(盤面の11人の平均)</p>'+
    (CL.int===-1
      ?'<div class="trs"><button class="tr rest" data-act="rest"><b>休憩する</b><small>練習の代わりに休む。経験は入らないが、疲労が大きく抜け、調子の落ちた選手が戻る</small></button></div>'
      :'<div class="trs">'+trainOptions(S).map((o,i)=>'<button class="tr'+(o.sp>=0?' sp':'')+'" data-act="train" data-i="'+i+'">'+
        '<b>'+trainLabel(o)+'</b><small>'+trainDesc(o)+'</small></button>').join("")+'</div>');
}
/** ② コミュニケーション */
function commStepHtml(){
  const S=CL.S, g=S.g, all=Object.keys(g.pl), left=commLeft(S), U=COMM_UI[CL.comm];
  let h='<div class="step-h"><b>コミュニケーション</b><small>あと <em>'+left+'</em> 回。使わずに試合へ進んでもよい</small></div>'+
    '<div class="tabs t4">'+Object.keys(COMM_UI).map(k=>'<button class="tab'+(CL.comm===k?' on':'')+'" data-act="comm" data-v="'+k+'"'+
      (left?'':' disabled')+'>'+COMM_LABEL[k]+'<small>'+COMM_UI[k].sub+'</small></button>').join("")+'</div>';
  if(!left)return h+'<p class="dim">今回のコミュニケーションは使い切った</p>';
  if(!U)return h+'<p class="dim">場所を選ぶ</p>';
  h+='<p class="dim">'+U.hint+'</p>'+chipsHtml(all,CL.pick,U.info);
  if(CL.pick.length===U.n){
    const id=CL.pick[0];
    h+='<div class="ask">'+CL.pick.map(x=>'<p class="voice"><b>'+cname(x)+'</b>「'+voiceOf(S,x)+'」<small>信頼度: '+
      TRUST_LABEL[trustLv(S.g.pl[x])]+'</small></p>').join("");
    if(CL.comm==="lounge"){
      const f=loungeInfo(S,CL.pick[0],CL.pick[1]);
      h+='<p><b>'+cname(CL.pick[0])+'</b> と <b>'+cname(CL.pick[1])+'</b> ・ いま: '+LINK_LABEL[f.lv]+
        (f.gold?'(黄金線の兆し)':'')+'</p><p class="hint">'+f.hint+'</p>'+
        f.choices.map((t,i)=>'<button class="btn ch" data-act="lounge" data-i="'+i+'">'+t+'</button>').join("");
    }else if(CL.comm==="meet"){
      const f=meetInfo(S,id);
      h+='<p><b>'+cname(id)+'</b> ・ 特殊能力 '+stars(f.ss)+' ・ 経験 '+Math.min(Math.floor(f.se),f.need)+'/'+f.need+'</p>';
      if(f.ready)h+='<p class="hint">★突破の話を切り出してきた。性格: '+f.pers+'</p>'+
        f.choices.map((t,i)=>'<button class="btn ch" data-act="meet" data-i="'+i+'">'+t+'</button>').join("");
      else h+='<button class="btn ch" data-act="meet" data-i="0">戦術の話をする</button>';
    }else if(CL.comm==="ind"){
      const p=S.g.pl[id];
      h+='<p><b>'+cname(id)+'</b> ・ 個人能力 '+stars(p.is)+(p.q?'(覚醒の兆し)':'')+'</p>'+
        '<button class="btn ch" data-act="ind">個別に指導する</button>';
    }else{
      const p=S.g.pl[id];
      h+='<p><b>'+cname(id)+'</b> ・ いま '+MOT_LABEL[p.mot]+' ・ 疲労 '+Math.round(p.fat*100)+'%</p>'+
        '<button class="btn ch" data-act="talk">声をかける</button>';
    }
    h+='</div>';
  }
  return h;
}
/**
 * 準備の手順(全画面)。上に「×」と手順の印、下に次へ進むボタン。
 * 筐体の1クレジットと同じく、練習 → コミュニケーション → 試合 の順にしか進まない
 */
function prepHtml(){
  const S=CL.S, fx=CL.fx, st=S.g.step, comp=COMPS[fx.comp];
  const no=st==="train"?1:2;
  let h='<header class="prep-top"><button class="x" data-act="home">×</button>'+
    '<div class="steps">'+["チーム練習","コミュニケーション","試合"].map((t,i)=>
      '<span class="'+(i+1<no?'done':i+1===no?'now':'')+'"><i>'+(i+1)+'</i>'+t+'</span>').join("")+'</div></header>'+
    '<div class="prep-vs">'+gradeTag(comp.grade)+'<b>'+comp.name+'</b> '+(fx.label||"")+
      ' <span>vs '+teamNameOf(TEAMS[fx.opp])+'</span></div>'+
    '<div class="cl-main prep">'+msgHtml()+(st==="train"?trainStepHtml():commStepHtml())+'</div>'+
    '<footer class="prep-bot">'+
      (st==="train"?'<span class="dim">練習を1つ選ぶと次へ進む</span>'
        :'<button class="btn btn-main" data-act="play">試合へ</button>')+
      (fx.canDecline?'<button class="lnk" data-act="decline">この大会を棄権する</button>':'')+
    '</footer>';
  return h;
}
/* ---- SQUAD: 既定の陣形(→docs/07 §7.10) ----
 * 縦のピッチ(自陣が下)に先発11人を置く。ここでの並びと KP が毎試合の初期配置になる。
 * ドラッグで動かす / 2枚タップで入れ替え(控えとも)/ 陣形の選択で一括で並べ直す */
const SQ_FORMS=Object.keys(FORMS);
/** 盤面の座標 h(0=自ゴール…1)・x(0…100) ⇔ ピッチ上の % */
const sqPos=(h,x)=>({ l:7+x*0.86, t:95-h*90 });
const sqInv=(l,t)=>({ x:(l-7)/0.86, h:(95-t)/90 });
const APT_MARK=a=>a>=TUNING.apt.own?"◎":a>=TUNING.apt.group?"○":a>=TUNING.apt.near?"△":"×";
/** 位置での役割と適性 */
function sqRole(id,i,h,x){
  const role=i===0?"GK":roleAt(h,x), a=aptOf(CARDS[id],role);
  return { role, a, cls:aptClass(a), mark:APT_MARK(a) };
}
function sqTokenHtml(id,i,on){
  const S=CL.S, c=CARDS[id], g=S.g.pl[id], col=cardColor(c);
  let pos="", rl=null;
  if(on){ const l=S.layout[id], p=sqPos(l[0],l[1]); rl=sqRole(id,i,l[0],l[1]);
    pos=' style="left:'+p.l.toFixed(2)+'%;top:'+p.t.toFixed(2)+'%;--cc:'+col+'"'; }
  else pos=' style="--cc:'+col+'"';
  const sign=g&&(g.q||g.sq||spReady(S,id));
  return '<div class="sqc '+c.pos.toLowerCase()+' r-'+(c.rar||"B")+(CL.sqSel===id?' sel':'')+(on?'':' bn')+(S.kp===id&&on?' kp':'')+
    (g&&g.fat>=TUNING.grow.int.tiredSign?' tired':'')+'" data-id="'+id+'" data-i="'+i+'"'+(on?'':' data-act="sqpick"')+pos+'>'+
    '<i class="no">'+c.no+'</i>'+
    (rl?'<b class="rl '+rl.cls+'">'+rl.role+'</b>':'<b class="rl">'+c.pos+'</b>')+
    '<span class="nm">'+nameOf(c)+'</span>'+
    (g?'<em class="mt m'+g.mot+'"></em>':'')+
    (S.kp===id&&on?'<i class="kpb">KP</i>':'')+(sign?'<i class="sg">兆</i>':'')+'</div>';
}
/** 連携の線(薄線・太線・黄金線。黄金線の兆しは点線を重ねる) */
function sqLinksSvg(){
  const S=CL.S, on=S.sq.slice(0,11);
  let h='<svg class="sq-links" viewBox="0 0 100 100" preserveAspectRatio="none">';
  for(const k of Object.keys(S.g.links)){
    const l=S.g.links[k], p=k.split("|");
    if(l.lv<1||!on.includes(p[0])||!on.includes(p[1]))continue;
    const a=S.layout[p[0]], b=S.layout[p[1]], A=sqPos(a[0],a[1]), B=sqPos(b[0],b[1]);
    const ln=cls=>'<line class="'+cls+'" data-a="'+p[0]+'" data-b="'+p[1]+'" x1="'+A.l.toFixed(2)+'" y1="'+A.t.toFixed(2)+
      '" x2="'+B.l.toFixed(2)+'" y2="'+B.t.toFixed(2)+'" vector-effect="non-scaling-stroke"/>';
    h+=ln("lk l"+l.lv)+(l.gold&&l.lv===2?ln("lk omen"):"");
  }
  // 選んだ選手について、次の段が近い相手(線なし・薄線で、経験が soon を超えたもの)を細い点線で(→docs/05 §5.3 見える化)
  for(let i=0;i<on.length;i++)for(let j=i+1;j<on.length;j++){
    const a=on[i], b=on[j], l=linkOf(S,a,b);
    if(CL.sqSel!==a&&CL.sqSel!==b)continue;
    if(l.lv>=2||linkProgress(S,a,b)<TUNING.grow.soon)continue;
    const A=sqPos(S.layout[a][0],S.layout[a][1]), B=sqPos(S.layout[b][0],S.layout[b][1]);
    h+='<line class="lk soon" data-a="'+a+'" data-b="'+b+'" x1="'+A.l.toFixed(2)+'" y1="'+A.t.toFixed(2)+'" x2="'+B.l.toFixed(2)+
      '" y2="'+B.t.toFixed(2)+'" vector-effect="non-scaling-stroke"/>';
  }
  return h+'</svg>';
}
/** 選んでいる選手の板(役割と適性・育成・KP にする) */
function sqDetailHtml(){
  const S=CL.S, id=CL.sqSel;
  if(!id)return '<p class="sq-hint">ドラッグで位置を動かす ・ 2人をタップで入れ替え(控えとも)・ 選んだ選手は KP にできる</p>';
  const c=CARDS[id], g=S.g.pl[id], i=S.sq.indexOf(id), on=i<11, G0=TUNING.grow;
  const sk=c.skill?SKILLS[c.skill]:null, st=styleOfCard(c);
  const rl=on?sqRole(id,i,S.layout[id][0],S.layout[id][1]):null;
  const need=g.is<4?G0.ind.need[g.is]:G0.ind.awake;
  return '<div class="sq-det"><div class="sd-top"><i class="no">'+c.no+'</i><b>'+nameOf(c)+'</b><small>'+c.pos+' ・ '+c.age+'歳</small>'+
      (on?'<span class="rlx '+c.pos.toLowerCase()+' '+rl.cls+'">'+rl.role+' '+rl.mark+'</span>':'<span class="rlx '+c.pos.toLowerCase()+'">控え</span>')+'</div>'+
    '<div class="sd-row"><span>個人 <b class="st5">'+stars(g.is)+'</b><em><u style="width:'+(g.is>=5?100:Math.min(100,g.ie/need*100))+'%"></u></em></span>'+
      '<span>特殊 <b class="st5">'+stars(g.ss)+'</b><em><u style="width:'+Math.floor(spProgress(g)*100)+'%"></u></em></span>'+
      (g.q?'<span class="sgn">覚醒の兆し</span>':'')+(g.sq?'<span class="sgn">極みの兆し</span>':'')+
      '<span>信頼度 '+TRUST_LABEL[trustLv(g)]+'</span>'+
      '<span class="mot m'+g.mot+'">'+MOT_LABEL[g.mot]+'</span><span class="fat'+(g.fat>=G0.int.tiredSign?' warn':'')+'">疲労 '+Math.round(g.fat*100)+'%</span></div>'+
    '<div class="sd-row"><span>'+(sk?'★'+sk.label:'')+(st?' ・ KP: '+st.name:'')+'</span><span class="dim">得意 '+c.roles.join("/")+'</span></div>'+
    '<div class="sd-act">'+(on?(S.kp===id?'<span class="kpnow">KP</span>':'<button data-act="sqkp" data-id="'+id+'">KP にする</button>'):'')+
      '<button class="ghost" data-act="sqpick" data-id="'+id+'">選択をやめる</button></div>'+
    '<p class="voice"><b>'+nameOf(c)+'</b>「'+voiceOf(S,id)+'」</p>'+
    '<p class="sq-hint">入れ替える相手をタップ</p></div>';
}
function squadHtml(){
  const S=CL.S, G0=TUNING.grow;
  fillLayout(S);
  const on=S.sq.slice(0,11), bench=S.sq.slice(11);
  let h='<section class="sq-head"><h3>SQUAD <small>この並びと KP で毎試合はじまる</small></h3>'+
    '<div class="sq-forms">'+SQ_FORMS.map(f=>'<button class="'+(S.form===f?'on':'')+'" data-act="sqform" data-v="'+f+'">'+f+'</button>').join("")+'</div></section>';
  h+='<div class="sq-pitch" id="sqPitch"><i class="pm half"></i><i class="pm circ"></i><i class="pm pa top"></i><i class="pm pa bot"></i>'+
    '<i class="pm ga top"></i><i class="pm ga bot"></i>'+sqLinksSvg()+
    on.map((id,i)=>sqTokenHtml(id,i,true)).join("")+'</div>';
  h+='<div class="sq-bench"><span class="lbl">控え</span>'+bench.map((id,j)=>sqTokenHtml(id,11+j,false)).join("")+'</div>';
  h+=sqDetailHtml();
  // 連携の数・戦力グラフ
  const lv=[0,0,0,0]; Object.values(S.g.links).forEach(l=>lv[l.lv]++);
  h+='<section class="card"><h3>連携 <small>試合で一緒に出ると育つ</small></h3><p class="lklg"><span><i class="l1"></i>薄線 '+lv[1]+'</span>'+
    '<span><i class="l2"></i>太線 '+lv[2]+'</span><span><i class="l3"></i>黄金線 '+lv[3]+'</span><span><i class="omen"></i>黄金線の兆し</span><span><i class="soon"></i>次の段が近い(選手を選ぶと出る)</span>'+
    ' <small>セットプレイ +'+Math.round(S.g.set*100)+'%</small></p></section>';
  h+='<section class="card"><h3>戦力グラフ <small>練習で上下する。スタイルのランクに効く</small></h3><div class="graph">'+
    Object.keys(S.g.graph).map(a=>{ const v=S.g.graph[a], w=Math.abs(v)/G0.graph.max*50;
      return '<div><span>'+AXIS_LABEL[a]+'</span><em><u class="'+(v<0?'neg':'')+'" style="width:'+w+'%;'+(v<0?'right:50%':'left:50%')+'"></u></em><b>'+
        (v>=0?"+":"")+v.toFixed(2)+'</b></div>'; }).join("")+'</div></section>';
  return h;
}
/** 選手を選ぶ。2人目で入れ替え(→pool.js moveSquad) */
function sqPick(id){
  const S=CL.S;
  if(!CL.sqSel)CL.sqSel=id;
  else if(CL.sqSel===id)CL.sqSel=null;
  else{
    const a=CL.sqSel;
    moveSquad(S,a,id);
    // KP が控えに下がったら、代わりに入った人が KP を引き継ぐ
    if(S.kp===a&&S.sq.indexOf(a)>=11)S.kp=id; else if(S.kp===id&&S.sq.indexOf(id)>=11)S.kp=a;
    fillLayout(S); CL.sqSel=null; persist(S);
  }
  showClub(true);
}
/** ピッチのカードをドラッグで動かす。動かさずに離したらタップ(選ぶ・入れ替え) */
function sqBind(pitch){
  let d=null;
  const at=e=>{ const r=pitch.getBoundingClientRect();
    const q=sqInv((e.clientX-r.left)/r.width*100,(e.clientY-r.top)/r.height*100);
    return clampPos(d.i===0,q.h,q.x); };
  pitch.addEventListener("pointerdown",e=>{
    const el=e.target.closest(".sqc"); if(!el)return;
    d={ el, id:el.dataset.id, i:+el.dataset.i, x0:e.clientX, y0:e.clientY, moved:false, pid:e.pointerId };
    try{ el.setPointerCapture(e.pointerId); }catch(_){}
  });
  pitch.addEventListener("pointermove",e=>{
    if(!d||e.pointerId!==d.pid)return;
    if(!d.moved&&Math.hypot(e.clientX-d.x0,e.clientY-d.y0)<7)return;
    d.moved=true; d.el.classList.add("drag");
    const q=at(e), p=sqPos(q.h,q.x); d.q=q;
    d.el.style.left=p.l+"%"; d.el.style.top=p.t+"%";
    const rl=sqRole(d.id,d.i,q.h,q.x), b=d.el.querySelector(".rl");
    b.className="rl "+rl.cls; b.textContent=rl.role;
    pitch.querySelectorAll('line[data-a="'+d.id+'"]').forEach(l=>{ l.setAttribute("x1",p.l); l.setAttribute("y1",p.t); });
    pitch.querySelectorAll('line[data-b="'+d.id+'"]').forEach(l=>{ l.setAttribute("x2",p.l); l.setAttribute("y2",p.t); });
  });
  const end=e=>{
    if(!d||e.pointerId!==d.pid)return;
    const dd=d; d=null;
    if(dd.moved&&dd.q){ CL.S.layout[dd.id]=[r2(dd.q.h),r2(dd.q.x)]; persist(CL.S); showClub(true); }
    else if(!dd.moved&&e.type==="pointerup")sqPick(dd.id);
  };
  pitch.addEventListener("pointerup",end);
  pitch.addEventListener("pointercancel",end);
}

/* ---- カード(→pool.js) ---- */

/** カードの人物の影(独自に描いた汎用の上半身。絵は後で差し替える) */
const CARD_SIL='<svg class="k-sil" viewBox="0 0 100 110" preserveAspectRatio="xMidYMax meet">'+
  '<path d="M50 8c11 0 19 9 19 21 0 9-4 16-10 20l3 5c16 3 28 11 32 26l4 30H2l4-30c4-15 16-23 32-26l3-5c-6-4-10-11-10-20 0-12 8-21 19-21z"/></svg>';
// レアリティの呼び方(→docs/08 §8.10): 白 = REGULAR / 黒 = SPECIAL / キラ = WORLD CLASS / レジェンド = LEGENDS
const RAR_TAG={ W:"REGULAR", B:"SPECIAL", K:"WORLD CLASS", L:"LEGENDS" };
/** カードのクラブの色(実在クラブ・アズーロFC) */
const cardColor=c=>(c.team&&TEAMS[c.team]?TEAMS[c.team].color:c.id&&c.id[0]==="h"?TEAMS.azr.color:"#888");
/**
 * カード1枚の見た目(→docs/07 §7.8)。トレーディングカードの構成:
 *   斜めの色帯(クラブの色)/ 網点の地に人物の影 / 背番号と役割 / リボン状の名前帯 / レアリティの箔
 * size: "s" 小(一覧) / "m" 中(払い出し・詳細)
 */
function cardHtml(id,size,extra){
  const c=CARDS[id], r=c.rar||"B", st=styleOfCard(c), sk=c.skill?SKILLS[c.skill]:null;
  const top=STATS.slice().sort((a,b)=>c[b]-c[a]).slice(0,3);
  const n=CL.S&&CL.S.coll[id]||0;
  return '<div class="kc r-'+r+' kc-'+size+(extra||"")+'" data-act="card" data-id="'+id+'" style="--tc:'+cardColor(c)+'">'+
    '<i class="k-band"></i><div class="k-art">'+CARD_SIL+'</div>'+
    '<div class="k-top"><b class="k-no">'+statTotal(c)+'</b><i class="k-pos '+c.pos.toLowerCase()+'">'+c.pos+'</i></div>'+
    '<div class="k-rar">'+RAR_TAG[r]+'</div>'+
    '<div class="k-name"><b>'+nameOf(c)+'</b><small>'+clubOfCard(c)+'<em class="k-num">'+c.no+'</em></small></div>'+
    '<i class="k-cno">'+cardNoOf(c)+'</i>'+
    (size==="m"?'<div class="k-st">'+top.map(k=>'<span><i>'+STAT_LABEL[k]+'</i><b>'+c[k]+'</b></span>').join("")+'</div>'+
      '<div class="k-sk">'+(sk?sk.label:"")+'<em>'+(st?st.name:"")+'</em></div>'
      :'<div class="k-sk">'+(sk?sk.label:"")+'</div>')+
    '<i class="k-foil"></i>'+(n>1?'<i class="kcnt">×'+n+'</i>':'')+
    '</div>';
}
/** 選んだカードの詳細と、登録の入れ替え */
function cardDetailHtml(id){
  const S=CL.S, c=CARDS[id], st=styleOfCard(c), sk=c.skill?SKILLS[c.skill]:null, inSq=S.sq.includes(id);
  let h='<div class="kdet">'+cardHtml(id,"m")+'<div class="kinfo">'+
    '<p class="kmeta"><b>'+cardNoOf(c)+'</b> '+RAR_TAG[c.rar||"B"]+' ・ '+clubOfCard(c)+' #'+c.no+' ・ 合計 <b>'+statTotal(c)+'</b></p>'+
    '<div class="sts">'+STATS.map(k=>'<span class="st"><i>'+STAT_LABEL[k]+'</i><b>'+c[k]+'</b><em><u style="width:'+(c[k]/STAT_MAX*100)+'%"></u></em></span>').join("")+'</div>'+
    '<p><b>★'+(sk?sk.label:"")+'</b> '+(sk?sk.desc:"")+'</p>'+
    (st?'<p><b>KP: '+st.name+'</b> <small>'+(st.scope==="team"?"全体":"個人")+'・'+AXIS_LABEL[st.axis]+'</small><br>'+
      '<span class="get">○ '+st.get+'</span>'+(st.lose?'<br><span class="lose">× '+st.lose+'</span>':'')+'</p>':'')+
    '<p class="dim">得意: '+c.roles.join(" / ")+' ・ 持っている枚数 '+(S.coll[id]||0)+'</p></div></div>';
  if(inSq)h+='<p class="dim">登録中の選手</p>';
  else{
    h+='<p class="hint">登録する: 入れ替える選手を選ぶ(その選手の育成は消える)</p>'+
      chipsHtml(S.sq,[],(g,x)=>(S.sq.indexOf(x)<11?"先発 ":"控え ")+(g?"個★"+g.is:""),"swap");
  }
  return h;
}
/** コレクション(登録していないカード) */
function collectionHtml(){
  const S=CL.S, ids=Object.keys(S.coll), n=ids.reduce((s,id)=>s+S.coll[id],0);
  const ord=r=>RAR_ORDER.indexOf(r), posOrd={ GK:0, DF:1, MF:2, FW:3 };
  const by={ rar:(a,b)=>ord(CARDS[b].rar)-ord(CARDS[a].rar)||posOrd[CARDS[a].pos]-posOrd[CARDS[b].pos]||cnoCmp(a,b),
    no:cnoCmp, tot:(a,b)=>statTotal(CARDS[b])-statTotal(CARDS[a])||cnoCmp(a,b) };
  const list=ids.filter(id=>!S.sq.includes(id)&&(CL.cf==="ALL"||CARDS[id].pos===CL.cf)).sort(by[CL.cs]||by.rar);
  let h='<section class="card coll"><h3>カード <small>'+ids.length+'種 ・ '+n+'枚 ・ 登録 16人</small></h3>'+
    '<div class="tabs t5">'+["ALL","GK","DF","MF","FW"].map(k=>'<button class="tab'+(CL.cf===k?' on':'')+'" data-act="cf" data-v="'+k+'">'+
      (k==="ALL"?"全部":k)+'</button>').join("")+'</div>'+
    '<div class="tabs t3 sorts">'+[["rar","レア順"],["no","No.順"],["tot","合計順"]].map(([k,t])=>'<button class="tab'+((CL.cs||"rar")===k?' on':'')+
      '" data-act="cs" data-v="'+k+'">'+t+'</button>').join("")+'</div>';
  if(CL.sel)h+=cardDetailHtml(CL.sel);
  h+=list.length?'<div class="kgrid">'+list.map(id=>cardHtml(id,"s",CL.sel===id?" on":"")).join("")+'</div>'
    :'<p class="dim">登録していないカードはまだ無い。試合のあとに1枚ずつ出る</p>';
  return h+'</section>';
}

/** 任期終了の画面。称号・年俸・施設・ついてくる選手(→term.js) */
function termEndHtml(){
  const S=CL.S, e=S.tend, x=e.facts, t=titleOf(e.title);
  const ttl=S.titles.filter(z=>z.term===S.term).map(z=>COMPS[z.comp].name);
  let h='<section class="card next tend"><h3>任期終了 <small>第'+e.term+'任期</small></h3>'+
    '<div class="ttl"><small>監督称号</small><b>'+t.name+'</b><i>'+t.need+'</i></div>'+
    '<div class="sc2"><b>'+x.w+'勝 '+x.d+'分 '+x.l+'敗</b></div>'+
    '<p>勝率 '+Math.round(x.wr*100)+'% ・ タイトル '+x.titles+' ・ 賞金 '+Math.round(x.money)+'億</p>'+
    (ttl.length?'<p class="dim">'+ttl.join(" / ")+'</p>':'')+
    '<p>覚醒 '+x.awake+'人 ・ 黄金線 '+x.gold+'本 ・ KP 変更 '+x.kpCh+'回 ・ 先発で使った選手 '+x.used+'人</p>'+
    '<div class="sal"><div><small>年俸</small><b>'+e.salary+'<i>億</i></b></div><div><small>累計</small><b>'+e.total+'<i>億</i></b></div>'+
      '<div><small>施設</small><b>Lv'+e.fac+'</b>'+(e.facUp?'<i class="up">UP</i>':'')+'</div></div>'+
    '<p class="dim">施設が上がると、特殊練習が候補に出やすくなる</p>';
  h+='<h4>次の任期についてくる選手</h4>'+(e.follow.length?'<ul class="fol">'+e.follow.map(id=>{
      const g=S.g.pl[id], c=CARDS[id];
      return '<li><b>'+c.no+' '+nameOf(c)+'</b> 個人'+stars(g.is)+' 特殊'+stars(g.ss)+' <small>絆 '+g.bond+'</small></li>'; }).join("")+'</ul>'
    :'<p class="dim">絆を深めた選手がいない(コミュニケーションで呼ぶと絆が深まる)</p>')+
    '<p class="dim">ついてくる選手は★と能力を保ったまま、互いの連携も残る。ほかの選手は初めから。'+
    '次の任期はリーグの格 '+e.grade+' から</p>'+
    '<button class="btn btn-main" data-act="term">次の任期へ</button></section>';
  return h;
}
/** 歴代の任期 */
function careerHtml(){
  const S=CL.S;
  if(!S.career.length)return "";
  return '<section class="card"><h3>歴代 <small>累計年俸 '+S.salary+'億</small></h3><table class="tbl">'+
    '<tr><th></th><th></th><th>勝</th><th>分</th><th>敗</th><th>冠</th><th>年俸</th></tr>'+
    S.career.map(c=>'<tr><td>第'+c.term+'任期</td><td class="nm2">'+titleOf(c.title).name+'</td><td>'+c.w+'</td><td>'+c.d+
      '</td><td>'+c.l+'</td><td>'+c.titles+'</td><td>'+c.salary+'</td></tr>').join("")+'</table></section>';
}
/* ---- 監督室(→docs/07 §7.9)。HOME をハブにして、下のタブで行き来する ---- */

const TABS=[["home","HOME","⌂"],["squad","SQUAD","◫"],["cards","CARDS","▤"],["season","SEASON","☰"],["club","CLUB","◎"]];

/** 秘書の一言。次に何をするとよいかを、状況から1つ選ぶ */
function secLine(S){
  const fx=CL.fx, g=S.g, pl=Object.values(g.pl);
  if(CL.alert)return CL.alert;                 // 保存の異常は何より先に知らせる
  if(S.termOver)return "任期が終わりました。お疲れさまでした。";
  const sign=Object.keys(g.pl).filter(id=>hasSign(S,id)).length;
  const omen=pl.filter(p=>p.q||p.sq).length+Object.values(g.links).filter(l=>l.gold).length;
  if(fx.kind==="friendly"&&omen)return "フレンドリーマッチです。兆しのある選手を出して勝てば、開花します。";
  if(g.step!=="train"&&commLeft(S))return "練習は済みました。コミュニケーションがあと "+commLeft(S)+" 回使えます。";
  if(teamFatigue(S)>=TUNING.grow.int.tiredSign)return "選手が疲れています。今日の練習は軽めにしては。";
  if(sign)return "「！」の付いた選手が "+sign+" 人います。話を聞いてあげてください。";
  if(fx.ko&&/決勝/.test(fx.label))return COMPS[fx.comp].name+"の決勝です。ここで勝てばタイトルです。";
  if(S.played===0)return "ようこそ、監督。まずは次の試合に向けて準備を始めましょう。";
  return "次の試合の準備を始めましょう。";
}
/** 次の試合の煽り(同じ試合なら毎回同じ文) */
function hypeOf(S,fx){
  const t=tierOf(fx.opp), me=S.grade+1;
  if(fx.kind==="friendly")return "腕試しの一戦。";
  if(fx.agg)return "第1試合の結果を背負って、勝負の第2戦。";
  if(/決勝/.test(fx.label))return "頂点まで、あと一つ。";
  if(fx.kind==="league"&&S.league.done===13)return "リーグ最終節。";
  if(t>=me+2)return "格上への挑戦。番狂わせを起こせ。";
  if(t<=me-1)return "取りこぼしは許されない。";
  return fx.kind==="cup"?"負ければ終わりの一戦。":"勝ち点3を積み上げる。";
}
/** HOME の見出し(クラブと任期) */
function homeHeadHtml(){
  const S=CL.S, C=TUNING.club, last=S.career.length?titleOf(S.career[S.career.length-1].title).name:null;
  return '<header class="chd">'+emblemSvg(TEAMS.azr,30)+'<div><b>'+teamNameOf(TEAMS.azr)+'</b><small>第'+S.term+'任期 ・ 格 '+S.grade+
    ' ・ 施設 Lv'+S.fac+(last?' ・ 「'+last+'」':'')+'</small></div>'+
    '<div class="num"><b>'+S.played+'<i>/'+C.termLen+'</i></b><small>MATCH</small></div>'+
    '<div class="num"><b>'+S.money.toFixed(0)+'<i>億</i></b><small>PRIZE</small></div></header>';
}
/** 次の試合のタイル。**タイル全体が押す面**で、中にボタンを置かない(pftb の決まり) */
function nextTileHtml(){
  const S=CL.S, fx=CL.fx, comp=COMPS[fx.comp], t=TEAMS[fx.opp], kp=CARDS[t.kp], st=styleOfCard(kp);
  const go=S.g.step==="train"?"準備をはじめる":"準備のつづき";
  return '<section class="tile next" data-act="go">'+
    '<div class="nx-band">'+gradeTag(comp.grade)+'<b>'+comp.name+'</b><em>'+(fx.label||"")+'</em><i>第'+fx.no+'試合</i></div>'+
    '<p class="nx-hype">'+hypeOf(S,fx)+'</p>'+
    '<div class="nx-vs"><div class="me">'+emblemSvg(TEAMS.azr,46)+'<b>'+TEAMS.azr.short+'</b></div>'+
      '<span class="vs">VS</span>'+
      '<div class="op">'+emblemSvg(t,46)+'<b>'+t.short+'</b></div></div>'+
    '<p class="nx-opp">'+teamNameOf(t)+' <span>'+"★".repeat(tierOf(fx.opp))+'</span></p>'+
    '<p class="nx-meta">KP '+nameOf(kp)+(st?' ・ '+st.name:'')+' ・ '+t.form+
      (fx.kind==="friendly"?"":fx.home?" ・ HOME":" ・ AWAY")+(fx.agg?' ・ 第1試合 '+fx.agg[0]+'-'+fx.agg[1]:fx.ko?' ・ 同点なら PK':'')+'</p>'+
    (fx.missed?'<p class="nx-meta dim">'+COMPS[fx.missed].name+'('+fx.why+')の枠</p>':'')+
    '<div class="nx-go">› '+go+'</div></section>';
}
/** 秘書の一言 */
function secHtml(){
  return '<section class="sec"><i class="sec-ic">SEC</i><p>'+secLine(CL.S)+'</p></section>';
}
/** 前の試合(要約) */
function lastHtml(){
  const S=CL.S, L=S.last;
  if(!L)return "";
  const lines=L.lines.filter(x=>!/^カード:/.test(x)).slice(0,3);
  return '<section class="tile last"><h3>前の試合 <small>'+COMPS[L.comp].name+' '+(L.label||"")+'</small></h3>'+
    '<div class="ls"><div class="ls-sc">'+TEAMS.azr.short+' <b>'+L.hg+' - '+L.ag+'</b> '+clubShort(L.opp)+
      (L.pso?'<small>PK '+L.pso[0]+'-'+L.pso[1]+'</small>':'')+'</div>'+
      (L.card?'<div class="ls-card">'+cardHtml(L.card,"s")+'</div>':'')+'</div>'+
    (lines.length?'<ul>'+lines.map(x=>'<li>'+x+'</li>').join("")+'</ul>':'')+'</section>';
}
function homeHtml(){
  const S=CL.S;
  return homeHeadHtml()+(S.termOver?termEndHtml():nextTileHtml()+secHtml()+lastHtml());
}
/** SEASON: リーグの順位と大会 */
function seasonHtml(){
  const S=CL.S, L=S.league, order=sortTable(L.table);
  let h='<section class="card"><h3>レギュラーリーグ <small>'+L.done+'/14 節</small></h3><table class="tbl">'+
    '<tr><th></th><th></th><th>試</th><th>勝</th><th>分</th><th>敗</th><th>得失</th><th>点</th></tr>'+
    order.map((id,i)=>{ const r=L.table[id];
      return '<tr'+(id==="me"?' class="me"':'')+'><td>'+(i+1)+'</td><td class="nm2">'+clubName(id)+'</td><td>'+r.p+
        '</td><td>'+r.w+'</td><td>'+r.d+'</td><td>'+r.l+'</td><td>'+(r.gf-r.ga>0?"+":"")+(r.gf-r.ga)+'</td><td><b>'+r.pts+'</b></td></tr>'; }).join("")+
    '</table></section>';
  const stTxt={ wait:"—", in:"出場中", out:"敗退", quit:"棄権", won:"優勝" };
  h+='<section class="card"><h3>大会 <small>'+S.cyc+'周目</small></h3><table class="tbl cups">'+
    CUP_IDS.map(id=>{ const c=S.cups[id], past=SCHED.findIndex(x=>x[0]===id)<S.slot;
      const txt=c.st==="wait"?(past?"出場なし":entryOk(S,id)?"出場できる":"条件を満たしていない"):stTxt[c.st];
      return '<tr class="st-'+c.st+'"><td>'+gradeTag(COMPS[id].grade)+'</td><td class="nm2">'+COMPS[id].name+'</td><td>'+txt+'</td></tr>'; }).join("")+
    '</table></section>';
  return h;
}
/** CLUB: この任期の記録・歴代・設定 */
function clubTabHtml(){
  const S=CL.S, r=S.rec, names=S.titles.filter(t=>t.term===S.term).map(t=>COMPS[t.comp].name);
  return '<section class="card"><h3>この任期 <small>第'+S.term+'任期</small></h3>'+
    '<div class="rec"><div><b>'+r.w+'</b><small>勝</small></div><div><b>'+r.d+'</b><small>分</small></div><div><b>'+r.l+'</b><small>敗</small></div>'+
    '<div><b>'+r.gf+'</b><small>得点</small></div><div><b>'+r.ga+'</b><small>失点</small></div></div>'+
    '<p class="dim">タイトル '+names.length+(names.length?': '+names.join(" / "):'')+'</p></section>'+
    careerHtml()+settingsHtml();
}
function tabbarHtml(){
  const S=CL.S, sign=Object.keys(S.g.pl).some(id=>hasSign(S,id));
  return '<nav class="tabbar">'+TABS.map(([k,l,ic])=>'<button class="'+(CL.tab===k?'on':'')+'" data-act="tab" data-v="'+k+'">'+
    '<i>'+ic+'</i><span>'+l+'</span>'+(k==="squad"&&sign?'<b class="dot"></b>':'')+'</button>').join("")+'</nav>';
}
function clubHtml(){
  if(CL.flow==="prep"&&!CL.S.termOver)return prepHtml();
  const body=CL.tab==="squad"?squadHtml():CL.tab==="cards"?collectionHtml():CL.tab==="season"?seasonHtml()
    :CL.tab==="club"?clubTabHtml():homeHtml();
  return '<div class="cl-main tab-'+CL.tab+'">'+body+'</div>'+tabbarHtml();
}

/** 試合を始める。配置は前の試合の最後のまま */
function startFixture(){
  skipComm(CL.S);                              // 残りのコミュニケーションは使わない
  CL.flow=null; CL.tab="home";
  const fx=CL.fx, m=fixtureMatch(CL.S,fx), comp=COMPS[fx.comp];
  CL.msg=[]; CL.comm=null; CL.pick=[];
  sceneMatchup(fx,()=>{
    sceneHide(); hideClub();
    newMatch(m.home,m.away,m.seed,m.opts,{ title:comp.name+(fx.label?" "+fx.label:""), career:true,
      starters:m.home.xi.map(x=>x.card.id) });
  });
}
/** 試合が終わったら呼ぶ。結果を反映して保存し、クラブハウスへ戻る */
function finishFixture(M){
  // 並びと KP は SQUAD で決めた既定のまま。試合中に動かしたぶんはその試合だけ(→docs/07 §7.10)
  const onPitch=M.home.players.map(p=>p.id);
  const played=[...new Set((G.meta.starters||[]).concat(onPitch))];
  applyResult(CL.S,CL.W,CL.fx,{ hg:M.home.score, ag:M.away.score, pso:M.pso, layout:null, kp:null, played, onPitch,
    starters:G.meta.starters||[], subs:M.home.subs,
    kpCh:M.events.filter(e=>e.type==="kp"&&e.side==="H").length });
  persist(CL.S);
  const L=CL.S.last;
  sceneResult(M,L,()=>{
    const done=()=>{ sceneHide(); showClub(); };
    if(L&&L.card)sceneCard(L.card,L.cardNew,done); else done();
  });
}
function onClubClick(e){
  const b=e.target.closest("[data-act]");
  if(!b||b.disabled)return;
  const act=b.dataset.act, S=CL.S, save=()=>persist(S);
  if(act!=="reset")CL.armReset=false;
  if(onSettingsClick(act,b))return;
  if(act==="tab"){ CL.tab=b.dataset.v; CL.sel=null; CL.sqSel=null; showClub(); return; }
  if(act==="go"){ CL.flow="prep"; CL.comm=null; CL.pick=[]; showClub(); return; }
  if(act==="home"){ CL.flow=null; CL.tab="home"; showClub(); return; }
  if(act==="play")startFixture();
  else if(act==="decline"){ declineCup(S,CL.fx.comp); CL.msg=["棄権した。この枠はフレンドリーマッチになる"]; save(); showClub(true); }
  else if(act==="term"){ startNextTerm(S,CL.W); CL.msg=[]; save(); showClub(); }
  else if(act==="train"){
    const o=trainOptions(S)[+b.dataset.i];
    CL.msg=["練習: "+trainLabel(o)+"("+INT_LABEL[CL.int]+")"].concat(doTraining(S,+b.dataset.i,CL.int));
    CL.comm=null; CL.pick=[]; save(); showClub();
  }
  else if(act==="int"){ CL.int=+b.dataset.i; showClub(true); }
  else if(act==="rest"){ CL.msg=doRest(S); CL.comm=null; CL.pick=[]; CL.int=1; save(); showClub(); }
  else if(act==="cf"){ CL.cf=b.dataset.v; CL.sel=null; showClub(true); }
  else if(act==="cs"){ CL.cs=b.dataset.v; showClub(true); }
  else if(act==="card"){ CL.sel=CL.sel===b.dataset.id?null:b.dataset.id; showClub(true); }
  else if(act==="swap"&&CL.sel){
    const out=b.dataset.id, inn=CL.sel;
    if(swapSquad(S,out,inn)){ CL.msg=["登録: "+cname(out)+" → "+cname(inn)+"(次の試合から使える)"]; CL.sel=null; save(); }
    showClub(true);
  }
  else if(act==="sqpick")sqPick(b.dataset.id);
  else if(act==="sqform"){ setForm(S,b.dataset.v); CL.sqSel=null; save(); showClub(true); }
  else if(act==="sqkp"){ S.kp=b.dataset.id; save(); showClub(true); }
  else if(act==="comm"){ CL.comm=b.dataset.v; CL.pick=[]; showClub(true); }
  else if(act==="ind"&&CL.pick.length===1){
    const id=CL.pick[0], r=doIndTrain(S,id); CL.msg=CL.msg.concat(["個人練習"],r.lines,[reactOf(S,id,"ind",r.res===1?1:0)]);
    CL.pick=[]; save(); showClub(true);
  }
  else if(act==="talk"&&CL.pick.length===1){
    const id=CL.pick[0], r=doTalk(S,id); CL.msg=CL.msg.concat(["声かけ"],r.lines,[reactOf(S,id,"talk",0)]);
    CL.pick=[]; save(); showClub(true);
  }
  else if(act==="pick"){
    const id=b.dataset.id, max=COMM_UI[CL.comm]?COMM_UI[CL.comm].n:1, i=CL.pick.indexOf(id);
    if(i>=0)CL.pick.splice(i,1); else{ if(CL.pick.length>=max)CL.pick.shift(); CL.pick.push(id); }
    showClub(true);
  }
  else if(act==="lounge"&&CL.pick.length===2){
    const r=doLounge(S,CL.pick[0],CL.pick[1],+b.dataset.i);
    CL.msg=CL.msg.concat(["ラウンジ: "+cname(CL.pick[0])+" と "+cname(CL.pick[1])],r.lines,r.res>=0?[reactOf(S,CL.pick[0],"lounge",r.res)]:[]);
    CL.pick=[]; save(); showClub(true);
  }
  else if(act==="meet"&&CL.pick.length===1){
    const r=doMeeting(S,CL.pick[0],+b.dataset.i);
    CL.msg=CL.msg.concat(["ミーティング: "+cname(CL.pick[0])],r.lines,r.res>=0?[reactOf(S,CL.pick[0],"meet",r.res)]:[]);
    CL.pick=[]; save(); showClub(true);
  }
  else if(act==="reset"){
    if(!CL.armReset){ CL.armReset=true; showClub(true); return; }
    CL.armReset=false; clearCareer(CL.store); CL.msg=[];
    CL.S=newCareer(Date.now()&0x7fffffff); CL.W=worldOf(CL.S);
    persist(CL.S); showClub();
  }
}
