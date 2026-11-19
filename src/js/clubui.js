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
  const tok=(id,st)=>{ const c=CARDS[id], g=S.g.pl[id];
    return '<button class="cmt '+c.pos.toLowerCase()+(on.includes(id)?' on':'')+(g&&g.mot===0?' inj':'')+'" data-act="pick" data-id="'+id+'"'+(st||'')+'>'+
      '<b class="rl">'+c.pos+'</b><i class="no">'+c.no+'</i><span class="nm">'+nameOf(c)+'</span>'+
      (hasSign(S,id)?'<em class="sg">！</em>':'')+(g&&g.is?'<em class="gs'+(g.is>=5?' aw':'')+'">★'+g.is+'</em>':'')+
      '<small>'+info(g,id)+'</small></button>'; };
  return '<div class="cm-board"><div class="sq-pitch cm-pitch"><i class="pm half"></i><i class="pm circ"></i><i class="pm pa top"></i><i class="pm pa bot"></i>'+
    xi.filter(id=>ids.includes(id)).map(id=>{ const l=L[id], p=sqPos(l[0],l[1]); return tok(id,' style="left:'+p.l.toFixed(1)+'%;top:'+p.t.toFixed(1)+'%"'); }).join("")+
    '</div><div class="cm-bench">'+S.sq.slice(11).filter(id=>ids.includes(id)).map(id=>tok(id)).join("")+'</div></div>';
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
    return ic+" "+LINK_LABEL[l.lv]+(l.lv>=2?(l.gold?"・兆し":""):" "+Math.floor(linkProgress(CL.S,a,id)*100)+"%"); } },
  talk:  { sub:"やる気・ケガ", n:1, hint:"1人を選ぶ(落ちている選手ほど大きく戻る。ケガの選手は手当てで治る)", info:g=>MOT_LABEL[g.mot] }
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
  h+='<p class="dim">'+U.hint+'</p>'+commBoardHtml(all,CL.pick,U.info);
  if(CL.pick.length===U.n){
    const id=CL.pick[0];
    h+='<div class="ask">'+CL.pick.map(x=>'<p class="voice"><b>'+cname(x)+'</b>「'+voiceOf(S,x)+'」<small>信頼度: '+
      TRUST_LABEL[trustLv(S.g.pl[x])]+'</small></p>').join("");
    if(CL.comm==="lounge"){
      const f=loungeInfo(S,CL.pick[0],CL.pick[1]);
      const bo=linkBonusOf(CL.pick[0],CL.pick[1]);
      h+='<p class="dim">'+CL.pick.map(x=>cname(x)+' '+aniTxt(CARDS[x])+' ・ '+natTxt(CARDS[x])).join('<br>')+'</p>'+
        (bo.length?'<p class="bonus">'+bo.map(t=>'<b>'+BONUS_LABEL[t]+'</b>').join("")+' 連携が付きやすい</p>':'');
      h+='<p><b>'+cname(CL.pick[0])+'</b> と <b>'+cname(CL.pick[1])+'</b> ・ いま: '+LINK_LABEL[f.lv]+
        (f.gold?'(黄金線の兆し)':'')+'</p><p class="hint">'+f.hint+'</p>'+
        f.choices.map((t,i)=>'<button class="btn ch" data-act="lounge" data-i="'+i+'">'+t+'</button>').join("");
    }else if(CL.comm==="meet"){
      const f=meetInfo(S,id);
      h+='<p><b>'+cname(id)+'</b> ・ 特殊能力 '+stars(f.ss)+' ・ 経験 '+Math.min(Math.floor(f.se),f.need)+'/'+f.need+'</p>'+
        '<p class="dim near">'+(f.near.length?'周りで聞く選手: '+f.near.map(cname).join("・")+'(経験が少し入る。★突破の成否はやる気にも響く)'
          :'周りで聞く選手はいない(連携のある選手と、先発なら盤面で近い選手にも効く)')+'</p>';
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
        '<button class="btn ch" data-act="talk">'+(p.mot===0?'ケガを手当てする':'ケアする')+'</button>';
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
    '<div class="cl-main prep">'+msgHtml()+(st==="train"?trainStepHtml():commStepHtml())+mabHtml()+'</div>'+
    '<footer class="prep-bot">'+
      (st==="train"?'<span class="dim">練習を1つ選ぶと次へ進む</span>'
        :(commLeft(CL.S)?'<button class="btn btn-sub go-soft" data-act="play">試合へ(コミュニケーションはあと '+commLeft(CL.S)+' 回)</button>':'<button class="btn btn-main" data-act="play">試合へ</button>'))+
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
    (g&&g.is?'<i class="gs'+(g.is>=5?' aw':'')+'">★'+g.is+'</i>':'')+
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
    '<div class="sd-row"><span>'+natTxt(c)+'</span><span>'+aniTxt(c)+'</span></div>'+
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
    '<i class="k-band"></i><div class="k-art">'+poseSvg(c)+'</div>'+
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
/** 選んだカードの詳細と、登録の入れ替え */
function cardDetailHtml(id){
  const S=CL.S, c=CARDS[id], st=styleOfCard(c), sk=c.skill?SKILLS[c.skill]:null, inSq=S.sq.includes(id);
  let h='<div class="kdet">'+cardHtml(id,"m")+'<div class="kinfo">'+
    '<p class="kmeta"><b>'+cardNoOf(c)+'</b> '+RAR_TAG[c.rar||"B"]+' ・ '+clubOfCard(c)+' #'+c.no+' ・ 合計 <b>'+statTotal(c)+'</b></p>'+
    '<div class="sts">'+STATS.map(k=>'<span class="st"><i>'+STAT_LABEL[k]+'</i><b>'+c[k]+'</b><em><u style="width:'+(c[k]/STAT_MAX*100)+'%"></u></em></span>').join("")+'</div>'+
    '<p><b>★'+(sk?sk.label:"")+'</b> '+(sk?sk.desc:"")+'</p>'+
    (st?'<p><b>KP: '+st.name+'</b> <small>'+(st.scope==="team"?"全体":"個人")+'・'+AXIS_LABEL[st.axis]+'</small><br>'+
      '<span class="get">○ '+st.get+'</span>'+(st.lose?'<br><span class="lose">× '+st.lose+'</span>':'')+'</p>':'')+
    '<p class="dim">得意: '+c.roles.join(" / ")+' ・ 持っている枚数 '+(S.coll[id]||0)+'</p>'+
    '<p class="dim">国籍: '+natTxt(c)+' ・ 動物: '+aniTxt(c)+'</p>'+
    (dupOf(S,id)?'<p class="dup">重なり ×'+dupOf(S,id)+': 個別指導の経験 +'+Math.round(TUNING.grow.dup.indK*dupOf(S,id)*100)+'% ・ 覚醒の上がり幅が大きくなりやすい</p>':'')+'</div></div>';
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
    '<div class="tabs t5">'+["ALL","GK","DF","MF","FW"].map(k=>'<button class="tab'+(CL.cf===k?' on':'')+'" data-act="cf" data-v="'+k+'">'+
      (k==="ALL"?"全部":k)+'</button>').join("")+'</div>'+
    '<div class="tabs t3 sorts">'+[["rar","レア順"],["no","No.順"],["tot","合計順"]].map(([k,t])=>'<button class="tab'+((CL.cs||"rar")===k?' on':'')+
      '" data-act="cs" data-v="'+k+'">'+t+'</button>').join("")+'</div>';
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
  return '<header class="chd">'+emblemSvg(myTeam(S),30)+'<div><b>'+myTeam(S).name+'</b><small>'+(S.mgr?'監督 '+S.mgr.name+(S.mgr.ani!=null?ANI_ICON[S.mgr.ani]:'')+' ・ ':'')+(S.tset?'「'+titleOf(S.tset).name+'」 ・ ':'')+'第'+S.term+'任期 ・ 格 '+S.grade+
    ' ・ ランク '+S.fac+(last?' ・ 「'+last+'」':'')+'</small></div>'+
    '<div class="num pw"><b>'+teamPower(S).toFixed(1)+'<i>'+powDelta(S)+'</i></b><small>チーム力</small></div>'+
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
    '<div class="nx-go">› '+go+'</div></section>';
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
/** スタジアムの絵。段が上がるほどスタンドが高く広くなり、照明塔と屋根が付く(独自の意匠) */
function stadiumSvg(lv){
  const st=(x,w,h,c)=>'<rect x="'+x+'" y="'+(92-h)+'" width="'+w+'" height="'+h+'" fill="'+c+'"/>'+
    '<g stroke="rgba(255,255,255,.35)" stroke-width="1">'+Array.from({ length:Math.floor(h/6) },(_,i)=>'<line x1="'+x+'" x2="'+(x+w)+'" y1="'+(92-h+4+i*6)+'" y2="'+(92-h+4+i*6)+'"/>').join("")+'</g>';
  let g='<rect x="0" y="0" width="300" height="120" fill="#cfe6f5"/><rect x="0" y="92" width="300" height="28" fill="#3f8f4a"/>'+
    '<rect x="70" y="96" width="160" height="16" fill="none" stroke="#fff" stroke-width="1.5"/><line x1="150" y1="96" x2="150" y2="112" stroke="#fff" stroke-width="1.5"/>';
  const H=[0,14,24,36,52,58][lv]||14, side=lv>=2;
  g+=st(20,lv>=4?110:80,H,"#8a1c2b")+(side?st(lv>=4?170:200,lv>=4?110:80,H,"#8a1c2b"):'');
  if(lv>=4)g+=st(130,40,H-8,"#6e1622");
  if(lv>=3)[12,288].forEach(x=>{ g+='<line x1="'+x+'" y1="92" x2="'+x+'" y2="'+(lv>=4?18:28)+'" stroke="#555" stroke-width="3"/>'+
    '<rect x="'+(x-8)+'" y="'+(lv>=4?12:22)+'" width="16" height="7" fill="#fff6c8" stroke="#555"/>'; });
  if(lv>=5)g+='<path d="M14 '+(92-H-2)+' Q150 '+(92-H-26)+' 286 '+(92-H-2)+'" fill="none" stroke="#d8dde3" stroke-width="7"/>'+
    '<path d="M14 '+(92-H-2)+' Q150 '+(92-H-26)+' 286 '+(92-H-2)+'" fill="none" stroke="#8d97a3" stroke-width="1.5"/>';
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
function spMiniHtml(){
  const S=CL.S, sp=S.biz&&S.biz.sp; if(!sp||S.termOver)return "";
  const done=sp.ms.filter(m=>m.done).length, on=SP_IND.filter(x=>S.biz.boost[x.eff]>0).map(x=>spItem(x,S.biz.boostRank[x.eff]||1)+" 残り"+S.biz.boost[x.eff]);
  return '<button class="tile sp-mini" data-act="tab" data-v="club"><span class="logo r'+sp.rank+'">'+sp.name+'</span>'+
    '<small>ミッション '+done+'/'+sp.ms.length+(on.length?' ・ '+on.join(" ・ "):'')+'</small><b>›</b></button>';
}
/** CLUB のスポンサーの欄(胸ロゴとミッションの進み) */
function spTileHtml(){
  const S=CL.S, sp=S.biz&&S.biz.sp; if(!sp||S.termOver)return "";
  return '<section class="tile sptile"><h3><span class="logo r'+sp.rank+'">'+sp.name+'</span></h3><div class="spo r'+sp.rank+'">'+spCardHtml(sp)+'</div>'+spBoostHtml()+'</section>';
}
/** CLUB のスタジアムと施設の欄 */
function bizClubHtml(){
  const S=CL.S, Z=S.biz; if(!Z)return "";
  const sd=stadOf(S), nx=TUNING.biz.stad[Z.stad];
  let h='<section class="card stad"><h3>スタジアム <small>Lv'+Z.stad+' ・ '+sd.name+'</small></h3>'+stadiumSvg(Z.stad)+
    '<p>収容 <b>'+(sd.cap/10000).toFixed(1)+'万人</b> ・ ファン <b>'+(Z.fans/10000).toFixed(1)+'万人</b>'+(Z.att?' ・ 前のホーム '+(Z.att/10000).toFixed(1)+'万人':'')+'</p>'+
    '<p class="dim">'+(nx?'次の改修: 「'+nx.name+'」'+nx.cost+'億(資金がたまるか、優勝・昇格のときに秘書が知らせる)':'これ以上の改修はない')+'</p></section>';
  h+='<section class="card facs"><h3>施設 <small>資金 '+S.money.toFixed(0)+'億 ・ 育成に効く</small></h3>'+FAC_KEYS.map(k=>{
    const lv=Z.fac[k], c=facCost(S,k), f=FAC_INFO[k];
    return '<div class="fac"><div><b>'+f.name+' <i>Lv'+lv+'</i></b><small>'+f.eff+(lv?'(いま '+facEffTxt(k,lv)+')':'')+'</small></div>'+
      (c==null?'<span class="dim">最大</span>':'<button class="btn btn-sub" data-act="fac" data-v="'+k+'"'+(S.money<c?' disabled':'')+'>'+c+'億で'+(lv?'上げる':'建てる')+'</button>')+'</div>'; }).join("")+'</section>';
  return h;
}
const facEffTxt=(k,lv)=>k==="med"?"疲労の残り ×"+TUNING.biz.medFat[lv]+"・ケガが治る率 +"+Math.round(TUNING.biz.medHeal[lv]*100)+"%"
  :"経験 ×"+TUNING.biz.facK[lv];
/* ---- 監督能力(→docs/10 §10.2 C)。準備の画面の下で、1試合に3つまでセットする ---- */
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
/** 前の試合(要約) */
function lastHtml(){
  const S=CL.S, L=S.last;
  if(!L)return "";
  const lines=L.lines.filter(x=>!/^カード:/.test(x)).slice(0,3);
  return '<section class="tile last"><h3>前の試合 <small>'+COMPS[L.comp].name+' '+(L.label||"")+'</small></h3>'+
    '<div class="ls"><div class="ls-sc">'+myTeam(S).short+' <b>'+L.hg+' - '+L.ag+'</b> '+clubShort(L.opp)+
      (L.pso?'<small>PK '+L.pso[0]+'-'+L.pso[1]+'</small>':'')+'</div>'+
      (L.card?'<div class="ls-card">'+cardHtml(L.card,"s")+'</div>':'')+'</div>'+
    (lines.length?'<ul>'+lines.map(x=>'<li>'+x+'</li>').join("")+'</ul>':'')+'</section>';
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
  return homeHeadHtml()+(S.termOver?termEndHtml():nextTileHtml()+(S.biz&&S.biz.offers?(CL.spOpen?spPickHtml(false):spRenewBarHtml()):'')+
    stadOfferHtml()+secHtml()+spMiniHtml()+lastHtml());
}
/** SEASON: リーグの順位と大会 */
/** 大会に出る条件(club.js の entryOk と同じ中身を言葉で) */
const ENTRY_NEED={ NSC:"この周にプレシーズンカップかキングスクラブカップで優勝", W4:"前の周のリーグ4位以内",
  CONTI:"前の周のリーグ2位以内、または前の周にエンタープライズ・キングスクラブ・ナショナルスーパー・W4のどれかで優勝",
  CSC:"この周にコンチネンタルカップで優勝", CT:"前の周のリーグ優勝、または前の周にコンチネンタルカップかW4で優勝",
  JT:"この周にチャンピオンズトロフィーで優勝", ICC:"この周にチャンピオンズトロフィーかコンチネンタルカップで優勝、または前の周にチャンピオンズトロフィーで優勝" };
function seasonHtml(){
  const S=CL.S, L=S.league, order=sortTable(L.table);
  let h='<section class="card"><h3>レギュラーリーグ <small>'+L.done+'/14 節</small></h3><table class="tbl">'+
    '<tr><th></th><th></th><th>試</th><th>勝</th><th>分</th><th>敗</th><th>得失</th><th>点</th></tr>'+
    order.map((id,i)=>{ const r=L.table[id];
      return '<tr'+(id==="me"?' class="me"':'')+'><td>'+(i+1)+'</td><td class="nm2">'+clubName(id)+'</td><td>'+r.p+
        '</td><td>'+r.w+'</td><td>'+r.d+'</td><td>'+r.l+'</td><td>'+(r.gf-r.ga>0?"+":"")+(r.gf-r.ga)+'</td><td><b>'+r.pts+'</b></td></tr>'; }).join("")+
    '</table></section>';
  const stTxt={ wait:"—", in:"出場中", out:"敗退", quit:"棄権", won:"優勝" };
  // S の大会への道(→docs/09 第4弾): S の大会に出る条件と、いま満たしているか
  const sIds=CUP_IDS.filter(id=>COMPS[id].grade==="S");
  h+='<section class="card road"><h3>S の大会への道 <small>'+S.cyc+'周目</small></h3>'+sIds.map(id=>{ const c=S.cups[id], ok=c.st!=="wait"||entryOk(S,id);
    return '<p class="'+(ok?'ok':'')+'">'+gradeTag("S")+'<b>'+COMPS[id].name+'</b><span>'+(c.st==="won"?"優勝":c.st==="in"?"出場中":ok?"出場できる":"条件: "+ENTRY_NEED[id])+'</span></p>'; }).join("")+'</section>';
  // 大会は日程の順に。次の試合の大会に印
  const firstSlot=id=>SCHED.findIndex(x=>x[0]===id), nextComp=SCHED[S.slot]?SCHED[S.slot][0]:null;
  h+='<section class="card"><h3>大会 <small>日程の順 ・ ▶ = 次の試合</small></h3><table class="tbl cups">'+
    CUP_IDS.slice().sort((a,b)=>firstSlot(a)-firstSlot(b)).map(id=>{ const c=S.cups[id], past=SCHED.findIndex(x=>x[0]===id)<S.slot;
      const txt=c.st==="wait"?(past?"出場なし":entryOk(S,id)?"出場できる":"条件: "+(ENTRY_NEED[id]||"—")):stTxt[c.st];
      return '<tr class="st-'+c.st+'"><td>'+gradeTag(COMPS[id].grade)+'</td><td class="nm2">'+(id===nextComp?'▶ ':'')+COMPS[id].name+'</td><td>'+txt+'</td></tr>'; }).join("")+
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
    spTileHtml()+bizClubHtml()+secClubHtml()+careerHtml()+settingsHtml();
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
  const inj=M.events.filter(e=>e.type==="injury"&&e.side==="H").map(e=>e.by);
  applyResult(CL.S,CL.W,CL.fx,{ hg:M.home.score, ag:M.away.score, pso:M.pso, layout:null, kp:null, played, onPitch, inj,
    starters:G.meta.starters||[], subs:M.home.subs,
    kpCh:M.events.filter(e=>e.type==="kp"&&e.side==="H").length });
  persist(CL.S);
  const L=CL.S.last;
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
  if(onSettingsClick(act,b))return;
  if(act==="tab"){ CL.tab=b.dataset.v; CL.sel=null; CL.sqSel=null; CL.secOpen=false; showClub(); return; }
  if(act==="secpick"){ chooseSec(S,b.dataset.v); CL.secOpen=false; CL.msg=[secOf(S).name+"「"+SEC_LINES[secOf(S).id].hello+"」"]; save(); showClub(true); return; }
  if(act==="secopen"){ CL.secOpen=true; showClub(true); return; }
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
    const id=CL.pick[0], r=doTalk(S,id); CL.msg=CL.msg.concat(["ケア"],r.lines,[reactOf(S,id,"talk",0)]);
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
