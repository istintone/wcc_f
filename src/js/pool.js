/* =========================================================================
   wcc_f — カード(DOM非依存)→docs/06
   ・カードの一覧(POOL)は実在の16クラブ × 16人(realcards.js。**名前は偽名**。実名はパックで上書き →docs/01 §1.4)
   ・能力は「役割のひな形 + 格 + 特徴」から作る。レアリティは格で決まる
   ・16クラブは相手クラブとしても登場する(強さの段4〜5。→club.js の genWorld)
   ・試合のあとに1枚払い出される。レアリティを抽選してから、その段のカードを1枚選ぶ
   ・持っているカードは S.coll {id: 枚数}。任期をまたいでも残る
   ・登録選手は S.sq(16枚。先頭11枚が先発で、並びは陣形の枠の順)
   ========================================================================= */

/** レアリティ。W 白 / B 黒 / K キラ / L レジェンド。at=この格以上でその段 */
const RARITY={
  W:{ name:"白",         at:-9 },
  B:{ name:"黒",         at:1.6 },
  K:{ name:"キラ",       at:2.2 },
  L:{ name:"レジェンド", at:2.8 }
};
const RAR_ORDER=["W","B","K","L"];
const rarOf=r=>RAR_ORDER.slice().reverse().find(k=>r>=RARITY[k].at);
/** 特徴の文字 → 能力 */
const TRAIT_STAT={ o:"off", d:"def", t:"tec", p:"pow", s:"spd", a:"sta" };
const POOL_SEED=20261117;
/** 実在クラブの id(並びは REAL_CLUBS の順) */
const REAL_IDS=REAL_CLUBS.map(c=>c[0]);
const POOL=(()=>{
  const C=TUNING.pack, out=[];
  for(const r of REAL_ROWS){
    const [id,ci,no,name,roles,age,grade,traits,skill,nat,ani]=r, rl=roles.split("/"), g=GEN_ROLE[baseRole(rl[0])];
    const st={};
    const off=(grade-C.gradeBase)*C.gradeK;      // 格 → 能力のずれ
    STATS.forEach((k,i)=>{ const v=g.st[i]; st[k]=v+(v<=6?off*C.lowK:off); });
    for(let k=0;k+1<traits.length;k+=2)st[TRAIT_STAT[traits[k]]]+=traits[k+1]==="+"?C.trait:-C.trait;
    STATS.forEach(k=>{ st[k]=clamp(Math.round(st[k]),1,STAT_MAX); });
    CARDS[id]=Object.assign({ id, no, name, pos:g.pos, roles:rl, skill, age, grade,
      rar:rarOf(grade), club:REAL_CLUBS[ci][1], team:REAL_CLUBS[ci][0],
      nat:nat||NAT_POOL[hashStr("nat:"+id)%NAT_POOL.length], ani:ani!=null?ani:hashStr("ani:"+id)%ANIMALS.length },st);
    out.push(id);
  }
  // 相手クラブとしての定義。強さの段は先発11人の格の平均で、上位8クラブが5、残りが4
  const avg=REAL_CLUBS.map((c,ci)=>{ const xi=REAL_ROWS.filter(r=>r[1]===ci).slice(0,11);
    return xi.reduce((s,r)=>s+r[6],0)/xi.length; });
  const top=avg.slice().sort((a,b)=>b-a)[7];
  const rng=mulberry32(POOL_SEED);
  REAL_CLUBS.forEach((c,ci)=>{
    const [cid,name,short,color,form,kp]=c, ids=REAL_ROWS.filter(r=>r[1]===ci).map(r=>r[0]);
    const xi=ids.slice(0,11), tier=avg[ci]>=top?5:4, links=[], nLink=TUNING.club.linkBase+TUNING.club.linkTier*tier;
    for(let k=0;k<nLink*3&&links.length<nLink;k++){
      const a=xi[1+Math.floor(rng()*10)], b=xi[1+Math.floor(rng()*10)];
      if(a===b||links.some(l=>(l[0]===a&&l[1]===b)||(l[0]===b&&l[1]===a)))continue;
      links.push([a,b,clamp(Math.round(tier/2+rng()*1.2),1,3)]);
    }
    TEAMS[cid]={ id:cid, name, short, color, form, kp:ids[kp-1], xi, bench:ids.slice(11), links, tier, real:true };
  });
  return out;
})();
/** 最初から持っている16枚(アズーロFC)。レアリティは黒として扱う */
TEAMS.azr.xi.concat(TEAMS.azr.bench).forEach(id=>{ CARDS[id].rar=CARDS[id].rar||"B"; CARDS[id].club=CARDS[id].club||"アズーロFC"; });

/** 最初の状態。持っているのはアズーロFCの16枚で、それがそのまま登録選手 */
function newCollection(){
  const coll={};
  TEAMS.azr.xi.concat(TEAMS.azr.bench).forEach(id=>coll[id]=1);
  return coll;
}
const startSquad=()=>TEAMS.azr.xi.concat(TEAMS.azr.bench);

/** 試合のあとに1枚引く。たねは任期と試合数で決まる(読み込み直しても同じカード) */
function drawCard(S,salt){
  // salt … 同じ試合で何枚か引くとき(スポンサーの選手パック)に1枚ずつ変える
  const P=TUNING.pack, rng=mulberry32((S.seed^hashStr("pack:"+S.term+":"+S.played+(salt?":"+salt:"")))>>>0);
  let r=rng(), rar="W";
  for(const k of RAR_ORDER){ if(r<P.rate[k]){ rar=k; break; } r-=P.rate[k]; }
  const list=POOL.filter(id=>CARDS[id].rar===rar);
  return list[Math.floor(rng()*list.length)];
}
/** 払い出し。コレクションに足して、何を引いたかを返す */
function payout(S,salt){
  const id=drawCard(S,salt), isNew=!S.coll[id];
  S.coll[id]=(S.coll[id]||0)+1;
  return { id, isNew };
}

/**
 * 登録選手を入れ替える。out の枠(位置・先発か控えか)に in が入る。
 * **入れ替えられた選手の育成は消える**(本家と同じく、登録を外すと育てたものは残らない)。
 * 入ってきた選手は育成が初めから。
 */
function swapSquad(S,outId,inId){
  const i=S.sq.indexOf(outId);
  if(i<0||S.sq.includes(inId)||!S.coll[inId])return false;
  S.sq[i]=inId;
  if(S.layout[outId]){ S.layout[inId]=S.layout[outId]; delete S.layout[outId]; }
  if(S.kp===outId)S.kp=null;
  if(S.roles)for(const k in S.roles)if(S.roles[k]===outId)S.roles[k]=null;
  delete S.g.pl[outId];
  for(const k of Object.keys(S.g.links))if(k.split("|").includes(outId))delete S.g.links[k];
  S.g.pl[inId]=newPlayerGrowth();
  return true;
}
/** 登録選手の中で、先発と控えを入れ替える(育成は消えない) */
/** 先発11人の既定の位置を埋める。置いていない人は陣形の枠、控えの位置は消す(→docs/07 §7.10) */
function fillLayout(S){
  const f=FORMS[S.form]||FORMS[TEAMS.azr.form], on=S.sq.slice(0,11);
  on.forEach((id,i)=>{ if(!S.layout[id])S.layout[id]=[f[i][0],f[i][1]]; });
  for(const id of Object.keys(S.layout))if(!on.includes(id))delete S.layout[id];
  // KP は先発にいる人だけ。いなければクラブの既定、それも控えなら最前線の人
  if(!on.includes(S.kp))S.kp=on.includes(TEAMS.azr.kp)?TEAMS.azr.kp:on.slice().sort((a,b)=>S.layout[b][0]-S.layout[a][0])[0];
  return S.layout;
}
/** 陣形を選び直す。先発の並び順(枠の順)どおりに一括で置き直す */
function setForm(S,form){
  if(!FORMS[form])return false;
  S.form=form; S.layout={};
  fillLayout(S);
  return true;
}
function moveSquad(S,a,b){
  const i=S.sq.indexOf(a), j=S.sq.indexOf(b);
  if(i<0||j<0||i===j)return false;
  S.sq[i]=b; S.sq[j]=a;
  const la=S.layout[a], lb=S.layout[b];
  if(la||lb){ if(lb)S.layout[a]=lb; else delete S.layout[a]; if(la)S.layout[b]=la; else delete S.layout[b]; }
  return true;
}

/* ---- カードNo.(通し番号)とパラメーター合計値(→docs/06) ----
 * カードNo. はカードの id そのもの(mcb01 なら MCB01)。クラブの略号 + クラブ内の番号なので、
 * 選手を足しても既存の番号は変わらず、No.順に並べるとクラブごとにまとまる */
const cardNoOf=c=>c.id.toUpperCase();
const cnoCmp=(a,b)=>a<b?-1:a>b?1:0;
const statTotal=c=>STATS.reduce((s,k)=>s+(c[k]||0),0);
/** カードのクラブ名(実名パックがあれば実名) */
function clubOfCard(c){
  const t=c.team&&TEAMS[c.team]?TEAMS[c.team]:c.id[0]==="h"?TEAMS.azr:c.id[0]==="a"?TEAMS.ros:null;
  return t?teamNameOf(t):(c.club||"");
}

/**
 * キャプテン・キッカーを任命する(→docs/12)。id が null なら任命を解く(キッカーは自動、キャプテンは無し)。
 * キャプテンの任命ではやる気が動く。**上がるのは同じ選手に任期1回まで**(付け替えでやる気を戻せないように)、
 * 外された前のキャプテンは下がることがある。返り値は知らせの行
 */
function setRole(S,kind,id){
  if(!S.roles)S.roles={ cap:null, pk:null, fk:null, ck:null };
  const old=S.roles[kind], out=[];
  if(old===id)return out;
  S.roles[kind]=id;
  if(kind!=="cap")return out;
  const C=TUNING.cap, roll=k=>(hashStr("cap:"+S.term+":"+S.played+":"+k)%1000)/1000;
  if(old&&S.g.pl[old]&&roll("d"+old)<C.drop&&S.g.pl[old].mot>0){ S.g.pl[old].mot--; out.push(nameOf(CARDS[old])+" は腕章を外されて、やる気が下がった"); }
  if(id&&S.g.pl[id]){
    if(!S.capHist)S.capHist=[];
    const a=capApt(CARDS[id]), g=S.g.pl[id];
    if(!S.capHist.includes(id)){
      S.capHist.push(id);
      if(roll("u"+id)<C.up[a]&&g.mot<4){ g.mot++; out.push(nameOf(CARDS[id])+" はキャプテンを任されて、やる気が上がった"); }
      else if(roll("w"+id)<C.down[a]&&g.mot>0){ g.mot--; out.push(nameOf(CARDS[id])+" には腕章が重荷のようだ。やる気が下がった"); }
    }
  }
  return out;
}

/* ---- 最適配置(→docs/14)。いまの陣形の枠ごとに、その役割に合う能力 × 適性が最も高い選手を当てはめる ---- */
/** 役割ごとに重く見る能力 */
const ROLE_W={ GK:{ def:3, pow:1, tec:1 }, CB:{ def:3, pow:2, spd:1 }, SB:{ def:2, spd:2, sta:1 }, DMF:{ def:2, sta:1, tec:1 },
  CMF:{ tec:2, sta:1, off:1 }, SMF:{ spd:2, tec:1, off:1 }, OMF:{ tec:2, off:2 }, WG:{ spd:2, off:2, tec:1 }, CF:{ off:3, pow:1, spd:1 } };
/** その選手をその役割に置いたときの値(育成を入れた能力。ケガの選手はほとんど選ばない) */
function slotValue(S,id,role){
  const c=growCard(S,CARDS[id]), w=ROLE_W[role]||{}, g=S.g.pl[id];
  let v=0, n=0; for(const k in w){ v+=c[k]*w[k]; n+=w[k]; }
  return v/(n||1)*aptOf(c,role)*(g&&g.mot===0?0.3:1);
}
/** 登録16人から、いまの陣形に最適な11人と並びを決める。いちばん値の高い組から順に埋める。KP は先発に残れば引き継ぐ */
function autoSquad(S){
  const f=FORMS[S.form]||FORMS[TEAMS.azr.form], roles=f.map((p,i)=>i===0?"GK":posAt(p[0],p[1]));
  const pairs=[];
  for(const id of S.sq)roles.forEach((r,i)=>pairs.push({ id, i, v:slotValue(S,id,r) }));
  pairs.sort((a,b)=>b.v-a.v);
  const slot=new Array(roles.length).fill(null), used=new Set();
  for(const p of pairs){ if(slot[p.i]||used.has(p.id))continue; slot[p.i]=p.id; used.add(p.id); }
  S.sq=slot.concat(S.sq.filter(id=>!used.has(id)));
  S.layout={}; fillLayout(S);
  return S.sq.slice(0,11);
}
