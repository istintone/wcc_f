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
  CL.fx=nextFixture(CL.S,CL.W);
  el.innerHTML=clubHtml();
  el.classList.add("on");
  const main=el.querySelector(".cl-main");
  if(main)main.scrollTop=keepScroll?y:0;
  const pitch=document.getElementById("sqPitch");
  if(pitch)sqBind(pitch);
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

/** 選手を指名するための札の並び。on = 選択中。info = 札の下段に出す情報。act = 押したときの動き */
function chipsHtml(ids,on,info,act){
  const S=CL.S;
  return '<div class="chips">'+ids.map(id=>{
    const c=CARDS[id];
    return '<button class="chipb '+c.pos.toLowerCase()+(on.includes(id)?' on':'')+'" data-act="'+(act||"pick")+'" data-id="'+id+'">'+
      '<i>'+c.no+'</i>'+nameOf(c)+(hasSign(S,id)?'<b class="sign">！</b>':'')+
      '<small>'+info(S.g.pl[id],id)+'</small></button>'; }).join("")+'</div>';
}
/**
 * コミュニケーションの相手を選ぶ盤面(本家と同じくフォーメーションのまま。→docs/08 §8.12)。
 * 先発は SQUAD の既定の位置、控えは下の列。駒には次の★までの進みなど(info)を添える
 */
function commBoardHtml(ids,on,info){
  const S=CL.S, xi=S.sq.slice(0,11), L=fillLayout(S);
  const first=CL.comm==="lounge"&&on.length?on[0]:null;   // ラウンジで1人目を選んだら、その人との線と前兆だけを見せる(→docs/07 §7.14)
  const tok=(id,st)=>{ const c=CARDS[id], g=S.g.pl[id];
    return '<button class="cmt '+c.pos.toLowerCase()+(on.includes(id)?' on':'')+(g&&g.mot===0?' inj':'')+'" data-act="pick" data-id="'+id+'"'+(st||'')+'>'+
      '<b class="rl">'+c.pos+'</b><i class="no">'+c.no+'</i><span class="nm">'+nameOf(c)+'</span>'+
      ((first?id!==first&&linkSign(S,first,id):commSign(S,id,CL.comm))?'<em class="sg">！</em>':'')+(g&&g.is?'<em class="gs'+(g.is>=5?' aw':'')+'">★'+g.is+'</em>':'')+
      '<small>'+info(g,id)+'</small></button>'; };
  return '<div class="cm-board"><div class="sq-pitch cm-pitch"><i class="pm half"></i><i class="pm circ"></i><i class="pm pa top"></i><i class="pm pa bot"></i>'+
    (first&&L[first]&&xi.includes(first)?loungeLinksSvg(first,xi.filter(id=>ids.includes(id)),L):'')+
    xi.filter(id=>ids.includes(id)).map(id=>{ const l=L[id], p=sqPos(l[0],l[1]); return tok(id,' style="left:'+p.l.toFixed(1)+'%;top:'+p.t.toFixed(1)+'%"'); }).join("")+
    '</div><div class="cm-bench">'+S.sq.slice(11).filter(id=>ids.includes(id)).map(id=>tok(id)).join("")+'</div></div>';
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
  // 札には次の★までの進み(%)と兆しを出す(→docs/05 §5.3 見える化)
  ind:   { sub:"個人能力", n:1, hint:"1人を選ぶ(個人能力の経験 +"+TUNING.grow.comm.ind+" × 伸びやすさ。★は試合のあとに上がる)",
           info:(g,id)=>g.is>=5?"個★5 覚醒":g.q?"個★4 覚醒の兆し":"個★"+g.is+" "+Math.floor(indProgress(g)*100)+"%" },
  meet:  { sub:"特殊能力", n:1, hint:"1人を選ぶ(！ = ★突破の話がある)",
           info:g=>g.ss>=5?"特★5":g.sq?"特★4 極みの兆し":"特★"+g.ss+" "+Math.floor(spProgress(g)*100)+"%" },
  // 相性の組は見せない(→docs/08)。1人目を選んだら、その人との今の連携を出す
  lounge:{ sub:"2人の連携", n:2, hint:"2人を選ぶ(動物・国籍・クラブが手がかり)", info:(g,id)=>{ const a=CL.pick[0], ic=ANI_ICON[CARDS[id].ani]||"";
    if(!a||a===id)return ic; const l=linkOf(CL.S,a,id);
    // 札の幅に収まるよう短く(線なし→なし・黄金線→黄金。太線の黄金線の兆しは「兆し」)
    return ic+(l.lv===2&&l.gold?"兆し":["なし","薄線","太線","黄金"][l.lv])+(l.lv>=2?"":Math.floor(linkProgress(CL.S,a,id)*100)+"%"); } },
  talk:  { sub:"やる気・ケガ", n:1, hint:"1人を選ぶ(落ちている選手ほど大きく戻る。ケガの選手は手当てで治る)", info:g=>'<b class="mot m'+g.mot+'">'+MOT_LABEL[g.mot]+'</b>' }
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
      '<small>×'+N.k[i]+(N.fat[i]?' 疲労+'+Math.round(N.fat[i]*100)+'%':'')+'</small></button>').join("")+'</div>'+
    '<p class="dim">いまの疲労 <b class="'+(fat>=N.tiredSign?'warn':'')+'">'+Math.round(fat*100)+'%</b>(盤面の11人の平均)</p>'+
    (CL.int===-1
      ?'<div class="trs"><button class="tr rest" data-act="rest"><b>休憩する</b><small>練習の代わりに休む。経験は入らないが、疲労が大きく抜け、調子の落ちた選手が戻る</small></button></div>'
      :'<div class="trs">'+trainOptions(S).map((o,i)=>'<button class="tr'+(o.sp>=0?' sp':'')+(CL.trSel===i?' on':'')+'" data-act="train" data-i="'+i+'">'+
        '<b>'+trainLabel(o)+'</b><small>'+trainDesc(o)+'</small></button>').join("")+'</div>');
}
/** ② コミュニケーション */
/* ---- コミュニケーションのチャット(→docs/07 §7.14)。画面の下に重なる層で、選手(左)・秘書(紫)・監督(右・金)が話す ---- */
const chatFace=id=>{ const c=CARDS[id], src=c&&typeof artSrc==="function"?artSrc(c,"stand"):null;
  return '<i class="cf pl">'+(src?'<img src="'+src+'" alt="">':'<b>'+(c?c.no:"")+'</b>')+'</i>'; };
const chatPl=(id,t,first)=>'<div class="cm pl'+(first?' first':'')+'">'+(first?chatFace(id):'<i class="cf sp"></i>')+'<div>'+(first?'<small>'+cname(id)+'</small>':'')+'<p>'+t+'</p></div></div>';
const chatSec=(t,first)=>'<div class="cm csec'+(first?' first':'')+'">'+(first?'<i class="cf se"></i>':'<i class="cf sp"></i>')+'<div>'+(first?'<small>'+secOf(CL.S).name+'</small>':'')+'<p>'+t+'</p></div></div>';
const chatMe=t=>'<div class="cm me"><p>'+t+'</p></div>';
const chatNote=t=>'<div class="cn">'+t+'</div>';
/** いま開いているやりとり(選手を選んだら)と、答えたあとの結果 */
function commChatHtml(){
  const S=CL.S, U=COMM_UI[CL.comm];
  if(CL.chat){
    const K=CL.chat;
    return '<div class="chat-sheet"><div class="ch-head"><b>'+K.title+'</b></div><div class="ch-log">'+
      K.who.map((x,i)=>chatPl(x,"「"+voiceOf(S,x)+"」",true)).join("")+chatMe(K.said)+
      K.lines.map(chatNote).join("")+(K.react?chatPl(K.who[0],K.react,true):"")+
      '</div><div class="ch-acts">'+(commLeft(S)?'<button class="cr ok" data-act="chatok">OK</button>'
        :'<button class="cr ok" data-act="chatok">閉じる</button><button class="cr ok ko" data-act="chatgo">戦略方針へ</button>')+'</div></div>';
  }
  if(!U||CL.pick.length!==U.n)return "";
  const id=CL.pick[0], who=CL.pick.slice();
  let log=who.map(x=>chatPl(x,"「"+voiceOf(S,x)+"」",true)+chatNote("信頼度: "+TRUST_LABEL[trustLv(S.g.pl[x])])).join(""), acts="";
  if(CL.comm==="lounge"){
    const f=loungeInfo(S,who[0],who[1]), bo=linkBonusOf(who[0],who[1]);
    log+=chatSec(cname(who[0])+" と "+cname(who[1])+"、いまは「"+LINK_LABEL[f.lv]+"」"+(f.gold?"(黄金線の兆し)":"")+"です。",true)+
      chatSec(f.hint+"。<br><span class=\"dim\">"+who.map(x=>cname(x)+" "+aniTxt(CARDS[x])+" ・ "+natTxt(CARDS[x])).join("<br>")+"</span>"+
        (bo.length?"<br><span class=\"bonus\">"+bo.map(t=>BONUS_LABEL[t]).join("・")+" ― 連携が付きやすい</span>":""),false);
    acts=f.choices.map((t,i)=>'<button class="cr" data-act="lounge" data-i="'+i+'">'+t+'</button>').join("");
  }else if(CL.comm==="meet"){
    const f=meetInfo(S,id);
    log+=chatSec("特殊能力 "+stars(f.ss)+" ・ 経験 "+Math.min(Math.floor(f.se),f.need)+"/"+f.need+"。"+
      (f.near.length?"周りで "+f.near.map(cname).join("・")+" も聞いています。":""),true);
    if(f.ready){ log+=chatSec("★突破の話を切り出してきました。性格は「"+f.pers+"」です。",false);
      acts=f.choices.map((t,i)=>'<button class="cr" data-act="meet" data-i="'+i+'">'+t+'</button>').join(""); }
    else acts='<button class="cr" data-act="meet" data-i="0">戦術の話をする</button>';
  }else if(CL.comm==="ind"){
    const p=S.g.pl[id];
    log+=chatSec("個人能力 "+stars(p.is)+(p.q?"(覚醒の兆し)":"")+" ・ 次の★まで "+Math.floor(indProgress(p)*100)+"%"+(dupOf(S,id)?" ・ 重なり ×"+dupOf(S,id):"")+"。",true);
    acts='<button class="cr" data-act="ind">個別に指導する</button>';
  }else{
    const p=S.g.pl[id];
    log+=chatSec("いま <b class=\"mot m"+p.mot+"\">"+MOT_LABEL[p.mot]+"</b> ・ 疲労 "+Math.round(p.fat*100)+"%です。",true);
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
function commStepHtml(){
  const S=CL.S, g=S.g, all=Object.keys(g.pl), left=commLeft(S), U=COMM_UI[CL.comm];
  let h='<div class="step-h"><b>コミュニケーション</b><small>あと <em>'+left+'</em> 回。使わずに試合へ進んでもよい</small></div>'+
    '<div class="tabs t4">'+Object.keys(COMM_UI).map(k=>'<button class="tab'+(CL.comm===k?' on':'')+'" data-act="comm" data-v="'+k+'"'+
      (left?'':' disabled')+'>'+COMM_LABEL[k]+(Object.keys(S.g.pl).some(id=>commSign(S,id,k))?'<b class="tsg">！</b>':'')+'<small>'+COMM_UI[k].sub+'</small></button>').join("")+'</div>';
  if(!left)return h+'<p class="dim">今回のコミュニケーションは使い切った</p>'+commChatHtml();   // 最後の1回の結果はここで見せる
  if(!U)return h+'<p class="dim">場所を選ぶ</p>';
  h+='<p class="dim">'+U.hint+'</p>'+commBoardHtml(all,CL.pick,U.info);
  h+=commChatHtml();
  return h;
}
/**
 * 準備の手順(全画面)。上に「×」と手順の印、下に次へ進むボタン。
 * 筐体の1クレジットと同じく、練習 → コミュニケーション → 試合 の順にしか進まない
 */
function prepHtml(){
  const S=CL.S, fx=CL.fx, st=S.g.step, comp=COMPS[fx.comp];
  // 準備は3段: チーム練習 → コミュニケーション → 戦略方針(監督能力を選ぶ)→ キックオフ(→docs/14)
  const no=st==="train"?1:CL.strat?3:2;
  let h='<header class="prep-top"><button class="x" data-act="home">×</button>'+
    '<div class="steps">'+["チーム練習","コミュニケーション","戦略方針"].map((t,i)=>
      '<span class="'+(i+1<no?'done':i+1===no?'now':'')+'"><i>'+(i+1)+'</i>'+t+'</span>').join("")+'</div></header>'+
    '<div class="prep-vs">'+gradeTag(comp.grade)+'<b>'+comp.name+'</b> '+(fx.label||"")+
      ' <span>vs '+teamNameOf(TEAMS[fx.opp])+'</span></div>'+
    '<div class="cl-main prep">'+msgHtml()+(st==="train"?trainStepHtml():CL.strat?stratStepHtml():commStepHtml())+'</div>'+
    '<footer class="prep-bot">'+
      (st==="train"?(CL.trSel!=null&&CL.int!==-1&&trainOptions(S)[CL.trSel]
          ?'<button class="btn btn-main" data-act="trgo">この練習で決定 <small>'+trainLabel(trainOptions(S)[CL.trSel])+' ・ '+INT_LABEL[CL.int]+'</small></button>'
          :'<span class="dim">練習と強さを選んで決定する</span>')
        :CL.strat?'<button class="btn btn-main" data-act="play">キックオフ</button>'+(commLeft(CL.S)?'<button class="lnk" data-act="stratback">‹ コミュニケーションに戻る</button>':'')
        :(commLeft(CL.S)?(CL.armPlay?'<button class="btn btn-main warn" data-act="strat">残り '+commLeft(CL.S)+' 回を使わずに戦略方針へ(もう一度押す)</button>'
            :'<button class="btn btn-sub go-soft" data-act="strat">戦略方針へ(コミュニケーションはあと '+commLeft(CL.S)+' 回)</button>'):'<button class="btn btn-main" data-act="strat">戦略方針へ</button>'))+
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
  return '<div class="sqc '+c.pos.toLowerCase()+' r-'+(c.rar||"B")+(CL.sqSel===id?' sel':'')+(on?'':' bn')+(S.kp===id&&on?' kp':'')+
    (g&&g.fat>=TUNING.grow.int.tiredSign?' tired':'')+'" data-id="'+id+'" data-i="'+i+'"'+pos+'>'+
    '<i class="no">'+c.no+'</i>'+
    (rl?'<b class="rl '+rl.cls+'">'+rl.role+'</b>':'<b class="rl">'+c.pos+'</b>')+
    '<span class="nm">'+nameOf(c)+'</span>'+
    (g?'<em class="mt m'+g.mot+'"></em>':'')+
    (g&&g.is?'<i class="gs'+(g.is>=5?' aw':'')+'">★'+g.is+'</i>':'')+
    (S.kp===id&&on?'<i class="kpb">KP</i>':'')+   // 兆しの印は出さない(SQUAD では突破は関係ない →docs/14 §14.14)
    (S.roles&&S.roles.cap===id?'<i class="capb">C</i>':'')+'</div>';
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
  if(!id)return '<p class="sq-hint">カードを引っ張って位置を動かす ・ ほかの選手に重ねると入れ替え(控えからも)・ タップで選手の詳細と KP</p>';
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
    cardBackHtml(growCard(S,c),{ ss:g.ss })+                    // 能力・適性のマップ・スキルはカードの裏で(→docs/14 §14.14)
    '<div class="sd-act">'+(st?'<span class="sd-rk">'+st.name+' '+rankChip(myStyleRank(S,st))+'</span>':'')+(on?(S.kp===id?'<span class="kpnow">KP</span>':'<button data-act="sqkp" data-id="'+id+'">KP にする</button>'):'')+
      '<button class="ghost" data-act="sqpick" data-id="'+id+'">選択をやめる</button></div>'+
    '<p class="voice"><b>'+nameOf(c)+'</b>「'+voiceOf(S,id)+'」</p>'+
    '<p class="sq-hint">入れ替えるときは、カードを引っ張って相手に重ねる</p></div>';
}
/** ハーフタイムの指示の登録(→docs/10 §10.8)。使える指示から3つまで。同じ特殊練習を2回すると覚える */
function htSetHtml(){
  const S=CL.S, set=S.ht.set, av=htAvail(S);
  return '<details class="card htset fold"><summary><h3>ハーフタイムの指示 <small>'+set.length+'/'+TUNING.ht.max+' 登録 ・ '+set.map(id=>htOf(id).name).join(" / ")+'</small></h3></summary>'+
    '<p class="dim">同じ特殊練習を'+TUNING.ht.unlock+'回すると覚える</p>'+
    av.map(id=>{ const h=htOf(id); return '<button class="ht'+(set.includes(id)?' on':'')+'" data-act="htset" data-v="'+id+'"><b>'+h.name+'</b><i>'+htAxTxt(h)+'</i>'+
      (h.train?'<small>'+h.train+'</small>':'<small>初めから</small>')+'</button>'; }).join("")+'</details>';
}
function squadHtml(){
  const S=CL.S, G0=TUNING.grow;
  fillLayout(S);
  const on=S.sq.slice(0,11), bench=S.sq.slice(11);
  // 上部: 左に OVR(チーム力)、右にフォーメーションのプルダウンと最適配置(→docs/14 §14.12)
  let h='<section class="sq-head"><div class="sq-ovr"><small>OVR</small><b>'+teamPower(S).toFixed(1)+'</b></div>'+
    '<div class="sq-ctl"><select class="sq-formsel" data-chg="sqform" aria-label="フォーメーション">'+SQ_FORMS.map(f=>'<option value="'+f+'"'+(S.form===f?' selected':'')+'>'+f+'</option>').join("")+'</select>'+
    '<button class="btn btn-sub sq-auto" data-act="sqauto">最適配置</button></div></section>';
  // 3列: 左に任命(CAP・PK・FK・CK)、中央にピッチ、右に控え(試合画面と同じ並び。→docs/12 §12.2)
  h+='<div class="sq-3col">'+sqRolesHtml()+
    '<div class="sq-pitch" id="sqPitch"><i class="pm half"></i><i class="pm circ"></i><i class="pm pa top"></i><i class="pm pa bot"></i>'+
    '<i class="pm ga top"></i><i class="pm ga bot"></i>'+sqLinksSvg()+
    on.map((id,i)=>sqTokenHtml(id,i,true)).join("")+'</div>'+
    '<div class="sq-bench"><span class="lbl">控え</span>'+bench.map((id,j)=>sqTokenHtml(id,11+j,false)).join("")+'</div></div>';
  if(CL.roleMsg&&CL.roleMsg.length)h+='<p class="sq-rmsg">'+CL.roleMsg.join("<br>")+'</p>';
  h+=CL.roleSel?'<p class="sq-hint on">'+ROLE_LABEL[CL.roleSel]+' にする選手をピッチでタップ ・ もう一度 '+ROLE_LABEL[CL.roleSel]+' を押すと'+(CL.roleSel==="cap"?'任命を解く':'自動に戻す')+'</p>':sqDetailHtml();
  // 連携の数・戦力グラフ
  const lv=[0,0,0,0]; Object.values(S.g.links).forEach(l=>lv[l.lv]++);
  h+='<details class="card fold"><summary><h3>連携 <small>薄線 '+lv[1]+' ・ 太線 '+lv[2]+' ・ 黄金線 '+lv[3]+' ・ 線の見方</small></h3></summary><p class="lklg"><span><i class="l1"></i>薄線 '+lv[1]+'</span>'+
    '<span><i class="l2"></i>太線 '+lv[2]+'</span><span><i class="l3"></i>黄金線 '+lv[3]+'</span><span><i class="omen"></i>黄金線の兆し</span><span><i class="soon"></i>次の段が近い(選手を選ぶと出る)</span>'+
    ' <small>セットプレイ +'+Math.round(S.g.set*100)+'%</small></p></details>';
  h+=htSetHtml();
  h+=growGraphHtml(S);
  return h;
}
/** 自分のチームでの、そのスタイルのランク(成長グラフから。→docs/15 §15.5) */
const myStyleRank=(S,st)=>styleRank({ graph:Object.assign({},S.g.graph,{ gold:S.g.gold }) },st);
const rankChip=r=>'<b class="rk rk'+r+'">'+r+'</b>';
/**
 * チームの成長グラフ(→docs/15)。六角形は向かい合う軸が対角。横に対ごとの値(MAX・金色)、下に KP のランク。
 * 金色が3つそろうとグラフ全体が金色
 */
function growGraphHtml(S){
  const G=S.g.graph, gold=S.g.gold, R=TUNING.grow.graph, all=graphGoldN(S)>=3, v={};
  for(const a in G)v[a]=G[a]/R.max;
  const ax=a=>'<span class="'+(gold[a]?'gd':G[a]>=R.max-1e-9?'mx':'')+'"><i>'+AXIS_ABBR[a]+'</i><b>'+Math.round(G[a])+'</b>'+
    (gold[a]?'<em>GOLD</em>':G[a]>=R.max-1e-9?'<em>MAX</em>':'')+'</span>';
  const kc=S.kp&&CARDS[S.kp], st=kc?styleOfCard(kc):null, rk=st?myStyleRank(S,st):null;
  return '<section class="card graph-r'+(all?' gold':'')+'"><h3>成長グラフ <small>'+(all?'黄金のチーム':'練習で伸び縮みする。KP のランクを決める')+'</small></h3>'+
    (S.g.golden>0?'<p class="gr-golden">👑 黄金期 ・ あと '+S.g.golden+' 試合 全員が絶好調</p>':'')+
    '<div class="gr-wrap">'+radarSvg([{ v, color:all?'#e8b11c':teamColor(myTeam(S)), op:all?0.55:0.35 }],{ gold, cls:all?'gold':'' })+
    '<ul class="gr-list">'+[["O","D"],["S","P"],["R","C"]].map(p=>'<li>'+ax(p[0])+'<i class="pr">⇄</i>'+ax(p[1])+'</li>').join("")+'</ul></div>'+
    (st?'<p class="gr-kp">KP '+nameOf(kc)+' ・ '+st.name+' '+rankChip(rk)+' <small>'+styleAxes(st).map(a=>AXIS_ABBR[a]).join("・")+
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
  return '<div class="sq-roles"><span class="lbl">任命</span>'+ROLE_KINDS.map(k=>{
    const id=R[k], c=id&&CARDS[id], on=id&&S.sq.slice(0,11).includes(id);
    const mk=!c?"":k==="cap"?CAP_MARK[capApt(c)]:kickMark(S,id,k);
    return '<button class="rs'+(CL.roleSel===k?' sel':'')+(c?' set':'')+(c&&!on?' off':'')+'" data-act="sqrole" data-v="'+k+'">'+
      '<b>'+ROLE_LABEL[k]+'</b>'+(c?'<i class="no">'+c.no+'</i><span class="nm">'+nameOf(c)+'</span><em class="mk m'+mk+'">'+mk+'</em>'
        :'<span class="nm auto">'+(k==="cap"?'未任命':'自動')+'</span>')+
      (c&&!on?'<small>控え</small>':'')+'</button>'; }).join("")+'</div>';
}
/** 選手を選ぶ。2人目で入れ替え(→pool.js moveSquad)。任命の枠を選んでいるときは、その役に任命する */
function sqPick(id){
  const S=CL.S;
  if(CL.roleSel){
    if(S.sq.indexOf(id)<11){ CL.roleMsg=setRole(S,CL.roleSel,id); CL.roleSel=null; persist(S); }
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
    '<i class="k-band"></i><div class="k-art">'+(artSrc(c,"play")?'<img class="k-img" src="'+artSrc(c,"play")+'" alt="">':poseSvg(c))+'</div>'+
    (cardTeam(c)?'<i class="k-emb">'+emblemSvg(cardTeam(c),size==="m"?22:13)+'</i>':'')+
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
/** その選手のレアKP が、いま KP にすれば発動するか(★5) */
const rareOn=(S,id)=>!!rareOfCard(CARDS[id])&&!!S.g.pl[id]&&S.g.pl[id].ss>=5;
/** カードの詳細に出すレアKP の行。★4以下のあいだは伏せる */
function rareRowHtml(S,id){
  const R=rareOfCard(CARDS[id]); if(!R)return "";
  const mv=R.mv?RARE_MOVES[R.mv]:null, g=S.g.pl[id], ss=g?g.ss:0;
  if(ss<5)return '<p class="rarekp lock"><b>RARE KP</b> ？？？ <small>特殊能力 ★5 で解放(いま ★'+ss+')</small></p>';
  return '<p class="rarekp"><b>RARE KP</b> '+R.name+(mv?' <small>技: '+mv.label+'</small>':'')+'<br><span class="get">KP にすると発動。スキルとスタイルが強まる</span></p>';
}
/** 選んだカードの詳細と、登録の入れ替え */
function cardDetailHtml(id){
  const S=CL.S, c=CARDS[id], st=styleOfCard(c), sk=c.skill?SKILLS[c.skill]:null, inSq=S.sq.includes(id);
  // カードの裏の形で見せる(→docs/14 §14.14)。登録中なら育成を入れた値
  const g=S.g.pl[id], cc=g?growCard(S,c):c;
  let h='<div class="kdet back">'+cardBackHtml(cc,{ stars:g?[g.is,g.ss]:null, ss:g?g.ss:0, front:cardHtml(id,"s"),
    extra:'<p class="dim">'+RAR_TAG[c.rar||"B"]+' ・ 持っている枚数 '+(S.coll[id]||0)+' ・ 動物: '+aniTxt(c)+'</p>'+
      (dupOf(S,id)?'<p class="dup">重なり ×'+dupOf(S,id)+': 個別指導の経験 +'+Math.round(TUNING.grow.dup.indK*dupOf(S,id)*100)+'% ・ 覚醒の上がり幅が大きくなりやすい</p>':'') })+'</div>';
  if(inSq)h+='<p class="dim">登録中の選手('+(S.sq.indexOf(id)<11?"先発":"控え")+')。外すときは、登録していないカードを選んでこの選手と入れ替える</p>';
  else{
    h+='<p class="hint">登録する: 入れ替える選手を選ぶ(その選手の育成は消える)</p>'+
      chipsHtml(S.sq,[],(g,x)=>(S.sq.indexOf(x)<11?"先発 ":"控え ")+(g?"個★"+g.is:""),"swap");
  }
  return h;
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
  if(CL.sel)h+=cardDetailHtml(CL.sel);
  h+=list.length?'<div class="kgrid">'+list.map(id=>cardHtml(id,"s",(CL.sel===id?" on":"")+(S.sq.includes(id)?" insq":""))).join("")+'</div>'
    :'<p class="dim">このポジションのカードはまだ無い。試合のあとに1枚ずつ出る</p>';
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
    '<p class="dim">監督ランクが上がると、特殊練習が候補に出やすくなる</p>';
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
  club:'<path d="M12 3l7 3v6c0 4.2-3 7.5-7 9-4-1.5-7-4.8-7-9V6z"/><path d="M9.5 12.5l1.8 1.8 3.5-4"/>'
};
const TABS=[["home","HOME","⌂"],["squad","SQUAD","◫"],["cards","CARDS","▤"],["season","SEASON","☰"],["club","CLUB","◎"]];

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
  if(t>=me+2)return "格上への挑戦。番狂わせを起こせ。";
  if(t<=me-1)return "取りこぼしは許されない。";
  return fx.kind==="cup"?"負ければ終わりの一戦。":"勝ち点3を積み上げる。";
}
/** HOME の見出し(クラブと任期) */
const powDelta=S=>{ const d=teamPower(S)-(S.ts.pow0||teamPower(S)); return d>=0.05?" +"+d.toFixed(1):d<=-0.05?" "+d.toFixed(1):""; };
function homeHeadHtml(){
  if(CL.S.ts&&CL.S.ts.pow0==null)CL.S.ts.pow0=teamPower(CL.S);   // 任期の始め(または初めて見たとき)のチーム力
  const S=CL.S, C=TUNING.club, last=S.career.length?titleOf(S.career[S.career.length-1].title).name:null;
  // 2行目は1行に収まる分だけ(格・ランク・称号は CLUB にある。→docs/14 第2弾)
  return '<header class="chd">'+emblemSvg(myTeam(S),30)+'<div><b>'+myTeam(S).name+'</b><small>第'+S.term+'任期'+(S.mgr?' ・ 監督 '+S.mgr.name:'')+'</small></div>'+
    '<div class="num pw"><b>'+teamPower(S).toFixed(1)+'<i>'+powDelta(S)+'</i></b><small>OVR</small></div>'+
    '<div class="num"><b>'+S.played+'<i>/'+C.termLen+'</i></b><small>試合</small></div>'+
    '<div class="num"><b>'+S.money.toFixed(0)+'<i>億</i></b><small>資金</small></div>'+
    (S.biz?'<div class="num"><b>'+(S.biz.fans/10000).toFixed(1)+'<i>万</i></b><small>ファン</small></div>':'')+'</header>';
}
/** 次の試合のタイル。**タイル全体が押す面**で、中にボタンを置かない(pftb の決まり) */
function nextTileHtml(){
  const S=CL.S, fx=CL.fx, comp=COMPS[fx.comp], t=TEAMS[fx.opp], kp=CARDS[t.kp], st=styleOfCard(kp);
  const go=S.g.step==="train"?"準備をはじめる":"準備のつづき";
  return '<section class="tile next" data-act="go">'+
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
    '<div class="nx-go"><span>'+go+'</span></div></section>';
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
  let h='<section class="sec"><i class="sec-ic">SEC</i><div><b class="sec-nm">'+se.name+'</b><p>'+secLine(S)+'</p></div></section>';
  // 監督室の短い会話(親密度のイベント)
  const ev=S.sec&&S.sec.ev!=null?SEC_EVENTS[S.sec.ev]:null;
  if(ev&&!S.termOver)h+='<section class="sec sec-ev"><i class="sec-ic">TALK</i><div><b class="sec-nm">'+se.name+'</b><p>「'+ev.q+'」</p>'+
    '<div class="sec-ch">'+ev.ch.map((c,i)=>'<button class="btn ch" data-act="secev" data-i="'+i+'">'+c[0]+'</button>').join("")+'</div></div></section>';
  return h;
}
/** CLUB の秘書の欄: いまの秘書と親密度。開くと選び直せる */
function secClubHtml(){
  const S=CL.S, se=secOf(S), b=secBond(S), lv=secLv(S), t=TUNING.sec.lv;
  if(CL.secOpen)return secPickHtml("秘書を替える");
  return '<section class="card"><h3>秘書 <small><button class="lnk" data-act="secopen">替える</button></small></h3>'+
    '<p><b>'+se.name+'</b> ・ '+se.desc+'</p><p class="dim">親密度 '+SEC_LV_LABEL[lv]+(lv<t.length?'(次まで '+(t[lv]-b)+')':'')+
    ' ・ フォローの起きやすさ '+Math.round(TUNING.sec.follow[lv]*100)+'%</p></section>';
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
  const nx=TUNING.biz.stad[o.lv-1], why=o.why==="資金"?"資金がたまりました。":o.why+"で、クラブの評価が上がっています。";
  return '<section class="sec stad-offer"><i class="sec-ic">STADIUM</i><div><b class="sec-nm">'+secOf(S).name+'</b>'+
    '<p>'+why+'スタジアムを「'+nx.name+'」(収容 '+(nx.cap/10000).toFixed(1)+'万人)に改修しませんか。費用は '+o.cost+'億です'+(o.why!=="資金"?'(今なら割引)':'')+'。</p>'+
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
  return '<div class="spo-h"><b>'+o.name+'</b><i>'+ind.name+'</i><span class="st">'+spStars(o.rank)+'</span>'+
    '<small>1試合 '+o.pay.toFixed(2)+'億 ・ ミッションを達成するたびに報酬</small></div>'+
    '<p class="rw"><b>'+spItem(ind,o.rank)+'</b> '+spEffTxt(ind.eff,o.rank)+'(<u>'+spDur(ind,o.rank)+'試合</u>)</p>'+missionsHtml(o.ms);
}
/** 候補から選ぶ。first なら選ばないと始められない(任期の始め)、そうでなければ今の契約を続けられる */
function spPickHtml(first){
  const S=CL.S, Z=S.biz;
  return '<section class="card sppick"><h3>スポンサーを選ぶ <small>'+(first?'任期の始め':'リーグの1周が終わった')+' ・ 契約は次の区切りまで</small></h3>'+
    Z.offers.map((o,i)=>'<div class="spo r'+o.rank+'">'+spCardHtml(o)+
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
/** ③ 戦略方針: 監督能力を選ぶ(→docs/14) */
function stratStepHtml(){
  return '<div class="step-h"><b>戦略方針</b><small>この試合で使う監督能力を選ぶ。選んだまま次の試合にも引き継ぐ</small></div>'+mabHtml();
}
function mabHtml(){
  const S=CL.S, set=S.mab.set, M=TUNING.mab;
  const chip=k=>{ const a=MAB.find(x=>x.id===k), r=mabRank(S,k), on=set.includes(k), xp=S.mab.xp[k]||0, nx=M.rankAt[r+1];
    return '<button class="mab'+(on?' on':'')+'" data-act="mab" data-v="'+k+'"><b>'+a.name+'</b><i>'+MAB_RANK[r]+'</i>'+
      '<small>'+a.desc+(nx!=null?' ・ 次のランクまで '+(nx-xp)+'試合':'')+'</small></button>'; };
  return '<section class="card mabs"><h3>監督能力 <small>試合に軽く効く ・ '+set.length+'/'+M.max+' ・ 使うほどランクが上がる</small></h3>'+
    (CL.mabOpen?'<div class="mab-list">'+MAB.map(a=>chip(a.id)).join("")+'</div><button class="lnk" data-act="mabopen">閉じる</button>'
      :'<div class="mab-set">'+(set.length?set.map(chip).join(""):'<p class="dim">セットしていない</p>')+'</div><button class="btn btn-sub" data-act="mabopen">監督能力を選ぶ</button>')+'</section>';
}
/* ---- 称号のセット(→docs/10 §10.2 B) ---- */
function titleSetHtml(){
  const S=CL.S, ids=earnedTitles(S);
  return '<section class="card tset"><h3>称号をセットする <small>この任期のあいだ効く ・ 獲った称号から1つ</small></h3>'+
    ids.map(id=>'<button class="sp" data-act="tset" data-v="'+id+'"><b>'+titleOf(id).name+'</b><i>'+TITLE_FX[id].desc+'</i></button>').join("")+
    '<button class="sp" data-act="tset" data-v=""><b>セットしない</b></button></section>';
}
/* ---- 監督ライセンスと監督契約(→docs/10 §10.2 A) ---- */
/** 監督ライセンス(初回だけ。あとから変えられない) */
function licenseHtml(){
  const d=CL.draft||(CL.draft={});
  const ani=(()=>{ const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(d.birth||""); return m?aniOfDate(+m[1],+m[2],+m[3]):null; })();
  return '<section class="card lic"><h3>監督ライセンス <small>初回だけ。あとから変えられない</small></h3>'+
    '<label>監督名<input data-f="mname" maxlength="12" value="'+embEsc(d.mname||"")+'" placeholder="例: 山田 太郎"></label>'+
    '<label>生年月日(任意)<input type="date" data-f="birth" value="'+embEsc(d.birth||"")+'"></label>'+
    (ani!=null?'<p class="dim">監督の動物: '+ANI_ICON[ani]+ANIMALS[ani].name+'('+ANI_GROUP[ANIMALS[ani].g]+')。同じ群れの選手と相性が良い</p>':'<p class="dim">生年月日を入れると、監督の動物(動物占い)が分かる</p>')+
    '<button class="btn btn-main" data-act="license">登録する</button></section>';
}
/** 監督契約(初回と新しい任期の始め): クラブ名・略称・ホームタウン・色・エンブレム */
function contractHtml(){
  const S=CL.S, d=CL.draft||(CL.draft={});
  if(!d.c){ const nm=S.term>1?"":"アズーロFC";
    d.c={ name:nm, short:"", town:TOWNS[(S.term-1)%TOWNS.length], color:"#1B4FD8", emb:{} }; }
  const c=d.c, name=c.name||"(クラブ名)", e=embDesign("azr",name,c.emb,c.color);
  const row=(k,list,lab)=>'<div class="ce-row"><i>'+lab+'</i>'+list.map(v=>'<button class="ce'+(e[k]===v?' on':'')+'" data-act="emb" data-k="'+k+'" data-v="'+v+'">'+(EMB_LABEL[v]||v)+'</button>').join("")+'</div>';
  const hues=EMB_CLASSIC.map(id=>embHueById(id));
  return '<section class="card contract"><h3>監督契約 <small>第'+S.term+'任期'+(S.term>1?' ・ 新しいクラブ':'')+'</small></h3>'+
    '<div class="ce-prev">'+embSvg("azr",name,96,{ color:c.color, design:c.emb })+'<div><b>'+embEsc(name)+'</b><small>'+embEsc(c.town)+' ・ '+embEsc((c.short||clubAbbr(name)).toUpperCase().slice(0,3))+'</small>'+
      (S.mgr?'<small>監督 '+embEsc(S.mgr.name)+'</small>':'')+'</div></div>'+
    '<label>クラブ名<input data-f="cname" maxlength="10" value="'+embEsc(c.name)+'" placeholder="例: ミナト・ブルーズ"></label>'+
    '<label>略称(英字3字・スコアに出る)<input data-f="cshort" maxlength="3" value="'+embEsc(c.short)+'" placeholder="'+clubAbbr(name)+'"></label>'+
    '<div class="ce-row"><i>ホームタウン</i>'+TOWNS.map(t=>'<button class="ce'+(c.town===t?' on':'')+'" data-act="ctown" data-v="'+t+'">'+t+'</button>').join("")+'</div>'+
    '<div class="ce-row"><i>クラブの色</i>'+hues.map(h=>'<button class="ce sw'+(c.color===h.hex?' on':'')+'" data-act="ccolor" data-v="'+h.hex+'" style="--sw:'+h.hex+'" title="'+h.name+'"></button>').join("")+'</div>'+
    '<h4>エンブレム</h4>'+
    row("shape",EMB_SHAPES,"形")+row("field",EMB_FIELDS,"地の柄")+row("crest",EMB_CRESTS,"紋章")+row("orn",EMB_ORNS,"外装")+row("lay",EMB_LAYS,"文字")+
    '<div class="ce-row"><i>柄の色</i>'+hues.map(h=>'<button class="ce sw'+(e.away===h.id?' on':'')+'" data-act="emb" data-k="away" data-v="'+h.id+'" style="--sw:'+h.hex+'" title="'+h.name+'"></button>').join("")+'</div>'+
    '<div class="ce-acts"><button class="btn btn-sub" data-act="embauto">おまかせ</button><button class="btn btn-main" data-act="contract">この内容で契約する</button></div></section>';
}
const EMB_LABEL={ shield:"盾", round:"丸", oval:"楕円", pointed:"尖り盾", banner:"旗",
  solid:"無地", stripe:"縦縞", half:"左右", quarter:"四分割", sash:"たすき", hoop:"横縞", chevron:"山形", cross:"十字", saltire:"斜め十字",
  none:"なし", star:"星", crown:"王冠", eagle:"鷲", lion:"獅子", horse:"馬", helm:"兜", dragon:"竜", fleur:"百合", cannon:"大砲", griffin:"グリフィン", wyvern:"ワイバーン", athena:"女神",
  laurel:"月桂樹", ribbon:"リボン", wreath:"月桂冠", row:"横", col:"縦", diag:"斜め" };
/** 秘書を選ぶ(任期の始め・CLUB の設定)。口調の見本と、その秘書との親密度を出す */
function secPickHtml(title){
  const S=CL.S;
  return '<section class="card secpick"><h3>'+title+' <small>能力の差はなく、口調だけが違う</small></h3>'+SECS.map(x=>{
    const b=S.sec.bond[x.id]||0, t=TUNING.sec.lv; let lv=0; while(lv<t.length&&b>=t[lv])lv++;
    return '<button class="sp'+(S.sec.id===x.id?' on':'')+'" data-act="secpick" data-v="'+x.id+'"><b>'+x.name+'</b><small>'+x.desc+' ・ '+SEC_LV_LABEL[lv]+'</small>'+
      '<i>「'+SEC_LINES[x.id].hello+'」</i></button>'; }).join("")+'</section>';
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
  if(!S.club&&!S.termOver)return alertBox+contractHtml();
  if(!S.tsetChosen&&!S.termOver){ if(earnedTitles(S).length)return homeHeadHtml()+alertBox+titleSetHtml(); S.tsetChosen=true; }
  if(S.sec&&!S.sec.chosen&&!S.termOver)return homeHeadHtml()+alertBox+secPickHtml("秘書を選ぶ");
  // スポンサー: 契約が無ければ選ぶまで始められない。区切りでは選び直せる(続けてもよい)
  if(S.biz&&S.biz.offers&&!S.biz.sp&&!S.termOver)return homeHeadHtml()+alertBox+spPickHtml(true);
  // 次の試合が主役。その下に WEEKLY NEWS の1行。秘書・スポンサー・改修は、答えや判断が要るときだけ(→docs/14 第2弾)
  return homeHeadHtml()+(S.termOver?termEndHtml():nextTileHtml()+newsLineHtml()+
    (S.biz&&S.biz.offers?(CL.spOpen?spPickHtml(false):spRenewBarHtml()):'')+stadOfferHtml()+(secNeeded(S)?secHtml():''));
}
/** SEASON: リーグの順位と大会 */
/** 大会に出る条件(club.js の entryOk と同じ中身を言葉で) */
const ENTRY_NEED={ NSC:"この周にプレシーズンカップかキングスクラブカップで優勝", W4:"前の周のリーグ4位以内",
  CONTI:"前の周のリーグ2位以内、または前の周にエンタープライズ・キングスクラブ・ナショナルスーパー・W4のどれかで優勝",
  CSC:"この周にコンチネンタルカップで優勝", CT:"前の周のリーグ優勝、または前の周にコンチネンタルカップかW4で優勝",
  JT:"この周にチャンピオンズトロフィーで優勝", ICC:"この周にチャンピオンズトロフィーかコンチネンタルカップで優勝、または前の周にチャンピオンズトロフィーで優勝" };
function seasonHtml(){
  const S=CL.S, L=S.league, order=sortTable(L.table);
  // 順位表は首位・自分の前後・最下位に畳む(「全部見る」で広げる →docs/14 第2弾)
  const mi=order.indexOf("me"), keep=i=>CL.fullTable||i===0||i===order.length-1||Math.abs(i-mi)<=2;
  let gap=false;
  let h='<section class="card"><h3>レギュラーリーグ <small>'+L.done+'/14 節 ・ '+(mi+1)+'位</small></h3><table class="tbl">'+
    '<tr><th></th><th></th><th>試</th><th>勝</th><th>分</th><th>敗</th><th>得失</th><th>点</th></tr>'+
    order.map((id,i)=>{ const r=L.table[id];
      if(!keep(i)){ if(gap)return ""; gap=true; return '<tr class="gap"><td colspan="8">…</td></tr>'; }
      gap=false;
      return '<tr'+(id==="me"?' class="me"':'')+'><td>'+(i+1)+'</td><td class="nm2">'+clubName(id)+'</td><td>'+r.p+
        '</td><td>'+r.w+'</td><td>'+r.d+'</td><td>'+r.l+'</td><td>'+(r.gf-r.ga>0?"+":"")+(r.gf-r.ga)+'</td><td><b>'+r.pts+'</b></td></tr>'; }).join("")+
    '</table><button class="lnk more" data-act="fulltable">'+(CL.fullTable?'畳む':'全部見る')+'</button></section>';
  const stTxt={ wait:"—", in:"出場中", out:"敗退", quit:"棄権", won:"優勝" };
  // 「S の大会への道」は大会表と同じ中身なので、大会表にまとめた(条件は名前の下の行。→docs/14 第2弾)
  // 大会は日程の順に。次の試合の大会に印
  const firstSlot=id=>SCHED.findIndex(x=>x[0]===id), nextComp=SCHED[S.slot]?SCHED[S.slot][0]:null;
  h+='<section class="card"><h3>大会 <small>日程の順 ・ '+S.cyc+'周目 ・ ▶ = 次の試合</small></h3><table class="tbl cups">'+
    CUP_IDS.slice().sort((a,b)=>firstSlot(a)-firstSlot(b)).map(id=>{ const c=S.cups[id], past=SCHED.findIndex(x=>x[0]===id)<S.slot, ok=entryOk(S,id);
      const txt=c.st==="wait"?(past?"出場なし":ok?"出場できる":"条件待ち"):stTxt[c.st];
      const cond=c.st==="wait"&&!past&&!ok&&ENTRY_NEED[id]?'<small class="cond">'+ENTRY_NEED[id]+'</small>':'';
      return '<tr class="st-'+c.st+(c.st==="wait"&&!past&&ok?' ok':'')+'"><td>'+gradeTag(COMPS[id].grade)+'</td><td class="nm2">'+(id===nextComp?'▶ ':'')+COMPS[id].name+cond+'</td><td>'+txt+'</td></tr>'; }).join("")+
    '</table></section>';
  return h;
}
/* ---- トロフィーの棚(→docs/14 §14.20): 全大会のトロフィーを並べ、獲得したものだけ光らせる ---- */
const TROPHY_ORDER=["ICC","CT","JT","LG","CONTI","CSC","W4","KINGS","NSC","ENT","PRE"];      // 格の高い順
const TROPHY_SHORT={ ICC:"インターナショナル", CT:"チャンピオンズ", JT:"ジャパン", LG:"リーグ", CONTI:"コンチネンタル", CSC:"コンチネンタルSC",
  W4:"W4", KINGS:"キングス", NSC:"ナショナルSC", ENT:"エンタープライズ", PRE:"プレシーズン" };
/** 格ごとの形(S = 取っ手の大杯 / リーグ = 盾の皿 / A = 脚の長い杯 / B = 星 / C = 小杯 / D・E = メダル)と金属の色 */
function trophyIconSvg(id,won){
  const g=id==="LG"?"L":COMPS[id].grade, metal=!won?"":g==="S"||g==="L"||g==="A"?"g":g==="B"||g==="C"?"s":"b";
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
function trophyShelfHtml(){
  const S=CL.S, n={}, now={};
  for(const t of S.titles){ n[t.comp]=(n[t.comp]||0)+1; if(t.term===S.term)now[t.comp]=1; }
  const kinds=TROPHY_ORDER.filter(id=>n[id]).length;
  const stop=(o,c)=>'<stop offset="'+o+'" stop-color="'+c+'"/>', grad=(k,cs)=>'<linearGradient id="tm-'+k+'" x1="0" x2="1">'+cs.map((c,i)=>stop(i/(cs.length-1),c)).join("")+'</linearGradient>';
  return '<section class="card troph"><h3>トロフィー <small>獲得 '+kinds+' / '+TROPHY_ORDER.length+' 種 ・ 通算 '+S.titles.length+' 回</small></h3>'+
    '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>'+grad("g",["#8a6414","#ffe9a3","#e2b84a","#7a5510"])+
      grad("s",["#5d6470","#f4f6fa","#b8bec9","#555c68"])+grad("b",["#5a2f10","#f3c08e","#c07a3e","#5a2f10"])+'</defs></svg>'+
    '<div class="tro-grid">'+TROPHY_ORDER.map(id=>'<div class="tro'+(n[id]?' won':'')+'" title="'+COMPS[id].name+'">'+trophyIconSvg(id,!!n[id])+
      '<small>'+TROPHY_SHORT[id]+'</small>'+(n[id]?'<b>×'+n[id]+'</b>':'')+(now[id]?'<i>今期</i>':'')+'</div>').join("")+'</div></section>';
}
/** CLUB: この任期の記録・歴代・設定 */
function clubTabHtml(){
  const S=CL.S, r=S.rec, names=S.titles.filter(t=>t.term===S.term).map(t=>COMPS[t.comp].name);
  return '<section class="card"><h3>この任期 <small>第'+S.term+'任期</small></h3>'+
    '<div class="rec"><div><b>'+r.w+'</b><small>勝</small></div><div><b>'+r.d+'</b><small>分</small></div><div><b>'+r.l+'</b><small>敗</small></div>'+
    '<div><b>'+r.gf+'</b><small>得点</small></div><div><b>'+r.ga+'</b><small>失点</small></div></div>'+
    '<p class="dim">タイトル '+names.length+(names.length?': '+names.join(" / "):'')+'</p>'+
    '<p class="dim">リーグの格 '+S.grade+' ・ 監督ランク '+S.fac+(S.tset?' ・ セットした称号「'+titleOf(S.tset).name+'」':'')+'</p></section>'+
    trophyShelfHtml()+spTileHtml()+bizClubHtml()+secClubHtml()+careerHtml()+settingsHtml();
}
function tabbarHtml(){
  const S=CL.S;
  return '<nav class="tabbar">'+TABS.map(([k,l,ic])=>'<button class="'+(CL.tab===k?'on':'')+'" data-act="tab" data-v="'+k+'">'+
    (TAB_ICON[k]?'<svg class="ico" viewBox="0 0 24 24">'+TAB_ICON[k]+'</svg>':'<i>'+ic+'</i>')+'<span>'+l+'</span></button>').join("")+'</nav>';   // SQUAD に兆しの点は出さない(→docs/14 §14.14)
}
function clubHtml(){
  if(CL.paperI!=null)return paperHtml(CL.paperI);
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
  applyResult(CL.S,CL.W,CL.fx,{ hg:M.home.score, ag:M.away.score, pso:M.pso, layout:null, kp:null, played, onPitch, inj,
    starters:G.meta.starters||[], subs:M.home.subs,
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
  if(act==="tab"){ CL.tab=b.dataset.v; CL.sel=null; CL.sqSel=null; CL.secOpen=false; showClub(); return; }
  if(act==="secpick"){ chooseSec(S,b.dataset.v); CL.secOpen=false; CL.msg=[secOf(S).name+"「"+SEC_LINES[secOf(S).id].hello+"」"]; save(); showClub(true); return; }
  if(act==="secopen"){ CL.secOpen=true; showClub(true); return; }
  if(act==="chatx"){ CL.pick=[]; showClub(true); return; }
  if(act==="chatok"){ CL.chat=null; showClub(true); return; }
  if(act==="chatgo"){ CL.chat=null; CL.strat=true; CL.mabOpen=true; showClub(); return; }   // 最後の1回の結果を見てから戦略方針へ
  if(act==="paper"){ CL.paperI=+b.dataset.i; if(CL.paperI===S.paper.length-1){ S.paperSeen=paperKey(S.paper[CL.paperI]); persist(S); } showClub(); return; }
  if(act==="news"){ CL.paperI=S.paper.length-1; S.paperSeen=paperKey(S.paper[CL.paperI]); persist(S); showClub();
    const g=document.getElementById("ppGossip"); if(g)g.scrollIntoView({ block:"center" }); return; }   // ゴシップ欄から開く
  if(act==="paperclose"){ CL.paperI=null; showClub(); return; }
  if(act==="fulltable"){ CL.fullTable=!CL.fullTable; showClub(true); return; }
  if(act==="none")return;
  if(act==="htset"){ if(!toggleHt(S,b.dataset.v))CL.msg=["ハーフタイムの指示は "+TUNING.ht.max+" つまで"]; save(); showClub(true); return; }
  if(act==="mab"){ if(!toggleMab(S,b.dataset.v))CL.msg=["監督能力は "+TUNING.mab.max+" つまで"]; save(); showClub(true); return; }
  if(act==="mabopen"){ CL.mabOpen=!CL.mabOpen; showClub(true); return; }
  if(act==="tset"){ setTitle(S,b.dataset.v||null); CL.msg=S.tset?["称号「"+titleOf(S.tset).name+"」をセットした("+TITLE_FX[S.tset].desc+")"]:[]; save(); showClub(true); return; }
  if(act==="license"){ const d=CL.draft||{}; if(registerManager(S,d.mname,d.birth)){ CL.draft=null; save(); } else CL.msg=["監督名を入れてください"]; showClub(true); return; }
  if(act==="ctown"||act==="ccolor"){ const c=CL.draft.c; if(act==="ctown")c.town=b.dataset.v; else{ c.color=b.dataset.v; c.emb=Object.assign({},c.emb,{ home:b.dataset.v }); } showClub(true); return; }   // 選んだ色はエンブレムの地の色にも(名前の色の言葉より優先)
  if(act==="emb"){ const c=CL.draft.c; c.emb=Object.assign({},c.emb,{ [b.dataset.k]:b.dataset.v }); showClub(true); return; }
  if(act==="embauto"){ const c=CL.draft.c; c.emb={}; showClub(true); return; }
  if(act==="contract"){ const c=CL.draft&&CL.draft.c;
    if(c&&signClub(S,{ name:c.name, short:c.short, town:c.town, color:c.color,
      emblem:Object.keys(c.emb).length?Object.assign(embDesign("azr",c.name,c.emb,c.color),{ text:undefined }):null })){ CL.draft=null; save(); }
    else CL.msg=["クラブ名を入れてください"]; showClub(true); return; }
  if(act==="stad"){ const r=answerStadium(S,b.dataset.v==="1"); if(r)CL.msg=[r.ok?"スタジアムを改修した: 「"+stadOf(S).name+"」(収容 "+(stadOf(S).cap/10000).toFixed(1)+"万人)":"改修を見送った"]; save(); showClub(true); return; }
  if(act==="spopen"){ CL.spOpen=true; showClub(true); return; }
  if(act==="spsign"||act==="spkeep"){ CL.spOpen=false; }
  if(act==="spsign"||act==="spkeep"){ if(signSponsor(S,+b.dataset.i,act==="spkeep"))CL.msg=[S.biz.sp.name+" と契約した(ユニフォームの胸に "+S.biz.sp.name+")"]; save(); showClub(true); return; }
  if(act==="fac"){ const k=b.dataset.v; if(buildFac(S,k))CL.msg=[FAC_INFO[k].name+" を Lv"+S.biz.fac[k]+" にした("+facEffTxt(k,S.biz.fac[k])+")"]; save(); showClub(true); return; }
  if(act==="secev"){ const r=answerSecEvent(S,+b.dataset.i); if(r){ CL.msg=[r.line].concat(r.up?[r.up]:[]); save(); } showClub(true); return; }
  if(act==="go"){ CL.flow="prep"; CL.comm=null; CL.pick=[]; showClub(); return; }
  if(act==="home"){ CL.flow=null; CL.tab="home"; CL.strat=false; showClub(); return; }
  if(act==="strat"){
    if(commLeft(S)>0&&!CL.armPlay){ CL.armPlay=true; showClub(true); return; }   // 残りがあるときは2度押しで確かめる(→docs/14)
    CL.armPlay=false; CL.strat=true; CL.mabOpen=true; CL.chat=null; CL.pick=[]; showClub(); return;
  }
  if(act==="stratback"){ CL.strat=false; CL.mabOpen=false; showClub(); return; }
  if(act==="play"){ CL.strat=false; CL.mabOpen=false; startFixture(); }
  else if(act==="decline"){ declineCup(S,CL.fx.comp); CL.msg=["棄権した。この枠はフレンドリーマッチになる"]; save(); showClub(true); }
  else if(act==="term"){ startNextTerm(S,CL.W); CL.msg=[]; save(); showClub(); }
  else if(act==="train"){ const i=+b.dataset.i; CL.trSel=CL.trSel===i?null:i; showClub(true); }   // 選ぶだけ。決定は下のボタン(→docs/14)
  else if(act==="trgo"&&CL.trSel!=null){
    const i=CL.trSel, o=trainOptions(S)[i]; CL.trSel=null;
    CL.msg=["練習: "+trainLabel(o)+"("+INT_LABEL[CL.int]+")"].concat(doTraining(S,i,CL.int));
    CL.comm=null; CL.pick=[]; save(); showClub();
  }
  else if(act==="int"){ CL.int=+b.dataset.i; if(CL.int===-1)CL.trSel=null; showClub(true); }
  else if(act==="rest"){ CL.msg=doRest(S); CL.comm=null; CL.pick=[]; CL.int=1; save(); showClub(); }
  else if(act==="cf"){ CL.cf=b.dataset.v; CL.sel=null; showClub(true); }
  else if(act==="cs"){ const o=["rar","no","tot"]; CL.cs=b.dataset.v==="next"?o[(o.indexOf(CL.cs||"rar")+1)%3]:b.dataset.v; showClub(true); }
  else if(act==="card"){ CL.sel=CL.sel===b.dataset.id?null:b.dataset.id; showClub(true); }
  else if(act==="swap"&&CL.sel){
    const out=b.dataset.id, inn=CL.sel;
    if(swapSquad(S,out,inn)){ CL.msg=["登録: "+cname(out)+" → "+cname(inn)+"(次の試合から使える)"]; CL.sel=null; save(); }
    showClub(true);
  }
  else if(act==="sqpick")sqPick(b.dataset.id);
  else if(act==="sqform"){ setForm(S,b.dataset.v); CL.sqSel=null; save(); showClub(true); }
  else if(act==="sqauto"){ autoSquad(S); CL.sqSel=null; CL.msg=[]; save(); showClub(true); sndUi("ok"); }
  else if(act==="sqrole"){ const k=b.dataset.v; CL.sqSel=null; CL.roleMsg=null;
    if(CL.roleSel===k){ if(S.roles[k])CL.roleMsg=setRole(S,k,null); CL.roleSel=null; save(); }   // もう一度押すと解く
    else CL.roleSel=k;
    showClub(true); }
  else if(act==="sqkp"){ const id=b.dataset.id; S.kp=id; save(); showClub(true);
    if(rareOn(S,id))cutIn(CARDS[id],"H");   // レアKP が発動する選手を KP にした(→docs/11)
  }
  else if(act==="comm"){ CL.comm=b.dataset.v; CL.pick=[]; showClub(true); }
  else if(act==="ind"&&CL.pick.length===1){
    const id=CL.pick[0], r=doIndTrain(S,id); chatResult("ind",[id],b.textContent,r,reactOf(S,id,"ind",r.res===1?1:0));
    save(); showClub(true);
  }
  else if(act==="talk"&&CL.pick.length===1){
    const id=CL.pick[0], r=doTalk(S,id); chatResult("talk",[id],b.textContent,r,reactOf(S,id,"talk",0));
    save(); showClub(true);
  }
  else if(act==="pick"){
    const id=b.dataset.id, max=COMM_UI[CL.comm]?COMM_UI[CL.comm].n:1, i=CL.pick.indexOf(id);
    if(i>=0)CL.pick.splice(i,1); else{ if(CL.pick.length>=max)CL.pick.shift(); CL.pick.push(id); }
    showClub(true);
  }
  else if(act==="lounge"&&CL.pick.length===2){
    const who=CL.pick.slice(), r=doLounge(S,who[0],who[1],+b.dataset.i);
    chatResult("lounge",who,b.textContent,r,r.res>=0?reactOf(S,who[0],"lounge",r.res):"");
    save(); showClub(true);
  }
  else if(act==="meet"&&CL.pick.length===1){
    const who=CL.pick.slice(), r=doMeeting(S,who[0],+b.dataset.i);
    chatResult("meet",who,b.textContent,r,r.res>=0?reactOf(S,who[0],"meet",r.res):"");
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
