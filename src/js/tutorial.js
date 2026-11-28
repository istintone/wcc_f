/**
 * チュートリアル(→docs/36)。A = クラブハウスの場面に初めて来たときだけ秘書が案内する / B = 練習試合で試合中の操作を順に。
 * 画面の上に重なる層(#tut)。押すところを光らせて(まわりを暗く)、秘書の顔と吹き出しで1〜2行。TOUCH で次へ、SKIP で全部止める。
 * 見たかどうかは S.tut = { seen:{ 場面:1 }, off, match }
 */
/** クラブハウスの場面ごとの案内。when … その場面か / steps … [光らせる部品, 話すこと] */
const TUT_CLUB=[
  { id:"home", when:()=>CL.tab==="home"&&!CL.flow&&CL.paperI==null&&!!document.querySelector("#club .tile.next"), steps:[
    ["#club .chd","監督、ここがクラブの情報です。OVR はチームの強さ、資金は施設やスタジアムの改修に使えます。"],
    ["#club .tile.next","次の試合です。「試合の準備」から 練習 → コミュニケーション → 視察 → 戦術 の順に進めて、試合に入ります。"],
    ["#club .tabbar","下のメニューで、選手の並び・カード・日程・クラブ・監督の画面を行き来できます。"],
    ["#club .tut-tile","まずは練習試合で、試合中の操作を覚えましょう。結果は記録に残りません。"] ] },
  { id:"train", when:()=>CL.flow==="prep"&&CL.S.g.step==="train", steps:[
    ["#club .ints","① 練習です。まず強さを選びます。強いほど伸びますが、疲れもたまります。疲れたら休養も。"],
    ["#club .trs","次に練習を選んで決めます。グラフは、どの能力が伸びるかの見込みです。"] ] },
  { id:"comm", when:()=>CL.flow==="prep"&&CL.S.g.step!=="train"&&!CL.scout&&!CL.strat, steps:[
    ["#club .tabs.t4","② コミュニケーションです。ラウンジ・ミーティング・声かけ・個別指導の4つから、残りの回数だけ選手と話せます。"],
    ["#club .cm-say","話した選手は、やる気や連携、能力の伸び方が変わります。吹き出しの印は、話したがっている選手です。"] ] },
  { id:"scout", when:()=>CL.flow==="prep"&&CL.scout, steps:[
    ["#club .srep","③ 視察です。わたしが相手を調べた報告書です。親密度が上がると、黒塗りのところも読めるようになります。"],
    ["#club .sr-pitch","予想布陣とメンバーの選手を押すと、相手の選手のカードが見られます。"] ] },
  { id:"strat", when:()=>CL.flow==="prep"&&CL.strat, steps:[
    ["#club .cl-main.prep","④ 戦術です。称号・監督能力・ハーフタイムの指示を選んでから、試合へ進みます。"] ] },
  { id:"squad", when:()=>CL.tab==="squad"&&!CL.flow, steps:[
    ["#sqPitch","SQUAD です。カードを指で引っ張ると、並びを入れ替えたり位置を動かしたりできます。"],
    ["#club [data-act=sqauto]","迷ったら最適配置。今の陣形のまま、いちばん合う並びにします。"],
    ["#club [data-act=kpopen]","キープレイヤー(KP)もここで決めます。試合で発動するスタイルが変わります。"] ] },
  { id:"cards", when:()=>CL.tab==="cards"&&!CL.flow, steps:[
    ["#club .card.coll","CARDS です。試合のあとに引いたカードがここに集まります。押すと大きく見られます。"] ] },
  { id:"season", when:()=>CL.tab==="season"&&!CL.flow, steps:[
    ["#club .cl-main","SEASON です。日程と順位、大会の勝ち上がりが見られます。相手のクラブを押すと、スカウティングレポートが開きます。"] ] },
  { id:"club", when:()=>CL.tab==="club"&&!CL.flow, steps:[
    ["#club .sptile","CLUB です。スポンサーのミッションを達成すると、報酬の効果が始まります。"],
    ["#club .card.facs","資金で施設を建てると、練習や回復が良くなります。"] ] } ];
/** 練習試合の案内(→docs/36 §36.3)。try … その操作をすると次へ */
const TUT_MATCH=[
  ["#cards","練習試合です。盤面のカードを指で引っ張ると、その位置で戦います。1人動かしてみましょう。","move"],
  ["#pad .cross","十字の戦術ボタンです。中央突破・左右のサイド・プレス・カウンターを、試合の流れに合わせて押します。押してみましょう。","ins"],
  ["#btnKp","KP ボタンで、キープレイヤーのスタイルを発動します。押してから選手のカードを選びます。"],
  ["#btnShoot","SHOOT は、押しておくと次のチャンスで撃ちます。もう一度押すと取り消し。押してみましょう。","shoot"],
  ["#btnKeeper","KEEPER は、キーパーへの指示です。前に出て守るか、ゴールを守るか。"],
  ["#bench","控えです。控えのカードを盤面の選手に重ねると、交代できます。"],
  ["","では、キックオフです! 試合が終わったら、クラブハウスに戻りましょう。"] ];
const TUT={ on:false, steps:null, i:0, done:null, wait:null, id:null };
const tutState=S=>S.tut||(S.tut={ seen:{}, off:false, match:false });
/** showClub のたびに呼ぶ。初めての場面なら案内を出す */
function tutCheck(){
  const S=CL.S; if(!S||TUT.on)return;
  const T=tutState(S); if(T.off||S.termOver||!S.mgr||!S.club||!S.biz||!S.biz.sp||(S.sec&&!S.sec.chosen))return;
  if(document.querySelector("#club .kmodal")||(typeof SC!=="undefined"&&SC.el&&/\bon\b/.test(SC.el.className))||CL.chat)return;
  const sc=TUT_CLUB.find(x=>!T.seen[x.id]&&x.when());
  if(!sc)return;
  setTimeout(()=>{ if(TUT.on||T.seen[sc.id]||!sc.when())return;
    T.seen[sc.id]=1; persist(S);
    tutRun(sc.steps.filter(s=>!s[0]||document.querySelector(s[0])).map(s=>({ sel:s[0], text:s[1] })),sc.id,null); },450);   // 画面の入りの動きが済んでから
}
/** 案内を順に出す。fin … 終わったら(飛ばしても)呼ぶ */
function tutRun(steps,id,fin){
  if(!steps.length){ if(fin)fin(); return; }
  Object.assign(TUT,{ on:true, steps, i:0, done:fin, id });
  let el=document.getElementById("tut");
  if(!el){ el=document.createElement("div"); el.id="tut"; document.body.appendChild(el);
    el.addEventListener("click",e=>{
      if(e.target.closest("[data-tut=skip]")){ tutSkipAll(); return; }
      if(!TUT.wait||e.target.closest(".tut-say"))tutNext(); }); }
  tutDraw();
}
function tutDraw(){
  const el=document.getElementById("tut"), st=TUT.steps[TUT.i], S=CL.S; if(!el||!st)return;
  const tg=st.sel?document.querySelector(st.sel):null;
  if(tg){ const r0=tg.getBoundingClientRect(); if(r0.bottom<0||r0.top>innerHeight)tg.scrollIntoView({ block:"center" }); }
  const r=tg?tg.getBoundingClientRect():null, pad=6, low=r&&r.top+r.height/2>innerHeight*0.55;
  TUT.wait=st.wait||null;
  el.className="on"+(TUT.wait?" try":"")+(low?" top":"");
  el.innerHTML=(r?'<i class="tut-hole" style="left:'+(r.left-pad)+'px;top:'+(r.top-pad)+'px;width:'+(r.width+pad*2)+'px;height:'+(r.height+pad*2)+'px"></i>':'<i class="tut-dim"></i>')+
    '<div class="tut-say">'+(typeof secAv==="function"&&S?secAv(S):'')+'<div><b>'+(S?secOf(S).name:'')+'</b><p>'+st.text+'</p>'+
    '<span class="tut-ft"><small>'+(TUT.i+1)+' / '+TUT.steps.length+'</small>'+(TUT.wait?'<em>やってみる</em>':'')+'<u>TOUCH</u></span></div>'+
    '<button class="tut-skip" data-tut="skip">SKIP</button></div>';
}
function tutNext(){
  TUT.i++;
  if(TUT.i<TUT.steps.length){ tutDraw(); return; }
  tutEnd();
}
function tutEnd(){
  const el=document.getElementById("tut"); if(el){ el.className=""; el.innerHTML=""; }
  const f=TUT.done; Object.assign(TUT,{ on:false, steps:null, done:null, wait:null, id:null });
  if(f)f();
}
/** SKIP: 残りのチュートリアルを全部止める(設定からもう一度見られる) */
function tutSkipAll(){
  if(CL.S){ const T=tutState(CL.S); T.off=true; persist(CL.S); }
  tutEnd();
}
/** 「やってみる」の操作をしたら次へ */
function tutAct(k){ if(TUT.on&&TUT.wait===k)setTimeout(tutNext,350); }
/** 設定の「チュートリアルをもう一度見る」 */
function tutReplay(S){ S.tut={ seen:{}, off:false, match:false }; }
/** HOME の練習試合の札 */
function tutTileHtml(){
  const S=CL.S, T=tutState(S); if(T.off||T.match||S.termOver)return "";
  return '<section class="tile tut-tile"><div><small>TUTORIAL MATCH</small><b>練習試合で操作を覚える</b></div>'+
    '<button class="btn btn-main" data-act="tutgo">練習試合</button><button class="btn btn-sub" data-act="tutno">今はしない</button></section>';
}
/** 練習試合を始める(次の試合の相手と。結果は記録に残さない) */
function tutMatchStart(){
  const S=CL.S, fx=CL.fx, m=fixtureMatch(S,fx);
  hideClub();
  newMatch(m.home,m.away,(m.seed^0x5a5a)>>>0,m.opts,{ title:"TUTORIAL MATCH", en:{ name:"TUTORIAL MATCH", round:"" }, tut:true, career:false });
  closeOverlay(); setPlaying(false);
  setTimeout(()=>tutRun(TUT_MATCH.map(s=>({ sel:s[0], text:s[1], wait:s[2] })),"match",()=>{
    overlay("KICK OFF",'<small class="en">TUTORIAL MATCH</small>',TUNING.play.capKick,()=>setPlaying(true)); }),300);
}
/** 練習試合が終わった */
function tutMatchEnd(){
  const S=CL.S; tutState(S).match=true; persist(S);
  showClub();
}
/* 試合中の「やってみる」: 盤面のカードを動かした・十字のボタン・SHOOT */
document.addEventListener("pointerup",()=>{ if(TUT.on&&typeof BD!=="undefined"&&BD.drag&&BD.drag.moved&&!BD.drag.bench)tutAct("move"); },true);
document.addEventListener("click",e=>{ if(!TUT.on||!e.target.closest)return;
  if(e.target.closest("#pad .cross .btn"))tutAct("ins"); else if(e.target.closest("#btnShoot"))tutAct("shoot"); },true);
