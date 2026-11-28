/**
 * ゴシップの秘密の情報(スクープ。→docs/38)。DOM に触らない。
 * 新聞の号のゴシップの1つが手がかり(art.scoop)になる → 判子を押すと秘書が調べる(S.scoop.inv)→ 次の試合のあとに報告(S.scoop.rep)→ 2択
 */
/** 秘密の種類。rumor … ゴシップの文 / truth … 本当だったときの秘書の報告 / ch … [答え, 結果] / need … 作れる条件 */
const SCOOPS={
  ace:{ name:"エースの負傷", rumor:"{opp}のエース {a}、練習を途中で切り上げる姿が目撃される", truth:"{opp}の {a}、やはり足を痛めているようです。次の試合、そこを突きますか？",
    ch:[["そこを突く",{ weak:true }],["見なかったことにする",{ fans:"fair" }]] },
  transfer:{ name:"移籍の迷い", rumor:"{p}に国外のビッグクラブが関心か? 関係者は「ノーコメント」", truth:"{p}さん、本当に移籍の話で迷っているようです。",
    ch:[["話を聞く",{ bet:[0.6,"growth","rebel"] }],["放っておく",{ player:"doubt" }]] },
  night:{ name:"深夜の自主練", rumor:"{p}、深夜のクラブハウスでひとり練習 ― 目撃情報", truth:"{p}さん、実は結果が出なくて焦っているみたいです。",
    ch:[["練習に付き合う",{ player:"growth", fat:0.06 }],["休ませる",{ fat:-0.06 }]] },
  pair:{ name:"昔からの仲", rumor:"{p}と{q}、オフに一緒に食事か 連携の秘密はここに?", truth:"{p}さんと{q}さん、昔からの仲だそうです。",
    ch:[["同じ組で練習させる",{ link:true }],["普段どおり",{}]] },
  sponsor:{ name:"社長の思惑", rumor:"{sp}の社長、お忍びでスタジアムに? VIP席に見慣れない姿", truth:"{sp}の社長、協賛を増やすか考えているそうです。おもてなし、しますか？",
    ch:[["もてなす(0.3億)",{ spX2:true }],["普段どおり",{}]] },
  plan:{ name:"新しい布陣", rumor:"{opp}の監督、非公開練習で新しい布陣を試しているらしい", truth:"{opp}、次の試合で布陣を変えてくるようです。",
    ch:[["対策を練る",{ plan:true }],["気にしない",{}]] },
  ob:{ name:"伝説の OB", rumor:"{town}の街で、伝説のOBらしき人物を見かけたとの声", truth:"街で見かけたのは、本当にクラブの伝説の OB でした。クラブのことを気にかけているそうです。",
    ch:[["会いに行く",{ ob:true }],["そっとしておく",{}]] } };
const scoopOf=S=>S.scoop||(S.scoop={ inv:null, rep:null, weak:null, plan:null, found:{}, readNo:-1 });
/** 名前を当てはめる */
function scoopFill(t,x){
  return t.replace(/\{opp\}/g,x.opp&&TEAMS[x.opp]?teamNameOf(TEAMS[x.opp]):"").replace(/\{a\}/g,x.ace&&CARDS[x.ace]?nameOf(CARDS[x.ace]):"")
    .replace(/\{p\}/g,x.id&&CARDS[x.id]?nameOf(CARDS[x.id]):"").replace(/\{q\}/g,x.id2&&CARDS[x.id2]?nameOf(CARDS[x.id2]):"")
    .replace(/\{sp\}/g,x.sp||"").replace(/\{town\}/g,x.town||"");
}
/** 新聞の号に手がかりを作るか(paper.js の makeArticle から)。作れば { k, id, id2, opp, ace, sp, town, at, txt } */
function scoopLead(S,rng){
  const K=TUNING.scoop, Z=scoopOf(S);
  if(S.termOver||rng()>=K.p)return null;
  const sq=(S.sq||[]).filter(id=>CARDS[id]&&S.g&&S.g.pl[id]), nx=typeof upcoming==="function"?(upcoming(S,1)||[])[0]:null, opp=nx&&nx.opp&&TEAMS[nx.opp]?nx.opp:null;
  const ace=opp?(TEAMS[opp].kp||(TEAMS[opp].xi||[])[9]):null;
  const ok={ ace:!!(opp&&ace&&CARDS[ace]), transfer:sq.length>0, night:sq.length>0, pair:sq.length>1, sponsor:!!(S.biz&&S.biz.sp), plan:!!opp, ob:!S.obSeed };
  const w=Object.keys(SCOOPS).filter(k=>ok[k]).map(k=>[k,K.w[k]||1]); if(!w.length)return null;
  let r=rng()*w.reduce((a,x)=>a+x[1],0), k=w[w.length-1][0]; for(const [kk,v] of w){ if(r<v){ k=kk; break; } r-=v; }
  const a=sq[Math.floor(rng()*sq.length)], b=sq.filter(x=>x!==a)[Math.floor(rng()*Math.max(1,sq.length-1))];
  const x={ k, id:a||null, id2:b||null, opp, ace, sp:S.biz&&S.biz.sp?S.biz.sp.name:"", town:S.club?S.club.town:"", at:S.played };
  x.txt="【うわさ】"+scoopFill(SCOOPS[k].rumor,x);
  return x;
}
/** その手がかりを今調べられるか(古くない・ほかを調べていない・報告を待っていない) */
const scoopCanAsk=(S,sc)=>!!sc&&!sc.asked&&S.played-sc.at<=TUNING.scoop.life&&!scoopOf(S).inv&&!scoopOf(S).rep&&!S.termOver;
/** 秘書に調べてもらう */
function scoopAsk(S,sc){ if(!scoopCanAsk(S,sc))return false; sc.asked=true; scoopOf(S).inv=Object.assign({},sc,{ askAt:S.played }); return true; }
/** 試合のあと(applyResult から): 調べた結果の報告を作る・相手の弱みと采配の対策を使い終える */
function scoopAfterMatch(S,fx){
  const Z=scoopOf(S);
  if(Z.weak&&fx&&fx.opp===Z.weak.opp)Z.weak=null;
  if(Z.plan&&fx&&fx.opp===Z.plan.opp)Z.plan=null;
  if(Z.inv&&S.played>=Z.inv.askAt){   // 調べ始めた次の試合の結果を反映するとき(S.played はまだ増える前)
    const lv=typeof secLv==="function"?secLv(S):0, ok=mulberry32((S.seed^hashStr("scp:"+S.term+":"+S.played))>>>0)()<TUNING.scoop.truth[lv];
    Z.rep=Object.assign({},Z.inv,{ ok }); Z.inv=null;
  }
}
/** 2択に答える。i = 答えの番号(ただの噂のときは i を見ない)。結果の行を返す */
function scoopAnswer(S,i){
  const Z=scoopOf(S), r=Z.rep; if(!r)return [];
  Z.rep=null; const out=[];
  if(!r.ok){ out.push("ただの噂だった"); return out; }
  Z.found[r.k]=(Z.found[r.k]||0)+1;
  if(typeof noteTag==="function")noteTag(S,"sc:"+r.k);   // COACHING NOTE のスクープ
  const R=(SCOOPS[r.k].ch[i]||[])[1]||{}, K=TUNING.scoop, rng=mulberry32((S.seed^hashStr("sca:"+S.term+":"+S.played+":"+i))>>>0);
  if(R.weak){ Z.weak={ opp:r.opp, id:r.ace }; out.push("🔎 次の試合、"+nameOf(CARDS[r.ace])+" の足を狙う");
    if(rng()<K.cheatP){ if(S.biz)S.biz.fans=Math.max(0,S.biz.fans-K.cheatFans); (S.pnews||(S.pnews=[])).push({ t:"cheat" }); out.push("📰 新聞に「卑怯な采配」と書かれた(ファン −"+K.cheatFans+"人)"); } }
  if(R.fans==="fair"&&S.biz){ S.biz.fans+=K.fairFans; out.push("ファン +"+K.fairFans+"人(フェアプレーが評判に)"); }
  if(R.bet&&r.id&&S.g.pl[r.id]){ const [p,hit,miss]=R.bet; addPlayerTag(S,r.id,rng()<p?hit:miss,out); }
  if(R.player&&r.id&&S.g.pl[r.id])addPlayerTag(S,r.id,R.player,out);
  if(R.fat&&r.id&&S.g.pl[r.id]){ const g=S.g.pl[r.id]; g.fat=clamp((g.fat||0)+R.fat,0,TUNING.grow.int.fatMax); out.push(R.fat>0?nameOf(CARDS[r.id])+" に疲れが残った":nameOf(CARDS[r.id])+" の疲れが抜けた"); }
  if(R.link&&r.id&&r.id2&&S.g.pl[r.id]&&S.g.pl[r.id2]&&typeof linkExp==="function"){ linkExp(S,r.id,r.id2,K.linkExp); out.push("🔗 "+nameOf(CARDS[r.id])+" と "+nameOf(CARDS[r.id2])+" の連携が深まった"); }
  if(R.spX2&&S.biz){ S.money=Math.round((S.money-K.spCost)*100)/100; S.biz.spX2=true; out.push("📣 次のミッションの報酬は2倍(資金 −"+K.spCost+"億)"); }
  if(R.plan){ Z.plan={ opp:r.opp }; out.push("🔎 次の試合、"+teamNameOf(TEAMS[r.opp])+" の布陣の変更に備える"); }
  if(R.ob){ S.obSeed=true; out.push("🤝 伝説の OB と話した。いつか何かが起きるかもしれない"); }
  if(!out.length)out.push("いつもどおりに戻った");
  return out;
}
/** 秘書の誘導の言い回し(→docs/38 §38.5) */
const SCOOP_NUDGE=["気になるうわさが載っていますよ。もう新聞は読まれましたか？","たまにはニュースもチェックしてくださいね。ゴシップ欄が少し気になります。",
  "記者さんが何か嗅ぎつけたみたいです。紙面、ご覧になりました？","今朝の新聞、面白い記事がありましたよ。","監督、新聞を読む時間はありますか？ ひとつ、確かめたいうわさがあるんです。"];
/** 相手の定義に、調べた弱みを当てる(oppDefOf の最後)。エースの能力 −weakK、布陣の変更をしない(頑固) */
function scoopOppDef(S,fx,d){
  const Z=S&&S.scoop; if(!Z||!fx)return d;
  if(Z.weak&&Z.weak.opp===fx.opp){ const k=TUNING.scoop.weakK;
    d.xi=d.xi.map(x=>x.card.id!==Z.weak.id?x:Object.assign({},x,{ card:Object.assign({},x.card,{ off:Math.max(1,x.card.off-k), spd:Math.max(1,x.card.spd-k), tec:Math.max(1,x.card.tec-k) }) })); }
  if(Z.plan&&Z.plan.opp===fx.opp)d.pers="stubborn";
  return d;
}
