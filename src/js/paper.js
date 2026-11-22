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
  return { no:S.played, term:S.term, comp:L.comp, label:L.label||"", opp:L.opp, hg, ag, pso:pso||null, kind,
    head, sub, lead, quote, side:side.slice(0,4), mvp:mvp?{ id:mvp.id, r:mvp.r }:null, photo:mvp?mvp.id:null };
}
/** 記事を残す(古いものから消す) */
function addArticle(S,a){
  if(!S.paper)S.paper=[];
  S.paper.push(a);
  while(S.paper.length>TUNING.paper.max)S.paper.shift();
}
