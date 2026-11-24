/* =========================================================================
   wcc_f — クラブ新聞(→docs/07 §7.13)。試合が終わったら、その試合の記事を1つ作って残す。
   ヨーロッパのタブロイド紙のような見出しと、ゴシップ欄。**文の型に試合の中身を当てはめて作る**(同じ試合なら毎回同じ文)。
   DOM に触らない(作るのは記事のデータだけ。紙面の HTML は clubui.js の paperHtml)。
   S.paper = [記事](新しいものが後ろ。最大 TUNING.paper.max 件)
   ========================================================================= */

const PAPER_HEAD={
  title:  ["【栄冠】{me}、{comp}を制す！ 歓喜の夜","頂点へ！ {me}が{comp}の王者に"],
  rout:   ["{me}、{opp}を粉砕！ {gf}発の大勝劇","止まらない！ {me}が{opp}に{gf}ゴールの圧勝"],
  win:    ["{me}、{opp}を下す ― 殊勲は{mvp}","勝ち点3！ {mvp}の活躍で{me}が{opp}に勝利"],
  pkwin:  ["PK戦の死闘を制す！ {me}、執念の勝利","11メートルの攻防 {me}が{opp}を振り切る"],
  draw:   ["痛み分け {me}と{opp}、勝ち点1を分け合う","決め手を欠いた{me} {opp}とドロー"],
  pklose: ["PK戦の末に涙… {me}、{opp}に屈す","非情の11メートル {me}の挑戦はここまで"],
  lose:   ["{me}、{opp}に惜敗 {mgr}監督「次は勝つ」","あと一歩… {me}、{opp}に競り負ける"],
  crash:  ["悪夢！ {me}、{opp}に完敗 スタンドからため息","まさかの大敗 {me}に何が起きたのか"]
};
const PAPER_QUOTE={
  win:  ["選手たちを誇りに思う。","内容にも満足している。次も同じように戦うだけだ。","まだ完璧ではない。だが、勝ちは勝ちだ。"],
  draw: ["悪くはなかったが、勝ち切らなければならなかった。","次に向けて修正する。"],
  lose: ["責任は私にある。","今日の結果は受け止める。だが、下を向くつもりはない。","サポーターに申し訳ない。次で取り返す。"]
};
const PAPER_RUMOR=["{p}に国外のビッグクラブが関心か? 関係者は「ノーコメント」","{p}、練習後も居残りでシュート練習 ― 目撃情報",
  "{mgr}監督、深夜までビデオ分析か クラブハウスの明かりが消えない","{p}の新しい髪型が話題に ― 本人は「験担ぎ」と笑う",
  "秘書の{sec}さん、試合前にスタジアム周辺でサポーターと記念撮影","{p}と{q}、オフに一緒に食事か 連携の秘密はここに?",
  "{town}の街で{me}のユニフォームが品薄に"];

/* ---- 一面の話題(→docs/14 §14.135)。試合の結果だけでなく、その試合のあとに起きたいちばん大きな話題を一面にする ----
 * 優先: 優勝 > 覚醒 > 昇格 > 新加入 > スタジアム > 施設拡充 > スター誕生 > カップ戦突破 > (ときどき)次の相手の分析 > 試合の結果
 * 新加入・スタジアム・施設は試合の外で起きるので、起きたときに S.pnews に積んでおき、次の号で使う */
const PAPER_TOPIC={
  awaken:{ tag:"ESCLUSIVA", head:["覚醒！ {p}、別次元へ","{p}が覚醒 ― 指揮官も「想像以上だ」","もう誰にも止められない {p}、ついに目覚める"],
    sub:["練習場で異次元の動き。{me}に新たな切り札が生まれた","チームメイトも驚く変貌ぶり。次の試合で真価が問われる"],
    lead:["{pos}の{p}({age}歳)がついに覚醒した。関係者によれば、ここ数週間の練習から「何かが違う」と噂になっていたという。{mgr}監督は多くを語らないが、起用法に変化があるかもしれない。",
          "これまで{me}を支えてきた{p}が、殻を破った。持ち味にさらに磨きがかかり、練習ではベテランをも圧倒。{town}のサポーターの期待は高まるばかりだ。"] },
  promo:{ tag:"PROMOZIONE", head:["{me}、{div}へ昇格！","昇格決定 {me}が次のステージへ","{town}が歓喜 {me}、{div}の扉を開く"],
    sub:["{mgr}監督の下、一丸となってつかんだ昇格","より強い相手との戦いが待つ。真価が問われるのはここから"],
    lead:["{me}が{div}への昇格を決めた。最終節までもつれた争いを制し、クラブは新たな舞台へ。{mgr}監督は「選手たちが自分たちの力で勝ち取った」と胸を張った。"] },
  join:{ tag:"MERCATO", head:["新戦力 {p}、{me}に加入","{me}が{p}を獲得 ― {pos}の補強に成功","電撃加入！ {p}が{me}のユニフォームに袖を通す"],
    sub:["{club}から加わった{age}歳。{mgr}監督の構想の中心に","即戦力の補強。ポジション争いがさらに激しくなる"],
    lead:["{me}は{p}の加入を発表した。{club}でプレーしてきた{age}歳の{pos}で、{rar}のカード。クラブ関係者は「チームに足りなかったピース」と期待を寄せる。"] },
  stad:{ tag:"CLUB", head:["新スタジアム「{st}」がお披露目","{me}の本拠地が生まれ変わる 収容{cap}万人に","{town}に新たな聖地 ― {st}"],
    sub:["より多くのサポーターが {me} の戦いを見届ける","改修でファンの熱も一段と高まりそうだ"],
    lead:["{me}の本拠地が「{st}」へと改修された。収容人数は{cap}万人。入場料収入の増加も見込まれ、クラブの経営にも追い風となりそうだ。"] },
  fac:{ tag:"CLUB", head:["{me}、{fac}を拡充","{fac}がリニューアル ― {me}の本気度","設備投資の加速 {me}の{fac}がLv{lv}に"],
    sub:["{eff}。選手の成長に期待がかかる","クラブは育成への投資を惜しまない"],
    lead:["{me}は{fac}をLv{lv}へと拡充した。{eff}とされ、選手たちからも歓迎の声が上がっている。{mgr}監督は「環境は整った。あとは結果で示すだけ」と話した。"] },
  star:{ tag:"PERSONAGGIO", head:["{p}、スターの階段を駆け上がる","街は{p}一色 ― ユニフォームが品切れ","新たなスター誕生 {p}の名が響く"],
    sub:["大一番での活躍で、一躍{town}の顔に","スポンサーの視線も熱い。人気は留まるところを知らない"],
    lead:["{p}の人気が止まらない。大舞台での活躍で一気に注目を集め、{town}の街では{p}の名を口にするサポーターが後を絶たない。クラブにとっても収入面で大きな追い風だ。"] },
  cup:{ tag:"COPPA", head:["{comp}、{label}突破！","{me}、{comp}で勝ち上がる","{comp}の頂点へ一歩前進 {me}が{opp}を下す"],
    sub:["次の相手も手強い。勢いをどこまで保てるか","トロフィーまであと少し。{town}の期待が膨らむ"],
    lead:["{me}が{comp}の{label}を突破した。{opp}との一戦を制し、次のラウンドへ駒を進める。{mvp}の活躍が光った。"] },
  preview:{ tag:"ANALISI", head:["次の相手は{nopp} ― 徹底分析","{nopp}を丸裸に 鍵を握るのは{nkp}","要注意！ {nopp}の{nkp}を止められるか"],
    sub:["{ncomp}で激突。{me}はどう立ち向かうのか","{nkp}を封じれば勝機はある ― 本紙の分析"],
    lead:["{me}の次の相手は{nopp}。{nstr}と評されるチームで、注目はKPの{nkp}({nst})。{mgr}監督がどんな対策を打つか、戦術にも注目が集まる。"] }
};
const POS_JA={ GK:"ゴールキーパー", DF:"ディフェンダー", MF:"ミッドフィルダー", FW:"フォワード" };
/** 試合の外で起きたこと(新加入・スタジアム・施設)を次の号のために積む */
function paperNews(S,n){ (S.pnews||(S.pnews=[])).push(n); if(S.pnews.length>8)S.pnews.shift(); }

/** 文の型の {キー} を当てはめる */
const paperFill=(t,v)=>String(t).replace(/\{(\w+)\}/g,(m,k)=>v[k]!=null?v[k]:m);

/**
 * 試合の記事を作る。M は終わった試合、L は S.last(applyResult が作る)、RT は採点(matchRatings)
 * 返り値 { no, term, comp, label, opp, hg, ag, pso, kind, head, sub, lead, quote, side:[ゴシップ], mvp:{ id, r }, photo:選手の id }
 */
function makeArticle(S,M,L,RT){
  const rng=mulberry32((S.seed^hashStr("paper:"+S.term+":"+S.played))>>>0), pick=a=>a[Math.floor(rng()*a.length)];
  const me=S.club?S.club.name:TEAMS.azr.name, opp=teamNameOf(TEAMS[L.opp]||{ name:L.opp }), comp=COMPS[L.comp].name;
  const hg=L.hg, ag=L.ag, pso=L.pso, d=hg-ag, won=d>0||(d===0&&pso&&pso[0]>pso[1]), lost=d<0||(d===0&&pso&&pso[0]<pso[1]);
  const title=L.lines.some(x=>/^🏆 /.test(x));
  const mine=RT.list.filter(x=>x.side==="H").sort((a,b)=>b.r-a.r), mvp=mine[0]||null;
  const scorers=M.events.filter(e=>e.type==="shot"&&e.res==="goal"&&e.side==="H").map(e=>nameOf(CARDS[e.by])+"("+e.min+"分)");
  const kind=title?"title":pso&&won?"pkwin":pso&&lost?"pklose":d>=3?"rout":d>0?"win":d===0?"draw":d<=-3?"crash":"lose";
  const v={ me, opp, comp, gf:hg, mvp:mvp?nameOf(CARDS[mvp.id]):"", mgr:S.mgr?S.mgr.name:"",
    sec:typeof secOf==="function"&&S.sec?secOf(S).name:"", town:S.club?S.club.town:"", p:mvp?nameOf(CARDS[mvp.id]):"" };
  const head=paperFill(pick(PAPER_HEAD[kind]),v);
  const sub=comp+(L.label?" "+L.label:"")+" ・ "+me+" "+hg+" - "+ag+" "+opp+(pso?"(PK "+pso[0]+"-"+pso[1]+")":"");
  const lead=(scorers.length?"得点は "+scorers.join("・")+"。":"この日は無得点に終わった。")+
    (mvp?" 採点では "+nameOf(CARDS[mvp.id])+" が "+mvp.r.toFixed(1)+" でチーム最高。":"");
  const quote=S.mgr?S.mgr.name+"監督「"+pick(PAPER_QUOTE[won?"win":lost?"lose":"draw"])+"」":"";
  // ゴシップ欄: 育成・ケガ・ミッション・スタジアムの知らせ + うわさ話1つ
  const side=[];
  // 黄金期の到来(この試合の前の練習で、成長グラフの金色が3つそろった。→docs/15 §15.3)
  if(S.g&&S.g.goldenAt!=null&&S.g.goldenAt===S.played-1)side.push("【黄金期到来】"+me+"の成長グラフが黄金に！ 全員が絶好調、手が付けられない");
  for(const x of L.lines){
    // タグ(→docs/23): 付いたタグをゴシップに
    { const m=/^🏷 (.+?) に「(.+?)」/.exec(x); if(m&&side.length<3)side.push("【噂】"+m[1]+" に「"+m[2]+"」の声"); }
    if(/^🏷 .*再現といわれています/.test(x))side.push("【特集】"+x.replace(/^🏷 /,"").replace(/(。|\().*$/,""));
    if(/が覚醒/.test(x))side.push("【独占】"+x.replace(/^⭐ /,"")+" 練習場で異次元の動き");
    else if(/★5 に/.test(x))side.push("【分析】"+x.replace(/^⭐ /,""));
    else if(/黄金の輝き/.test(x))side.push("【話題】"+x.replace(/^✨ /,"")+" ― 名コンビ誕生か");
    else if(/がケガ/.test(x))side.push("【速報】"+x.replace(/^🩹 /,"").replace(/(.*?)がケガ.*/,"$1が負傷 全治は未定か"));
    else if(/ミッション達成/.test(x))side.push("【スポンサー】"+x.replace(/^📣 /,""));
    else if(/スタジアムを改修|ファンが/.test(x))side.push("【クラブ】"+x);
  }
  const q=mine[1]?nameOf(CARDS[mine[1].id]):v.p;
  if(v.p)side.push("【うわさ】"+paperFill(pick(PAPER_RUMOR),Object.assign({},v,{ q })));
  const art={ no:S.played, term:S.term, comp:L.comp, label:L.label||"", opp:L.opp, hg, ag, pso:pso||null, kind, topic:"match",
    head, sub, lead, quote, side:side.slice(0,4), mvp:mvp?{ id:mvp.id, r:mvp.r }:null, photo:mvp?mvp.id:null };
  paperTopic(S,L,art,v,pick,rng);
  return art;
}
/** 一面の話題を選び、見出し・リード・写真を差し替える(試合の結果は art.brief に残す) */
function paperTopic(S,L,art,v,pick,rng){
  if(art.kind==="title"){ S.pnews=[]; return; }   // 優勝は試合の記事が主役
  const pc=id=>{ const c=CARDS[id]; return { p:nameOf(c), pos:POS_JA[c.pos]||c.pos, age:c.age||"", club:typeof clubOfCard==="function"?clubOfCard(c):"", rar:typeof RAR_TAG!=="undefined"?RAR_TAG[c.rar||"W"]:"" }; };
  const find=re=>{ for(const x of L.lines){ const m=re.exec(x); if(m)return m; } return null; };
  const news=S.pnews||[]; S.pnews=[];
  let t=null, x={}, photo=art.photo;
  let m;
  if((m=find(/^⭐ (.+?) が覚醒/))){ const id=S.sq.find(i=>nameOf(CARDS[i])===m[1]); if(id){ t="awaken"; x=pc(id); photo=id; } }
  if(!t&&find(/^⬆ 昇格/)&&typeof divName==="function"){ t="promo"; x={ div:divName(S.grade+1) }; }
  if(!t){ const j=news.filter(n=>n.t==="join"&&CARDS[n.id]).pop(); if(j){ t="join"; x=pc(j.id); photo=j.id; } }
  if(!t){ const n=news.filter(n=>n.t==="stad").pop(); if(n&&typeof TUNING!=="undefined"){ const sd=TUNING.biz.stad[n.lv-1]; t="stad"; x={ st:sd.name, cap:(sd.cap/10000).toFixed(1), lv:n.lv }; photo=null; art.stadLv=n.lv; } }
  if(!t){ const n=news.filter(n=>n.t==="fac").pop(); if(n&&typeof FAC_INFO!=="undefined"&&FAC_INFO[n.k]){ t="fac"; x={ fac:FAC_INFO[n.k].name, lv:n.lv, eff:FAC_INFO[n.k].eff }; photo=null; art.stadLv=S.biz?S.biz.stad:1; } }
  if(!t&&(m=find(/^🏷 (.+?) に「スター選手」/))){ const id=S.sq.find(i=>nameOf(CARDS[i])===m[1]); if(id){ t="star"; x=pc(id); photo=id; } }
  if(!t&&COMPS[L.comp]&&COMPS[L.comp].kind!=="league"&&L.comp!=="FR"&&L.comp!=="LG"&&art.kind!=="lose"&&art.kind!=="crash"&&art.kind!=="pklose"&&art.kind!=="draw"&&L.label&&!/グループ/.test(L.label)){ t="cup"; }
  if(!t&&typeof upcoming==="function"&&rng()<0.3){
    const nx=(upcoming(S,1)||[])[0], T=nx&&nx.opp&&TEAMS[nx.opp];
    if(T&&T.kp&&CARDS[T.kp]){ const st=typeof styleOfCard==="function"?styleOfCard(CARDS[T.kp]):null, tr=typeof tierOf==="function"?tierOf(nx.opp):3;
      t="preview"; x={ nopp:teamNameOf(T), nkp:nameOf(CARDS[T.kp]), nst:st?st.name:"", ncomp:COMPS[nx.comp]?COMPS[nx.comp].name:"", nstr:["発展途上","中堅","粘り強い","上位をうかがう","優勝候補の"][Math.max(0,Math.min(4,tr-1))] };
      photo=T.kp; art.prevOpp=nx.opp; } }
  if(!t)return;
  const P=PAPER_TOPIC[t], w=Object.assign({},v,x,{ label:L.label||"" });
  art.topic=t; art.tag=P.tag; art.photo=photo;
  art.head=paperFill(pick(P.head),w); art.sub=paperFill(pick(P.sub),w); art.lead=paperFill(pick(P.lead),w)+" "+art.lead;
  art.brief=art.subMatch=COMPS[L.comp].name+(L.label?" "+L.label:"");
  if(t!=="cup")art.quote="";
  // 一面と同じ話はゴシップ欄から外す
  art.side=art.side.filter(y=>!(t==="awaken"&&/覚醒/.test(y))&&!(t==="star"&&/スター選手/.test(y)));
}
/** 記事を残す(古いものから消す) */
function addArticle(S,a){
  if(!S.paper)S.paper=[];
  S.paper.push(a);
  while(S.paper.length>TUNING.paper.max)S.paper.shift();
}
