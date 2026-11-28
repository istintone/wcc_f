/**
 * 長い期間の賞(→docs/37)。DOM に触らない。
 * リーグの1周の終わり: 得点王・アシスト王(ごほうびはスター選手のタグだけ)・リーグ ベストイレブン(受賞歴だけ)
 * 任期の終わり: 年間最優秀選手・ゴールデンシュー・最優秀GK・最優秀若手・最優秀監督(授賞式の場面・賞金・ファン・次の任期の受賞者のタグ)
 * ライバルは同じリーグのクラブの選手。成績はそのクラブの順位表の記録(得点・失点)から作る(同じ試合なら同じ値)
 */
const AWARDS={
  scorer:{ name:"得点王", en:"TOP SCORER", lg:true },
  assist:{ name:"アシスト王", en:"TOP ASSIST", lg:true },
  xi:    { name:"リーグ ベストイレブン", en:"BEST XI", lg:true },
  poy:   { name:"年間最優秀選手", en:"PLAYER OF THE YEAR" },
  shoe:  { name:"ゴールデンシュー", en:"GOLDEN SHOE" },
  gk:    { name:"最優秀GK", en:"BEST KEEPER" },
  young: { name:"最優秀若手", en:"YOUNG PLAYER" },
  mgr:   { name:"最優秀監督", en:"MANAGER OF THE YEAR" } };
const awHash=s=>{ let h=2166136261; for(const c of String(s))h=Math.imul(h^c.charCodeAt(0),16777619); return (h>>>0)/4294967296; };
/** リーグ戦の自分の選手の成績(この周)。S.lstat = { id:{ ap, gl, as, rs, rn } } */
function awLeagueAdd(S,res){
  const L=S.lstat||(S.lstat={}), st=id=>L[id]||(L[id]={ ap:0, gl:0, as:0, rs:0, rn:0 });
  for(const id of res.played||[]){ const s=st(id); s.ap++; const r=res.rate&&res.rate[id]; if(r!=null){ s.rs+=r; s.rn++; } }
  for(const id in res.goals||{})st(id).gl+=res.goals[id];
  for(const id in res.assists||{})st(id).as+=res.assists[id];
}
/** ライバルのクラブの選手: エース(FW の中で OFE と TEC がいちばん高い)・GK・若手(23歳以下でいちばん強い) */
function awClubMen(cid){
  const T=TEAMS[cid]; if(!T||!T.xi)return null;
  const xi=T.xi.map(id=>CARDS[id]).filter(Boolean), tot=c=>c.off+c.def+c.tec+c.pow+c.spd+c.sta;
  const fw=xi.filter(c=>c.pos==="FW"), ace=(fw.length?fw:xi.slice(1)).slice().sort((a,b)=>(b.off*1.2+b.tec)-(a.off*1.2+a.tec))[0];
  const yg=xi.filter(c=>c.age&&c.age<=TUNING.award.youngAge).sort((a,b)=>tot(b)-tot(a))[0]||null;
  return { ace, gk:xi[0], young:yg };
}
/** ライバルの成績(リーグのこの周): 順位表の得点・失点から。share は選手ごとに決まった取り分 */
function awRivalLeague(S){
  const A=TUNING.award, L=S.league, out=[]; if(!L||!L.table)return out;
  for(const cid of L.clubs){ if(cid==="me")continue; const m=awClubMen(cid), t=L.table[cid]; if(!m||!t)continue;
    const h=awHash(S.term+":"+S.cyc+":"+m.ace.id), sh=A.share[0]+(A.share[1]-A.share[0])*h, ash=A.asShare[0]+(A.asShare[1]-A.asShare[0])*awHash("a"+m.ace.id);
    out.push({ id:m.ace.id, club:cid, gl:Math.round(t.gf*sh), as:Math.round(t.gf*ash), p:t.p, ga:t.ga, w:t.w, gk:m.gk.id, young:m.young?m.young.id:null }); }
  return out;
}
/** 得点王・アシスト王のレース(SEASON の表と、リーグの1周の終わり)。上位 n 人 [{ id, club, v, me }] */
const AW_STAT={ scorer:"gl", assist:"as", gl:"gl", as:"as" };
function awRace(S,key,n){
  key=AW_STAT[key]||key;
  const mine=Object.keys(S.lstat||{}).filter(id=>CARDS[id]).map(id=>({ id, club:"me", v:S.lstat[id][key], me:true }));
  const riv=awRivalLeague(S).map(r=>({ id:r.id, club:r.club, v:r[key] }));
  return mine.concat(riv).filter(x=>x.v>0).sort((a,b)=>b.v-a.v||(a.me?-1:1)).slice(0,n||5);
}
/** 受賞を記録する(カードの受賞歴は任期をまたいで残る) */
function awRecord(S,key,id,v,club){
  const rec={ term:S.term, cyc:S.cyc, key, id, v, club };
  (S.awards||(S.awards=[])).push(rec);
  if(club==="me"&&id&&id!=="mgr"){ const H=S.honors||(S.honors={}); (H[id]||(H[id]=[])).push([S.term,key]); }
  return rec;
}
/** リーグの1周の終わり(endCycle の初め。順位表が締まった時点で) */
function awCycleEnd(S,out){
  const A=TUNING.award, lines=[];
  for(const key of ["scorer","assist"]){
    const top=awRace(S,key,1)[0]; if(!top)continue;
    awRecord(S,key,top.id,top.v,top.club);
    const nm=nameOf(CARDS[top.id]);
    if(top.me){ lines.push("🏅 "+nm+" が"+AWARDS[key].name+"("+top.v+(key==="scorer"?"点":"アシスト")+")");
      if(S.g&&S.g.pl[top.id]&&!pHas(S,top.id,"star"))addPlayerTag(S,top.id,"star",out); }   // ごほうびはスター選手だけ(→docs/37 §37.6)
    else lines.push("🏅 "+AWARDS[key].name+"は "+teamNameOf(TEAMS[top.club])+" の "+nm+"("+top.v+")");
  }
  // リーグ ベストイレブン: 自分の選手から、ポジションの束ごとに採点の平均が上位(出場が minAp 以上)。受賞歴だけ
  const L=S.lstat||{}, grp={ GK:1, DF:4, MF:3, FW:3 }, picked=[];
  for(const g in grp){ const c=Object.keys(L).filter(id=>CARDS[id]&&CARDS[id].pos===g&&L[id].ap>=A.minAp&&L[id].rn&&L[id].rs/L[id].rn>=A.xiRate)
      .sort((a,b)=>L[b].rs/L[b].rn-L[a].rs/L[a].rn).slice(0,grp[g]); picked.push(...c); }
  for(const id of picked)awRecord(S,"xi",id,+(L[id].rs/L[id].rn).toFixed(2),"me");
  if(picked.length)lines.push("🏅 リーグ ベストイレブンに "+picked.length+"人("+picked.map(id=>nameOf(CARDS[id])).join("・")+")");
  lines.forEach(x=>out.push(x));
  S.awAcc=S.awAcc||{};                          // 任期の賞に使うライバルの積み上げ(この周のリーグの記録)
  for(const r of awRivalLeague(S)){ const a=S.awAcc[r.id]||(S.awAcc[r.id]={ club:r.club, gl:0, as:0, p:0, w:0, ga:0, gk:r.gk, young:r.young }); a.gl+=r.gl; a.as+=r.as; a.p+=r.p; a.w+=r.w; a.ga+=r.ga; }
  S.lstat={};
}
/** 年間最優秀選手の点数(自分の選手) */
function awPoyMine(S,id){
  const W=TUNING.award.poyW, t=(S.tstat||{})[id]; if(!t||t.ap<TUNING.award.minAp*2)return 0;
  return t.gl*W.gl+t.as*W.as+t.mvp*W.mvp+(t.rn?t.rs/t.rn:0)*W.rate+(S.titles||[]).length*W.title;
}
/** ライバルの任期の成績: 周ごとの積み上げに、この周の途中の記録を足し、任期の試合数に引き伸ばす */
function awRivalTerm(S){
  const acc=JSON.parse(JSON.stringify(S.awAcc||{}));
  for(const r of awRivalLeague(S)){ const a=acc[r.id]||(acc[r.id]={ club:r.club, gl:0, as:0, p:0, w:0, ga:0, gk:r.gk, young:r.young }); a.gl+=r.gl; a.as+=r.as; a.p+=r.p; a.w+=r.w; a.ga+=r.ga; }
  const n=TUNING.club.termLen, W=TUNING.award.poyW;
  return Object.keys(acc).map(id=>{ const a=acc[id], k=a.p?n/a.p:0, wr=a.p?a.w/a.p:0;
    return Object.assign({ id, k, gl:Math.round(a.gl*k), as:Math.round(a.as*k),
      poy:Math.round(a.gl*k)*W.gl+Math.round(a.as*k)*W.as+Math.round(a.gl*k/5)*W.mvp+(6.6+wr*0.8)*W.rate+(wr>0.6?2:0)*W.title }, a); });
}
/** 任期の終わりの賞(endTerm で)。S.tAwards = [{ key, cand:[{ id, club, v }](3人), win }] を作り、ごほうびを付ける */
function awTermEnd(S){
  const A=TUNING.award, T=S.tstat||{}, R=awRivalTerm(S), ids=Object.keys(T).filter(id=>CARDS[id]), out=[];
  const rk=(L,v)=>L.slice().sort((a,b)=>b.v-a.v).slice(0,3);
  const tot=c=>c.off+c.def+c.tec+c.pow+c.spd+c.sta;
  const mineT=f=>ids.map(id=>({ id, club:"me", v:f(id), me:true })).filter(x=>x.v>0);
  const list=[];
  list.push({ key:"poy", cand:rk(mineT(id=>Math.round(awPoyMine(S,id))).concat(R.map(r=>({ id:r.id, club:r.club, v:Math.round(r.poy) })))) });
  list.push({ key:"shoe", cand:rk(mineT(id=>T[id].gl).concat(R.map(r=>({ id:r.id, club:r.club, v:r.gl })))) });
  const gkMine=ids.filter(id=>CARDS[id].pos==="GK"&&T[id].ap>=A.minAp*2).map(id=>({ id, club:"me", me:true, v:Math.round((T[id].cs||0)*3+(T[id].rn?T[id].rs/T[id].rn:0)*10) }));
  const gkRiv=R.filter(r=>r.gk).map(r=>{ const pg=r.p?r.ga/r.p:1.5, cs=Math.round(TUNING.club.termLen*Math.max(0.05,0.5-pg*0.22)); return { id:r.gk, club:r.club, v:Math.round(cs*3+(6.6+(1.5-pg)*0.4)*10) }; });
  list.push({ key:"gk", cand:rk(gkMine.concat(gkRiv)) });
  const yMine=ids.filter(id=>CARDS[id].age&&CARDS[id].age<=A.youngAge).map(id=>({ id, club:"me", me:true, v:Math.round(awPoyMine(S,id)) })).filter(x=>x.v>0);
  const yRiv=R.filter(r=>r.young&&r.young!==r.id).map(r=>({ id:r.young, club:r.club, v:Math.round(r.poy*0.55*(0.8+0.4*awHash("y"+r.young))) }))
    .concat(R.filter(r=>r.young===r.id).map(r=>({ id:r.id, club:r.club, v:Math.round(r.poy) })));
  list.push({ key:"young", cand:rk(yMine.concat(yRiv)) });
  // 最優秀監督: 任期の勝率とタイトル。ライバルの監督は、勝ち越したクラブの監督の点数で比べる
  const rec=S.rec, n=rec.w+rec.d+rec.l, wr=n?rec.w/n:0, me={ id:"mgr", club:"me", me:true, v:Math.round(wr*100+(S.titles||[]).length*A.mgrTitle) };
  const rm=R.map(r=>({ id:"mgr:"+r.club, club:r.club, v:Math.round((r.p?r.w/r.p:0)*100+(r.p&&r.w/r.p>0.6?2:0)*A.mgrTitle) }));
  list.push({ key:"mgr", cand:rk([me].concat(rm)) });
  for(const a of list){ const w=a.cand[0]; if(!w)continue; a.win=w; awRecord(S,a.key,w.id,w.v,w.club);
    if(w.club!=="me")continue;
    S.money+=A.prize[a.key]||0; if(S.biz)S.biz.fans+=A.fans[a.key]||0;
    if(a.key!=="mgr")(S.awNext||(S.awNext=[])).push({ id:w.id, key:a.key }); else S.mgrAwards=(S.mgrAwards||0)+1; }
  S.tAwards=list.filter(a=>a.win); S.tAwShown=false;
  S.awAcc={}; S.lstat={};
  return out;
}
/** 次の任期の初め(startNextTerm で): 受賞した選手に「受賞者」のタグ、年間最優秀選手にスター選手 */
function awNextTerm(S){
  const out=[];
  for(const a of S.awNext||[]){ if(!S.g||!S.g.pl[a.id])continue;
    addPlayerTag(S,a.id,"laureate",out);
    if(a.key==="poy"&&!pHas(S,a.id,"star"))addPlayerTag(S,a.id,"star",out); }
  S.awNext=[];
  return out;
}
/** 選手の受賞歴の文(カードの裏・調書) */
const awHonorTxt=(S,id)=>((S&&S.honors&&S.honors[id])||[]).map(h=>"第"+h[0]+"任期 "+AWARDS[h[1]].name);
/** ライバルの名前(監督の賞は「◯◯ の監督」) */
const awWho=x=>x.id==="mgr"?"監督(あなた)":/^mgr:/.test(x.id)?teamNameOf(TEAMS[x.club])+" の監督":nameOf(CARDS[x.id]);
