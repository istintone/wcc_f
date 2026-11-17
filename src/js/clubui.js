/* =========================================================================
   wcc_f — クラブハウス(試合の外の画面)。中身の計算は club.js / grow.js、ここは見せるだけ。
   流れ: チーム練習 → コミュニケーション(最大3回)→ 試合 → 結果を反映して保存 → …
   ========================================================================= */

const CL={ S:null, W:null, fx:null, store:null, armReset:false,
  msg:[], comm:null, pick:[], int:1,           // int=練習の強度(0 軽め / 1 普通 / 2 ハード)
  cf:"ALL", sel:null, sqSel:null,
  set:false, setMsg:"", copyText:"" };          // set=設定・データを開いている(→settings.js)            // cf=コレクションの絞り込み / sel=選んだカード / sqSel=並べ替えで選んだ登録選手                // msg=育成で起きたこと / comm=開いている場所 / pick=指名中の選手

/** localStorage が使えない環境(プライベートブラウズなど)では、その場かぎりの入れ物で動かす */
function careerStore(){
  try{
    localStorage.setItem("wcc_f.probe","1"); localStorage.removeItem("wcc_f.probe");
    return localStorage;
  }catch(e){
    return { m:{}, setItem(k,v){ this.m[k]=v; }, getItem(k){ return this.m[k]||null; }, removeItem(k){ delete this.m[k]; } };
  }
}
function initCareer(seed){
  CL.store=careerStore();
  CL.S=loadCareer(CL.store)||newCareer(seed);
  CL.W=worldOf(CL.S);
  saveCareer(CL.store,CL.S);
  showClub();
}
function showClub(keepScroll){
  const el=document.getElementById("club"), y=el.scrollTop;
  CL.fx=nextFixture(CL.S,CL.W);
  el.innerHTML=clubHtml();
  el.classList.add("on");
  el.scrollTop=keepScroll?y:0;
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
  ind:   { sub:"個人能力", n:1, hint:"1人を選ぶ(個人能力の経験 +"+TUNING.grow.comm.ind+" × 伸びやすさ。★は試合のあとに上がる)",
           info:(g,id)=>"個★"+g.is+" "+CARDS[id].age+"歳" },
  meet:  { sub:"特殊能力", n:1, hint:"1人を選ぶ(！ = ★突破の話がある)", info:g=>"特★"+g.ss },
  lounge:{ sub:"2人の連携", n:2, hint:"2人を選ぶ", info:(g,id)=>"組"+"ABCDEFGHIJK"[affOf(id)] },
  talk:  { sub:"やる気", n:1, hint:"1人を選ぶ(落ちている選手ほど大きく戻る)", info:g=>MOT_LABEL[g.mot] }
};
function developHtml(){
  const S=CL.S, g=S.g, N=TUNING.grow.int;
  let h="";
  if(CL.msg.length)h+='<section class="card msg"><h3>育成の結果</h3><ul>'+CL.msg.map(x=>'<li>'+x+'</li>').join("")+'</ul></section>';
  if(g.step==="train"){
    const fat=teamFatigue(S);
    h+='<section class="card dev"><h3>① チーム練習 <small>全員に効く</small></h3>'+
      '<div class="ints">'+INT_LABEL.map((t,i)=>'<button class="tab'+(CL.int===i?' on':'')+'" data-act="int" data-i="'+i+'">'+t+
        '<small>伸び ×'+N.k[i]+(N.fat[i]?' ・ 疲労 +'+Math.round(N.fat[i]*100)+'%':' ・ 疲れない')+'</small></button>').join("")+'</div>'+
      '<p class="dim">いまの疲労(盤面の11人の平均) <b class="'+(fat>=N.tiredSign?'warn':'')+'">'+Math.round(fat*100)+'%</b>'+
        ' ・ 疲れたぶん試合を消耗した状態で始める</p>'+
      '<div class="trs">'+trainOptions(S).map((o,i)=>'<button class="tr'+(o.sp>=0?' sp':'')+'" data-act="train" data-i="'+i+'">'+
        '<b>'+trainLabel(o)+'</b><small>'+trainDesc(o)+'</small></button>').join("")+'</div></section>';
  }else if(g.step==="comm"){
    const all=Object.keys(g.pl), left=commLeft(S), U=COMM_UI[CL.comm];
    h+='<section class="card dev"><h3>② コミュニケーション <small>あと '+left+' 回(使わずに試合へ進んでもよい)</small></h3>'+
      '<div class="tabs t4">'+Object.keys(COMM_UI).map(k=>'<button class="tab'+(CL.comm===k?' on':'')+'" data-act="comm" data-v="'+k+'">'+
        COMM_LABEL[k]+'<small>'+COMM_UI[k].sub+'</small></button>').join("")+'</div>';
    if(U){
      h+='<p class="dim">'+U.hint+'</p>'+chipsHtml(all,CL.pick,U.info);
      if(CL.pick.length===U.n){
        const id=CL.pick[0];
        h+='<div class="ask">';
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
    }
    h+='</section>';
  }
  return h;
}
function squadHtml(){
  const S=CL.S;
  const G0=TUNING.grow;
  let h='<section class="card"><h3>登録選手 <small>行を2つタップで先発と控えを入れ替え</small></h3>'+
    (CL.sqSel?'<p class="hint">'+cname(CL.sqSel)+' と入れ替える選手をタップ</p>':'')+'<table class="tbl sq">';
  for(const id of S.sq){
    const c=CARDS[id], g=S.g.pl[id], need=g.is<4?G0.ind.need[g.is]:G0.ind.awake, on=S.sq.indexOf(id)<11;
    h+='<tr class="'+(on?'':'bn')+(CL.sqSel===id?' sel':'')+'" data-act="sqpick" data-id="'+id+'">'+
      '<td><i class="pos '+c.pos.toLowerCase()+'">'+c.pos+'</i></td>'+
      '<td class="nm2">'+c.no+' '+nameOf(c)+' <small class="age">'+c.age+'歳</small>'+(S.kp===id?' <b class="kpt">KP</b>':'')+'</td>'+
      '<td class="st5">'+stars(g.is)+(g.q?'<b class="sign">兆</b>':'')+'<em><u style="width:'+
        (g.is>=5?100:Math.min(100,g.ie/need*100))+'%"></u></em></td>'+
      '<td class="st5 sp">'+stars(g.ss)+(g.sq?'<b class="sign">兆</b>':spReady(S,id)?'<b class="sign">！</b>':'')+'</td>'+
      '<td class="mot m'+g.mot+'">'+MOT_LABEL[g.mot]+'</td>'+
      '<td class="fat'+(g.fat>=G0.int.tiredSign?' warn':'')+'">'+Math.round(g.fat*100)+'%</td></tr>';
  }
  h+='</table></section>';
  // 戦力グラフと連携
  const lv=[0,0,0,0]; Object.values(S.g.links).forEach(l=>lv[l.lv]++);
  h+='<section class="card"><h3>戦力グラフ <small>練習で上下する。スタイルのランクに効く</small></h3><div class="graph">'+
    Object.keys(S.g.graph).map(a=>{ const v=S.g.graph[a], w=Math.abs(v)/G0.graph.max*50;
      return '<div><span>'+AXIS_LABEL[a]+'</span><em><u class="'+(v<0?'neg':'')+'" style="width:'+w+'%;'+(v<0?'right:50%':'left:50%')+'"></u></em><b>'+
        (v>=0?"+":"")+v.toFixed(2)+'</b></div>'; }).join("")+'</div>'+
    '<p class="dim">連携: 薄線 '+lv[1]+' / 太線 '+lv[2]+' / 黄金線 '+lv[3]+' ・ セットプレイ +'+Math.round(S.g.set*100)+'%</p></section>';
  return h;
}

/* ---- カード(→pool.js) ---- */

/** カード1枚の見た目。size: "s" 小(一覧) / "m" 中(払い出し・詳細) */
function cardHtml(id,size,extra){
  const c=CARDS[id], r=c.rar||"B", st=styleOfCard(c), sk=c.skill?SKILLS[c.skill]:null;
  const top=STATS.slice().sort((a,b)=>c[b]-c[a]).slice(0,3);
  return '<div class="kc r-'+r+' kc-'+size+(extra||"")+'" data-act="card" data-id="'+id+'">'+
    '<div class="kr">'+RARITY[r].name+'</div>'+
    '<div class="kp '+c.pos.toLowerCase()+'">'+c.pos+'</div>'+
    '<div class="kn"><b>'+c.no+'</b>'+nameOf(c)+'</div>'+
    '<div class="kcl">'+(c.club||"")+' ・ '+c.age+'歳</div>'+
    (size==="m"?'<div class="kst">'+top.map(k=>STAT_LABEL[k]+'<b>'+c[k]+'</b>').join("")+'</div>'+
      '<div class="ksk">★'+(sk?sk.label:"")+'</div><div class="ksy">KP: '+(st?st.name:"-")+'</div>'
      :'<div class="ksk">'+(sk?sk.label:"")+'</div>')+
    (CL.S.coll[id]>1?'<i class="kcnt">×'+CL.S.coll[id]+'</i>':'')+
    '</div>';
}
/** 選んだカードの詳細と、登録の入れ替え */
function cardDetailHtml(id){
  const S=CL.S, c=CARDS[id], st=styleOfCard(c), sk=c.skill?SKILLS[c.skill]:null, inSq=S.sq.includes(id);
  let h='<div class="kdet">'+cardHtml(id,"m")+'<div class="kinfo">'+
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
  const list=ids.filter(id=>!S.sq.includes(id)&&(CL.cf==="ALL"||CARDS[id].pos===CL.cf))
    .sort((a,b)=>ord(CARDS[b].rar)-ord(CARDS[a].rar)||posOrd[CARDS[a].pos]-posOrd[CARDS[b].pos]||(a<b?-1:1));
  let h='<section class="card coll"><h3>カード <small>'+ids.length+'種 ・ '+n+'枚 ・ 登録 16人</small></h3>'+
    '<div class="tabs t5">'+["ALL","GK","DF","MF","FW"].map(k=>'<button class="tab'+(CL.cf===k?' on':'')+'" data-act="cf" data-v="'+k+'">'+
      (k==="ALL"?"全部":k)+'</button>').join("")+'</div>';
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
function clubHtml(){
  const S=CL.S, fx=CL.fx, C=TUNING.club;
  const last=S.career.length?titleOf(S.career[S.career.length-1].title).name:null;
  let h='<header class="chd"><div><b>'+teamNameOf(TEAMS.azr)+'</b><small>第'+S.term+'任期 ・ リーグの格 '+S.grade+
    ' ・ 施設 Lv'+S.fac+(last?' ・ 称号「'+last+'」':'')+'</small></div>'+
    '<div class="num"><b>'+S.played+'<i>/'+C.termLen+'</i></b><small>試合</small></div>'+
    '<div class="num"><b>'+S.money.toFixed(0)+'<i>億</i></b><small>賞金</small></div></header>';

  // ---- 直前の試合 ----
  if(S.last&&S.g.step==="train"&&!CL.msg.length){
    const L=S.last;
    h+='<section class="card last"><h3>前の試合 <small>'+COMPS[L.comp].name+' '+L.label+'</small></h3>'+
      '<div class="sc2">'+TEAMS.azr.short+' <b>'+L.hg+' - '+L.ag+'</b> '+clubShort(L.opp)+
      (L.pso?' <small>(PK '+L.pso[0]+'-'+L.pso[1]+')</small>':'')+'</div>'+
      (L.card?'<div class="pay"><small>カードが出た'+(L.cardNew?' <b class="new">NEW</b>':'')+'</small>'+cardHtml(L.card,"m")+'</div>':'')+
      (L.lines.length?'<ul>'+L.lines.filter(x=>!/^カード:/.test(x)).map(x=>'<li>'+x+'</li>').join("")+'</ul>':'')+'</section>';
  }

  // ---- 次の試合 / 任期の終わり ----
  if(S.termOver){
    h+=termEndHtml();
  }else{
    const comp=COMPS[fx.comp], t=TEAMS[fx.opp], kp=CARDS[t.kp], st=styleOfCard(kp), ready=S.g.step!=="train";
    h+='<section class="card next"><h3>第'+fx.no+'試合 <small>'+gradeTag(comp.grade)+comp.name+' '+fx.label+'</small></h3>'+
      (fx.missed?'<p class="dim">'+COMPS[fx.missed].name+'('+fx.why+')の枠</p>':'')+
      '<div class="opp"><i class="chip" style="background:'+t.color+'"></i><div><b>'+teamNameOf(t)+'</b>'+
      '<small>'+stars(tierOf(fx.opp))+' ・ '+t.form+' ・ '+(fx.kind==="friendly"?"":fx.home?"ホーム":"アウェイ")+'</small>'+
      '<small>KP '+nameOf(kp)+(st?'｜'+st.name:'')+'</small></div></div>'+
      (fx.agg?'<p>第1試合 '+fx.agg[0]+' - '+fx.agg[1]+'(2試合の合計で決まる)</p>':'')+
      (fx.ko?'<p class="dim">同点なら PK 戦</p>':'')+
      (fx.kind==="friendly"?'<p class="dim">フレンドリーマッチ: 勝つと、兆しのある選手の覚醒・★5・黄金線が開花する</p>':'')+
      (ready?'<button class="btn btn-main" data-act="play">③ 試合へ</button>'
            :'<button class="btn btn-main" disabled>先にチーム練習を選ぶ</button>')+
      (fx.canDecline?'<button class="btn btn-sub" data-act="decline">棄権してフレンドリーマッチにする</button>':'')+
      '</section>';
    h+=developHtml();
  }

  h+=squadHtml();
  h+=collectionHtml();

  // ---- リーグ ----
  const L=S.league, order=sortTable(L.table);
  h+='<section class="card"><h3>レギュラーリーグ <small>'+L.done+'/14 節</small></h3><table class="tbl">'+
    '<tr><th></th><th></th><th>試</th><th>勝</th><th>分</th><th>敗</th><th>得失</th><th>点</th></tr>'+
    order.map((id,i)=>{ const r=L.table[id];
      return '<tr'+(id==="me"?' class="me"':'')+'><td>'+(i+1)+'</td><td class="nm2">'+clubName(id)+'</td><td>'+r.p+
        '</td><td>'+r.w+'</td><td>'+r.d+'</td><td>'+r.l+'</td><td>'+(r.gf-r.ga>0?"+":"")+(r.gf-r.ga)+'</td><td><b>'+r.pts+'</b></td></tr>'; }).join("")+
    '</table></section>';

  // ---- 大会 ----
  const stTxt={ wait:"—", in:"出場中", out:"敗退", quit:"棄権", won:"優勝" };
  h+='<section class="card"><h3>大会 <small>'+S.cyc+'周目</small></h3><table class="tbl cups">'+
    CUP_IDS.map(id=>{ const c=S.cups[id], past=SCHED.findIndex(s=>s[0]===id)<S.slot;
      const txt=c.st==="wait"?(past?"出場なし":entryOk(S,id)?"出場できる":"条件を満たしていない"):stTxt[c.st];
      return '<tr class="st-'+c.st+'"><td>'+gradeTag(COMPS[id].grade)+'</td><td class="nm2">'+COMPS[id].name+'</td><td>'+txt+'</td></tr>'; }).join("")+
    '</table></section>';

  // ---- 成績 ----
  const r=S.rec, names=S.titles.map(t=>COMPS[t.comp].name);
  h+='<section class="card"><h3>この任期</h3><p>'+r.w+'勝 '+r.d+'分 '+r.l+'敗 ・ 得点 '+r.gf+' / 失点 '+r.ga+'</p>'+
    '<p class="dim">獲得タイトル '+S.titles.length+(names.length?': '+names.slice(-6).join(" / "):'')+'</p></section>';

  h+=careerHtml();
  h+=settingsHtml();
  return h;
}

/** 試合を始める。配置は前の試合の最後のまま */
function startFixture(){
  skipComm(CL.S);                              // 残りのコミュニケーションは使わない
  const fx=CL.fx, m=fixtureMatch(CL.S,fx), comp=COMPS[fx.comp];
  CL.msg=[]; CL.comm=null; CL.pick=[];
  hideClub();
  newMatch(m.home,m.away,m.seed,m.opts,{ title:comp.name+(fx.label?" "+fx.label:""), career:true,
    starters:m.home.xi.map(x=>x.card.id) });
}
/** 試合が終わったら呼ぶ。結果を反映して保存し、クラブハウスへ戻る */
function finishFixture(M){
  const layout={}, onPitch=M.home.players.map(p=>p.id);
  M.home.players.forEach(p=>layout[p.id]=[r2(p.h),r2(p.x)]);
  const played=[...new Set((G.meta.starters||[]).concat(onPitch))];
  applyResult(CL.S,CL.W,CL.fx,{ hg:M.home.score, ag:M.away.score, pso:M.pso, layout, kp:M.home.kp, played, onPitch,
    starters:G.meta.starters||[], subs:M.home.subs,
    kpCh:M.events.filter(e=>e.type==="kp"&&e.side==="H").length });
  saveCareer(CL.store,CL.S);
  showClub();
}
function onClubClick(e){
  const b=e.target.closest("[data-act]");
  if(!b||b.disabled)return;
  const act=b.dataset.act, S=CL.S, save=()=>saveCareer(CL.store,S);
  if(act!=="reset")CL.armReset=false;
  if(onSettingsClick(act))return;
  if(act==="play")startFixture();
  else if(act==="decline"){ declineCup(S,CL.fx.comp); save(); showClub(true); }
  else if(act==="term"){ startNextTerm(S,CL.W); CL.msg=[]; save(); showClub(); }
  else if(act==="train"){
    const o=trainOptions(S)[+b.dataset.i];
    CL.msg=["練習: "+trainLabel(o)+"("+INT_LABEL[CL.int]+")"].concat(doTraining(S,+b.dataset.i,CL.int));
    CL.comm=null; CL.pick=[]; save(); showClub();
  }
  else if(act==="int"){ CL.int=+b.dataset.i; showClub(true); }
  else if(act==="cf"){ CL.cf=b.dataset.v; CL.sel=null; showClub(true); }
  else if(act==="card"){ CL.sel=CL.sel===b.dataset.id?null:b.dataset.id; showClub(true); }
  else if(act==="swap"&&CL.sel){
    const out=b.dataset.id, inn=CL.sel;
    if(swapSquad(S,out,inn)){ CL.msg=["登録: "+cname(out)+" → "+cname(inn)+"(次の試合から使える)"]; CL.sel=null; save(); }
    showClub(true);
  }
  else if(act==="sqpick"){
    const id=b.dataset.id;
    if(!CL.sqSel)CL.sqSel=id;
    else if(CL.sqSel===id)CL.sqSel=null;
    else{ moveSquad(S,CL.sqSel,id); CL.sqSel=null; save(); }
    showClub(true);
  }
  else if(act==="comm"){ CL.comm=b.dataset.v; CL.pick=[]; showClub(true); }
  else if(act==="ind"&&CL.pick.length===1){
    const r=doIndTrain(S,CL.pick[0]); CL.msg=CL.msg.concat(["個人練習"],r.lines);
    CL.pick=[]; save(); showClub(true);
  }
  else if(act==="talk"&&CL.pick.length===1){
    const r=doTalk(S,CL.pick[0]); CL.msg=CL.msg.concat(["声かけ"],r.lines);
    CL.pick=[]; save(); showClub(true);
  }
  else if(act==="pick"){
    const id=b.dataset.id, max=COMM_UI[CL.comm]?COMM_UI[CL.comm].n:1, i=CL.pick.indexOf(id);
    if(i>=0)CL.pick.splice(i,1); else{ if(CL.pick.length>=max)CL.pick.shift(); CL.pick.push(id); }
    showClub(true);
  }
  else if(act==="lounge"&&CL.pick.length===2){
    const r=doLounge(S,CL.pick[0],CL.pick[1],+b.dataset.i);
    CL.msg=CL.msg.concat(["ラウンジ: "+cname(CL.pick[0])+" と "+cname(CL.pick[1])],r.lines);
    CL.pick=[]; save(); showClub(true);
  }
  else if(act==="meet"&&CL.pick.length===1){
    const r=doMeeting(S,CL.pick[0],+b.dataset.i);
    CL.msg=CL.msg.concat(["ミーティング: "+cname(CL.pick[0])],r.lines);
    CL.pick=[]; save(); showClub(true);
  }
  else if(act==="reset"){
    if(!CL.armReset){ CL.armReset=true; showClub(true); return; }
    CL.armReset=false; clearCareer(CL.store); CL.msg=[];
    CL.S=newCareer(Date.now()&0x7fffffff); CL.W=worldOf(CL.S);
    saveCareer(CL.store,CL.S); showClub();
  }
}
