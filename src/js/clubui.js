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
  if(S&&S.fromPrev){
    // 最新のセーブが読めず、1つ前の世代から戻した。読めなかった方は退避しておく
    delete S.fromPrev; const raw=rawSave(CL.store); if(raw)backupSave(CL.store,raw);
    CL.alert="最新のセーブを読めなかったので、1試合前のセーブから戻しました(読めなかった方は退避してあります)";
  }
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
  if(typeof bgmPlay==="function")bgmPlay("club");   // 監督室の BGM(→docs/14 第4弾)
  const el=document.getElementById("club"), old=el.querySelector(".cl-main"), y=old?old.scrollTop:0;
  const kb=el.querySelector(".kmod-box"), ky=kb?kb.scrollTop:0;
  CL.fx=nextFixture(CL.S,CL.W);
  el.innerHTML=clubHtml();
  el.classList.add("on");
  const main=el.querySelector(".cl-main");
  if(main)main.scrollTop=keepScroll?y:0;
  const kb2=el.querySelector(".kmod-box");
  if(kb2){ kb2.scrollTop=keepScroll?ky:0; if(CL.kTo){ const t=kb2.querySelector(CL.kTo); if(t)kb2.scrollTop=t.offsetTop-8; CL.kTo=null; } }
  const pitch=document.getElementById("sqPitch");
  if(pitch)sqBind(pitch);
  k3dBind();                                   // 大きなカード(→docs/14 §14.114)
  holdBind();                                  // 長押しのボタン(→docs/14 §14.124)
}
function hideClub(){ document.getElementById("club").classList.remove("on"); }

const clubName=id=>id==="me"?myTeam(CL.S).name:teamNameOf(TEAMS[id]);
const clubShort=id=>id==="me"?myTeam(CL.S).short:TEAMS[id].short;
const stars=n=>"★".repeat(n)+"☆".repeat(5-n);
const gradeTag=g=>g==="-"?"":'<b class="gr gr'+g+'">'+g+'</b>';
const cname=id=>nameOf(CARDS[id]);
/** 国籍と動物(→docs/08 §8.6)。例: イタリア ・ 🦈鮫(海) */
const natTxt=c=>NAT_NAME[c.nat]||c.nat||"";
const aniTxt=c=>{ const a=ANIMALS[c.ani]; return a?ANI_ICON[c.ani]+a.name+"("+ANI_GROUP[a.g]+")":""; };
const BONUS_LABEL={ nat:"同じ国籍", club:"同じクラブ", ani:"同じ動物" };

/* ---- 育成の札 ---- */

/** 疲労の電池(3目盛り・横向き)。満タン緑 → 1つ減って黄 → 2つ減って赤 → 空で灰(→docs/14 §14.81) */
const batteryHtml=(g,to)=>{
  // to … 見通しのあとの残り。休憩でふえる目盛りは点滅(色はあとの段)、練習で減る目盛りは赤く点滅(→docs/14 §14.84・§14.87)
  const n=batteryOf(g), m=to!=null?to:n;
  if(m<n)return '<i class="bat b'+m+' bdrop" title="疲労">'+[0,1,2].map(k=>'<u class="'+(k<m?'on':k<n?'dn':'')+'"></u>').join("")+'</i>';
  return '<i class="bat b'+m+(m>n?' brec':'')+'" title="疲労">'+[0,1,2].map(k=>'<u class="'+(k<n?'on':k<m?'on up':'')+'"></u>').join("")+'</i>'; };
/** 開く ▽ / 閉じる ▲(字で説明しない。→docs/14 §14.107)。open … いま開いているか */
const foldBtn=(act,open,label)=>'<button class="fold'+(open?' up':'')+'" data-act="'+act+'" aria-label="'+(label||(open?'閉じる':'開く'))+'"></button>';
/** 閉じる □×(浮いている窓・カードの右上。→docs/14 §14.107) */
const xBtn=act=>'<button class="xb" data-act="'+act+'" aria-label="閉じる">×</button>';
/** 話がある印(前は「！」。分かりにくいので吹き出しの形に。→docs/14 §14.78) */
const BUB='<svg class="bub" viewBox="0 0 16 16" aria-label="話がある"><path d="M2.5 2.5h11a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H7.2l-3.2 3v-3H2.5a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1z"/></svg>';
/** 覚醒の兆し(個人の覚醒・特殊の★5 の手前)。フレンドリーマッチに連れていく合図なので、ここだけは見せる */
const sgnOf=g=>g&&(g.q||g.sq)?'<b class="sgn2">覚醒の兆し</b>':'';
/** 選手を指名するための札の並び。on = 選択中。info = 札の下段に出す情報。act = 押したときの動き */
function chipsHtml(ids,on,info,act){
  const S=CL.S;
  return '<div class="chips">'+ids.map(id=>{
    const c=CARDS[id];
    return '<button class="chipb '+c.pos.toLowerCase()+(on.includes(id)?' on':'')+'" data-act="'+(act||"pick")+'" data-id="'+id+'">'+
      '<i>'+c.no+'</i>'+nameOf(c)+(hasSign(S,id)?'<b class="sign">'+BUB+'</b>':'')+
      '<small>'+info(S.g.pl[id],id)+'</small></button>'; }).join("")+'</div>';
}
/**
 * コミュニケーションの相手を選ぶ盤面(本家と同じくフォーメーションのまま。→docs/08 §8.12)。
 * 先発は SQUAD の既定の位置、控えは下の列。駒には次の★までの進みなど(info)を添える
 */
function commBoardHtml(ids,on,info,stars){
  const S=CL.S, xi=S.sq.slice(0,11), L=fillLayout(S);
  const first=CL.comm==="lounge"&&on.length?on[0]:null;   // ラウンジで1人目を選んだら、その人との線と前兆だけを見せる(→docs/07 §7.14)
  const o=id=>{ const g=S.g.pl[id];
    return { act:"pick", info:info(g,id), hi:on.includes(id), sign:first?id!==first&&linkSign(S,first,id):commSign(S,id,CL.comm),
      stars:stars!==undefined?stars:CL.comm==="ind"?"is":CL.comm==="meet"?"ss":null }; };
  const bench=S.sq.slice(11).filter(id=>ids.includes(id));
  return '<div class="cm-board"><div class="sq-pitch cm-pitch"><i class="pm half"></i><i class="pm circ"></i><i class="pm pa top"></i><i class="pm pa bot"></i>'+
    (first&&L[first]&&xi.includes(first)?loungeLinksSvg(first,xi.filter(id=>ids.includes(id)),L):'')+
    xi.filter(id=>ids.includes(id)).map(id=>sqTokenHtml(id,xi.indexOf(id),true,o(id))).join("")+'</div>'+
    '<div class="sq-bench cm-bench"><span class="lbl">SUB</span>'+bench.map(id=>sqTokenHtml(id,S.sq.indexOf(id),false,o(id))).join("")+'</div></div>';
}
/**
 * ラウンジの1人目と、盤面のほかの選手との連携の線。線なしは淡い点線、薄線・太線・黄金線は SQUAD と同じ線、
 * 黄金線の兆しは金の点線を重ね、強くなる前兆がある相手は線を光らせる
 */
function loungeLinksSvg(a,ids,L){
  const S=CL.S, P=id=>sqPos(L[id][0],L[id][1]), A=P(a);
  let h='<svg class="sq-links cm-links" viewBox="0 0 100 100" preserveAspectRatio="none">';
  for(const b of ids){
    if(b===a||!L[b])continue;
    const l=linkOf(S,a,b), B=P(b);
    const ln=cls=>'<line class="'+cls+'" x1="'+A.l.toFixed(2)+'" y1="'+A.t.toFixed(2)+'" x2="'+B.l.toFixed(2)+'" y2="'+B.t.toFixed(2)+'" vector-effect="non-scaling-stroke"/>';
    h+=(linkSign(S,a,b)?ln("lk sgl"):"")+ln("lk l"+l.lv)+(l.gold&&l.lv===2?ln("lk omen"):"");
  }
  return h+'</svg>';
}
/** コミュニケーションの種類ごとの、札の見せ方と問いかけ */
const COMM_UI={
  // 育成度(次の★までの %)は裏の数字なので出さない。フィーリングで感じる程度に(→docs/14 §14.78)。覚醒の兆しだけは見せる
  ind:   { sub:"個人能力", n:1, hint:"1人を選ぶ(★は試合のあとに上がる)", info:g=>sgnOf(g) },
  meet:  { sub:"特殊能力", n:1, hint:"1人を選ぶ(吹き出し = ★突破の話がある)", info:g=>sgnOf(g) },
  // 相性の組は見せない(→docs/08)。1人目を選んだら、その人との今の連携を出す
  lounge:{ sub:"2人の連携", n:2, hint:"2人を選ぶ(気の合う2人ほど連携が深まる)", info:(g,id)=>{ const a=CL.pick[0];
    if(!a||a===id)return ""; const l=linkOf(CL.S,a,id);
    // 動物の印と連携の進み(%)は出さない(→docs/14 §14.78)。いまの線の段だけ
    // 線の名前ではなく、2人の関係の言い方で(→docs/14 §14.88)。信頼(黄金線)は金の文字、黄金線の兆しは「信頼の兆し」
    return l.lv>=3?'<b class="rel-gd">信頼</b>':l.lv===2&&l.gold?'<b class="rel-sg">信頼の兆し</b>':REL_LABEL[l.lv]; } },
  talk:  { sub:"やる気・ケガ", n:1, hint:"1人を選ぶ(落ちている選手ほど大きく戻る。ケガの選手は手当てで治る)", info:g=>'<b class="mot m'+g.mot+'">'+MOT_LABEL[g.mot]+'</b>' }
};
/** 育成で起きたことの帯(手順の上に出す) */
/**
 * インフォバー(→docs/14 §14.41)。画面の右から滑り込み、少し置いて消える。めったに出ない大事な知らせ用
 * (成長グラフの限界突破・黄金期の到来・ハーフタイムの指示を覚えた)。複数あれば少しずつずらして重ねる
 */
const INFO_BAR_RE=/^(🌟|👑|📋|🏷)/;
function infoBar(lines){
  if(!lines||!lines.length)return;
  let box=document.getElementById("infoBars");
  if(!box){ box=document.createElement("div"); box.id="infoBars"; document.body.appendChild(box); }
  lines.forEach((t,i)=>{
    const el=document.createElement("div");
    el.className="ibar"+(/^👑/.test(t)?" gold":"");
    const m=/^(\p{Extended_Pictographic}\uFE0F?)\s*/u.exec(t);
    el.innerHTML='<i>'+(m?m[1]:'ℹ')+'</i><span>'+(m?t.slice(m[0].length):t)+'</span>';
    el.style.animationDelay=(i*0.45)+"s";
    box.appendChild(el);
    setTimeout(()=>el.remove(),4200+i*450);
  });
  if(typeof sndUi==="function")sndUi("ok");
}
function msgHtml(only){
  const m=only?CL.msg.filter(x=>only.test(x)):CL.msg;   // only … この型の行だけ出す(コミュニケーションの上は大事な知らせだけ。→docs/14 §14.40)
  return m.length?'<div class="msgs">'+m.map(x=>'<span>'+x+'</span>').join("")+'</div>':"";
}
/**
 * 練習の効果の見通し(→docs/14 §14.30)。セーブの写しで練習を1回行い、今との差を返す(本物は変えない)。
 * 返り値 { graph:練習後の成長グラフ, gold, pl:{ id:{ ind:個人の進みの増え(0〜1), sp:特殊の進みの増え } } }
 */
function trainPreview(S,i,lv){
  const T=JSON.parse(JSON.stringify(S)), out={ graph:null, gold:null, pl:{} };
  doTraining(T,i,lv);
  out.graph=T.g.graph; out.gold=T.g.gold;
  for(const id in S.g.pl){ const a=S.g.pl[id], b=T.g.pl[id]; if(!b)continue;
    const di=(b.is>a.is?1:0)+indProgress(b)-indProgress(a), ds=(b.ss>a.ss?1:0)+spProgress(b)-spProgress(a);
    out.pl[id]={ ind:Math.max(0,di), sp:Math.max(0,ds) }; }
  return out;
}
/** チーム練習の下: 成長グラフ(練習後を重ねる)と、フォーメーションの盤面(誰がどれだけ伸びるか) */
function trainEffectHtml(part){
  const S=CL.S, G=S.g.graph, R=TUNING.grow.graph, sel=CL.trSel!=null&&CL.int!==-1;
  const pv=sel?trainPreview(S,CL.trSel,CL.int):null, cur={}, aft={};
  for(const a in G){ cur[a]=G[a]/R.max; if(pv)aft[a]=pv.graph[a]/R.max; }
  const sets=[{ v:cur, color:teamColor(myTeam(S)), op:0.3 }].concat(pv?[{ v:aft, color:"#ff3d6e", fill:"#ff3d6e", op:0.18 }]:[]);
  const diff=pv?Object.keys(G).map(a=>({ a, d:pv.graph[a]-G[a] })).filter(x=>Math.abs(x.d)>=0.05):[];
  const chips=diff.length?diff.map(x=>'<span class="'+(x.d>0?'up':'dn')+'">'+AXIS_ABBR[x.a]+' '+(x.d>0?'+':'')+x.d.toFixed(1)+'</span>').join("")
    :'<span class="dim">'+(sel?'成長グラフは変わらない':'練習を選ぶと、伸びる軸(黄)と下がる軸が出る')+'</span>';
  // 盤面: 選んだ練習でよく伸びる選手(個人の進みが平均より大きい)を光らせ、札に伸びを出す
  const vals=pv?Object.values(pv.pl).map(x=>x.ind):[], avg=vals.length?vals.reduce((s,x)=>s+x,0)/vals.length:0;
  const fit=pv?Object.keys(pv.pl).filter(id=>pv.pl[id].ind>avg*1.15):[];
  const info=g=>sgnOf(g);   // 育成度・伸びの % は出さない(よく伸びる選手が光るだけ。→docs/14 §14.78)
  // part="graph" … 練習の候補の左に置くグラフ / それ以外 … 盤面(→docs/14 §14.34)
  const hl={}, delta={}; diff.forEach(x=>{ hl[x.a]=x.d>0?"u":"d"; delta[x.a]=x.d; });
  // part="graph" … 候補の左のグラフ / "chips" … 候補の下の変わる軸と凡例 / それ以外 … 盤面(→docs/14 §14.35)
  if(part==="graph")return '<div class="tf-g">'+radarSvg(sets,{ gold:S.g.gold, hl, delta, cls:"tf-radar" })+'</div>';
  if(part==="chips")return '<div class="tf-chips">'+chips+(pv?'<span class="tf-leg"><i class="tf-fit"></i>よく伸びる選手</span>':'')+'</div>';
  return '<section class="tr-fx">'+
    (()=>{ // 練習の強さを選んでいれば、練習のあとの疲労で電池を描く(減る目盛りが赤く点滅。→docs/14 §14.87)
      const N=TUNING.grow.int, add=CL.int!=null&&CL.int>=0?N.fat[CL.int]||0:0;
      if(add>0){ CL.batTo={}; for(const id in S.g.pl){ const g=S.g.pl[id]; CL.batTo[id]=batteryOf({ fat:Math.min(N.fatMax,g.fat+add) }); } }
      const h=commBoardHtml(Object.keys(S.g.pl),fit,info,"is"); CL.batTo=null; return h; })()+'</section>';
}
/** 休憩の見通し(→docs/14 §14.37): 盤面に選手ごとの疲労(今 → 休憩のあと)。疲れている選手は暗く(試合中と同じ) */
function restEffectHtml(){
  const S=CL.S, T=JSON.parse(JSON.stringify(S)); doRest(T);
  // 疲労の数字はやめ、札の電池を休憩のあとの状態で描く(回復するぶんが点滅。→docs/14 §14.84)
  const info=()=>'';   // 調子が上がる選手は、調子の丸が光る(文字は出さない)
  CL.batTo={}; CL.motTo={}; for(const id in S.g.pl){ const b=T.g.pl[id]||S.g.pl[id]; CL.batTo[id]=batteryOf(b); CL.motTo[id]=b.mot; }
  const h='<section class="tr-fx rest-fx">'+commBoardHtml(Object.keys(S.g.pl),[],info,null)+'</section>';
  CL.batTo=null; CL.motTo=null;
  return h;
}
/** ① チーム練習 */
function trainStepHtml(){
  const S=CL.S, N=TUNING.grow.int, fat=teamFatigue(S);
  return '<div class="step-h one"><b>チーム練習</b><small>強いほど伸びるが疲れる ・ 疲労 <b class="'+(fat>=N.tiredSign?'warn':'')+'">'+Math.round(fat*100)+'%</b></small></div>'+
    '<div class="ints i4"><button class="tab rest'+(CL.int===-1?' on':'')+'" data-act="int" data-i="-1">休憩<small>疲労が抜ける</small></button>'+
      INT_LABEL.map((t,i)=>'<button class="tab'+(CL.int===i?' on':'')+'" data-act="int" data-i="'+i+'">'+t+
      '<small>×'+N.k[i]+(N.fat[i]?' 疲労+'+Math.round(N.fat[i]*100)+'%':'')+'</small></button>').join("")+'</div>'+
    (CL.int===-1
      ?'<div class="tr-top">'+trainEffectHtml("graph")+'<div class="tr-right"><div class="trs"><button class="tr rest" data-act="rest"><b>休憩する</b><small>練習の代わりに休む。経験は入らないが、疲労が大きく抜け、調子の落ちた選手が戻る</small></button></div></div></div>'+restEffectHtml()
      :'<div class="tr-top">'+trainEffectHtml("graph")+'<div class="tr-right"><div class="trs two">'+trainOptions(S).map((o,i)=>'<button class="tr'+(o.sp>=0?' sp':'')+(CL.trSel===i?' on':'')+'" data-act="train" data-i="'+i+'">'+
        '<b>'+trainLabel(o)+'</b></button>').join("")+'</div></div></div>'+trainEffectHtml());
}
/** ② コミュニケーション */
/* ---- コミュニケーションのチャット(→docs/07 §7.14)。画面の下に重なる層で、選手(左)・秘書(紫)・監督(右・金)が話す ---- */
const chatFace=id=>{ const c=CARDS[id], src=c&&typeof artSrc==="function"?artSrc(c,"stand"):null;
  return '<i class="cf pl">'+(src?'<img src="'+src+'" alt="">':'<b>'+(c?c.no:"")+'</b>')+'</i>'; };
const chatPl=(id,t,first)=>'<div class="cm pl'+(first?' first':'')+'">'+(first?chatFace(id):'<i class="cf sp"></i>')+'<div>'+(first?'<small>'+cname(id)+'</small>':'')+'<p>'+t+'</p></div></div>';
const chatSec=(t,first)=>'<div class="cm csec'+(first?' first':'')+'">'+(first?'<i class="cf pl se">'+(secArt(secOf(CL.S).id,"full")?'<img src="'+secArt(secOf(CL.S).id,"full")+'" alt="">':'')+'</i>':'<i class="cf sp"></i>')+'<div>'+(first?'<small>'+secOf(CL.S).name+'</small>':'')+'<p>'+t+'</p></div></div>';
const chatMe=t=>{ const f=CL.S&&CL.S.mgr?mgrArt(CL.S.mgr.av,"full"):null; return '<div class="cm me"><p>'+t+'</p>'+(f?'<i class="cf pl mg"><img src="'+f+'" alt=""></i>':'')+'</div>'; };
const chatNote=t=>'<div class="cn">'+t+'</div>';
/** いま開いているやりとり(選手を選んだら)と、答えたあとの結果 */
function commChatHtml(){
  const S=CL.S, U=COMM_UI[CL.comm];
  if(CL.chat){
    const K=CL.chat;
    const PR=S.g.prop&&S.g.prop.id===K.who[0]?S.g.prop:null;   // 選手からの提案(→docs/23 §23.2 の 5)
    return '<div class="chat-sheet"><div class="ch-head"><b>'+K.title+'</b>'+(PR||commLeft(S)?'':'<button class="ch-x" data-act="chatok" aria-label="閉じる">×</button>')+'</div><div class="ch-log">'+
      K.who.map((x,i)=>chatPl(x,"「"+voiceOf(S,x)+"」",true)).join("")+chatMe(K.said)+
      K.lines.map(chatNote).join("")+(K.react?chatPl(K.who[0],K.react,true):"")+
      (PR?chatPl(PR.id,"「監督、自分はこんな選手になりたいんです。どの道がいいと思いますか？」",true)+
        chatSec(secSay(S,"chProp",{ n:cname(PR.id) }),true):'')+
      '</div><div class="ch-acts">'+(PR?PR.opts.map((k,i)=>'<button class="cr prop" data-act="propick" data-i="'+i+'"><b>'+TAGS[k].name+'</b><small>'+TAGS[k].desc.replace(/^特性/,"")+'</small></button>').join("")+
          '<button class="cr" data-act="propick" data-i="-1">今は見送る</button>'
      :commLeft(S)?'<button class="cr ok" data-act="chatok">OK</button>'
        :'<button class="cr ok ko" data-act="chatgo">視察へ</button>')+'</div></div>';
  }
  if(!U||CL.pick.length!==U.n)return "";
  const id=CL.pick[0], who=CL.pick.slice();
  // 信頼度は注記で見せず、選手の言葉の距離感で伝える(→docs/14 §14.109)
  let log=who.map(x=>chatPl(x,"「"+voiceOf(S,x)+trustSay(S,x)+"」",true)).join(""), acts="";
  if(CL.comm==="lounge"){
    const f=loungeInfo(S,who[0],who[1]), bo=linkBonusOf(who[0],who[1]);
    log+=chatSec(secSay(S,"chLink",{ a:cname(who[0]), b:cname(who[1]), l:REL_LABEL[f.lv]+(f.gold?"(信頼の兆し)":"") }),true)+
      chatSec(f.hint+"。",false);   // 動物・国籍・相性の手がかりは出さない(→docs/14 §14.78)
    acts=f.choices.map((t,i)=>'<button class="cr" data-act="lounge" data-i="'+i+'">'+t+'</button>').join("");
  }else if(CL.comm==="meet"){
    const f=meetInfo(S,id);
    // 育成の様子を秘書の言葉で(★の数・性格の名前は出さない。性格は選手の話し方から。→docs/14 §14.108)
    log+=chatSec(growLine(S,id,"meet"),true);
    if(f.ready)acts=meetOpts(S,id).map(o=>'<button class="cr" data-act="meet" data-i="'+o.i+'">'+o.t+'</button>').join("");
    else acts='<button class="cr" data-act="meet" data-i="0">戦術の話をする</button>';
  }else if(CL.comm==="ind"){
    const p=S.g.pl[id];
    log+=chatSec(growLine(S,id,"ind"),true);   // 育成の様子を秘書の言葉で(→docs/14 §14.108)
    acts='<button class="cr" data-act="ind">個別に指導する</button>';
  }else{
    const p=S.g.pl[id];
    log+=chatSec(growLine(S,id,"talk"),true);   // 調子と疲れを秘書の言葉で(→docs/14 §14.108)
    acts='<button class="cr" data-act="talk">'+(p.mot===0?'ケガを手当てする':'ケアする')+'</button>';
  }
  return '<div class="chat-sheet"><div class="ch-head"><b>'+COMM_LABEL[CL.comm]+'</b><small>'+who.map(cname).join(" ・ ")+'</small>'+
    '<button class="ch-x" data-act="chatx">×</button></div><div class="ch-log">'+log+'</div><div class="ch-acts">'+acts+'</div></div>';
}
/** 答えたあと: 結果をチャットに残す(OK で閉じる)。react は選手の返事(reactOf の「」の中) */
function chatResult(kind,who,said,r,react){
  CL.chat={ title:COMM_LABEL[kind], who, said, lines:r.lines||[], react:react?react.replace(/^[^「]*/,""):"" };
  CL.pick=[];
}
/** 個別指導の種類ごとの施設(→docs/14 §14.92)。見出しに施設のレベルを出す */
const COMM_FAC={ ind:"train", meet:"tact", lounge:"lounge", talk:"med" };
const commFacHtml=(S,k)=>{ const f=COMM_FAC[k], lv=S.biz&&f?S.biz.fac[f]||0:null;
  return lv==null?'':'<i class="flv'+(lv>0?' up':'')+'" title="'+FAC_INFO[f].name+'">Lv'+lv+'</i>'; };
/** 秘書の呼びかけ(顔の丸 + 吹き出し)。個別指導の案内(→docs/14 §14.94) */
const cmSayHtml=t=>'<div class="cm-say">'+secAv(CL.S)+'<p>'+t+'</p></div>';
/** いまの個別指導の種類と、選んだ途中の状態に合わせた呼びかけ */
function cmLine(S){
  const k=CL.comm, ids=Object.keys(S.g.pl);
  if(k==="lounge")return CL.pick[0]?secSay(S,"cmLounge2",{ n:nameOf(CARDS[CL.pick[0]]) }):secSay(S,"cmLounge");
  if(k==="meet")return secSay(S,ids.some(id=>commSign(S,id,k))?"cmMeetSign":"cmMeet");
  if(k==="talk"){ const h=ids.find(id=>S.g.pl[id].mot===0&&S.sq.includes(id)); return h?secSay(S,"cmTalkHurt",{ n:nameOf(CARDS[h]) }):secSay(S,"cmTalk"); }
  return secSay(S,"cmInd");
}
function commStepHtml(){
  const S=CL.S, g=S.g, all=Object.keys(g.pl), left=commLeft(S), U=COMM_UI[CL.comm];
  // 残りは右端に「残り n/最大」。案内は秘書の呼びかけで(説明文にしない。→docs/14 §14.94)
  const max=TUNING.grow.comm.max;
  let h='<div class="step-h one cm-h"><b>個別指導</b><span class="cm-left'+(left?'':' out')+'">残り <em>'+left+'</em>/'+max+'</span></div>'+
    '<div class="tabs t4">'+Object.keys(COMM_UI).map(k=>'<button class="tab'+(CL.comm===k?' on':'')+'" data-act="comm" data-v="'+k+'"'+
      (left?'':' disabled')+'>'+COMM_LABEL[k]+(Object.keys(S.g.pl).some(id=>commSign(S,id,k))?'<b class="tsg">'+BUB+'</b>':'')+'<small>'+commFacHtml(S,k)+'</small></button>').join("")+'</div>';   // 2段目は施設のレベルだけ(→docs/14 §14.93)
  if(!left)return h+cmSayHtml(secSay(S,"cmDone"))+commChatHtml();   // 最後の1回の結果はここで見せる
  if(!U)return h;
  h+=cmSayHtml(cmLine(S))+commBoardHtml(all,CL.pick,U.info);
  h+=commChatHtml();
  return h;
}
/**
 * 準備の手順(全画面)。上に「×」と手順の印、下に次へ進むボタン。
 * 筐体の1クレジットと同じく、練習 → コミュニケーション → 試合 の順にしか進まない
 */
function prepHtml(){
  const S=CL.S, fx=CL.fx, st=S.g.step, comp=COMPS[fx.comp];
  // 準備は4段: チーム練習 → コミュニケーション → 視察(相手の SQUAD。→docs/18)→ 戦略方針 → キックオフ(→docs/14)
  const no=st==="train"?1:CL.strat?4:CL.scout?3:2;
  let h='<header class="prep-top"><button class="x" data-act="home">×</button>'+
    '<div class="steps s4">'+["チーム練習","個別指導","視察","戦略方針"].map((t,i)=>
      '<span class="'+(i+1<no?'done':i+1===no?'now':'')+'"><i>'+(i+1)+'</i>'+t+'</span>').join("")+'</div></header>'+
    '<div class="prep-vs">'+gradeTag(comp.grade)+'<b>'+comp.name+'</b> '+(fx.label||"")+
      ' <span>vs '+teamNameOf(TEAMS[fx.opp])+'</span></div>'+
    '<div class="cl-main prep">'+(st==="train"?msgHtml():'')+(st==="train"?trainStepHtml():CL.strat?stratStepHtml():CL.scout?scoutStepHtml():commStepHtml())+'</div>'+
    '<footer class="prep-bot">'+
      (st==="train"?(CL.trSel!=null&&CL.int!==-1&&trainOptions(S)[CL.trSel]
          ?'<button class="btn btn-main" data-act="trgo">この練習で決定 <small>'+trainLabel(trainOptions(S)[CL.trSel])+' ・ '+INT_LABEL[CL.int]+'</small></button>'
          :'<span class="dim">練習と強さを選んで決定する</span>')
        :CL.strat?'<button class="btn btn-main" data-act="play">キックオフ</button>'+'<button class="lnk" data-act="stratback">‹ 視察に戻る</button>'
        :CL.scout?'<button class="btn btn-main" data-act="scoutgo">戦略方針へ</button>'+(commLeft(CL.S)?'<button class="lnk" data-act="scoutback">‹ 個別指導に戻る</button>':'')
        :(commLeft(CL.S)?(CL.armPlay?'<button class="btn btn-main warn" data-act="strat">残り '+commLeft(CL.S)+' 回を使わずに視察へ(もう一度押す)</button>'
            :'<button class="btn btn-sub go-soft" data-act="strat">視察へ(個別指導はあと '+commLeft(CL.S)+' 回)</button>'):'<button class="btn btn-main" data-act="strat">視察へ</button>'))+
    '</footer>'+(CL.scout&&CL.oppSel?oppCardModalHtml():'')+(CL.scout&&CL.scoutRep?scoutRepModalHtml():'');
  return h;
}
/* ---- SQUAD: 既定の陣形(→docs/07 §7.10) ----
 * 縦のピッチ(自陣が下)に先発11人を置く。ここでの並びと KP が毎試合の初期配置になる。
 * ドラッグで動かす / 2枚タップで入れ替え(控えとも)/ 陣形の選択で一括で並べ直す */
const SQ_FORMS=Object.keys(FORMS);
/** 盤面の座標 h(0=自ゴール…1)・x(0…100) ⇔ ピッチ上の % */
// 縦は2本の直線: 自陣の下 1/4(h 0〜0.25)を広めに取り、キーパーとセンターバックの札が重ならないようにする(→docs/14 §14.59)
const SQ_Y=[[0,95],[0.25,64],[1,6]];
const sqT=h=>{ const [a,b,c]=SQ_Y, [p,q]=h<=b[0]?[a,b]:[b,c]; return p[1]+(h-p[0])*(q[1]-p[1])/(q[0]-p[0]); };
const sqH=t=>{ const [a,b,c]=SQ_Y, [p,q]=t>=b[1]?[a,b]:[b,c]; return p[0]+(t-p[1])*(q[0]-p[0])/(q[1]-p[1]); };
const sqPos=(h,x)=>({ l:7+x*0.86, t:sqT(h) });
const sqInv=(l,t)=>({ x:(l-7)/0.86, h:sqH(t) });
const APT_MARK=a=>a>=TUNING.apt.own?"◎":a>=TUNING.apt.group?"○":a>=TUNING.apt.near?"△":"×";
/** 位置での役割と適性 */
function sqRole(id,i,h,x){
  const role=i===0?"GK":posAt(h,x), a=aptOf(CARDS[id],role);   // 細かいポジション(→docs/17)
  return { role, a, cls:aptClass(a), mark:APT_MARK(a) };
}
/** カード左上の役割の札(→docs/14 §14.56)。CAP・KP・PK・FK・CK の順に下へ積む。KP は盤面にいるときだけ。キッカーは指名したときだけ */
const ROLE_TAG_ORDER=[["cap","CAP"],["kp","KP"],["pk","PK"],["fk","FK"],["ck","CK"]];
function roleTagsHtml(S,id,on){
  const r=S.roles||{}, t=ROLE_TAG_ORDER.filter(([k])=>k==="kp"?S.kp===id&&on:r[k]===id);
  return t.length?'<span class="rtags">'+t.map(([k,l])=>'<i class="t '+k+'">'+l+'</i>').join("")+'</span>':'';
}
/** 札の下の★の列(→docs/14 §14.50)。kind … "is"(個人・黄)/ "ss"(特殊・青)。★5 は全部をピンク寄りの赤で光らせる */
const starRow=(n,kind)=>'<span class="srow '+kind+(n>=5?' aw':'')+'">'+[0,1,2,3,4].map(k=>'<i'+(k<n?' class="on"':'')+'>★</i>').join("")+'</span>';
/**
 * 盤面の札(SQUAD の作り)。o を渡すとコミュニケーション・チーム練習の盤面用(→docs/14 §14.38):
 *   o = { act:押したときの動き, info:下の段の小さな情報(HTML), hi:光らせる, sign:「！」を付ける, stars:"both"|"is"|"ss"|null }。引っ張りはしない。
 *   ★の列は SQUAD(o なし)では個人と特殊の両方
 */
function sqTokenHtml(id,i,on,o){
  const S=CL.S, c=CARDS[id], g=S.g.pl[id], col=cardColor(c);
  let pos="", rl=null;
  if(on){ const l=S.layout[id], p=sqPos(l[0],l[1]); rl=sqRole(id,i,l[0],l[1]);
    pos=' style="left:'+p.l.toFixed(2)+'%;top:'+p.t.toFixed(2)+'%;--cc:'+col+'"'; }
  else pos=' style="--cc:'+col+'"';
  return (o?'<button':'<div')+' class="sqc '+c.pos.toLowerCase()+' r-'+(c.rar||"B")+(!o&&CL.sqSel===id?' sel':'')+(on?'':' bn')+(S.kp===id&&on?' kp':'')+
    // 疲れているほど暗く(3段。→docs/14 §14.57)
    (g&&g.fat>=TUNING.grow.int.tiredSign?' tired t'+(3-batteryOf(g)):'')+(o?' cmx'+(o.hi?' on':'')+(o.sign?' hsg':'')+(g&&g.mot===0?' inj':''):'')+'"'+(o?' data-act="'+(o.act||"pick")+'"':'')+' data-id="'+id+'" data-i="'+i+'"'+pos+'>'+
    '<i class="no">'+c.no+'</i>'+
    (rl?'<b class="rl '+rl.cls+'">'+rl.role+'</b>':'<b class="rl">'+c.pos+'</b>')+
    '<span class="nm">'+nameOf(c)+'</span>'+
    // 調子の丸。休憩の見通しで調子が上がる選手は、今の色とあとの色で光る(→docs/14 §14.86)
    (g?(()=>{ const to=CL.motTo&&CL.motTo[id]; return to!=null&&to>g.mot?'<em class="mt m'+g.mot+' mup" style="--m0:var(--mot'+g.mot+');--m1:var(--mot'+to+')"></em>':'<em class="mt m'+g.mot+'"></em>'; })():'')+
    // 星: SQUAD は札の右下に「★1 ★4」と数字で(個人 = 黄・特殊 = 青・★5 はピンク。→docs/14 §14.82)。ほかの盤面は今までどおり札の下に並べる
    (()=>{ if(!g)return '';
      if(!o)return CL.noStars?'':'<span class="stc"><b class="i'+(g.is>=5?' x':'')+'">★'+g.is+'</b><b class="s'+(g.ss>=5?' x':'')+'">★'+g.ss+'</b></span>';
      const m=o.stars; return m?'<span class="stars">'+(m!=="ss"?starRow(g.is,"is"):'')+(m!=="is"?starRow(g.ss,"ss"):'')+'</span>':''; })()+
    roleTagsHtml(S,id,on)+   // KP・CAP・キッカーは左上に縦に積む(→docs/14 §14.56)
    (g?batteryHtml(g,CL.batTo&&CL.batTo[id]):'')+   // 疲労は電池(色だけに頼らない。→docs/14 §14.81)。休憩の見通しでは、回復するぶんが点滅
    // 選手のタグの印(→docs/23 §23.6): CAP・KP の札と同じ形で、反対の右上に(→docs/14 §14.83)
    // 数だけ: バフは「+2」(金)、デバフは「−1」(青紫)を2段で
    (()=>{ const v=g&&g.tags&&g.tags.length?playerTagsView(S,id):[]; if(!v.length)return '';
      const fm=v.filter(t=>t.fame), w=v.filter(t=>!t.fame), up=w.filter(t=>t.pol>0).length, dn=w.length-up;
      // 話題のタグ(白。→docs/23 §23.11): スターは ★、問題児は ✖
      return '<span class="ptags">'+(up?'<i class="t">+'+up+'</i>':'')+(dn?'<i class="t dn">−'+dn+'</i>':'')+
        fm.map(t=>'<i class="t fm'+(t.bad?' bad':'')+'">'+(t.bad?'✖':'★')+'</i>').join("")+'</span>'; })()+
    (o?(o.sign?'<em class="sg">'+BUB+'</em>':'')+'<small class="if">'+(o.info||'')+'</small></button>':'</div>');
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
/** SQUAD で選んだ選手の詳細(→docs/14 §14.48)。CARDS と同じく画面の中央にフロート。‹ › で登録16人の前後へ */
function sqModalHtml(){
  const S=CL.S, id=CL.sqSel; if(!id||!CARDS[id])return "";
  const i=S.sq.indexOf(id), c=CARDS[id];
  const nav=(d,t)=>{ const j=S.sq[i+d]; return '<button class="km-nav" data-act="sqnav" data-id="'+(j||"")+'"'+(j?'':' disabled')+'>'+t+'</button>'; };
  return '<div class="kmodal" data-act="sqclose"><div class="kmod-box sq-mbox" data-act="none">'+
    '<header class="km-head">'+nav(-1,"‹")+'<b>'+c.no+' '+nameOf(c)+'</b><small>'+(i+1)+' / '+S.sq.length+'</small>'+nav(1,"›")+
      '<button class="km-x" data-act="sqclose" aria-label="閉じる">×</button></header>'+sqDetailHtml()+'</div></div>';
}
function sqDetailHtml(){
  const S=CL.S, id=CL.sqSel;
  if(!id)return '';
  const c=CARDS[id], g=S.g.pl[id], i=S.sq.indexOf(id), on=i<11, G0=TUNING.grow;
  const sk=c.skill?SKILLS[c.skill]:null, st=styleOfCard(c);
  const rl=on?sqRole(id,i,S.layout[id][0],S.layout[id][1]):null;
  const need=g.is<4?G0.ind.need[g.is]:G0.ind.awake;
  return '<div class="sq-det"><div class="sd-top"><i class="no">'+c.no+'</i><b>'+nameOf(c)+'</b><small>'+c.pos+' ・ '+c.age+'歳</small>'+
      (on?'<span class="rlx '+c.pos.toLowerCase()+' '+rl.cls+'">'+rl.role+' '+rl.mark+'</span>':'<span class="rlx '+c.pos.toLowerCase()+'">SUB</span>')+'</div>'+
    '<div class="sd-row"><span>個人 <b class="st5">'+stars(g.is)+'</b></span>'+   // ★の進み(バー)は裏の数字にした(→docs/14 §14.79)
      '<span>特殊 <b class="st5">'+stars(g.ss)+'</b></span>'+
      (g.q||g.sq?'<span class="sgn">覚醒の兆し</span>':'')+
      '<span>信頼度 '+TRUST_LABEL[trustLv(g)]+'</span>'+
      '<span class="mot m'+g.mot+'">'+MOT_LABEL[g.mot]+'</span><span class="fat">'+batteryHtml(g)+'</span></div>'+
    playerTagsHtml(id)+
    cardBackOf(id)+                    // 能力・適性のマップ・スキルはカードの裏で(CARDS のフロートと同じ。→docs/14 §14.14)
    '<div class="sd-act">'+(st?'<span class="sd-rk">'+st.name+' '+rankChip(myStyleRank(S,st))+'</span>':'')+(on?(S.kp===id?'<span class="kpnow">KP</span>':'<button data-act="sqkp" data-id="'+id+'">KP にする</button>'):'')+
      '</div>'+
    '</div>';   // 選手のコメントは HOME の選手の声へ(→docs/14 §14.81)
}
/** ハーフタイムの指示の登録(→docs/10 §10.8)。使える指示から3つまで。同じ特殊練習を2回すると覚える */
function htSetHtml(){
  // 監督能力と同じ形(→docs/14 §14.32): 閉じているときは登録中の指示をタイルで。「選ぶ」で使える指示を全部出す
  const S=CL.S, set=S.ht.set, av=htAvail(S);
  const tile=id=>{ const h=htOf(id); return '<button class="ht'+(set.includes(id)?' on':'')+'" data-act="htset" data-v="'+id+'"><b>'+h.name+'</b>'+htAxHtml(h)+
    (h.train?'<small>'+h.train+'</small>':'<small>初めから</small>')+'</button>'; };
  return '<section class="card htset"><h3>ハーフタイムの指示 <small>'+set.length+'/'+TUNING.ht.max+' 登録 ・ 同じ特殊練習を'+TUNING.ht.unlock+'回すると覚える</small></h3>'+
    (CL.htOpen?'<div class="ht-list">'+av.map(tile).join("")+'</div>'+foldBtn("htopen",true)
      :'<div class="ht-set">'+(set.length?set.map(id=>tile(id).replace('data-act="htset"','data-act="htopen"')).join(""):'<p class="dim">登録していない</p>')+'</div>'+
        '<button class="btn btn-sub" data-act="htopen">ハーフタイムの指示を選ぶ</button>')+'</section>';
}
function squadHtml(){
  const S=CL.S, G0=TUNING.grow;
  fillLayout(S);
  const on=S.sq.slice(0,11), bench=S.sq.slice(11);
  // いちばん上に HOME と同じ見出し(クラブ名・エンブレム。チームの画面を撮るとき用 →docs/14 §14.45)
  // 上部はチーム練習と同じ形(→docs/14 §14.42): 左に成長グラフのレーダー、右に OVR・KP・フォーメーションと最適配置
  const G=S.g.graph, R=TUNING.grow.graph, gv={}; for(const a in G)gv[a]=G[a]/R.max;
  const allG=graphGoldN(S)>=3, kc=S.kp&&CARDS[S.kp], kst=kc?styleOfCard(kc):null, krk=kst?myStyleRank(S,kst):null;
  const pw=teamAxisPower(S), pv={}; for(const a in pw)pv[a]=pw[a]/STAT_MAX;
  let h=homeHeadHtml()+'<section class="sq-top"><button class="tf-g sq-gbtn" data-act="ggopen" aria-label="OVR の内訳を開く">'+
      radarSvg([{ v:pv, color:"#5e6470", fill:"#5e6470", op:0.2 },{ v:gv, color:allG?'#e8b11c':teamColor(myTeam(S)), op:allG?0.55:0.35 }],{ gold:S.g.gold, cls:"tf-radar"+(allG?' gold':'') })+
      '<small class="gg-leg2"><span>成長</span><span>戦力</span><i class="g" style="background:'+(allG?'#e8b11c':teamColor(myTeam(S)))+'"></i><i class="p"></i></small></button>'+
    '<div class="sq-info"><div class="sq-ovr"><small>OVR</small><b>'+teamPower(S).toFixed(1)+'</b></div>'+
      (kst?'<p class="sq-kp"><i>KP</i><b>'+nameOf(kc)+'</b><span>'+kst.name+' '+rankChip(krk)+'</span></p>':'<p class="sq-kp none">KP なし(選手を選んで「KP にする」)</p>')+
      '</div></section>';
  // 2列: 左にピッチ、右に控え(SUB)とその下に任命(ORDER)。ピッチはチーム練習・個別指導の盤面と同じ大きさ(→docs/14 §14.89)
  h+='<div class="sq-3col sq-2col">'+
    '<div class="sq-pitch" id="sqPitch"><i class="pm half"></i><i class="pm circ"></i><i class="pm pa top"></i><i class="pm pa bot"></i>'+
    '<i class="pm ga top"></i><i class="pm ga bot"></i>'+(CL.noLinks?'':sqLinksSvg())+
    on.map((id,i)=>sqTokenHtml(id,i,true)).join("")+
    // 連携線の見方とトグルは、ピッチの緑の部分の下に重ねる(→docs/14 §14.47)
    '<div class="sq-lkrow"><span class="lklg"><span><i class="l1"></i>薄</span><span><i class="l2"></i>太</span><span><i class="l3"></i>黄金</span><span><i class="omen"></i>兆し</span></span>'+
      '<span class="tgs"><span><small>覚醒</small><button class="lk-tg'+(CL.noStars?' off':'')+'" data-act="sttoggle" aria-label="覚醒の★の表示"><i></i></button></span>'+
      '<span><small>連携線</small><button class="lk-tg'+(CL.noLinks?' off':'')+'" data-act="lktoggle" aria-label="連携線の表示"><i></i></button></span></span></div>'+'</div>'+
    '<div class="sq-side"><div class="sq-bench"><span class="lbl">SUB</span>'+bench.map((id,j)=>sqTokenHtml(id,11+j,false)).join("")+'</div>'+sqRolesHtml()+'</div></div>'+
    // フォーメーションと最適配置は盤面の下(→docs/14 §14.43)
    '<div class="sq-ctl sq-ctl-b"><button class="btn btn-sub sq-kpb" data-act="kpopen">KP設定</button><select class="sq-formsel" data-chg="sqform" aria-label="フォーメーション">'+SQ_FORMS.map(f=>'<option value="'+f+'"'+(S.form===f?' selected':'')+'>'+f+'</option>').join("")+'</select>'+
      '<button class="btn btn-sub sq-auto" data-act="sqauto">最適配置</button></div>';
  // 選手の詳細はフロート(sqModalHtml)、任命の案内と結果はインフォバー(→docs/14 §14.48)
  // ハーフタイムの指示は戦略方針へ移した(→docs/14 §14.31)
  return h;
}
/** 自分のチームでの、そのスタイルのランク(成長グラフから。→docs/15 §15.5) */
const myStyleRank=(S,st)=>styleRank({ graph:Object.assign({},S.g.graph,{ gold:S.g.gold }) },st);
const rankChip=r=>'<b class="rk rk'+r+'">'+r+'</b>';
/**
 * チームの成長グラフ(→docs/15)。六角形は向かい合う軸が対角。横に対ごとの値(MAX・金色)、下に KP のランク。
 * 金色が3つそろうとグラフ全体が金色
 */
/** KP を選ぶフロート(→docs/14 §14.44)。先発でスタイルを持つ選手と、いまのランク。押すと KP にして閉じる */
function kpModalHtml(){
  const S=CL.S, xi=S.sq.slice(0,11).filter(id=>styleOfCard(CARDS[id]));
  const rows=xi.map(id=>{ const c=CARDS[id], st=styleOfCard(c), rk=myStyleRank(S,st), g=S.g.pl[id];
    return '<button class="kp-row'+(S.kp===id?' on':'')+'" data-act="kppick" data-id="'+id+'"><i class="no">'+c.no+'</i><span><b>'+nameOf(c)+'</b><small>'+c.pos+' ・ 特★'+(g?g.ss:0)+(rareOn(S,id)?' ・ <em>RARE</em>':'')+'</small></span>'+
      '<span class="st"><b>'+st.name+'</b><small>'+(st.scope==="team"?"全体":"個人")+' ・ '+styleAxes(st).map(a=>AXIS_ABBR[a]).join("・")+'</small></span>'+rankChip(rk)+'</button>'; }).join("");
  return '<div class="kmodal" data-act="kpclose"><div class="kmod-box kp-box" data-act="none">'+
    '<header class="km-head"><span></span><b>KP を選ぶ</b><small>先発 '+xi.length+'人</small><span></span><button class="km-x" data-act="kpclose" aria-label="閉じる">×</button></header>'+
    '<div class="kp-list">'+(rows||'<p class="dim">スタイルを持つ先発の選手がいない</p>')+'</div></div></div>';
}
/** 戦力(盤面の11人の能力の平均。軸ごと)。6つを足すと OVR(teamPower)になる */
function teamAxisPower(S){
  const xi=S.sq.slice(0,11), out={ O:0, D:0, R:0, C:0, S:0, P:0 };
  for(const id of xi){ const c=growCard(S,CARDS[id]); for(const k of STATS)out[PARAM_AXIS[k]]+=c[k]/xi.length; }
  return out;
}
/**
 * 成長グラフのフロート(→docs/14 §14.43)。SQUAD の上部のレーダーを押すと出る。
 * 大きなレーダー(成長 + 戦力)と、軸ごとの 成長(0〜100・MAX・GOLD)/ 戦力(能力の平均。足すと OVR)
 */
function ggModalHtml(){
  // OVR(→docs/14 §14.111): グラフの項目の近くに各軸の数値、右下に OVR と内訳(任期の始め + 育成)をグラフの色で。表・KP・成長グラフは出さない
  const S=CL.S, pw=teamAxisPower(S), ovr=teamPower(S), p0=S.ts&&S.ts.pow0!=null?S.ts.pow0:ovr, d=ovr-p0;
  const ax0=S.ts&&S.ts.ax0?S.ts.ax0:Object.fromEntries(Object.keys(pw).map(a=>[a,pw[a]*p0/(ovr||1)]));   // 古いセーブは比で戻す
  const sc=v=>(v-8)/9, cur={}, base={}; for(const a in pw){ cur[a]=sc(pw[a]); base[a]=sc(ax0[a]); }
  const col=teamColor(myTeam(S)), gr="#9aa1ad";
  return '<div class="kmodal gg" data-act="ggclose"><div class="kmod-box gg-box" data-act="none">'+
    '<header class="km-head"><span></span><b>OVR</b><small>先発11人の能力</small><span></span><button class="km-x" data-act="ggclose" aria-label="閉じる">×</button></header>'+
    '<div class="gg-radar gg-ovrw">'+radarSvg([{ v:base, color:gr, fill:gr, op:0.25 },{ v:cur, color:col, fill:col, op:0.18 }],{ vals:pw, cls:"gg-vals" })+
      '<div class="gg-ovr"><small>OVR</small><b>'+ovr.toFixed(1)+'</b><span>(<i style="color:'+gr+'">'+p0.toFixed(1)+'</i> '+(d>=0?'+':'−')+' <i style="color:'+col+'">'+Math.abs(d).toFixed(1)+'</i>)</span></div>'+
      '<small class="gg-leg"><i class="p" style="background:'+gr+'"></i>任期の始め <i class="g" style="background:'+col+'"></i>育成</small></div>'+
    '</div></div>';
}
function growGraphHtml(S){
  const G=S.g.graph, gold=S.g.gold, R=TUNING.grow.graph, all=graphGoldN(S)>=3, v={};
  for(const a in G)v[a]=G[a]/R.max;
  const ax=a=>'<span class="'+(gold[a]?'gd':G[a]>=R.max-1e-9?'mx':'')+'"><i>'+AXIS_ABBR[a]+'</i><b>'+Math.round(G[a])+'</b>'+
    (gold[a]?'<em>GOLD</em>':G[a]>=R.max-1e-9?'<em>MAX</em>':'')+'</span>';
  const kc=S.kp&&CARDS[S.kp], st=kc?styleOfCard(kc):null, rk=st?myStyleRank(S,st):null;
  return '<section class="card graph-r'+(all?' gold':'')+'"><h3>成長グラフ <small>'+(all?'黄金のチーム':'練習で伸び縮みする。KP のランクを決める')+'</small></h3>'+
    goldenLineHtml(S)+
    '<div class="gr-wrap nor">'+   // レーダーは SQUAD の上部に出すので、ここは対ごとの値だけ(→docs/14 §14.42)
    '<ul class="gr-list">'+[["O","D"],["S","P"],["R","C"]].map(p=>'<li>'+ax(p[0])+'<i class="pr">⇄</i>'+ax(p[1])+'</li>').join("")+'</ul></div>'+
    (false&&st?'<p class="gr-kp">KP '+nameOf(kc)+' ・ '+st.name+' '+rankChip(rk)+' <small>'+styleAxes(st).map(a=>AXIS_ABBR[a]).join("・")+
      (rk==="G"?'':' が '+(rk==="B"?TUNING.rank.th[0]+' で A':rk==="A"?TUNING.rank.th[1]+' で S':'金色で G'))+'</small></p>':'')+
    '<p class="dim gr-note">向かい合う2軸で器 '+graphCap(S)+' を分け合う(片方が伸びると対角が下がる)。MAX の軸をさらに伸ばす練習で、限界突破して金色に</p></section>';
}
/* ---- 任命(キャプテン・キッカー。→docs/12) ---- */
const ROLE_KINDS=["cap","pk","fk","ck"], ROLE_LABEL={ cap:"CAP", pk:"PK", fk:"FK", ck:"CK" };
const ROLE_SUB={ cap:"キャプテン", pk:"PKキッカー", fk:"FKキッカー", ck:"CKキッカー" };
/** キッカーの向き不向き: 先発の中の順位(1位 S・2〜3位 A・4〜6位 B・ほか C)。式はエンジンの spKicker と同じ */
function kickMark(S,id,kind){
  const on=S.sq.slice(1,11);
  if(!on.includes(id))return "-";
  const sc=x=>{ const c=growCard(S,CARDS[x]), b=(c.skill&&SKILLS[c.skill].buff)||{}, k=1+((b[kind==="pk"?"pkK":kind]||1)-1)*(c.buffK||1);
    return (kind==="pk"?c.off*1.2+c.tec:kind==="fk"?c.tec*1.2+c.off*0.8:c.tec+c.pow*0.6)*k; };
  const r=on.slice().sort((a,b)=>sc(b)-sc(a)).indexOf(id);
  return r===0?"S":r<=2?"A":r<=5?"B":"C";
}
function sqRolesHtml(){
  const S=CL.S, R=S.roles||{};
  return '<div class="sq-roles"><span class="lbl">ORDER</span>'+ROLE_KINDS.map(k=>{
    const id=R[k], c=id&&CARDS[id], on=id&&S.sq.slice(0,11).includes(id);
    const mk=!c?"":k==="cap"?CAP_MARK[capApt(c)]:kickMark(S,id,k);
    return '<button class="rs'+(CL.roleSel===k?' sel':'')+(c?' set':'')+(c&&!on?' off':'')+'" data-act="sqrole" data-v="'+k+'">'+
      '<b>'+ROLE_LABEL[k]+'</b>'+(c?'<i class="no">'+c.no+'</i><span class="nm">'+nameOf(c)+'</span><em class="mk m'+mk+'">'+mk+'</em>'
        :'<span class="nm auto">'+(k==="cap"?'未任命':'自動')+'</span>')+
      (c&&!on?'<small>SUB</small>':'')+'</button>'; }).join("")+'</div>';
}
/** 選手を選ぶ。2人目で入れ替え(→pool.js moveSquad)。任命の枠を選んでいるときは、その役に任命する */
function sqPick(id){
  const S=CL.S;
  if(CL.roleSel){
    if(S.sq.indexOf(id)<11){ const m=setRole(S,CL.roleSel,id); CL.roleSel=null; persist(S); showClub(true); infoBar(m); return; }
    showClub(true); return;
  }
  CL.sqSel=CL.sqSel===id?null:id;              // タップは選ぶだけ。入れ替えはカードを引っ張る(試合と同じ。→docs/14 §14.12)
  showClub(true);
}
/** 2人を入れ替える(引っ張って重ねたとき)。KP が控えに下がったら、代わりに入った人が引き継ぐ */
function sqSwap(a,b){
  const S=CL.S; if(!moveSquad(S,a,b))return;
  if(S.kp===a&&S.sq.indexOf(a)>=11)S.kp=b; else if(S.kp===b&&S.sq.indexOf(b)>=11)S.kp=a;
  fillLayout(S); CL.sqSel=null; persist(S); sndUi&&sndUi("tap");
}
/** 動かしている選手の適性を、ピッチに薄く色で出す / 消す */
function sqAptOn(pitch,id){ sqAptOff(pitch); pitch.insertAdjacentHTML("afterbegin",aptOverlaySvg(growCard(CL.S,CARDS[id]),(h,x)=>{ const p=sqPos(h,x); return [p.l,p.t]; })); }
function sqAptOff(pitch){ const o=pitch.querySelector(".apt-ov"); if(o)o.remove(); }
/** 指の下にある、自分以外の選手のカード(ピッチでも控えでも) */
function sqCardAt(x,y,self){
  for(const n of document.elementsFromPoint(x,y)){ const c=n.closest&&n.closest("#club .sqc"); if(c&&c!==self)return c; }
  return null;
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
    if(!d.moved)sqAptOn(pitch,d.id);               // 動かし始めたら適性の色を出す(→docs/14 §14.14)
    d.moved=true; d.el.classList.add("drag");
    const q=at(e), p=sqPos(q.h,q.x); d.q=q;
    d.el.style.left=p.l+"%"; d.el.style.top=p.t+"%";
    const rl=sqRole(d.id,d.i,q.h,q.x), b=d.el.querySelector(".rl");
    b.className="rl "+rl.cls; b.textContent=rl.role;
    pitch.querySelectorAll('line[data-a="'+d.id+'"]').forEach(l=>{ l.setAttribute("x1",p.l); l.setAttribute("y1",p.t); });
    pitch.querySelectorAll('line[data-b="'+d.id+'"]').forEach(l=>{ l.setAttribute("x2",p.l); l.setAttribute("y2",p.t); });
    const tg=sqCardAt(e.clientX,e.clientY,d.el);
    document.querySelectorAll("#club .sqc.tgt").forEach(x=>{ if(x!==tg)x.classList.remove("tgt"); });
    if(tg)tg.classList.add("tgt");
  });
  const end=e=>{
    if(!d||e.pointerId!==d.pid)return;
    const dd=d; d=null; sqAptOff(pitch);
    const tg=dd.moved?sqCardAt(e.clientX,e.clientY,dd.el):null;
    if(tg){ sqSwap(dd.id,tg.dataset.id); showClub(true); }               // 別の選手に重ねたら入れ替え
    else if(dd.moved&&dd.q){ CL.S.layout[dd.id]=[r2(dd.q.h),r2(dd.q.x)]; persist(CL.S); showClub(true); }
    else if(!dd.moved&&e.type==="pointerup")sqPick(dd.id);
  };
  pitch.addEventListener("pointerup",end);
  pitch.addEventListener("pointercancel",end);
  // 控えのカード: 引っ張ってピッチの選手に重ねると入れ替え(試合の交代と同じ操作)。動かさずに離せば選ぶだけ
  const bench=document.querySelector("#club .sq-bench");
  if(!bench)return;
  let b=null;
  bench.addEventListener("pointerdown",e=>{
    const el=e.target.closest(".sqc"); if(!el)return;
    b={ el, id:el.dataset.id, x0:e.clientX, y0:e.clientY, moved:false, pid:e.pointerId, g:null };
    try{ el.setPointerCapture(e.pointerId); }catch(_){}
  });
  bench.addEventListener("pointermove",e=>{
    if(!b||e.pointerId!==b.pid)return;
    if(!b.moved&&Math.hypot(e.clientX-b.x0,e.clientY-b.y0)<10)return;
    if(!b.moved){ sqAptOn(pitch,b.id); b.moved=true; b.g=b.el.cloneNode(true); b.g.classList.add("sq-ghost"); document.body.appendChild(b.g); b.el.classList.add("dragging"); }
    b.g.style.left=e.clientX+"px"; b.g.style.top=(e.clientY-24)+"px";
    const tg=sqCardAt(e.clientX,e.clientY,b.el);
    document.querySelectorAll("#club .sqc.tgt").forEach(x=>{ if(x!==tg)x.classList.remove("tgt"); });
    if(tg&&tg!==b.g)tg.classList.add("tgt");
  });
  const bend=e=>{
    if(!b||e.pointerId!==b.pid)return;
    const bb=b; b=null; sqAptOff(pitch);
    if(bb.g)bb.g.remove(); bb.el.classList.remove("dragging");
    if(!bb.moved){ if(e.type==="pointerup")sqPick(bb.id); return; }
    const tg=sqCardAt(e.clientX,e.clientY,bb.el);
    if(tg&&!tg.classList.contains("sq-ghost")){ sqSwap(bb.id,tg.dataset.id); }
    showClub(true);
  };
  bench.addEventListener("pointerup",bend);
  bench.addEventListener("pointercancel",bend);
}

/* ---- カード(→pool.js) ---- */

/** カードの人物の影(独自に描いた汎用の上半身。絵は後で差し替える) */
const CARD_SIL='<svg class="k-sil" viewBox="0 0 100 110" preserveAspectRatio="xMidYMax meet">'+
  '<path d="M50 8c11 0 19 9 19 21 0 9-4 16-10 20l3 5c16 3 28 11 32 26l4 30H2l4-30c4-15 16-23 32-26l3-5c-6-4-10-11-10-20 0-12 8-21 19-21z"/></svg>';
/**
 * カードの人物の絵(→docs/09 第3弾)。ポジションごとのポーズを関節の位置で描く(独自の意匠)。
 * 上着はクラブの色、胸に背番号。座標は 100×110(地面 y=108)。[頭, 首, 腰, 左腕(肩→肘→手), 右腕, 左脚(腰→膝→足), 右脚, ボール]
 */
const POSES={
  GK:{ hd:[50,17], nk:[50,27], hp:[50,58], la:[[44,31],[31,19],[22,7]], ra:[[56,31],[69,19],[78,7]], ll:[[46,58],[37,81],[30,106]], rl:[[54,58],[63,81],[70,106]], ball:null },
  DF:{ hd:[40,27], nk:[43,36], hp:[53,63], la:[[42,39],[30,51],[24,62]], ra:[[47,39],[59,47],[67,41]], ll:[[51,63],[40,84],[30,105]], rl:[[56,63],[72,79],[90,96]], ball:[92,100] },
  MF:{ hd:[50,15], nk:[50,25], hp:[50,59], la:[[47,29],[36,43],[30,55]], ra:[[53,29],[64,41],[73,47]], ll:[[48,59],[46,83],[44,106]], rl:[[52,59],[64,75],[75,83]], ball:[80,86] },
  FW:{ hd:[43,16], nk:[46,26], hp:[51,58], la:[[44,30],[31,30],[20,23]], ra:[[49,30],[60,41],[66,53]], ll:[[49,58],[44,82],[40,106]], rl:[[53,58],[71,62],[89,55]], ball:[94,52] }
};
function poseSvg(c){
  const P=POSES[c.pos]||POSES.MF, col=cardColor(c);
  const ln=(pts,w,cl,cls)=>'<polyline'+(cls?' class="'+cls+'"':'')+' points="'+pts.map(p=>p.join(",")).join(" ")+'" fill="none" stroke="'+cl+'" stroke-width="'+w+'" stroke-linecap="round" stroke-linejoin="round"/>';
  const mid=[(P.nk[0]+P.hp[0])/2,(P.nk[1]+P.hp[1])/2];
  return '<svg class="k-pose" viewBox="0 0 100 110" preserveAspectRatio="xMidYMax meet">'+
    '<ellipse cx="50" cy="107" rx="30" ry="3" fill="rgba(0,0,0,.18)"/>'+
    ln(P.ll,7.5,"#1d1d1d","lg")+ln(P.rl,7.5,"#1d1d1d","lg")+
    ln([P.hp,[P.ll[1][0]*0.35+P.hp[0]*0.65,P.ll[1][1]*0.35+P.hp[1]*0.65]],10,"#f4f4f4")+ln([P.hp,[P.rl[1][0]*0.35+P.hp[0]*0.65,P.rl[1][1]*0.35+P.hp[1]*0.65]],10,"#f4f4f4")+
    ln([P.nk,P.hp],17,col)+ln(P.la,6.5,col)+ln(P.ra,6.5,col)+
    '<circle class="hd" cx="'+P.hd[0]+'" cy="'+P.hd[1]+'" r="8.5" fill="#1d1d1d"/>'+
    '<text x="'+mid[0]+'" y="'+(mid[1]+3.5)+'" text-anchor="middle" font-size="10" font-weight="900" fill="#fff" font-family="Oswald,system-ui,sans-serif">'+c.no+'</text>'+
    (P.ball?'<circle cx="'+P.ball[0]+'" cy="'+P.ball[1]+'" r="5" fill="#fff" stroke="#1d1d1d" stroke-width="1.2"/>':'')+'</svg>';
}
/** 【仮】選手の絵(pftb の汎用選手。→docs/10 §10.9)。GK は GK の絵、ほかは外野の絵から、id で決まる1枚 */
const ART_POOL={ gk:[], out:[] };
if(typeof PLAYER_ART!=="undefined")for(const k in PLAYER_ART){ const m=/^any-(gk|out)-(\w+)_play$/.exec(k); if(m)ART_POOL[m[1]].push(k.slice(0,-5)); }
function artKeyOf(c){ const p=ART_POOL[c.pos==="GK"?"gk":"out"]; return p&&p.length?p[hashStr("art:"+c.id)%p.length]:null; }
const artSrc=(c,kind)=>{ const k=artKeyOf(c); return k&&PLAYER_ART[k+"_"+kind]||null; };
/** カードのクラブ(エンブレムを描くため) */
const cardTeam=c=>c.team&&TEAMS[c.team]?TEAMS[c.team]:c.id[0]==="h"?TEAMS.azr:c.id[0]==="a"?TEAMS.ros:null;
// レアリティの呼び方(→docs/08 §8.10): 白 = REGULAR / 黒 = SPECIAL / キラ = WORLD CLASS / レジェンド = LEGENDS
const RAR_TAG={ W:"REGULAR", B:"SPECIAL", K:"WORLD CLASS", L:"LEGENDS" };
/** カードのシーズン(活躍した年。カテゴリの後ろに付ける。→docs/14 §14.117)。シーズンを足すときはここから */
const CARD_SEASON="25-26";
/** レアカードの刻印: WC / LE + メインポジション */
const EMB_PRE={ K:"WC", L:"LE" }, EMB_POS={ GK:"GOALKEEPER", DF:"DEFENDER", MF:"MIDFIELDER", FW:"FORWARD" };
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
    '<i class="k-band"></i>'+(EMB_PRE[r]?'<i class="k-emb2" data-t="'+EMB_PRE[r]+' '+(EMB_POS[c.pos]||c.pos)+'">'+EMB_PRE[r]+' '+(EMB_POS[c.pos]||c.pos)+'</i>':'')+'<div class="k-art">'+(artSrc(c,"play")?'<img class="k-img" src="'+artSrc(c,"play")+'" alt="">':poseSvg(c))+'</div>'+
    (cardTeam(c)?'<i class="k-emb">'+emblemSvg(cardTeam(c),size==="m"?22:13)+'</i>':'')+
    '<div class="k-top"><b class="k-no">'+statTotal(c)+'</b><i class="k-pos '+c.pos.toLowerCase()+'">'+c.pos+'</i></div>'+
    '<div class="k-rar">'+RAR_TAG[r]+' '+CARD_SEASON+'</div>'+
    '<div class="k-name"><b>'+nameOf(c)+'</b><small>'+clubOfCard(c)+'<em class="k-num">'+c.no+'</em></small></div>'+
    '<i class="k-cno">'+cardNoOf(c)+'</i>'+
    // WORLD CLASS・LEGENDS: メタリックの輝き(一覧ではゆっくり流れ、大きく開くと指に合わせて動く。→docs/14 §14.114)
    (r==="K"||r==="L"?'<i class="k-holo" style="--hd:-'+(hashStr("holo:"+id)%90/10).toFixed(1)+'s"></i>':'')+'<i class="k-glare"></i>'+
    (size==="m"?'<div class="k-st">'+top.map(k=>'<span><i>'+STAT_LABEL[k]+'</i><b>'+c[k]+'</b></span>').join("")+'</div>'+
      '<div class="k-sk">'+(sk?sk.label:"")+'<em>'+(st?st.name:"")+'</em></div>'
      :'<div class="k-sk">'+(sk?sk.label:"")+'</div>')+
    // 重なったカード: 右下に白いカードのアイコンを枚数ぶん(最大5枚)、手札のように少し重ねて扇に(正確な数は詳細で。→docs/14 §14.121)
    '<i class="k-foil"></i>'+(n>1?'<i class="k-dup" aria-label="'+n+'枚">'+Array.from({ length:Math.min(5,n) },(_,i,a)=>'<u style="--r:'+((i-(Math.min(5,n)-1)/2)*9).toFixed(1)+'deg"></u>').join("")+'</i>':'')+
    '</div>';
}
/** その選手のレアKP が、いま KP にすれば発動するか(★5) */
const rareOn=(S,id)=>!!rareOfCard(CARDS[id])&&!!S.g.pl[id]&&S.g.pl[id].ss>=5&&myStyleRank(S,styleOfCard(CARDS[id]))==="G";   // 発動は ★5 かつランク G(→docs/15 §15.6)
/** カードの詳細に出すレアKP の行。★4以下のあいだは伏せる */
function rareRowHtml(S,id){
  const R=rareOfCard(CARDS[id]); if(!R)return "";
  const mv=R.mv?RARE_MOVES[R.mv]:null, g=S.g.pl[id], ss=g?g.ss:0;
  if(ss<5)return '<p class="rarekp lock"><b>RARE KP</b> ？？？ <small>特殊能力 ★5 で解放(いま ★'+ss+')</small></p>';
  return '<p class="rarekp"><b>RARE KP</b> '+R.name+(mv?' <small>技: '+mv.label+'</small>':'')+'<br><span class="get">KP にすると発動。スキルとスタイルが強まる</span></p>';
}
/** カードの裏(登録中なら育成を入れた値)。CARDS のフロートと、入れ替えの比べ合いで使う */
function cardBackOf(id){
  const S=CL.S, c=CARDS[id], g=S.g.pl[id], cc=g?growCard(S,c):c;
  return '<div class="kdet back">'+cardBackHtml(cc,{ stars:g?[g.is,g.ss]:null, ss:g?g.ss:0, front:cardHtml(id,"s"),
    extra:'<p class="dim">'+RAR_TAG[c.rar||"B"]+' ・ 持っている枚数 '+(S.coll[id]||0)+'</p>'+   // 動物は出さない(選手の声で伝わる。→docs/14 §14.79)
      (dupOf(S,id)?'<p class="dup">重なり ×'+dupOf(S,id)+': 個別指導の経験 +'+Math.round(TUNING.grow.dup.indK*dupOf(S,id)*100)+'% ・ 覚醒の上がり幅が大きくなりやすい</p>':'') })+'</div>';
}
/**
 * 選んだカードを画面の中央にフロートで出す(→docs/14 §14.27)。‹ › で並びの前後へ。
 * 登録していない選手は「SQUAD と交代」を押したときだけ16人の札を出し、相手を選ぶと下にその選手の詳細を出して比べ、「入れ替える」で交代
 */
function cardModalHtml(id,list){
  const S=CL.S, c=CARDS[id], inSq=S.sq.includes(id), i=list.indexOf(id);
  const nav=(d,t)=>{ const j=i+d; return '<button class="km-nav" data-act="card" data-id="'+(list[j]||"")+'"'+(i>=0&&list[j]?'':' disabled')+'>'+t+'</button>'; };
  let h='<div class="kmodal" data-act="kclose"><div class="kmod-box'+(CL.kSwap?' cmp':'')+'" data-act="none">'+
    '<header class="km-head">'+nav(-1,"‹")+'<b>'+c.no+' '+nameOf(c)+'</b><small>'+(i>=0?(i+1)+' / '+list.length:'')+'</small>'+nav(1,"›")+
      '<button class="km-x" data-act="kclose" aria-label="閉じる">×</button></header>'+k3dHtml(id,"kFlip",CL.kSwap&&!inSq?"in":null);
  if(!inSq){   // 登録中の選手の説明文は出さない(→docs/14 §14.115)
    // 交代中は「交代をやめる」と分離線の代わりに、2枚の間に交代の印(赤の ↑ = OUT・緑の ↓ = IN。OUT が赤なのに合わせる)。飾りで押しても何も起きない(→docs/14 §14.122)
    const arw=(d,c1,c2)=>'<svg class="'+d+'" viewBox="0 0 20 40" aria-hidden="true"><defs><linearGradient id="xg'+d+'" x1="0" y1="'+(d==="up"?1:0)+'" x2="0" y2="'+(d==="up"?0:1)+'"><stop offset="0" stop-color="'+c1+'" stop-opacity=".15"/><stop offset="1" stop-color="'+c2+'"/></linearGradient></defs>'+
      '<path d="'+(d==="up"?'M10 1 L19 14 L13 14 L13 39 L7 39 L7 14 L1 14 Z':'M10 39 L19 26 L13 26 L13 1 L7 1 L7 26 L1 26 Z')+'" fill="url(#xg'+d+')"/></svg>';
    h+=CL.kSwap?'<div class="km-xchg" role="img" aria-label="交代(IN と OUT)">'+arw("up","#e8304a","#ff8a9a")+arw("dn","#2fb36a","#7dffb0")+'</div>'
      :'<button class="btn btn-main km-swap" data-act="kswap">⇄ SQUAD と交代</button>';
    if(CL.kSwap){
      // 交代の相手は、下のカードの左右の ‹ › で登録の順に切り替える(16人の札の並びはやめた。→docs/14 §14.122)
      if(!CL.kOut||!S.sq.includes(CL.kOut))CL.kOut=S.sq[0];
      h+='<div class="km-cmp"><div class="ko-row"><button class="ko-arw" data-act="koutnav" data-d="-1" aria-label="前の選手">‹</button>'+
        k3dHtml(CL.kOut,"kFlip2","out")+'<button class="ko-arw" data-act="koutnav" data-d="1" aria-label="次の選手">›</button></div>'+
        // 長押しで入れ替える: 押している間、左から緑のゲージが満ちて、満ちたら交代(間違いを防ぐ。→docs/14 §14.124)
        '<button class="btn btn-main hold-btn" data-hold="swap" data-id="'+CL.kOut+'"><span>長押しで入れ替える(経験が失われます)</span></button></div>';
    }
  }
  return h+'</div></div>';
}
/** 大きなカード(→docs/14 §14.114)。表 = カード、裏 = 情報(cardBackOf)。指でぐりぐり傾き、横にはじくと裏返る */
function k3dHtml(id,fk,tag){
  fk=fk||"kFlip";   // 裏返しの状態を持つ CL の項目(交代の相手は kFlip2)
  // tag … 交代のときの角の帯 "in"(右上・入る)/ "out"(左上・出る)。表と裏の両方に付ける(→docs/14 §14.122)
  const rib=tag?'<b class="k-rib '+tag+'">'+tag.toUpperCase()+'</b>':'', add=h=>rib?h.slice(0,-6)+rib+'</div>':h;
  return '<div class="k3d"'+(fk==="kFlip"?' id="k3d"':'')+' data-fk="'+fk+'"><div class="k3d-in'+(CL[fk]?' flip':'')+'">'+
    '<div class="k3d-f">'+add(cardHtml(id,"m"," big").replace('data-act="card"','data-act="none"'))+'</div>'+
    '<div class="k3d-b">'+add(kBackHtml(id))+'</div></div>'+
    '</div>';   // 裏返しの目印(↻)は出さない(オーナー。→docs/14 §14.123)
}
/**
 * カードの裏面(→docs/14 §14.115)。表と同じ形・大きさで、印刷されたカードの裏のように並べる。
 * 上の帯 = 背番号・名前・ポジション / クラブ・年齢・国籍、中段 = 適性マップと6能力、下段 = スキル・KP・RARE KP・キャプテンシー、いちばん下 = レアリティ・番号・枚数。
 * 登録中の選手は育成を入れた値
 */
function kBackHtml(id){
  const S=CL.S, c0=CARDS[id], g=S.g.pl[id], c=g?growCard(S,c0):c0, r=c0.rar||"B";
  const sk=c0.skill?SKILLS[c0.skill]:null, st=styleOfCard(c0), RK=rareOfCard(c0), tot=Math.round(STATS.reduce((a,k)=>a+c[k],0));
  const bar=k=>'<div class="kb-st"><i>'+STAT_LABEL[k]+'</i><em><u style="width:'+(c[k]/STAT_MAX*100).toFixed(0)+'%"></u></em><b>'+Math.round(c[k])+'</b></div>';
  return '<div class="kb r-'+r+'" style="--tc:'+cardColor(c0)+'">'+
    '<div class="kb-head"><b class="kb-no">'+c0.no+'</b><div class="kb-nm"><b>'+nameOf(c0)+'</b><small>'+clubOfCard(c0)+(c0.age?' ・ '+c0.age+'歳':'')+' ・ '+natTxt(c0)+'</small></div>'+
      '<i class="kb-pos '+c0.pos.toLowerCase()+'">'+c0.pos+'</i></div>'+
    '<div class="kb-mid"><div class="kb-map">'+aptMapSvg(c)+'<small>'+c0.roles.join(" / ")+'</small></div>'+
      '<div class="kb-sts">'+STATS.map(bar).join("")+'<div class="kb-tot"><i>TOTAL</i><b>'+tot+'</b></div></div></div>'+
    '<div class="kb-txt">'+(sk?'<p><b>★'+sk.label+'</b>'+sk.desc+'</p>':'')+
      (st?'<p><b>KP</b>'+st.name+' <small>'+(st.scope==="team"?"全体":"個人")+'・'+AXIS_ABBR[st.axis]+'</small></p>':'')+
      (RK?'<p class="rkp"><b>RARE KP</b>'+((g?g.ss:0)>=5?RK.name:'？？？')+'</p>':'')+
      '<p><b>CAP</b>'+CAP_MARK[capApt(c0)]+(g?' <small>個★'+g.is+' 特★'+g.ss+'</small>':'')+'</p></div>'+
    '<div class="kb-foot"><b>'+RAR_TAG[r]+' '+CARD_SEASON+'</b><span>'+cardNoOf(c0)+'</span><span>×'+(S.coll[id]||0)+(dupOf(S,id)?' ・ 重なり×'+dupOf(S,id):'')+'</span></div>'+
    '<i class="k-glare"></i></div>';
}
/** 長押しのボタン(→docs/14 §14.124): 押している間ゲージが満ち、HOLD_MS 押し続けたら data-hold の動き(クリックと同じ)をする。離すと戻る */
const HOLD_MS=1200;
function holdBind(){
  document.querySelectorAll("#club [data-hold]").forEach(b=>{
    let t=null;
    const stop=()=>{ clearTimeout(t); t=null; b.classList.remove("holding"); };
    b.addEventListener("contextmenu",e=>e.preventDefault());
    b.addEventListener("pointerdown",e=>{ e.preventDefault(); b.classList.add("holding");
      t=setTimeout(()=>{ t=null; b.classList.add("done"); if(navigator.vibrate)try{ navigator.vibrate(30); }catch(_){}
        b.dataset.act=b.dataset.hold; b.click(); },HOLD_MS); });
    ["pointerup","pointerleave","pointercancel"].forEach(k=>b.addEventListener(k,()=>{ if(!b.classList.contains("done"))stop(); }));
  });
}
/** 大きなカードの操作: ドラッグで傾き(輝きと光沢が指に付いてくる)、速く横にはじくと裏返る */
function k3dBind(){ document.querySelectorAll("#club .k3d").forEach(k3dBindOne); }
function k3dBindOne(st){
  const fk=st.dataset.fk||"kFlip";
  const inner=st.querySelector(".k3d-in"), face=()=>st.querySelector(CL[fk]?".k3d-b .kb":".k3d-f .kc");   // 見えている面に光沢
  let d=null;
  const base=()=>CL[fk]?180:0;
  const set=(rx,ry,ease)=>{ inner.style.transition=ease?"transform .45s cubic-bezier(.2,.8,.2,1.2)":"none"; inner.style.transform="rotateX("+rx+"deg) rotateY("+ry+"deg)"; };
  const shine=(px,py)=>{ const card=face(); for(const x of st.querySelectorAll(".kc,.kb"))if(x!==card)x.classList.remove("touch"); if(!card)return; card.style.setProperty("--mx",(px*100).toFixed(1)+"%"); card.style.setProperty("--my",(py*100).toFixed(1)+"%"); card.classList.toggle("touch",px!=null); };
  set(0,base(),false);
  // 画像のドラッグ・文字の選択を止める(止めないとブラウザが操作を打ち切る)
  st.addEventListener("dragstart",e=>e.preventDefault());
  const live=()=>{ const sl=st.closest(".pk-slot"); return !sl||sl.classList.contains("st2"); };   // パックの中は破ったあとだけ
  st.addEventListener("pointerdown",e=>{ if(!live())return; e.preventDefault(); d={ x:e.clientX, y:e.clientY, t:performance.now(), hx:[[e.clientX,performance.now()]] }; try{ st.setPointerCapture(e.pointerId); }catch(_){} });
  // マウスは押さずに上を動かすだけでも傾く(サンプルと同じ)
  st.addEventListener("pointerleave",()=>{ if(!d){ set(0,base(),true); shine(null,null); } });
  st.addEventListener("pointermove",e=>{
    if(!d){ if(e.pointerType!=="mouse"||!live())return;
      const r=st.getBoundingClientRect(), px=(e.clientX-r.left)/r.width, py=(e.clientY-r.top)/r.height;
      set(-(py-0.5)*28,base()+(px-0.5)*28,false); shine(px,py); return; }
    const r=st.getBoundingClientRect(), dx=e.clientX-d.x, dy=e.clientY-d.y;
    const ry=base()+Math.max(-40,Math.min(40,dx*0.35)), rx=Math.max(-28,Math.min(28,-dy*0.3));
    set(rx,ry,false);
    shine(Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height)));
    d.hx.push([e.clientX,performance.now()]); if(d.hx.length>6)d.hx.shift();
    if(Math.hypot(e.clientX-d.x,e.clientY-d.y)>8&&typeof SC!=="undefined")SC.packMoved=true; });   // つまんで動かしたあとのタップでは進まない
  const end=e=>{ if(!d)return;
    const h=d.hx, a=h[0], z=h[h.length-1], v=(z[0]-a[0])/Math.max(1,z[1]-a[1]), dx=e.clientX-d.x; d=null;
    // ピン！とはじいたら裏返る(速さ 0.6px/ms 以上・30px 以上)
    if(Math.abs(v)>0.6&&Math.abs(dx)>30){ CL[fk]=!CL[fk]; inner.classList.toggle("flip",CL[fk]);
    }
    set(0,base(),true); shine(null,null); };
  st.addEventListener("pointerup",end); st.addEventListener("pointercancel",end);
}
/** コレクション(持っているカード全部。登録中のカードには印) */
function collectionHtml(){
  const S=CL.S, ids=Object.keys(S.coll), n=ids.reduce((s,id)=>s+S.coll[id],0);
  const ord=r=>RAR_ORDER.indexOf(r), posOrd={ GK:0, DF:1, MF:2, FW:3 };
  const by={ rar:(a,b)=>ord(CARDS[b].rar)-ord(CARDS[a].rar)||posOrd[CARDS[a].pos]-posOrd[CARDS[b].pos]||cnoCmp(a,b),
    no:cnoCmp, tot:(a,b)=>statTotal(CARDS[b])-statTotal(CARDS[a])||cnoCmp(a,b) };
  // 登録中のカードも並べて「登録中」の印を付ける(コレクションとして全部見えるように)
  const list=ids.filter(id=>CL.cf==="ALL"||CARDS[id].pos===CL.cf).sort(by[CL.cs]||by.rar);
  let h='<section class="card coll"><h3>カード <small>'+ids.length+'種 ・ '+n+'枚 ・ 登録 16人</small></h3>'+
    // 絞り込みと並べ替えを1段に。並べ替えは押すたびに切り替わる(→docs/14 第2弾)
    '<div class="cfrow"><div class="tabs t5">'+["ALL","GK","DF","MF","FW"].map(k=>'<button class="tab'+(CL.cf===k?' on':'')+'" data-act="cf" data-v="'+k+'">'+
      (k==="ALL"?"全部":k)+'</button>').join("")+'</div>'+
    '<button class="tab sortb" data-act="cs" data-v="next">↕ '+({ rar:"レア", no:"No.", tot:"合計" })[CL.cs||"rar"]+'</button></div>';
  h+=list.length?'<div class="kgrid">'+list.map(id=>cardHtml(id,"s",(CL.sel===id?" on":"")+(S.sq.includes(id)?" insq":""))).join("")+'</div>'
    :'<p class="dim">このポジションのカードはまだ無い。試合のあとに1枚ずつ出る</p>';
  CL.kList=list;                               // フロート(cardModalHtml)の ‹ › で使う。フロートは監督室の外側に出す(clubHtml)
  return h+'</section>';
}

/** 任期終了の画面。称号・年俸・監督ランク・ついてくる選手(→term.js) */
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
      '<div><small>監督ランク</small><b>'+e.fac+'</b>'+(e.facUp?'<i class="up">UP</i>':'')+'</div></div>'+
    '<p class="dim">監督ランクが上がると、特殊練習が候補に出やすくなる</p>'+termExpHtml(e);
  h+='<h4>次の任期についてくる選手</h4>'+(e.follow.length?'<ul class="fol">'+e.follow.map(id=>{
      const g=S.g.pl[id], c=CARDS[id];
      return '<li><b>'+c.no+' '+nameOf(c)+'</b> 個人'+stars(g.is)+' 特殊'+stars(g.ss)+' <small>絆 '+g.bond+'</small></li>'; }).join("")+'</ul>'
    :'<p class="dim">絆を深めた選手がいない(個別指導で呼ぶと絆が深まる)</p>')+
    '<p class="dim">ついてくる選手は★と能力を保ったまま、互いの連携も残る。ほかの選手は初めから。'+
    '次の任期は、届いたオファー(称号と年俸で決まる)からクラブを選ぶ。途中のリーグとカップは任期の終わりで打ち切り</p>'+
    '<button class="btn btn-main" data-act="term">次の任期へ</button></section>';
  return h;
}
/** 歴代の任期 */
function careerHtml(){
  const S=CL.S;
  if(!S.career.length)return "";
  const best=Math.max(...S.career.map(c=>c.money||0));
  return '<section class="card"><h3>歴代 <small>累計年俸 '+S.salary+'億 ・ 稼いだ資金の最高 '+best+'億</small></h3><table class="tbl">'+
    '<tr><th></th><th></th><th>勝</th><th>分</th><th>敗</th><th>冠</th><th>資金</th><th>年俸</th></tr>'+
    S.career.map(c=>'<tr'+(c.money&&c.money===best?' class="me"':'')+'><td>第'+c.term+'任期</td><td class="nm2">'+titleOf(c.title).name+'</td><td>'+c.w+'</td><td>'+c.d+
      '</td><td>'+c.l+'</td><td>'+c.titles+'</td><td>'+(c.money!=null?c.money:"—")+'</td><td>'+c.salary+'</td></tr>').join("")+'</table></section>';
}
/* ---- 監督室(→docs/07 §7.9)。HOME をハブにして、下のタブで行き来する ---- */

/** 下のメニューの専用アイコン(独自の線画。→docs/14 §14.18) */
const TAB_ICON={
  home:'<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
  squad:'<rect x="3.5" y="3.5" width="17" height="17" rx="1"/><path d="M3.5 12h17"/><circle cx="12" cy="12" r="2.6"/><circle cx="8" cy="7.5" r="1"/><circle cx="16" cy="7.5" r="1"/><circle cx="12" cy="17" r="1"/>',
  cards:'<rect x="7" y="3.5" width="12" height="16" rx="1.5" transform="rotate(8 13 11.5)"/><rect x="4.5" y="5" width="12" height="16" rx="1.5"/><path d="M8 9h5M8 12h3"/>',
  season:'<path d="M7 4h10v4a5 5 0 01-10 0z"/><path d="M7 6H4a3 3 0 003 4M17 6h3a3 3 0 01-3 4"/><path d="M12 13v4M8.5 20h7M10 17h4"/>',
  club:'<path d="M12 3l7 3v6c0 4.2-3 7.5-7 9-4-1.5-7-4.8-7-9V6z"/><path d="M9.5 12.5l1.8 1.8 3.5-4"/>',
  mgr:'<circle cx="12" cy="7.5" r="3.5"/><path d="M5 20.5c.8-4.2 3.6-6.5 7-6.5s6.2 2.3 7 6.5"/><path d="M12 14l-1.3 2.2L12 20l1.3-3.8z"/>'
};
const TABS=[["home","HOME","⌂"],["squad","SQUAD","◫"],["cards","CARDS","▤"],["season","SEASON","☰"],["club","CLUB","◎"],["mgr","MANAGER","👤"]];

/** 秘書の一言。次に何をするとよいかを、状況から1つ選ぶ。言葉はいまの秘書の口調(→grow.js の secSay) */
function secLine(S){
  const fx=CL.fx, g=S.g, pl=Object.values(g.pl);
  if(CL.alert)return CL.alert;                 // 保存の異常は何より先に知らせる
  if(S.termOver)return secSay(S,"termOver");
  const sign=Object.keys(g.pl).filter(id=>hasSign(S,id)).length;
  const omen=pl.filter(p=>p.q||p.sq).length+Object.values(g.links).filter(l=>l.gold).length;
  // ケガをした先発がいれば、入れ替えかケアを勧める(→docs/08 §8.8)
  const hurt=S.sq.slice(0,11).filter(id=>g.pl[id]&&g.pl[id].mot===0);
  if(hurt.length&&g.step!=="ready")return secSay(S,"hurt",{ n:hurt.map(cname).join("・") });
  if(fx.kind==="friendly"&&omen)return secSay(S,"omen");
  if(g.step!=="train"&&commLeft(S))return secSay(S,"comm",{ n:commLeft(S) });
  if(tiredStarters(S)>=TUNING.voice.manyTired)return secSay(S,"tiredMany");   // 多くの選手が疲れを訴えている(→docs/14 §14.81)
  if(teamFatigue(S)>=TUNING.grow.int.tiredSign)return secSay(S,"tired");
  if(sign)return secSay(S,"sign",{ n:sign });
  if(fx.ko&&/決勝/.test(fx.label))return secSay(S,"final",{ c:COMPS[fx.comp].name });
  if(S.played===0)return secSay(S,"welcome");
  return secSay(S,"next");
}
/** 次の試合の煽り(同じ試合なら毎回同じ文) */
function hypeOf(S,fx){
  const t=tierOf(fx.opp), me=S.grade+1;
  if(fx.kind==="friendly")return "腕試しの一戦。";
  if(fx.agg)return "第1試合の結果を背負って、勝負の第2戦。";
  if(/決勝/.test(fx.label))return "頂点まで、あと一つ。";
  if(fx.kind==="league"&&S.league.done===13)return "リーグ最終節。";
  if(t>=me+2)return "強豪への挑戦。番狂わせを起こせ。";
  if(t<=me-1)return "取りこぼしは許されない。";
  return fx.kind==="cup"?"負ければ終わりの一戦。":"勝ち点3を積み上げる。";
}
/** HOME の見出し(クラブと任期) */
const powDelta=S=>{ const d=teamPower(S)-(S.ts.pow0||teamPower(S)); return d>=0.05?" +"+d.toFixed(1):d<=-0.05?" "+d.toFixed(1):""; };
function homeHeadHtml(){
  if(CL.S.ts&&CL.S.ts.pow0==null){ CL.S.ts.pow0=teamPower(CL.S); CL.S.ts.ax0=teamAxisPower(CL.S); }   // 任期の始め(または初めて見たとき)のチーム力と6軸(→docs/14 §14.111)
  const S=CL.S, C=TUNING.club, last=S.career.length?titleOf(S.career[S.career.length-1].title).name:null;
  // 2行目は1行に収まる分だけ(格・ランク・称号は CLUB にある。→docs/14 第2弾)
  return '<header class="chd">'+emblemSvg(myTeam(S),30)+'<div><b>'+myTeam(S).name+'</b><small>第'+S.term+'任期'+(S.mgr?' ・ 監督 '+S.mgr.name:'')+'</small></div>'+
    '<div class="num pw"><small>OVR</small><b>'+teamPower(S).toFixed(1)+'</b></div>'+   // 合算値だけ。伸びの内訳は SQUAD の窓(→docs/14 §14.110)
    '<div class="num"><small>任期</small><b>'+S.played+'<i>/'+C.termLen+'</i></b></div>'+
    '<div class="num"><small>資金</small><b>'+S.money.toFixed(0)+'<i>億</i></b></div>'+
    (S.biz?'<div class="num"><small>サポーター</small><b>'+(S.biz.fans/10000).toFixed(1)+'<i>万</i></b></div>':'')+'</header>';
}
/** 次の試合のタイル。**タイル全体が押す面**で、中にボタンを置かない(pftb の決まり) */
function nextTileHtml(){
  const S=CL.S, fx=CL.fx, comp=COMPS[fx.comp], t=TEAMS[fx.opp], kp=CARDS[t.kp], st=styleOfCard(kp);
  const go=S.g.step==="train"?"準備をはじめる":"準備のつづき";
  // カップの1戦目: エントリーか棄権を選ぶまで準備に入れない(準備を始めたあとの古いセーブはそのまま対戦へ)
  if(fx.ask&&S.g.step==="train")return entryTileHtml();
  const fr=fx.kind==="friendly"&&fx.missed&&S.g.step==="train";   // フレンドリー: 節を飛ばせる(→docs/22)
  return '<section class="tile next'+(fr?' two':'')+'"'+(fr?'':' data-act="go"')+'>'+
    '<div class="nx-band">'+gradeTag(comp.grade)+'<b>'+comp.name+'</b><em>'+(fx.label||"")+'</em><i>第'+fx.no+'試合</i></div>'+
    '<p class="nx-hype">'+hypeOf(S,fx)+'</p>'+
    '<div class="nx-vs"><div class="me">'+emblemSvg(myTeam(CL.S),46)+'<b>'+myTeam(CL.S).short+'</b></div>'+
      '<span class="vs">VS</span>'+
      '<div class="op">'+emblemSvg(t,46)+'<b>'+t.short+'</b></div></div>'+
    '<p class="nx-opp">'+teamNameOf(t)+' <span>'+"★".repeat(tierOf(fx.opp))+'</span></p>'+
    '<p class="nx-meta">KP '+nameOf(kp)+(st?' ・ '+st.name:'')+' ・ '+t.form+
      (fx.kind==="friendly"?"":fx.home?" ・ HOME":" ・ AWAY")+(fx.agg?' ・ 第1試合 '+fx.agg[0]+'-'+fx.agg[1]:fx.ko?' ・ 同点なら PK':'')+'</p>'+
    (fx.missed?'<p class="nx-meta dim">'+COMPS[fx.missed].name+'('+fx.why+')の枠</p>':'')+
    formHtml(S)+
    (fr?'<div class="nx-go2"><button class="go" data-act="go">'+go+'</button><button class="sk" data-act="skipslot">節をスキップ<small>試合なし ・ 任期は減らない</small></button></div>'
      :'<div class="nx-go"><span>'+go+'</span></div>')+'</section>';
}
/** カップのエントリー受付(1戦目の前。→docs/20 §20.4)。エントリーすると対戦の札、棄権するとフレンドリーの札に変わる */
function entryTileHtml(){
  const S=CL.S, fx=CL.fx, comp=COMPS[fx.comp], st=comp.stages;
  const flow=st.map(x=>x[1].replace(/ 第\d試合$/,"")).filter((x,i,a)=>a.indexOf(x)===i).join(" → ");
  return '<section class="tile next two entry">'+
    '<div class="nx-band">'+gradeTag(comp.grade)+'<b>'+comp.name+'</b><em>エントリー受付</em><i>第'+fx.no+'試合</i></div>'+
    '<p class="nx-hype">出場の権利を得た。出るか、見送るか。</p>'+
    '<div class="en-cup">'+trophyIconSvg(fx.comp,false)+'<div><b>'+comp.name+'</b><small>'+flow+'(全'+st.length+'試合)</small>'+
      '<small>組み合わせはエントリーで発表</small></div></div>'+
    formHtml(S)+
    '<div class="nx-go2"><button class="go" data-act="cupenter">エントリー</button><button class="sk" data-act="decline">棄権<small>大会の枠はフレンドリーに</small></button></div></section>';
}
/** 試合の結果の印(W/D/L) */
const wdlOf=a=>{ const d=a.hg-a.ag, w=d>0||(d===0&&a.pso&&a.pso[0]>a.pso[1]), l=d<0||(d===0&&a.pso&&a.pso[0]<a.pso[1]); return w?"W":l?"L":"D"; };
/** 直近の試合の印(最大5。古い順に左から)。押すとその試合の新聞 */
function formHtml(S){
  const P=S.paper||[], n=Math.min(TUNING.paper.recent,P.length); if(!n)return "";
  let h='<div class="nx-form"><small>直近</small>';
  for(let i=P.length-n;i<P.length;i++)h+='<button class="wdl '+wdlOf(P[i])+'" data-act="paper" data-i="'+i+'" title="'+P[i].hg+'-'+P[i].ag+'">'+wdlOf(P[i])+'</button>';
  return h+'</div>';
}
/* ---- WEEKLY NEWS(→docs/14 第2弾)。最新号のゴシップから大事な順に1件を、HOME に1行で ---- */
const NEWS_ORDER=["【速報】","【独占】","【話題】","【分析】","【スポンサー】","【クラブ】","【うわさ】"];
function newsPick(a){
  if(!a)return null;
  for(const t of NEWS_ORDER){ const x=a.side.find(y=>y.indexOf(t)===0); if(x)return x; }
  return a.head;
}
/** 号の見分け(最大30号で古いものから消えるので、数ではなく任期と試合で) */
const paperKey=a=>a?a.term+":"+a.no:"";
function newsLineHtml(){
  const S=CL.S, P=S.paper||[], a=P[P.length-1]; if(!a)return "";
  const unread=S.paperSeen!==paperKey(a), more=a.side.length-1;
  return '<button class="tile news'+(unread?' unread':'')+'" data-act="news"><i class="nw-tag">WEEKLY<br>NEWS</i>'+
    '<span class="nw-line">'+newsPick(a)+'</span>'+(more>0?'<em>+'+more+'</em>':'')+'<b>›</b></button>';
}
/** 秘書が HOME に出るのは、伝えることがあるときだけ(定型の一言は出さない) */
function secNeeded(S){
  if(CL.alert)return true;
  if(S.sec&&S.sec.ev!=null)return true;
  const g=S.g, fx=CL.fx;
  if(S.sq.slice(0,11).some(id=>g.pl[id]&&g.pl[id].mot===0)&&g.step!=="ready")return true;   // ケガ
  if(fx&&fx.kind==="friendly"&&(Object.values(g.pl).some(p=>p.q||p.sq)||Object.values(g.links).some(l=>l.gold)))return true;   // 兆し
  if(fx&&fx.ko&&/決勝/.test(fx.label||""))return true;
  return S.played===0;                            // 最初のあいさつ
}
/** 秘書の一言 */
function secHtml(){
  const S=CL.S, se=secOf(S);
  let h='<section class="sec">'+secAv(S)+'<div><b class="sec-nm">'+se.name+'</b><p>'+secLine(S)+'</p></div></section>';
  // 監督室の短い会話(親密度のイベント)
  const ev=S.sec&&S.sec.ev!=null?SEC_EVENTS[S.sec.ev]:null;
  if(ev&&!S.termOver)h+='<section class="sec sec-ev">'+secAv(S)+'<div><b class="sec-nm">'+se.name+'<em class="sec-tag">TALK</em></b><p>「'+secEvQ(S,ev)+'」</p>'+
    '<div class="sec-ch">'+ev.ch.map((c,i)=>'<button class="btn ch" data-act="secev" data-i="'+i+'">'+c[0]+'</button>').join("")+'</div></div></section>';
  return h;
}
/** CLUB の秘書の欄: いまの秘書と親密度。開くと選び直せる */
function secClubHtml(){
  const S=CL.S, se=secOf(S), b=secBond(S), lv=secLv(S), t=TUNING.sec.lv;
  if(CL.secOpen)return secPickHtml("秘書を替える");
  const f=secArt(se.id,"full");
  return '<section class="card sec-card"><h3>秘書 <small><button class="lnk" data-act="secopen">替える</button></small></h3>'+
    '<div class="sc-row">'+(f?'<img class="sp-full" src="'+f+'" alt="">':'')+'<div>'+
    '<p><b>'+se.name+'</b> ・ '+se.desc+'</p><p class="dim">親密度 '+SEC_LV_LABEL[lv]+(lv<t.length?'(次まで '+(t[lv]-b)+')':'')+
    ' ・ フォローの起きやすさ '+Math.round(TUNING.sec.follow[lv]*100)+'%</p><p class="sc-say">「'+secSay(S,"next")+'」</p></div></div></section>';
}
/* ---- スタジアムと施設(→docs/05 §5.13) ---- */
/** スタジアムの絵(夜)。段が上がるほどスタンドが高く広く、照明塔と屋根が付く(独自の意匠 →docs/14 第3弾) */
function stadiumSvg(lv){
  const H=[0,16,26,38,50,58][lv]||16, top=92-H, wide=lv>=4;
  let g='<defs><linearGradient id="stSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#070a14"/><stop offset="1" stop-color="#1c2540"/></linearGradient>'+
    '<linearGradient id="stBeam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6c8" stop-opacity=".55"/><stop offset="1" stop-color="#fff6c8" stop-opacity="0"/></linearGradient>'+
    '<linearGradient id="stPitch" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2e8a45"/><stop offset="1" stop-color="#1d6a33"/></linearGradient></defs>'+
    '<rect x="0" y="0" width="300" height="120" fill="url(#stSky)"/>';
  // 星
  for(let k=0;k<18;k++){ const x=(k*53)%300, y=(k*29)%40+4; g+='<circle cx="'+x+'" cy="'+y+'" r="'+(k%3?0.6:1)+'" fill="#fff" opacity=".6"/>'; }
  // 照明の光の筋(Lv3 から)
  if(lv>=3)[[16,1],[284,-1]].forEach(([x,d])=>{ const y=lv>=4?14:24;
    g+='<polygon points="'+x+','+y+' '+(x+d*150)+',100 '+(x+d*70)+',100" fill="url(#stBeam)"/>'; });
  // スタンド: 斜めの段(左右の端ほど高い)。座席の赤と通路の線
  const stand=(x0,x1,h)=>{ let q='<polygon points="'+x0+',92 '+x0+','+(92-h)+' '+x1+','+(92-h*0.82)+' '+x1+',92" fill="#5a0f1c"/>';
    for(let y=92-h+5;y<92;y+=5)q+='<line x1="'+x0+'" y1="'+y+'" x2="'+x1+'" y2="'+(y+(h*0.18)*(92-y)/h)+'" stroke="#c8102e" stroke-width="2.2" opacity=".85"/>';
    return q; };
  g+=stand(0,wide?130:110,H)+stand(300,wide?170:190,H);
  if(lv>=2)g+='<rect x="'+(wide?130:110)+'" y="'+(92-H*0.55)+'" width="'+(wide?40:80)+'" height="'+(H*0.55)+'" fill="#3d0a14"/>';
  // 観客の点(段が上がるほど多い)
  for(let k=0;k<lv*26;k++){ const r1=hashStr("st"+k), x=r1%300, y=92-((r1>>9)%Math.max(4,H-4))-2; g+='<rect x="'+x+'" y="'+y+'" width="1.4" height="1.4" fill="'+(k%4?"#ffd9de":"#fff")+'" opacity=".7"/>'; }
  // 屋根(Lv5)
  if(lv>=5)g+='<path d="M0 '+(top-4)+' Q150 '+(top-22)+' 300 '+(top-4)+'" fill="none" stroke="#c9d1dc" stroke-width="5"/>';
  // 照明塔(Lv3 から)
  if(lv>=3)[16,284].forEach(x=>{ const y=lv>=4?14:24;
    g+='<line x1="'+x+'" y1="92" x2="'+x+'" y2="'+y+'" stroke="#8a93a6" stroke-width="2.5"/><rect x="'+(x-9)+'" y="'+(y-5)+'" width="18" height="7" rx="1" fill="#fff6c8"/>'; });
  // ピッチ
  g+='<rect x="0" y="92" width="300" height="28" fill="url(#stPitch)"/>'+
    '<rect x="60" y="96" width="180" height="20" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.2"/><line x1="150" y1="96" x2="150" y2="116" stroke="#fff" stroke-opacity=".7" stroke-width="1.2"/>'+
    '<circle cx="150" cy="106" r="5" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.2"/>';
  return '<svg class="stad-svg" viewBox="0 0 300 120" preserveAspectRatio="xMidYMax meet">'+g+'</svg>';
}
/** HOME の改修の知らせ(秘書の言葉で)。払うか見送るか */
function stadOfferHtml(){
  const S=CL.S, o=S.biz&&S.biz.offer; if(!o||S.termOver)return "";
  const nx=TUNING.biz.stad[o.lv-1], why=o.why==="資金"?secSay(S,"stadMoney"):secSay(S,"stadRep",{ r:o.why });
  return '<section class="sec stad-offer">'+secAv(S)+'<div><b class="sec-nm">'+secOf(S).name+'<em class="sec-tag">STADIUM</em></b>'+
    '<p>'+why+secSay(S,"stad",{ nm:nx.name, cap:(nx.cap/10000).toFixed(1), c:o.cost, d:o.why!=="資金"?"(今なら割引)":"" })+'</p>'+
    stadiumSvg(o.lv)+
    '<div class="sec-ch"><button class="btn ch" data-act="stad" data-v="1"'+(S.money<o.cost?' disabled':'')+'>改修する(資金 '+S.money.toFixed(0)+'億)</button>'+
    '<button class="btn ch" data-act="stad" data-v="0">見送る</button></div></div></section>';
}
/* ---- スポンサー(→docs/05 §5.14)。マスタは club.js の SP_IND(業種 × ☆1〜5) ---- */
const spStars=r=>"★".repeat(r)+"☆".repeat(5-r);
function missionsHtml(ms){
  return '<ul class="msn">'+ms.map(m=>'<li class="'+(m.done?'ok':m.fail?'ng':'')+'"><b>'+missionTxt(m)+'</b><em>'+missionProg(m)+'</em></li>').join("")+'</ul>';
}
/** 1社ぶん(業種・☆・収入・報酬・ミッション) */
function spCardHtml(o){
  const ind=spIndOf(o.ind);
  return '<div class="spo-h">'+(o.rare?'<em class="sp-rare">RARE</em>':'')+'<b>'+o.name+'</b><i>'+ind.name+'</i><span class="st">'+spStars(o.rank)+'</span>'+
    '<small>1試合 '+o.pay.toFixed(2)+'億 ・ ミッションを達成するたびに報酬</small></div>'+
    '<p class="rw"><b>'+spItem(ind,o.rank)+'</b> '+spEffTxt(ind.eff,o.rank)+'(<u>'+spDur(ind,o.rank)+'試合</u>)</p>'+
    (o.rare?'<p class="rw oil"><b>オイルマネー</b> 契約しているあいだ、カードの金パック(キラ・レジェンド)が出る率 ×'+TUNING.pack.oilK+'</p>':'')+missionsHtml(o.ms);
}
/** 候補から選ぶ。first なら選ばないと始められない(任期の始め)、そうでなければ今の契約を続けられる */
function spPickHtml(first){
  const S=CL.S, Z=S.biz;
  return '<section class="card sppick"><h3>スポンサーを選ぶ <small>'+(first?'任期の始め':'リーグの1周が終わった')+' ・ 契約は次の区切りまで</small></h3>'+
    Z.offers.map((o,i)=>'<div class="spo r'+o.rank+(o.rare?' rare':'')+'">'+spCardHtml(o)+
      '<button class="btn" data-act="spsign" data-i="'+i+'">この社と契約する</button></div>').join("")+
    (!first&&Z.sp?'<button class="btn btn-sub" data-act="spkeep">'+Z.sp.name+' との契約を続ける(ミッションは新しくなる)</button>':'')+'</section>';
}
/** いま効いている報酬の効果 */
function spBoostHtml(){
  const Z=CL.S.biz, on=SP_IND.filter(x=>Z.boost[x.eff]>0);
  return on.length?'<p class="boost">'+on.map(x=>{ const r=Z.boostRank[x.eff]||1; return spItem(x,r)+': '+spEffTxt(x.eff,r)+' 残り'+Z.boost[x.eff]+'試合'; }).join('<br>')+'</p>':'';
}
/** HOME: 区切りのスポンサーの候補は1行の帯にたたむ(押すと開く) */
function spRenewBarHtml(){ return '<button class="tile sp-bar" data-act="spopen">📣 スポンサーの契約を更新できます(候補 3社)<b>›</b></button>'; }
/** HOME: スポンサーは1行(社名・ミッションの達成数・効いている効果)。詳しくは CLUB タブ */
/** CLUB のスポンサーの欄(胸ロゴとミッションの進み) */
function spTileHtml(){
  const S=CL.S, sp=S.biz&&S.biz.sp; if(!sp||S.termOver)return "";
  return '<section class="tile sptile"><h3><span class="logo r'+sp.rank+'">'+sp.name+'</span></h3><div class="spo r'+sp.rank+'">'+spCardHtml(sp)+'</div>'+spBoostHtml()+'</section>';
}
/** CLUB のスタジアムと施設の欄 */
function bizClubHtml(){
  const S=CL.S, Z=S.biz; if(!Z)return "";
  const sd=stadOf(S), nx=TUNING.biz.stad[Z.stad];
  let st='<section class="card stad"><h3>スタジアム <small>Lv'+Z.stad+' ・ '+sd.name+'</small></h3>'+stadiumSvg(Z.stad)+
    '<p>収容 <b>'+(sd.cap/10000).toFixed(1)+'万人</b> ・ ファン <b>'+(Z.fans/10000).toFixed(1)+'万人</b>'+(Z.att?' ・ 前のホーム '+(Z.att/10000).toFixed(1)+'万人':'')+'</p>'+
    '<p class="dim">'+(nx?'次の改修: 「'+nx.name+'」'+nx.cost+'億(資金がたまるか、優勝・昇格のときに秘書が知らせる)':'これ以上の改修はない')+'</p></section>';
  // 施設(お金を使う唯一の操作)を先に、スタジアムの絵はそのあと(→docs/14 第2弾)
  let h='<section class="card facs"><h3>施設 <small>資金 '+S.money.toFixed(0)+'億 ・ 育成に効く</small></h3>'+FAC_KEYS.map(k=>{
    const lv=Z.fac[k], c=facCost(S,k), f=FAC_INFO[k];
    return '<div class="fac"><div><b>'+f.name+' <i>Lv'+lv+'</i></b><small>'+f.eff+(lv?'(いま '+facEffTxt(k,lv)+')':'')+'</small></div>'+
      (c==null?'<span class="dim">最大</span>':'<button class="btn btn-sub" data-act="fac" data-v="'+k+'"'+(S.money<c?' disabled':'')+'>'+c+'億で'+(lv?'上げる':'建てる')+'</button>')+'</div>'; }).join("")+'</section>';
  return h+st;
}
const facEffTxt=(k,lv)=>k==="med"?"疲労の残り ×"+TUNING.biz.medFat[lv]+"・ケガが治る率 +"+Math.round(TUNING.biz.medHeal[lv]*100)+"%"
  :"経験 ×"+TUNING.biz.facK[lv];
/* ---- 監督能力(→docs/10 §10.2 C)。準備の画面の下で、1試合に3つまでセットする ---- */
/* ---- 視察(→docs/18)。コミュニケーションと戦略方針のあいだ。秘書が相手の SQUAD を整理して伝える ---- */
// 監督の型を、秘書の言い回しで(→docs/18 §18.4)
const PERS_DESC={ steady:"いつもの戦い方を崩さない、手堅い人", quick:"試合の流れを読むのが得意な人",
  stubborn:"自分たちのやり方を最後まで貫く人", attack:"同点でも終盤は攻めてくる、強気な人",
  careful:"リードするとすぐに守りを固める、慎重な人" };
// 強い2つの軸の組 → チームの色(たとえ)
const AX_STYLE={ OS:"速い攻撃", OP:"力強い攻撃", OR:"技術で崩す攻撃", OC:"前から奪って攻める", DP:"体を張った堅い守り", CD:"粘り強く奪う守備",
  RS:"素早いパス回し", CR:"ボールを持つ時間が長い戦い", CS:"よく走り回る", CP:"球際の強さ", DS:"戻りの速い守り", DR:"落ち着いた組み立て",
  OD:"攻守のバランス", PS:"体の強さと速さ", PR:"技術と強さ", DO:"攻守のバランス" };
const AX_WORD={ O:"攻める力", D:"守る力", R:"ボールを持つ力", C:"奪う力", S:"速さ", P:"強さ" };
const AX_ADVICE={ O:"積極的に攻める", D:"落ち着いて守りから入る", R:"ボールを持って主導権を握る",
  C:"前から奪いにいく", S:"スピードで振り切る", P:"競り合いで勝負する" };
/** 軸ごとの戦力(先発の能力の平均。足すと OVR)。cards … 先発11枚 */
function axisPowerOf(cards){
  const out={ O:0, D:0, R:0, C:0, S:0, P:0 };
  for(const c of cards)for(const k of STATS)out[PARAM_AXIS[k]]+=c[k]/cards.length;
  return out;
}
const cardTotal=c=>STATS.reduce((s,k)=>s+c[k],0);
/**
 * 相手の CAP とキッカー(→docs/18 §18.3)。試合と同じ決め方: CAP はキャプテンの適性が一番高い選手(同じなら年長。engine.js の buildTeam)、
 * キッカーは指名が無いので、その場の一番うまい選手(engine.js の spKicker を、試合前の能力で)
 */
function oppRoles(def){
  const xi=def.xi.map(s=>s.card), fld=xi.filter(c=>c.pos!=="GK");
  const best=f=>fld.slice().sort((a,b)=>f(b)-f(a))[0]||null;
  const cap=xi.slice().sort((a,b)=>capApt(b)-capApt(a)||b.age-a.age)[0];
  return { cap:cap&&cap.id, kp:def.kp, pk:(best(c=>c.off*1.2+c.tec)||{}).id, fk:(best(c=>c.tec*1.2+c.off*0.8)||{}).id, ck:(best(c=>c.tec+c.pow*0.6)||{}).id };
}
/** 秘書の報告(相手の情報を整理した数行)。数字は出さず、たとえで伝える(→docs/18 §18.4) */
function scoutReport(S,fx,def){
  const t=TEAMS[fx.opp], tier=tierOf(fx.opp), xi=def.xi.map(s=>s.card), opw=axisPowerOf(xi), mpw=teamAxisPower(S);
  const ovO=xi.reduce((s,c)=>s+cardTotal(c),0)/xi.length, ovM=teamPower(S);
  const ax=Object.keys(opw), hi=ax.slice().sort((a,b)=>opw[b]-opw[a]);
  const kc=def.kp&&CARDS[def.kp], st=kc?styleOfCard(kc):null, rk=st?styleRank({ graph:def.graph },st):null;
  const pick=(f,g)=>xi.filter(f).sort((a,b)=>g(b)-g(a))[0];
  const atk=pick(c=>c.pos!=="GK"&&c.pos!=="DF",c=>c.off*1.2+c.tec+c.spd), dfn=pick(c=>c.pos==="DF"||c.pos==="GK",c=>c.def*1.2+c.pow);
  const pers=TUNING.coach.pers[def.pers]||TUNING.coach.pers.steady, nm=c=>c?c.no+" "+nameOf(c):"—";
  const lines=[];
  // チームの色(強い2つの軸)
  const key=[hi[0],hi[1]].sort().join(""), sty=AX_STYLE[key]||AX_STYLE[[hi[1],hi[0]].join("")]||"まとまった戦い";
  const say=(k,v)=>lines.push(secSay(S,k,v));
  say("scStyle",{ s:sty });
  // こちらが上回る軸
  const adv=ax.filter(a=>mpw[a]>opw[a]+0.3).sort((a,b)=>(mpw[b]-opw[b])-(mpw[a]-opw[a]))[0];
  if(adv)say("scAdv",{ w:AX_WORD[adv], a:AX_ADVICE[adv] }); else say("scNoAdv");
  say("scPers",{ p:PERS_DESC[def.pers]||PERS_DESC.steady });
  // KP のスタイル(何をしてくるか)
  if(st){ const g=String(st.get||"").split(/[。、]/)[0];
    if(st.scope==="team")say("scKpTeam",{ g }); else say("scKpOne",{ n:nm(kc), g });
    if(def.rareOpp&&rareOfCard(kc))say("scRare",{ n:nm(kc) }); }
  if(atk||dfn)say("scPillar",{ x:(atk?"攻めは "+nm(atk):"")+(atk&&dfn?"、":"")+(dfn?"守りは "+nm(dfn):"") });
  const OR=oppRoles(def), kick={}; for(const k of ["pk","fk","ck"]){ const id=OR[k]; (kick[id]=kick[id]||[]).push(k.toUpperCase()); }
  say("scRoles",{ c:nm(CARDS[OR.cap]), k:Object.keys(kick).map(id=>kick[id].join("・")+" を "+nm(CARDS[id])).join("、") });
  say(ovM>=ovO+2?"scUp":ovO>=ovM+2?"scDown":"scEven");
  return { lines, opw, mpw, ovO, ovM, kc, st, rk, tier, pers };
}
/** 相手の札(SQUAD の作り。押すとカードの裏) */
function oppTokenHtml(c,h,x,OR,on){
  const pos=on?(h<=0.06?"GK":posAt(h,x)):c.roles[0], a=aptOf(c,pos), p=on?sqPos(h,x):null;
  return '<button class="sqc cmx opp '+c.pos.toLowerCase()+' r-'+(c.rar||"B")+(on?'':' bn')+'" data-act="oppcard" data-id="'+c.id+'"'+
    (p?' style="left:'+p.l.toFixed(2)+'%;top:'+p.t.toFixed(2)+'%"':'')+'>'+
    '<i class="no">'+c.no+'</i><b class="rl '+aptClass(a)+'">'+pos+'</b><span class="nm">'+nameOf(c)+'</span>'+
    (()=>{ const t=on&&OR?ROLE_TAG_ORDER.filter(([k])=>OR[k]===c.id):[]; return t.length?'<span class="rtags">'+t.map(([k,l])=>'<i class="t '+k+'">'+l+'</i>').join("")+'</span>':''; })()+'<small class="if">計'+Math.round(cardTotal(c))+'</small></button>';
}
/**
 * 相手の SQUAD(→docs/18 §18.5)。上部(レーダー・名前・★・陣形・監督・OVR・KP)と盤面(先発・控え。札を押すとカードの裏)。
 * rep … 視察レポートのボタンを出すか(視察の画面だけ)
 */
function oppSquadHtml(S,oppId,def,rep){
  const t=TEAMS[oppId], OR=oppRoles(def), xi=def.xi.map(x=>x.card), opw=axisPowerOf(xi), mpw=teamAxisPower(S);
  const ovO=xi.reduce((a,c)=>a+cardTotal(c),0)/xi.length, kc=def.kp&&CARDS[def.kp], st=kc?styleOfCard(kc):null, rk=st?styleRank({ graph:def.graph },st):null;
  const pers=TUNING.coach.pers[def.pers]||TUNING.coach.pers.steady, v1={}, v2={};
  for(const a in opw){ v1[a]=opw[a]/STAT_MAX; v2[a]=mpw[a]/STAT_MAX; }
  const team=Object.assign({ id:oppId },t);
  return '<section class="sq-top scout-top"><div class="tf-g">'+radarSvg([{ v:v2, color:"#5e6470", fill:"#5e6470", op:0.15 },{ v:v1, color:teamColor(team), op:0.35 }],{ cls:"tf-radar" })+
      '<small class="gg-leg2"><span>相手</span><span>自軍</span><i class="g" style="background:'+teamColor(team)+'"></i><i class="p"></i></small></div>'+
      '<div class="sq-info"><div class="sc-team">'+emblemSvg(team,34)+'<div><b>'+teamNameOf(t)+'</b><small>'+"★".repeat(tierOf(oppId))+' ・ '+t.form+' ・ 監督 '+pers.name+'型</small></div></div>'+
      '<div class="sq-ovr sc-ovr"><small>OVR</small><b>'+ovO.toFixed(1)+'</b></div>'+   // 視察レポートのボタンは見出しの右端へ(→docs/14 §14.119)
      (st?'<p class="sq-kp"><i>KP</i><b>'+nameOf(kc)+'</b><span>'+st.name+' '+rankChip(rk)+'</span></p>':'')+
      ((def.titles||[]).length||(def.combos||[]).length||def.xi.some(s=>TAGS["u_"+s.card.id])?'<p class="opp-ttl">'+(def.titles||[]).map(id=>'<span class="tg up ttl" title="'+TAGS[id].desc+'"><b>'+TAGS[id].name+'</b></span>').join("")+
        (def.combos||[]).map(c=>'<span class="tg up cmb" title="'+c.ids.map(x=>nameOf(CARDS[x])).join("・")+'"><b>'+COMBOS[c.id].name+'</b></span>').join("")+
        def.xi.map(s=>s.card.id).filter(x=>TAGS["u_"+x]).map(x=>'<span class="tg up unq" title="'+nameOf(CARDS[x])+'"><b>'+TAGS["u_"+x].name+'</b></span>').join("")+'</p>':'')+'</div></section>'+
    '<div class="cm-board scout-board"><div class="sq-pitch cm-pitch"><i class="pm half"></i><i class="pm circ"></i><i class="pm pa top"></i><i class="pm pa bot"></i>'+
      def.xi.map(x=>oppTokenHtml(x.card,x.h,x.x,OR,true)).join("")+'</div>'+
      '<div class="sq-bench cm-bench"><span class="lbl">SUB</span>'+def.bench.map(c=>oppTokenHtml(c,0,0,null,false)).join("")+'</div></div>';
}
function scoutStepHtml(){
  const S=CL.S, fx=CL.fx;
  return '<div class="step-h one sc-h"><b>視察</b><small>秘書が相手の SQUAD を整理した</small><button class="btn btn-main sc-rep" data-act="screp">視察レポート</button></div>'+oppSquadHtml(S,fx.opp,oppDefOf(S,fx),true);
}
/** SEASON から見る相手の SQUAD(フロート。視察レポートは出さない)。リーグの相手は、Premier Div なら育成レベル最大で */
function oppViewModalHtml(){
  const S=CL.S, id=CL.oppView; if(!id||!TEAMS[id])return "";
  const inLg=S.league&&S.league.clubs.includes(id), def=oppDefOf(S,{ opp:id, kind:inLg?"league":"cup" });
  return '<div class="kmodal" data-act="oppvclose"><div class="kmod-box opp-vbox" data-act="none">'+
    '<header class="km-head"><span></span><b>'+teamNameOf(TEAMS[id])+'</b><small></small><span></span><button class="km-x" data-act="oppvclose" aria-label="閉じる">×</button></header>'+
    '<div class="ov-body">'+oppSquadHtml(S,id,def,false)+'</div></div></div>';
}
/** 相手の選手のカードの裏(フロート) */
/** 視察レポート(秘書の報告)のフロート */
function scoutRepModalHtml(){
  const S=CL.S, fx=CL.fx, def=oppDefOf(S,fx), R=scoutReport(S,fx,def), se=secOf(S);
  return '<div class="kmodal" data-act="screpclose"><div class="kmod-box sc-rbox" data-act="none">'+
    '<header class="km-head"><span></span><b>視察レポート</b><small>'+teamNameOf(TEAMS[fx.opp])+'</small><span></span><button class="km-x" data-act="screpclose" aria-label="閉じる">×</button></header>'+
    '<section class="sec scout-sec">'+secAv(S)+'<div><b class="sec-nm">'+se.name+'</b><ul>'+R.lines.map(l=>'<li>'+l+'</li>').join("")+'</ul></div></section></div></div>';
}
function oppCardModalHtml(){
  const c=CARDS[CL.oppSel]; if(!c)return "";
  return '<div class="kmodal" data-act="oppclose"><div class="kmod-box" data-act="none">'+
    '<header class="km-head"><span></span><b>'+c.no+' '+nameOf(c)+'</b><small>相手</small><span></span><button class="km-x" data-act="oppclose" aria-label="閉じる">×</button></header>'+
    '<div class="kdet back">'+cardBackHtml(c,{ ss:0, front:cardHtml(c.id,"s") })+'</div></div></div>';
}
/** ④ 戦略方針: 監督能力を選ぶ(→docs/14) */
function stratStepHtml(){
  return '<div class="step-h"><b>戦略方針</b><small>この試合で使う監督能力とハーフタイムの指示を選ぶ。選んだまま次の試合にも引き継ぐ</small></div>'+mabHtml()+htSetHtml();   // 監督能力は閉じた状態から。ハーフタイムの指示は SQUAD から移した(→docs/14 §14.31)
}
function mabHtml(){
  const S=CL.S, set=S.mab.set, M=TUNING.mab;
  const chip=k=>{ const a=MAB.find(x=>x.id===k), r=mabRank(S,k), on=set.includes(k), xp=S.mab.xp[k]||0, nx=M.rankAt[r+1];
    return '<button class="mab'+(on?' on':'')+'" data-act="mab" data-v="'+k+'"><b>'+a.name+'</b><i>'+MAB_RANK[r]+'</i>'+
      '<small>'+a.desc+(nx!=null?' ・ 次のランクまで '+(nx-xp)+'試合':'')+'</small></button>'; };
  return '<section class="card mabs"><h3>監督能力 <small>試合に軽く効く ・ '+set.length+'/'+M.max+' ・ 使うほどランクが上がる</small></h3>'+
    (CL.mabOpen?'<div class="mab-list">'+MAB.map(a=>chip(a.id)).join("")+'</div>'+foldBtn("mabopen",true)
      :'<div class="mab-set">'+(set.length?set.map(chip).join(""):'<p class="dim">セットしていない</p>')+'</div><button class="btn btn-sub" data-act="mabopen">監督能力を選ぶ</button>')+'</section>';
}
/* ---- 称号のセット(→docs/10 §10.2 B) ---- */
function titleSetHtml(){
  const S=CL.S, ids=earnedTitles(S);
  return '<section class="card tset"><h3>称号をセットする <small>この任期のあいだ効く ・ 獲った称号から1つ</small></h3>'+
    ids.map(id=>'<button class="sp" data-act="tset" data-v="'+id+'"><b>'+titleOf(id).name+'</b><i>'+TITLE_FX[id].desc+'</i></button>').join("")+
    '<button class="sp" data-act="tset" data-v=""><b>セットしない</b></button></section>';
}
/* ---- クラブオファー(→docs/16)。任期の始めに3つのクラブから選ぶ。見比べられるように、格・ファン・資金・スタジアム・施設・成長グラフ・期待を並べる ---- */
const OF_DIV_LABEL=["Premier Div","1st Div","2nd Div"];   // オファーの div(1〜3)→ Div の名前(→docs/19)
const misLevelTxt=p=>p>=0.4?"多い":p>=0.25?"ふつう":"少ない";
function offerCardHtml(o,i){
  const R=OF_REGIONS.find(r=>r.id===o.region), rare=o.rare?OF_RARES.find(x=>x.id===o.rare):null, G=TUNING.grow.graph, v={};
  for(const a in o.graph)v[a]=o.graph[a]/G.max;
  const fac=["train","tact","lounge","med"].map(k=>'<span'+(R.fac===k?' class="hi"':'')+'>'+OF_FAC_NAME[k]+' <b>Lv'+o.fac[k]+'</b></span>').join("");
  return '<article class="ofc'+(rare?' rare':'')+'">'+
    '<header><small>'+R.name+' ・ '+(leagueOf(o)||'')+(rare?' ・ RARE':' ・ '+OF_DIV_LABEL[o.div-1])+'</small><b>'+o.name+'</b>'+
      (rare?'<i>'+rare.desc+'</i>':'<i>'+R.name+'のクラブは'+OF_FAC_NAME[R.fac]+'が育っている</i>')+
      '<span class="lv">GRADE '+o.lv+'</span></header>'+
    '<div class="of-body">'+radarSvg([{ v, color:"#d0102f" }],{ cls:"of-radar" })+
      '<dl><div><dt>リーグ</dt><dd>'+(countryOf(o)?countryOf(o)+' ':'')+OF_DIV_LABEL[o.div-1]+'</dd></div>'+
        '<div><dt>ファン</dt><dd>'+(o.fans/10000).toFixed(1)+'万人</dd></div>'+
        '<div><dt>初めの資金</dt><dd>'+o.money+'億</dd></div>'+
        '<div'+(R.fac==="stad"?' class="hi"':'')+'><dt>スタジアム</dt><dd>'+TUNING.biz.stad[o.stad-1].name+'</dd></div></dl></div>'+
    '<p class="of-fac">'+fac+'</p>'+
    '<p class="of-exp">期待される獲得賞金 <b>'+o.target+'億</b> ・ オーナーの指令 <b>'+misLevelTxt(o.misP)+'</b></p>'+
    '<button class="btn btn-main" data-act="offer" data-i="'+i+'">このクラブと契約する</button></article>';
}
function offerHtml(){
  const S=CL.S, list=offersOf(S);
  return '<section class="card offers"><h3>クラブオファー <small>第'+S.term+'任期 ・ 監督 GRADE '+mgrLv(S)+'</small></h3>'+
    '<p class="dim">3つのクラブから監督のオファーが届いた。クラブを選んだあと、監督契約でクラブ名とエンブレムを決める。'+
    '大きいクラブほど設備は整っているが、期待される獲得賞金が高く、オーナーの指令も多い</p>'+
    list.map(offerCardHtml).join("")+'</section>';
}
/** HOME: クラブの期待(獲得賞金の進み)と、進んでいるオーナーの指令 */
/**
 * COACHING NOTE(→docs/23 §23.10): 見つけたタグの付き方と効き目。任期をまたいで残る。区分を押すと開く
 */
function noteHtml(){
  const S=CL.S, N=S.note||{}, all=noteAll(), tot=Object.values(all).reduce((a,l)=>a+l.length,0), got=Object.keys(N).filter(id=>noteCat(id)).length;
  const nameOfId=id=>/^cb:/.test(id)?(COMBOS[id.slice(3)]||{}).name:TAGS[id].name;
  const descOf=id=>/^cb:/.test(id)?comboDesc(COMBOS[id.slice(3)]):TAGS[id].desc;
  const cls=id=>/^cb:/.test(id)?'cmb':TAGS[id].kind==="title"?'ttl':TAGS[id].kind==="unique"?'unq':TAGS[id].kind==="fame"?'fm':TAGS[id].pol<0?'dn':'up';
  let h='<section class="card note"><h3>COACHING NOTE <small>見つけたタグ '+got+' / '+tot+' ・ 任期をまたいで残る</small></h3>'+
    '<div class="nt-cats">'+NOTE_CAT.map(([k,l])=>{ const n=all[k].filter(id=>N[id]).length;
      return '<button class="nt-cat'+(CL.noteCat===k?' on':'')+'" data-act="notecat" data-v="'+k+'">'+l+'<small>'+n+'/'+all[k].length+'</small></button>'; }).join("")+'</div>';
  if(CL.noteCat&&all[CL.noteCat]){
    const L=all[CL.noteCat], got2=L.filter(id=>N[id]), un=L.length-got2.length;
    h+='<ul class="nt-list">'+got2.map(id=>'<li><span class="tg '+cls(id)+'"><b>'+nameOfId(id)+'</b></span><small class="nt-at">第'+N[id].term+'任期で発見 ・ '+N[id].n+'回</small>'+
        '<p><i>付き方</i>'+noteHow(id)+'</p><p><i>効き目</i>'+descOf(id)+'</p></li>').join("")+'</ul>'+
      (un?'<div class="nt-un"><small>まだ見つけていない '+un+'</small>'+'<span class="tg"><b>???</b></span>'.repeat(un)+'</div>':'<p class="dim">この区分はすべて見つけた</p>');
  }
  return h+'</section>';
}
/** 黄金期の行(タグ「黄金期到来」の残り) */
function goldenLineHtml(S){ const t=(S.g.tags||[]).find(x=>x.id==="golden"); return t?'<p class="gr-golden">👑 黄金期 ・ あと '+t.n+' 試合 全員が絶好調</p>':''; }
/** HOME のチームのタグ(→docs/23 §23.6)。押すと説明がインフォバーで出る */
function teamTagsHtml(){
  const v=teamTagsView(CL.S); if(!v.length||CL.S.termOver)return "";
  return '<section class="tt-row"><small>TEAM</small>'+v.map(t=>'<button class="tg '+(t.pol<0?'dn':'up')+(t.title?' ttl':'')+(t.combo?' cmb':'')+'" data-act="taginfo" data-v="'+t.id+'">'+
    '<b>'+t.name+'</b>'+(t.left?'<i>'+t.left+'</i>':'')+'</button>').join("")+'</section>';
}
/** 選手の声(→docs/14 §14.79)。試合のあとに、ときどき選手が自分のことを伝えてくる(次の試合まで) */
function playerVoiceHtml(){
  const S=CL.S, v=S.g&&S.g.pvoice; if(!v||S.termOver||!CARDS[v.id]||!S.sq.includes(v.id))return "";
  const c=CARDS[v.id], a=artSrc(c,"stand");
  return '<section class="sec pvoice"><i class="sec-av pl-av">'+(a?'<img src="'+a+'" alt="">':'')+'</i>'+
    '<div><b class="sec-nm">'+c.no+' '+nameOf(c)+'<em class="sec-tag">VOICE</em></b><p>「'+v.text+'」</p></div></section>';
}
/** 出来事(→docs/23 §23.2 の 2)。秘書が知らせ、2択で答える */
function tagEventHtml(){
  const S=CL.S, ev=tagEventOf(S); if(!ev||S.termOver)return "";
  const id=S.g.tev.id;
  return '<section class="sec sec-ev tag-ev">'+(id?'<i class="sec-av pl-av">'+(artSrc(CARDS[id],"stand")?'<img src="'+artSrc(CARDS[id],"stand")+'" alt="">':'')+'</i>':secAv(S))+
    '<div><b class="sec-nm">'+secOf(S).name+'<em class="sec-tag">EVENT</em></b><p>'+tagEventText(S,ev)+'</p>'+
    '<div class="sec-ch">'+ev.ch.map((c,i)=>'<button class="btn ch" data-act="tagev" data-i="'+i+'">'+c[0]+'</button>').join("")+'</div></div></section>';
}
/** 選手のタグの札(選手の窓)。第3段から付く */
function playerTagsHtml(id){
  const v=playerTagsView(CL.S,id); if(!v.length)return "";
  return '<div class="pt-row">'+v.map(t=>'<span class="tg '+(t.fame?'fm':t.pol<0?'dn':'up')+(t.combo?' cmb':'')+(t.unique?' unq':'')+'"><b>'+t.name+'</b>'+(t.left?'<i>'+t.left+'</i>':'')+'<small>'+t.desc+'</small></span>').join("")+'</div>';
}
function expTileHtml(){
  const S=CL.S, cp=S.cprof; if(!cp||cp.legacy||S.termOver)return "";
  const got=S.ts.prize||0, pc=Math.min(100,got/cp.target*100);
  return '<section class="exp-tile"><div class="et-h"><small>'+cp.name+'</small><b>獲得賞金 '+Math.round(got)+' / '+cp.target+'億</b></div>'+
    '<i class="et-bar"><u style="width:'+pc.toFixed(1)+'%"'+(got>=cp.target?' class="ok"':'')+'></u></i>'+
    (S.mis?'<p class="et-mis">👔 オーナーの指令 <b>'+S.mis.text+'</b></p>':'')+'</section>';
}
/** 任期終了: クラブの期待と指令の結果(年俸の内訳) */
function termExpHtml(e){
  if(!e.exp&&!(e.mis&&e.mis.length))return "";
  return '<h4>クラブの期待 <small>'+(e.club||"")+'</small></h4><ul class="texp">'+
    (e.exp?'<li class="'+(e.exp.ok?'ok':'ng')+'">獲得賞金 '+e.exp.prize+' / 期待 '+e.exp.target+'億 → '+(e.exp.ok?'達成 年俸 +'+e.exp.bonus+'億':'届かず')+'</li>':'')+
    (e.mis||[]).map(m=>'<li class="'+(m.ok===null?'':m.ok?'ok':'ng')+'">👔 '+m.text+' → '+(m.ok===null?'任期の終わりで打ち切り':(m.ok?'達成 ':'失敗 ')+(m.v>=0?'+':'')+m.v+'億')+'</li>').join("")+'</ul>';
}
/* ---- 監督ライセンスと監督契約(→docs/10 §10.2 A) ---- */
/** 監督ライセンス(初回だけ。あとから変えられない) */
function licenseHtml(){
  const d=CL.draft||(CL.draft={});
  const ani=(()=>{ const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(d.birth||""); return m?aniOfDate(+m[1],+m[2],+m[3]):null; })();
  return '<section class="card lic"><h3>監督ライセンス <small>初回だけ。名前はあとで MANAGER から変えられる</small></h3>'+
    '<label>監督名<input data-f="mname" maxlength="12" value="'+embEsc(d.mname||"")+'" placeholder="例: 山田 太郎"></label>'+
    '<label>生年月日(任意)<input type="date" data-f="birth" value="'+embEsc(d.birth||"")+'"></label>'+
    '<p class="lbl2">アバター(あとで MANAGER から変えられる)</p>'+mgrAvPickHtml(d.av|0,"licav")+
    (ani!=null?'<p class="dim">監督の動物: '+ANI_ICON[ani]+ANIMALS[ani].name+'('+ANI_GROUP[ANIMALS[ani].g]+')。同じ群れの選手と相性が良い</p>':'<p class="dim">生年月日を入れると、監督の動物(動物占い)が分かる</p>')+
    '<button class="btn btn-main" data-act="license">登録する</button></section>';
}
/** 監督契約(初回と新しい任期の始め): クラブ名・略称・ホームタウン・色・エンブレム */
function contractHtml(edit){
  // edit … CLUB からクラブの設定を変える(→docs/14 §14.71)。中身は監督契約と同じで、いまのクラブを読み込んで始める
  const S=CL.S, d=CL.draft||(CL.draft={});
  if(!d.c){ const nm=S.term>1?"":"アズーロFC";
    d.c={ name:nm, short:"", town:TOWNS[(S.term-1)%TOWNS.length], color:"#1B4FD8", emb:{} }; }
  const c=d.c, name=c.name||"(クラブ名)", e=embDesign("azr",name,c.emb,c.color);
  const row=(k,list,lab)=>'<div class="ce-row"><i>'+lab+'</i>'+list.map(v=>'<button class="ce'+(e[k]===v?' on':'')+'" data-act="emb" data-k="'+k+'" data-v="'+v+'">'+(EMB_LABEL[v]||v)+'</button>').join("")+'</div>';
  const hues=EMB_CLASSIC.map(id=>embHueById(id));
  return '<section class="card contract">'+(edit?'<h3>クラブの設定 <small>名前・エンブレムなどを変える</small></h3>':'<h3>監督契約 <small>第'+S.term+'任期'+(S.term>1?' ・ 新しいクラブ':'')+'</small></h3>')+
    '<div class="ce-prev">'+embSvg("azr",name,96,{ color:c.color, design:c.emb, text:c.short||clubAbbr(name) })+'<div><b>'+embEsc(name)+'</b><small>'+(leagueOf(S.cprof)?embEsc(leagueOf(S.cprof))+' ・ ':'')+embEsc((c.short||clubAbbr(name)).toUpperCase().slice(0,3))+'</small>'+
      (S.mgr?'<small>監督 '+embEsc(S.mgr.name)+'</small>':'')+'</div></div>'+
    '<label>クラブ名<input data-f="cname" maxlength="10" value="'+embEsc(c.name)+'" placeholder="例: ミナト・ブルーズ"></label>'+
    '<label>略称(英字3字・スコアに出る)<input data-f="cshort" maxlength="3" value="'+embEsc(c.short)+'" placeholder="'+clubAbbr(name)+'"></label>'+
    // ホームタウンは今は選ばない(2026-11-22 オーナー。データは残す →docs/14 §14.71)
    '<div class="ce-row"><i>クラブの色</i>'+hues.map(h=>'<button class="ce sw'+(c.color===h.hex?' on':'')+'" data-act="ccolor" data-v="'+h.hex+'" style="--sw:'+h.hex+'" title="'+h.name+'"></button>').join("")+'</div>'+
    '<h4>エンブレム</h4>'+
    row("shape",EMB_SHAPES,"形")+row("field",EMB_FIELDS,"地の柄")+row("crest",EMB_CRESTS,"紋章")+row("orn",EMB_ORNS,"外装")+row("lay",EMB_LAYS,"文字")+
    '<div class="ce-row"><i>紋章・文字の色</i>'+EMB_INKS.map(v=>'<button class="ce'+((e.ink||"auto")===v?' on':'')+'" data-act="emb" data-k="ink" data-v="'+v+'">'+EMB_INK_LABEL[v]+'</button>').join("")+'</div>'+
    '<div class="ce-row"><i>柄の色</i>'+hues.map(h=>'<button class="ce sw'+(e.away===h.id?' on':'')+'" data-act="emb" data-k="away" data-v="'+h.id+'" style="--sw:'+h.hex+'" title="'+h.name+'"></button>').join("")+'</div>'+
    '<div class="ce-acts"><button class="btn btn-sub" data-act="embauto">おまかせ</button>'+
      (edit?'<button class="btn btn-main" data-act="csave">この内容で保存する</button></div><button class="lnk" data-act="cedit">やめる</button>'
        :'<button class="btn btn-main" data-act="contract">この内容で契約する</button></div>')+'</section>';
}
const EMB_INK_LABEL={ auto:"おまかせ", white:"白", black:"黒", gold:"金", away:"柄の色" };
const EMB_LABEL={ shield:"盾", round:"丸", oval:"楕円", pointed:"尖り盾", banner:"旗",
  solid:"無地", stripe:"縦縞", half:"左右", quarter:"四分割", sash:"たすき", hoop:"横縞", chevron:"山形", cross:"十字", saltire:"斜め十字",
  none:"なし", star:"星", crown:"王冠", eagle:"鷲", lion:"獅子", horse:"馬", helm:"兜", dragon:"竜", fleur:"百合", cannon:"大砲", griffin:"グリフィン", wyvern:"ワイバーン", athena:"女神",
  laurel:"月桂樹", ribbon:"リボン", wreath:"月桂冠", row:"横", col:"縦", diag:"斜め" };
EMB_LABEL.none="なし";   // 紋章・外装・文字の「なし」(文字なし = 無地)
/** 監督の絵(→docs/14 §14.69)。k: full 立ち絵 / bust バストアップ / face 顔 */
const mgrArt=(av,k)=>typeof MGR_ART!=="undefined"&&MGR_ART.length?MGR_ART[Math.min(MGR_ART.length-1,Math.max(0,av|0))][k||"face"]:null;
/** アバターを選ぶ列(顔を並べる) */
function mgrAvPickHtml(cur,act){
  return typeof MGR_ART==="undefined"?"":'<div class="mg-avs">'+MGR_ART.map((x,i)=>'<button class="mg-av'+(i===cur?' on':'')+'" data-act="'+act+'" data-v="'+i+'"><img src="'+x.full+'" alt=""></button>').join("")+'</div>';
}
/** 秘書の顔(→docs/05 §5.12。絵は tools/gen_sec_art.py が pftb から取り込む)。id を省くといまの秘書 */
const secArt=(id,k)=>typeof SEC_ART!=="undefined"&&SEC_ART[id]?SEC_ART[id][k||"face"]:null;
const secAv=(S,id)=>{ const a=secArt(id||secOf(S).id,"full"); return '<i class="sec-av">'+(a?'<img src="'+a+'" alt="">':'')+'</i>'; };   // 顔の丸は立ち絵を選手と同じ切り方で(→docs/14 §14.70)
/** 秘書を選ぶ(任期の始め・CLUB の設定)。口調の見本と、その秘書との親密度を出す */
function secPickHtml(title){
  const S=CL.S;
  return '<section class="card secpick"><h3>'+title+' <small>能力の差はなく、口調だけが違う</small></h3>'+SECS.map(x=>{
    const b=S.sec.bond[x.id]||0, t=TUNING.sec.lv; let lv=0; while(lv<t.length&&b>=t[lv])lv++;
    const f=secArt(x.id,"full");
    return '<button class="sp'+(S.sec.id===x.id?' on':'')+'" data-act="secpick" data-v="'+x.id+'">'+(f?'<img class="sp-full" src="'+f+'" alt="">':'')+
      '<span class="sp-tx"><b>'+x.name+'</b><small>'+x.desc+' ・ '+SEC_LV_LABEL[lv]+'</small>'+
      '<i>「'+SEC_LINES[x.id].hello+'」</i></span></button>'; }).join("")+'</section>';
}
/** クラブ新聞の紙面(ヨーロッパのタブロイド紙風)。i … S.paper の番号 */
function paperHtml(i){
  const S=CL.S, a=S.paper[i]; if(!a)return "";
  const club=S.club?S.club.name:TEAMS.azr.name, ph=a.photo&&CARDS[a.photo], img=ph&&artSrc(ph,"play");
  const nav='<nav class="pp-nav" data-act="none"><button data-act="paper" data-i="'+(i-1)+'"'+(i>0?'':' disabled')+'>‹ 前の号</button>'+
    '<span>'+(i+1)+' / '+S.paper.length+'</span><button data-act="paper" data-i="'+(i+1)+'"'+(i<S.paper.length-1?'':' disabled')+'>次の号 ›</button></nav>';
  return '<div class="paper-wrap" data-act="paperclose">'+nav+'<article class="paper k-'+a.kind+'" data-act="none">'+
    '<header class="mast"><small>第'+a.term+'任期 ・ 第'+a.no+'試合 ・ ¥150</small><b>'+club+' タイムズ</b><i>THE '+(S.club?S.club.short:"AZR")+' TIMES ・ '+(S.club?S.club.town:"")+'</i></header>'+
    '<p class="kicker">'+COMPS[a.comp].name+(a.label?' '+a.label:'')+'</p>'+
    '<h1>'+a.head+'</h1><p class="sub">'+a.sub+'</p>'+
    (img?'<figure><img src="'+img+'" alt=""><figcaption>'+(a.mvp?nameOf(CARDS[a.mvp.id])+' ・ 採点 '+a.mvp.r.toFixed(1):'')+'</figcaption></figure>':'')+
    '<div class="cols"><p>'+a.lead+'</p>'+(a.quote?'<p class="q">'+a.quote+'</p>':'')+'</div>'+
    (a.side.length?'<aside id="ppGossip"><b>ゴシップ</b>'+a.side.map(x=>'<p>'+x+'</p>').join("")+'</aside>':'')+
    '<footer><button class="btn btn-sub" data-act="paperclose">新聞をたたむ</button></footer></article></div>';
}
function homeHtml(){
  const S=CL.S;
  // セーブの異常の知らせは、選ぶ画面より先に出す(秘書の一言の欄が無い画面でも見えるように)
  const alertBox=CL.alert?'<section class="sec"><i class="sec-ic">SEC</i><div><p>'+CL.alert+'</p></div></section>':"";
  if(!S.mgr&&!S.termOver)return alertBox+licenseHtml();
  if(!S.cprof&&!S.termOver)return alertBox+offerHtml();          // クラブオファー(→docs/16)
  if(!S.club&&!S.termOver)return alertBox+contractHtml();
  if(!S.tsetChosen&&!S.termOver){ if(earnedTitles(S).length)return homeHeadHtml()+alertBox+titleSetHtml(); S.tsetChosen=true; }
  if(S.sec&&!S.sec.chosen&&!S.termOver)return homeHeadHtml()+alertBox+secPickHtml("秘書を選ぶ");
  // スポンサー: 契約が無ければ選ぶまで始められない。区切りでは選び直せる(続けてもよい)
  if(S.biz&&S.biz.offers&&!S.biz.sp&&!S.termOver)return homeHeadHtml()+alertBox+spPickHtml(true);
  // 次の試合が主役。その下に WEEKLY NEWS の1行。秘書・スポンサー・改修は、答えや判断が要るときだけ(→docs/14 第2弾)
  return homeHeadHtml()+(S.termOver?termEndHtml():nextTileHtml()+teamTagsHtml()+tagEventHtml()+expTileHtml()+newsLineHtml()+
    (S.biz&&S.biz.offers?(CL.spOpen?spPickHtml(false):spRenewBarHtml()):'')+stadOfferHtml()+playerVoiceHtml()+(secNeeded(S)?secHtml():''));
}
/** SEASON: リーグの順位と大会 */
/** 大会に出る条件(club.js の entryOk と同じ中身を言葉で) */
const ENTRY_NEED={ NSC:"この周にプレシーズンカップかキングスクラブカップで優勝", W4:"前の周のリーグ4位以内",
  CONTI:"前の周のリーグ2位以内、または前の周にエンタープライズ・キングスクラブ・ナショナルスーパー・W4のどれかで優勝",
  CSC:"この周にコンチネンタルカップで優勝", CT:"前の周のリーグ優勝、または前の周にコンチネンタルカップかW4で優勝",
  JT:"この周にチャンピオンズトロフィーで優勝", ICC:"この周にチャンピオンズトロフィーかコンチネンタルカップで優勝、または前の周にチャンピオンズトロフィーで優勝" };
/** SEASON の日程: 過去5試合と、次の試合から10試合(→docs/07 §7.16) */
const schedComp=c=>c==="FR"?"フレンドリー":c==="LG"?"リーグ":TROPHY_SHORT[c]||COMPS[c].name;
function schedRowHtml(r){
  // 進行表: 番号 | 大会と段 | H/A | 相手 | 結果(勝敗の印 + スコア)。行の高さはそろえる(注記は1行で切る)
  const T=r.opp&&TEAMS[r.opp], g=r.comp==="FR"?"":COMPS[r.comp].grade;
  const opp=T?'<span class="sd-opp oppv" data-act="oppview" data-id="'+r.opp+'">'+emblemSvg(Object.assign({ id:r.opp },T),18)+'<b>'+teamNameOf(T)+'</b></span>'
    :'<span class="sd-opp none">'+(r.note||"相手は当日に決まる")+'</span>';
  const res=r.res?'<b class="sd-res '+r.res+'">'+r.res+'</b><span class="sd-sc">'+r.sc+'</span>'+(r.pk?'<small class="sd-pk">'+r.pk+'</small>':'')
    :r.next?'<b class="sd-res nx">NEXT</b>':(r.ifWin?'<i class="sd-if">勝ち進めば</i>':'<i class="sd-if">—</i>');
  return '<li class="sd-row'+(r.res?' past':'')+(r.next?' next':'')+(r.comp==="FR"?' fr':'')+'"><i class="sd-no">'+r.no+'</i>'+
    '<span class="sd-comp"><b>'+(g&&g!=="-"?gradeTag(g):'')+schedComp(r.comp)+'</b><small>'+(r.label||(r.comp==="FR"?"親善試合":""))+'</small></span>'+
    '<i class="sd-ha'+(T?(r.home?' h':' a'):'')+'">'+(T?(r.home?'H':'A'):'')+'</i>'+
    opp+'<span class="sd-r">'+res+'</span></li>';
}
function scheduleHtml(){
  const S=CL.S;
  const past=(S.history||[]).slice(-5).map((h,i,a)=>{
    const pso=h[5], win=h[2]>h[3]||(h[2]===h[3]&&pso&&pso[0]>pso[1]), lose=h[2]<h[3]||(h[2]===h[3]&&pso&&pso[0]<pso[1]);
    return { no:h[6]||"", comp:h[0], label:h[4]||"", opp:h[1], home:h[7]!==0, res:win?"W":lose?"L":"D",
      sc:h[2]+" - "+h[3], pk:pso?"PK "+pso[0]+"-"+pso[1]:"" }; });
  const fut=S.termOver?[]:upcoming(S,10).map((r,i)=>Object.assign(r,{ next:i===0 }));
  if(!past.length&&!fut.length)return "";
  return '<section class="card sched"><h3>日程 <small>過去5試合と、この先10試合 ・ 第'+S.played+'/'+TUNING.club.termLen+'試合</small></h3><ol class="sd-list">'+
    past.map(schedRowHtml).join("")+fut.map(schedRowHtml).join("")+'</ol>'+
    '<p class="dim">カップの相手は出場が決まったときに抽選。出ない・出られない大会の枠は、フレンドリーマッチか、休んで節を進められる(・の行。任期の試合は減らない)</p></section>';
}
function seasonHtml(){
  const S=CL.S, L=S.league, order=sortTable(L.table);
  // 順位表は首位・自分の前後・最下位に畳む(「全部見る」で広げる →docs/14 第2弾)
  const mi=order.indexOf("me"), keep=i=>CL.fullTable||i===0||i===order.length-1||Math.abs(i-mi)<=2;
  let gap=false;
  let h=scheduleHtml()+'<section class="card"><h3>'+COMPS.LG.name+' <small>'+L.done+'/14 節 ・ '+(mi+1)+'位 ・ 上位 '+TUNING.club.promoteRank+' が昇格'+(S.grade>1?'・ '+TUNING.club.relegateRank+' 位以下が降格':'')+'</small></h3><table class="tbl lgdiv">'+
    '<tr><th></th><th></th><th>試</th><th>勝</th><th>分</th><th>敗</th><th>得失</th><th>点</th></tr>'+
    order.map((id,i)=>{ const r=L.table[id];
      if(!keep(i)){ if(gap)return ""; gap=true; return '<tr class="gap"><td colspan="8">…</td></tr>'; }
      gap=false;
      const zc=(i+1<=TUNING.club.promoteRank&&S.grade<3?' up':'')+(i+1>=TUNING.club.relegateRank&&S.grade>1?' down':'');   // 昇格・降格の圏内(→docs/19)
      return '<tr class="'+(id==="me"?'me':'')+zc+'"><td>'+(i+1)+'</td><td class="nm2">'+(id==="me"?clubName(id):'<button class="lnk oppv" data-act="oppview" data-id="'+id+'">'+clubName(id)+'</button>')+'</td><td>'+r.p+
        '</td><td>'+r.w+'</td><td>'+r.d+'</td><td>'+r.l+'</td><td>'+(r.gf-r.ga>0?"+":"")+(r.gf-r.ga)+'</td><td><b>'+r.pts+'</b></td></tr>'; }).join("")+
    '</table>'+foldBtn("fulltable",CL.fullTable)+'</section>';
  const stTxt={ wait:"—", in:"出場中", out:"敗退", quit:"棄権", won:"優勝" };
  // 「S の大会への道」は大会表と同じ中身なので、大会表にまとめた(条件は名前の下の行。→docs/14 第2弾)
  // 大会は日程の順に。次の試合の大会に印
  const firstSlot=id=>SCHED.findIndex(x=>x[0]===id), nextComp=SCHED[S.slot]?SCHED[S.slot][0]:null;
  h+='<section class="card"><h3>大会 <small>日程の順 ・ '+S.cyc+'周目 ・ ▶ = 次の試合</small></h3><table class="tbl cups">'+
    CUP_IDS.slice().sort((a,b)=>firstSlot(a)-firstSlot(b)).map(id=>{ const c=S.cups[id], past=SCHED.findIndex(x=>x[0]===id)<S.slot, ok=entryOk(S,id);
      const txt=c.st==="wait"?(past?"出場なし":ok?"出場できる":"条件待ち"):stTxt[c.st];
      const cond=c.st==="wait"&&!past&&!ok&&ENTRY_NEED[id]?'<small class="cond">'+ENTRY_NEED[id]+'</small>':'';
      return '<tr class="st-'+c.st+(c.st==="wait"&&!past&&ok?' ok':'')+'"><td>'+gradeTag(COMPS[id].grade)+'</td><td class="nm2">'+(id===nextComp?'▶ ':'')+(c.rmap&&c.st!=="quit"?'<button class="lnk oppv" data-act="bracket" data-v="'+id+'">'+COMPS[id].name+'</button>':COMPS[id].name)+cond+'</td><td>'+txt+'</td></tr>'; }).join("")+
    '</table></section>';
  return h;
}
/* ---- トーナメント表(→docs/20)。SEASON の大会の一覧から開く。組み合わせが決まった時点で全部見える ---- */
function bracketModalHtml(){
  const S=CL.S, id=CL.brView, cup=S.cups[id], comp=COMPS[id]; if(!cup||!cup.rmap)return "";
  const sh=c=>c==="me"?myTeam(S).short:c&&TEAMS[c]?TEAMS[c].short:"—";
  const em=c=>c==="me"?emblemSvg(myTeam(S),16):c&&TEAMS[c]?emblemSvg(Object.assign({ id:c },TEAMS[c]),16):'<i class="bt-q">?</i>';
  const row=(c,sc,w,dec)=>'<div class="bt'+(c==="me"?' me':'')+(dec&&w===c?' win':dec&&c?' lose':'')+'"'+(c&&c!=="me"?' data-act="oppview" data-id="'+c+'"':'')+'>'+
    em(c)+'<b>'+sh(c)+'</b><i>'+(sc!=null?sc:'')+'</i></div>';
  const nr=Math.max(...cup.rmap)+1, rounds=[];
  for(let r=0;r<nr;r++){
    const lab=(comp.stages[cup.rmap.indexOf(r)]||["",""])[1].replace(/ 第\d試合$/,"");
    let P=cup.br.rounds[r];
    if(!P){ const prev=rounds.length?rounds[rounds.length-1].P.length:(comp.adv===2?4:2); P=new Array(Math.max(1,prev/2)).fill(0).map(()=>({ a:null, b:null })); }
    rounds.push({ lab, P });
  }
  const grpT=(g,lab)=>{ if(!g)return ""; const o=sortTable(g.table);
    return '<div class="bg"><h5>'+lab+'</h5>'+o.map((c,i)=>'<div class="bt'+(c==="me"?' me':'')+(i<(comp.adv||1)?' win':'')+'"'+(c!=="me"?' data-act="oppview" data-id="'+c+'"':'')+'>'+
      '<i class="rk">'+(i+1)+'</i>'+em(c)+'<b>'+sh(c)+'</b><i>'+g.table[c].pts+'点</i></div>').join("")+'</div>'; };
  return '<div class="kmodal" data-act="brclose"><div class="kmod-box br-box" data-act="none">'+
    '<header class="km-head"><span></span><b>'+comp.name+'</b><small>'+gradeTag(comp.grade)+'</small><span></span><button class="km-x" data-act="brclose" aria-label="閉じる">×</button></header>'+
    '<div class="br-body">'+
      (cup.grp?'<div class="br-grps">'+grpT(cup.grp,"グループ A")+grpT(cup.grp2,"グループ B")+'</div>':'')+
      '<div class="br-cols">'+rounds.map(R=>'<div class="br-col"><h5>'+R.lab+'</h5><div class="br-ps">'+R.P.map(p=>
        '<div class="bp'+(p.a==="me"||p.b==="me"?' mine':'')+'">'+row(p.a,p.sc?p.sc[0]:null,p.w,!!p.w)+row(p.b,p.sc?p.sc[1]:null,p.w,!!p.w)+(p.pk?'<small class="pk">PK</small>':'')+'</div>').join("")+'</div></div>').join("")+'</div>'+
      '<p class="dim br-note">クラブを押すと、その SQUAD を見られる</p></div></div></div>';
}
/* ---- トロフィーの棚(→docs/14 §14.20): 全大会のトロフィーを並べ、獲得したものだけ光らせる ---- */
const TROPHY_ORDER=["ICC","CT","JT","LGP","CONTI","CSC","LG1","W4","KINGS","NSC","LG2","ENT","PRE"];      // 格の高い順。リーグは Div ごと(→docs/19)
const LG_KEY=["LG2","LG2","LG1","LGP"];                 // div(1〜3)→ 棚の id(div の無い前の記録は 2nd Div)
const trophyKey=t=>t.comp==="LG"?LG_KEY[t.div||1]:t.comp;
const trophyName=id=>/^LG/.test(id)?"レギュラーリーグ "+({ LGP:"Premier Div", LG1:"1st Div", LG2:"2nd Div" })[id]:COMPS[id].name;
const TROPHY_SHORT={ ICC:"インターナショナル", CT:"チャンピオンズ", JT:"ジャパン", LG:"リーグ", CONTI:"コンチネンタル", CSC:"コンチネンタルSC",
  W4:"W4", KINGS:"キングス", NSC:"ナショナルSC", ENT:"エンタープライズ", PRE:"プレシーズン", LGP:"プレミア", LG1:"1st Div", LG2:"2nd Div" };
/** 格ごとの形(S = 取っ手の大杯 / リーグ = 盾の皿 / A = 脚の長い杯 / B = 星 / C = 小杯 / D・E = メダル)と金属の色 */
function trophyIconSvg(id,won){
  const g=/^LG/.test(id)?"L":COMPS[id].grade, metal=!won?"":g==="S"||g==="L"||g==="A"?"g":g==="B"||g==="C"?"s":"b";
  const f=won?'url(#tm-'+metal+')':'currentColor', base='<rect x="11" y="40" width="18" height="6" rx="1" fill="'+(won?'#1a1a1a':'currentColor')+'"/>';
  let body;
  if(g==="S")body='<path fill="'+f+'" d="M10 4h20v5c0 10-4 16-8 18v7h4l2 5H12l2-5h4v-7c-4-2-8-8-8-18z"/><path fill="none" stroke="'+f+'" stroke-width="2.6" d="M11 8H4c0 7 3 10 8 11M29 8h7c0 7-3 10-8 11"/>';
  else if(g==="L")body='<circle cx="20" cy="18" r="15" fill="'+f+'"/><circle cx="20" cy="18" r="10" fill="none" stroke="'+(won?'rgba(0,0,0,.25)':'none')+'" stroke-width="1.4"/><path fill="'+f+'" d="M17 32h6l2 8H15z"/>';
  else if(g==="A")body='<path fill="'+f+'" d="M11 3h18c0 9-3 14-7 15v14h5v6H13v-6h5V18c-4-1-7-6-7-15z"/>';
  else if(g==="B")body='<path fill="'+f+'" d="M20 2l3.2 6.6 7.2 1-5.2 5 1.3 7.2L20 18.4l-6.5 3.4 1.3-7.2-5.2-5 7.2-1z"/><path fill="'+f+'" d="M18.5 21h3v13h4l1.5 6h-14l1.5-6h4z"/>';
  else if(g==="C")body='<path fill="'+f+'" d="M11 9h18c0 9-4 13-8 14v9h5l2 6H12l2-6h5v-9c-4-1-8-5-8-14z"/>';
  else body='<path fill="'+(won?'#c8102e':'currentColor')+'" d="M13 2h6l3 12h-6zM27 2h-6l-3 12h6z"/><circle cx="20" cy="27" r="11" fill="'+f+'"/><path fill="'+(won?'rgba(0,0,0,.28)':'none')+'" d="M20 20.5l2 4.2 4.5.6-3.3 3.1.8 4.5-4-2.1-4 2.1.8-4.5-3.3-3.1 4.5-.6z"/>';
  return '<svg class="tro-ic'+(won?'':' off')+'" viewBox="0 0 40 48">'+body+(g==="B"||g==="D"||g==="E"?'':base)+'</svg>';
}
/** トロフィーの棚。termOnly … CLUB(この任期のクラブのぶんだけ。任期ごとに別のクラブなのでリセット)/ なし … MANAGER(監督の通算。→docs/14 §14.120) */
function trophyShelfHtml(termOnly){
  const S=CL.S, n={}, now={}, list=termOnly?S.titles.filter(t=>t.term===S.term):S.titles;
  for(const t of list){ const k=trophyKey(t); n[k]=(n[k]||0)+1; if(!termOnly&&t.term===S.term)now[k]=1; }
  const kinds=TROPHY_ORDER.filter(id=>n[id]).length;
  const stop=(o,c)=>'<stop offset="'+o+'" stop-color="'+c+'"/>', grad=(k,cs)=>'<linearGradient id="tm-'+k+'" x1="0" x2="1">'+cs.map((c,i)=>stop(i/(cs.length-1),c)).join("")+'</linearGradient>';
  return '<section class="card troph"><h3>トロフィー <small>'+(termOnly?'第'+S.term+'任期 ・ ':'')+'獲得 '+kinds+' / '+TROPHY_ORDER.length+' 種 ・ '+(termOnly?'':'通算 ')+list.length+' 回</small></h3>'+
    '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>'+grad("g",["#8a6414","#ffe9a3","#e2b84a","#7a5510"])+
      grad("s",["#5d6470","#f4f6fa","#b8bec9","#555c68"])+grad("b",["#5a2f10","#f3c08e","#c07a3e","#5a2f10"])+'</defs></svg>'+
    '<div class="tro-grid">'+TROPHY_ORDER.map(id=>'<div class="tro'+(n[id]?' won':'')+'" title="'+trophyName(id)+'">'+trophyIconSvg(id,!!n[id])+
      '<small>'+TROPHY_SHORT[id]+'</small>'+(n[id]?'<b>×'+n[id]+'</b>':'')+(now[id]?'<i>今期</i>':'')+'</div>').join("")+'</div></section>';
}
/** CLUB: この任期の記録・歴代・設定 */
/** CLUB の上段: クラブの情報(エンブレム・名前・略称・ホームタウン)。「クラブを編集する」で設定を変える(→docs/14 §14.71) */
function clubInfoHtml(){
  const S=CL.S, c=S.club;
  if(CL.clubEdit)return contractHtml(true);
  const T=myTeam(S);
  return '<section class="card club-card"><h3>クラブ <small>'+(S.cprof&&S.cprof.name?S.cprof.name:'第'+S.term+'任期')+'</small></h3>'+
    '<div class="cc-top">'+emblemSvg(T,72)+'<div><b>'+embEsc(T.name)+'</b><small>'+embEsc(T.short)+' ・ '+(leagueOf(S.cprof)?leagueOf(S.cprof)+' ':'')+divName(S.grade)+'</small>'+
      '<button class="lnk" data-act="cedit">クラブを編集する</button></div></div></section>';
}
function clubTabHtml(){
  const S=CL.S, r=S.rec, names=S.titles.filter(t=>t.term===S.term).map(t=>trophyName(trophyKey(t)));
  return clubInfoHtml()+'<section class="card"><h3>この任期 <small>第'+S.term+'任期</small></h3>'+
    '<div class="rec"><div><b>'+r.w+'</b><small>勝</small></div><div><b>'+r.d+'</b><small>分</small></div><div><b>'+r.l+'</b><small>敗</small></div>'+
    '<div><b>'+r.gf+'</b><small>得点</small></div><div><b>'+r.ga+'</b><small>失点</small></div></div>'+
    '<p class="dim">タイトル '+names.length+(names.length?': '+names.join(" / "):'')+'</p>'+
    '<p class="dim">'+divName(S.grade)+(S.cprof&&S.cprof.name?' ・ '+S.cprof.name:'')+'</p></section>'+
    trophyShelfHtml(true)+spTileHtml()+bizClubHtml();   // クラブのトロフィーはこの任期のぶんだけ
}
/**
 * MANAGER(→docs/07 §7.9): 監督の情報(名前は変えられる)・生涯成績・称号・歴代・秘書・設定。
 * クラブ(任期ごとに替わるもの)の記録と持ち物は CLUB に残す
 */
function managerTabHtml(){
  const S=CL.S, m=S.mgr||{ name:"—" }, all=S.career.reduce((a,c)=>({ w:a.w+c.w, d:a.d+c.d, l:a.l+c.l }),{ w:0, d:0, l:0 });
  if(!S.termOver){ all.w+=S.rec.w; all.d+=S.rec.d; all.l+=S.rec.l; }
  const n=all.w+all.d+all.l, wr=n?Math.round(all.w/n*100):0, earned=earnedTitles(S);
  const last=S.career.length?titleOf(S.career[S.career.length-1].title).name:"—";
  const d=CL.draft||(CL.draft={});
  const name=CL.mEdit?'<span class="mg-edit"><input data-f="mname" maxlength="12" value="'+embEsc(d.mname!=null?d.mname:m.name)+'"><button class="btn btn-main" data-act="mrename">決定</button><button class="lnk" data-act="medit">やめる</button></span>'
    :'<b>'+embEsc(m.name)+'</b><button class="lnk" data-act="medit">名前を変える</button>';
  const full=mgrArt(m.av,"full");
  return '<section class="card mgr-card"><h3>監督 <small>第'+S.term+'任期 ・ 監督 GRADE '+mgrLv(S)+'</small></h3>'+
      '<div class="mg-top">'+(full?'<img class="mg-full" src="'+full+'" alt="">':'')+'<div class="mg-body">'+
      '<div class="mg-name">'+name+'</div>'+
      '<p class="dim">'+(m.ani!=null&&ANIMALS[m.ani]?'動物 '+ANI_ICON[m.ani]+ANIMALS[m.ani].name+'('+ANI_GROUP[ANIMALS[m.ani].g]+')・ ':'')+
        '監督ランク '+S.fac+' ・ 前の任期の称号「'+last+'」'+(S.tset?' ・ セット中「'+titleOf(S.tset).name+'」':'')+'</p>'+
      (CL.avOpen?foldBtn("avopen",true):'<button class="lnk" data-act="avopen">アバターを変える</button>')+'</div></div>'+
      (CL.avOpen?mgrAvPickHtml(m.av|0,"mav"):'')+'</section>'+
    '<section class="card"><h3>生涯成績 <small>'+(S.career.length+(S.termOver?0:1))+'任期 ・ 勝率 '+wr+'%</small></h3>'+
      '<div class="rec"><div><b>'+all.w+'</b><small>勝</small></div><div><b>'+all.d+'</b><small>分</small></div><div><b>'+all.l+'</b><small>敗</small></div>'+
      '<div><b>'+S.titles.length+'</b><small>タイトル</small></div><div><b>'+S.salary+'</b><small>累計年俸(億)</small></div></div>'+
      (earned.length?'<p class="dim">取った称号: '+earned.map(id=>titleOf(id).name).join(" / ")+'</p>':'')+'</section>'+
    trophyShelfHtml()+noteHtml()+careerHtml()+secClubHtml()+settingsHtml();   // 生涯のトロフィー(CLUB と同じ棚。→docs/14 §14.63)
}
function tabbarHtml(){
  const S=CL.S;
  return '<nav class="tabbar">'+TABS.map(([k,l,ic])=>'<button class="'+(CL.tab===k?'on':'')+'" data-act="tab" data-v="'+k+'">'+
    (TAB_ICON[k]?'<svg class="ico" viewBox="0 0 24 24">'+TAB_ICON[k]+'</svg>':'<i>'+ic+'</i>')+'<span>'+l+'</span></button>').join("")+'</nav>';   // SQUAD に兆しの点は出さない(→docs/14 §14.14)
}
function clubHtml(){
  if(CL.paperI!=null)return paperHtml(CL.paperI);
  if(CL.flow==="prep"&&!CL.S.termOver)return prepHtml();
  // フッターのタブの画面には、どれも HOME と同じヘッダ(HOME と SQUAD は自分で出す。→docs/14 §14.105)
  const body=CL.tab==="squad"?squadHtml():CL.tab==="cards"?homeHeadHtml()+collectionHtml():CL.tab==="season"?homeHeadHtml()+seasonHtml()
    :CL.tab==="club"?homeHeadHtml()+clubTabHtml():CL.tab==="mgr"?homeHeadHtml()+managerTabHtml():homeHtml();
  return '<div class="cl-main tab-'+CL.tab+'">'+body+'</div>'+tabbarHtml()+
    (CL.tab==="cards"&&CL.sel&&CARDS[CL.sel]?cardModalHtml(CL.sel,CL.kList||[]):'')+(CL.tab==="squad"&&CL.ggOpen?ggModalHtml():'')+(CL.tab==="squad"&&CL.kpOpen?kpModalHtml():'')+(CL.tab==="season"?(CL.brView?bracketModalHtml():'')+(CL.oppView?oppViewModalHtml()+(CL.oppSel?oppCardModalHtml():''):''):'')+(CL.tab==="squad"&&CL.sqSel&&!CL.kpOpen&&!CL.ggOpen?sqModalHtml():'');
}

/** 試合を始める。配置は前の試合の最後のまま */
function startFixture(){
  skipComm(CL.S);                              // 残りのコミュニケーションは使わない
  CL.flow=null; CL.tab="home";
  const fx=CL.fx, m=fixtureMatch(CL.S,fx), comp=COMPS[fx.comp];
  CL.msg=[]; CL.comm=null; CL.pick=[]; CL.chat=null;
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
  const inj=M.events.filter(e=>e.type==="injury"&&e.side==="H").map(e=>e.by);
  // この任期の選手ごとの得点(→docs/14 第4弾)
  if(!CL.S.tgoals)CL.S.tgoals={};
  for(const e of M.events)if(e.type==="shot"&&e.res==="goal"&&e.side==="H")CL.S.tgoals[e.by]=(CL.S.tgoals[e.by]||0)+1;
  // 選手のタグの判定に: 得点・採点・MVP・試合の最後の KP(→docs/23 §23.4)
  const RT0=matchRatings(M), goals={}, rate={};
  for(const e of M.events)if(e.type==="shot"&&e.res==="goal"&&e.side==="H")goals[e.by]=(goals[e.by]||0)+1;
  for(const x of RT0.list)if(x.side==="H")rate[x.id]=x.r;
  applyResult(CL.S,CL.W,CL.fx,{ hg:M.home.score, ag:M.away.score, pso:M.pso, layout:null, kp:null, played, onPitch, inj,
    starters:G.meta.starters||[], subs:M.home.subs, goals, rate, mvp:RT0.mvp, kpEnd:M.home.kp,
    kpCh:M.events.filter(e=>e.type==="kp"&&e.side==="H").length });
  const L=CL.S.last;
  if(L)addArticle(CL.S,makeArticle(CL.S,M,L,matchRatings(M)));   // クラブ新聞の記事(→docs/07 §7.13)
  persist(CL.S);
  // 結果 → ロッカールーム(大会の優勝なら撮影)→ カード(→docs/07 §7.12)
  sceneResult(M,L,RT=>{
    const done=()=>{ sceneHide(); showClub(); };
    const card=()=>{ if(L&&L.card)sceneCard(L.card,L.cardNew,done); else done(); };
    if(L&&L.lines.some(x=>/^🏆 /.test(x)))sceneTrophy(M,L,card); else sceneLocker(M,L,RT,card);
  });
}
function onClubClick(e){
  const b=e.target.closest("[data-act]");
  if(!b||b.disabled)return;
  const act=b.dataset.act, S=CL.S, save=()=>persist(S);
  if(act!=="reset")CL.armReset=false;
  if(act!=="strat")CL.armPlay=false;
  if(onSettingsClick(act,b))return;
  if(act==="comm")CL.chat=null;
  if(act==="tab"){ CL.tab=b.dataset.v; CL.sel=null; CL.sqSel=null; CL.secOpen=false; CL.oppView=null; CL.oppSel=null; CL.brView=null; showClub(); return; }
  if(act==="secpick"){ chooseSec(S,b.dataset.v); CL.secOpen=false; CL.msg=[secOf(S).name+"「"+SEC_LINES[secOf(S).id].hello+"」"]; save(); showClub(true); return; }
  if(act==="secopen"){ CL.secOpen=true; showClub(true); return; }
  if(act==="chatx"){ CL.pick=[]; showClub(true); return; }
  if(act==="chatok"){ CL.chat=null; showClub(true); return; }
  if(act==="propick"){ const i=+b.dataset.i, ln=answerProposal(S,i<0?null:i); if(CL.chat)CL.chat.lines=CL.chat.lines.concat(ln); save(); showClub(true); setTimeout(()=>infoBar(ln.filter(x=>/^🏷/.test(x))),0); return; }
  if(act==="chatgo"){ CL.chat=null; CL.scout=true; showClub(); return; }   // 最後の1回の結果を見てから視察へ   // 最後の1回の結果を見てから戦略方針へ
  if(act==="paper"){ CL.paperI=+b.dataset.i; if(CL.paperI===S.paper.length-1){ S.paperSeen=paperKey(S.paper[CL.paperI]); persist(S); } showClub(); return; }
  if(act==="news"){ CL.paperI=S.paper.length-1; S.paperSeen=paperKey(S.paper[CL.paperI]); persist(S); showClub();
    const g=document.getElementById("ppGossip"); if(g)g.scrollIntoView({ block:"center" }); return; }   // ゴシップ欄から開く
  if(act==="paperclose"){ CL.paperI=null; showClub(); return; }
  if(act==="fulltable"){ CL.fullTable=!CL.fullTable; showClub(true); return; }
  if(act==="none")return;
  if(act==="htopen"){ CL.htOpen=!CL.htOpen; showClub(true); return; }
  if(act==="htset"){ CL.htOpen=true; if(!toggleHt(S,b.dataset.v))CL.msg=["ハーフタイムの指示は "+TUNING.ht.max+" つまで"]; save(); showClub(true); return; }
  if(act==="mab"){ if(!toggleMab(S,b.dataset.v))CL.msg=["監督能力は "+TUNING.mab.max+" つまで"]; save(); showClub(true); return; }
  if(act==="mabopen"){ CL.mabOpen=!CL.mabOpen; showClub(true); return; }
  if(act==="tset"){ setTitle(S,b.dataset.v||null); CL.msg=S.tset?["称号「"+titleOf(S.tset).name+"」をセットした("+TITLE_FX[S.tset].desc+")"]:[]; save(); showClub(true); return; }
  if(act==="notecat"){ CL.noteCat=CL.noteCat===b.dataset.v?null:b.dataset.v; showClub(true); return; }
  if(act==="medit"){ CL.mEdit=!CL.mEdit; if(CL.draft)CL.draft.mname=null; showClub(true); return; }
  if(act==="mrename"){ const nm=CL.draft&&CL.draft.mname!=null?CL.draft.mname:S.mgr&&S.mgr.name; if(renameManager(S,nm)){ CL.mEdit=false; CL.draft.mname=null; save(); } else infoBar(["監督名を入れてください"]); showClub(true); return; }
  if(act==="licav"){ (CL.draft||(CL.draft={})).av=+b.dataset.v; showClub(true); return; }
  if(act==="mav"){ if(setManagerAvatar(S,+b.dataset.v)){ CL.avOpen=false; save(); } showClub(true); return; }
  if(act==="avopen"){ CL.avOpen=!CL.avOpen; showClub(true); return; }
  if(act==="license"){ const d=CL.draft||{}; if(registerManager(S,d.mname,d.birth,d.av|0)){ CL.draft=null; save(); } else CL.msg=["監督名を入れてください"]; showClub(true); return; }
  if(act==="ctown"||act==="ccolor"){ const c=CL.draft.c; if(act==="ctown")c.town=b.dataset.v; else{ c.color=b.dataset.v; c.emb=Object.assign({},c.emb,{ home:b.dataset.v }); } showClub(true); return; }   // 選んだ色はエンブレムの地の色にも(名前の色の言葉より優先)
  if(act==="emb"){ const c=CL.draft.c; c.emb=Object.assign({},c.emb,{ [b.dataset.k]:b.dataset.v }); showClub(true); return; }
  if(act==="embauto"){ const c=CL.draft.c; c.emb={}; showClub(true); return; }
  if(act==="offer"){ if(pickOffer(S,CL.W,+b.dataset.i)){ CL.msg=[S.cprof.name+" の監督に就任した。次はクラブ名とエンブレムを決める"]; save(); } showClub(true); return; }
  if(act==="cedit"){ CL.clubEdit=!CL.clubEdit; if(CL.clubEdit){ const c=S.club||{};
      (CL.draft||(CL.draft={})).c={ name:c.name||myTeam(S).name, short:c.short||"", town:c.town||TOWNS[0], color:c.color||myTeam(S).color, emb:Object.assign({},c.emblem||{}) }; }
    else if(CL.draft)CL.draft.c=null;
    showClub(true); return; }
  if(act==="csave"){ const c=CL.draft&&CL.draft.c;
    if(c&&signClub(S,{ name:c.name, short:c.short, town:c.town, color:c.color,
      emblem:Object.keys(c.emb).length?Object.assign(embDesign("azr",c.name,c.emb,c.color),{ text:undefined }):null })){ CL.draft.c=null; CL.clubEdit=false; save(); infoBar(["クラブの設定を保存した"]); }
    else infoBar(["クラブ名を入れてください"]); showClub(true); return; }
  if(act==="contract"){ const c=CL.draft&&CL.draft.c;
    if(c&&signClub(S,{ name:c.name, short:c.short, town:c.town, color:c.color,
      emblem:Object.keys(c.emb).length?Object.assign(embDesign("azr",c.name,c.emb,c.color),{ text:undefined }):null })){ CL.draft=null; save(); }
    else CL.msg=["クラブ名を入れてください"]; showClub(true); return; }
  if(act==="stad"){ const r=answerStadium(S,b.dataset.v==="1"); if(r)CL.msg=[r.ok?"スタジアムを改修した: 「"+stadOf(S).name+"」(収容 "+(stadOf(S).cap/10000).toFixed(1)+"万人)":"改修を見送った"].concat(r.tl||[]); save(); showClub(true);
    if(r&&r.tl&&r.tl.length)setTimeout(()=>infoBar(r.tl),0); return; }
  if(act==="spopen"){ CL.spOpen=true; showClub(true); return; }
  if(act==="spsign"||act==="spkeep"){ CL.spOpen=false; }
  if(act==="spsign"||act==="spkeep"){ if(signSponsor(S,+b.dataset.i,act==="spkeep"))CL.msg=[S.biz.sp.name+" と契約した(ユニフォームの胸に "+S.biz.sp.name+")"]; save(); showClub(true); return; }
  if(act==="fac"){ const k=b.dataset.v; if(buildFac(S,k))CL.msg=[FAC_INFO[k].name+" を Lv"+S.biz.fac[k]+" にした("+facEffTxt(k,S.biz.fac[k])+")"]; save(); showClub(true); return; }
  if(act==="tagev"){ const ln=answerTagEvent(S,+b.dataset.i); CL.msg=ln; save(); showClub(true); setTimeout(()=>infoBar(ln),0); return; }
  if(act==="secev"){ const r=answerSecEvent(S,+b.dataset.i); if(r){ CL.msg=[r.line].concat(r.up?[r.up]:[]); save(); } showClub(true); return; }
  if(act==="cupenter"){ enterCup(S,CL.fx.comp); save(); showClub(true); infoBar(["🏆 "+COMPS[CL.fx.comp].name+" にエントリーした。組み合わせが決まった"]); return; }
  if(act==="taginfo"){ const t=teamTagsView(S).find(x=>x.id===b.dataset.v); if(t)infoBar(["🏷 "+t.name+" ― "+t.desc+(t.left?"(あと "+t.left+")":"")]); return; }
  if(act==="skipslot"){ const r=skipSlot(S,CL.W); if(r){ save(); showClub(true); infoBar(r); } return; }
  if(act==="go"){ CL.flow="prep"; CL.comm=null; CL.pick=[]; showClub(); return; }
  if(act==="home"){ CL.flow=null; CL.tab="home"; CL.strat=false; CL.scout=false; CL.oppSel=null; showClub(); return; }
  if(act==="strat"){
    if(commLeft(S)>0&&!CL.armPlay){ CL.armPlay=true; showClub(true); return; }   // 残りがあるときは2度押しで確かめる(→docs/14)
    CL.armPlay=false; CL.scout=true; CL.strat=false; CL.chat=null; CL.pick=[]; showClub(); return;   // コミュニケーションのあとは視察(→docs/18)
  }
  if(act==="scoutgo"){ CL.scoutRep=false; CL.scout=false; CL.strat=true; CL.mabOpen=false; CL.oppSel=null; showClub(); return; }
  if(act==="scoutback"){ CL.scout=false; CL.oppSel=null; showClub(); return; }
  if(act==="oppcard"){ CL.oppSel=b.dataset.id; showClub(true); return; }
  if(act==="bracket"){ CL.brView=b.dataset.v; showClub(true); return; }
  if(act==="brclose"){ CL.brView=null; showClub(true); return; }
  if(act==="oppview"){ CL.oppView=b.dataset.id; CL.oppSel=null; showClub(true); return; }
  if(act==="oppvclose"){ CL.oppView=null; CL.oppSel=null; showClub(true); return; }
  if(act==="oppclose"){ CL.oppSel=null; showClub(true); return; }
  if(act==="screp"){ CL.scoutRep=true; showClub(true); return; }
  if(act==="screpclose"){ CL.scoutRep=false; showClub(true); return; }
  if(act==="stratback"){ CL.strat=false; CL.scout=true; CL.mabOpen=false; CL.htOpen=false; showClub(); return; }
  if(act==="play"){ CL.strat=false; CL.scout=false; CL.mabOpen=false; CL.htOpen=false; startFixture(); }
  else if(act==="decline"){ const nm=COMPS[CL.fx.comp].name; declineCup(S,CL.fx.comp); save(); showClub(true); infoBar([nm+" は棄権した。この大会の枠はフレンドリーマッチになる"]); }
  else if(act==="term"){ startNextTerm(S,CL.W); CL.msg=[]; save(); showClub(); }
  else if(act==="train"){ const i=+b.dataset.i; CL.trSel=CL.trSel===i?null:i; showClub(true); }   // 選ぶだけ。決定は下のボタン(→docs/14)
  else if(act==="trgo"&&CL.trSel!=null){
    const i=CL.trSel, o=trainOptions(S)[i]; CL.trSel=null;
    CL.msg=["練習: "+trainLabel(o)+"("+INT_LABEL[CL.int]+")"].concat(doTraining(S,i,CL.int));
    CL.comm=null; CL.pick=[]; save(); showClub();
    infoBar(CL.msg.filter(x=>INFO_BAR_RE.test(x)));   // めったに出ない大事な知らせは、横から出るインフォバーで(→docs/14 §14.41)
  }
  else if(act==="int"){ CL.int=+b.dataset.i; if(CL.int===-1)CL.trSel=null; showClub(true); }
  else if(act==="rest"){ CL.msg=doRest(S); CL.comm=null; CL.pick=[]; CL.int=1; save(); showClub(); }
  else if(act==="cf"){ CL.cf=b.dataset.v; CL.sel=null; showClub(true); }
  else if(act==="cs"){ const o=["rar","no","tot"]; CL.cs=b.dataset.v==="next"?o[(o.indexOf(CL.cs||"rar")+1)%3]:b.dataset.v; showClub(true); }
  else if(act==="card"){ if(!b.dataset.id)return; const nx=b.dataset.id, nav=b.classList.contains("km-nav");
    CL.sel=!nav&&CL.sel===nx?null:nx; CL.kSwap=false; CL.kOut=null; CL.kFlip=false; if(nav)CL.kTo=".km-head"; showClub(true); }
  else if(act==="sqclose"){ CL.sqSel=null; showClub(true); }
  else if(act==="sqnav"){ if(b.dataset.id){ CL.sqSel=b.dataset.id; CL.kTo=".km-head"; showClub(true); } }
  else if(act==="kpopen"){ CL.kpOpen=true; showClub(true); }
  else if(act==="kpclose"){ CL.kpOpen=false; showClub(true); }
  else if(act==="kppick"){ const id=b.dataset.id; S.kp=id; CL.kpOpen=false; save(); showClub(true); if(rareOn(S,id))cutIn(CARDS[id],"H"); }
  else if(act==="sttoggle"){ CL.noStars=!CL.noStars; showClub(true); }
  else if(act==="lktoggle"){ CL.noLinks=!CL.noLinks; showClub(true); }
  else if(act==="ggopen"){ CL.ggOpen=true; showClub(true); }
  else if(act==="ggclose"){ CL.ggOpen=false; showClub(true); }
  else if(act==="kclose"){ CL.sel=null; CL.kSwap=false; CL.kOut=null; showClub(true); }
  else if(act==="kswap"){ CL.kSwap=!CL.kSwap; CL.kOut=null; if(CL.kSwap)CL.kTo=".km-swap"; showClub(true); }
  else if(act==="koutnav"){ const q=S.sq, i=q.indexOf(CL.kOut); CL.kOut=q[(i+(+b.dataset.d)+q.length)%q.length]; CL.kFlip2=false; CL.kTo=".km-cmp"; showClub(true); }
  else if(act==="kout"){ CL.kOut=b.dataset.id; CL.kFlip2=false; CL.kTo=".km-cmp"; showClub(true); }
  else if(act==="swap"&&CL.sel){
    const out=b.dataset.id, inn=CL.sel;
    if(swapSquad(S,out,inn)){ CL.msg=["登録: "+cname(out)+" → "+cname(inn)+"(次の試合から使える)"].concat(S.joinLines||[]); CL.sel=null; CL.kSwap=false; CL.kOut=null; save();
      // 通知バーで「〇〇 がチームに参加しました」(加わった選手のタグの知らせが続く。→docs/14 §14.126)
      { const jl=[nameOf(CARDS[inn])+" がチームに参加しました"].concat(S.joinLines||[]); setTimeout(()=>infoBar(jl),0); } S.joinLines=null; }
    showClub(true);
  }
  else if(act==="sqpick")sqPick(b.dataset.id);
  else if(act==="sqform"){ setForm(S,b.dataset.v); CL.sqSel=null; save(); showClub(true); }
  else if(act==="sqauto"){ autoSquad(S); CL.sqSel=null; CL.msg=[]; save(); showClub(true); sndUi("ok"); }
  else if(act==="sqrole"){ const k=b.dataset.v; CL.sqSel=null; CL.roleMsg=null; let ib=null;
    if(CL.roleSel===k){ if(S.roles[k])ib=setRole(S,k,null); CL.roleSel=null; save(); }   // もう一度押すと解く
    else{ CL.roleSel=k; ib=["👆 "+ROLE_LABEL[k]+" にする選手をピッチでタップ(もう一度 "+ROLE_LABEL[k]+" を押すと"+(k==="cap"?"任命を解く":"自動に戻す")+")"]; }
    setTimeout(()=>infoBar(ib),0);
    showClub(true); }
  else if(act==="sqkp"){ const id=b.dataset.id; S.kp=id; save(); showClub(true);
    if(rareOn(S,id))cutIn(CARDS[id],"H");   // レアKP が発動する選手を KP にした(→docs/11)
  }
  else if(act==="comm"){ CL.comm=b.dataset.v; CL.pick=[]; showClub(true); }
  else if(act==="ind"&&CL.pick.length===1){
    const id=CL.pick[0], said=mgrSay(S,"ind",0,id), r=doIndTrain(S,id); chatResult("ind",[id],said,r,reactOf(S,id,"ind",hashStr("ri:"+S.term+":"+S.played+":"+id)%2));
    save(); showClub(true);
  }
  else if(act==="talk"&&CL.pick.length===1){
    const id=CL.pick[0], said=mgrSay(S,"talk",0,id), r=doTalk(S,id); chatResult("talk",[id],said,r,reactOf(S,id,"talk",0));
    save(); showClub(true);
  }
  else if(act==="pick"){
    const id=b.dataset.id, max=COMM_UI[CL.comm]?COMM_UI[CL.comm].n:1, i=CL.pick.indexOf(id);
    if(i>=0)CL.pick.splice(i,1); else{ if(CL.pick.length>=max)CL.pick.shift(); CL.pick.push(id); }
    showClub(true);
  }
  else if(act==="lounge"&&CL.pick.length===2){
    const who=CL.pick.slice(), said=mgrSay(S,"lounge",+b.dataset.i,who[0]), r=doLounge(S,who[0],who[1],+b.dataset.i);
    chatResult("lounge",who,said,r,r.res>=0?reactOf(S,who[0],"lounge",r.res):"");
    save(); showClub(true);
  }
  else if(act==="meet"&&CL.pick.length===1){
    const who=CL.pick.slice(), ready=spReady(S,who[0]), said=ready?b.textContent:mgrSay(S,"meet",0,who[0]), r=doMeeting(S,who[0],+b.dataset.i);
    chatResult("meet",who,said,r,r.res>=0?reactOf(S,who[0],"meet",r.res):"");
    save(); showClub(true);
  }
  else if(act==="reset"){
    if(!CL.armReset){ CL.armReset=true; showClub(true); return; }
    CL.armReset=false; clearCareer(CL.store); CL.msg=[];
    CL.S=newCareer(Date.now()&0x7fffffff); CL.W=worldOf(CL.S);
    persist(CL.S); showClub();
  }
}

/** 監督室の <select>(フォーメーションのプルダウンなど)。data-chg に名前 */
function onClubChange(e){
  const t=e.target; if(!t||!t.dataset||!t.dataset.chg)return;
  if(t.dataset.chg==="sqform"){ setForm(CL.S,t.value); CL.sqSel=null; persist(CL.S); showClub(true); }
}
