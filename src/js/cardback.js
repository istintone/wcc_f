/* =========================================================================
   wcc_f — 適性のマップ・戦力のレーダー・カードの裏(→docs/14 §14.14)
   DOM に触らない(HTML / SVG の文字列を返すだけ)。
     適性のマップ … ピッチを役割の区分(engine.js の roleAt と同じ境目)で塗り分ける。
                    得意な役割 = 緑・濃く / 同じポジション = 金 / 隣のポジション = 灰・薄く / それ以外は塗らない
     レーダー     … 戦力グラフの6軸の六角形(本家の戦力グラフにならう)
     カードの裏   … 番号・名前・得意な役割・ピッチの適性マップ・能力・スキル・KP・キャプテンシー
   ========================================================================= */

const APT_FILL={ own:["#2fb26a",0.5], group:["#d4a843",0.32], near:["#9aa3b5",0.16] };
/** 役割の区分(h … 0 = 自ゴール 〜 1、x … 0 〜 100)。roleAt の境目と同じ */
function aptZones(card){
  const Z=TUNING.zone, A=TUNING.apt, out=[];
  // 細かいポジション(→docs/17)。[下, 上, 中央, 左, 右]
  const rows=[[0.15,Z.dfH,"CB","LSB","RSB"],[Z.dfH,Z.dmfH,"DMF","LMF","RMF"],[Z.dmfH,Z.omfH,"CMF","LMF","RMF"],[Z.omfH,Z.fwH,"OMF","LMF","RMF"],
    [Z.fwH,Z.cfH,"ST","LWG","RWG"],[Z.cfH,0.97,"CF","LWG","RWG"]];
  const lv=role=>{ const a=aptOf(card,role); return a>=A.own?"own":a>=A.group?"group":a>=A.near?"near":null; };
  if(card.pos==="GK")out.push({ h0:0.02, h1:0.15, x0:30, x1:70, role:"GK", lv:"own" });
  else for(const [h0,h1,mid,l,r] of rows){
    out.push({ h0, h1, x0:0, x1:Z.wide, role:l, lv:lv(l) });
    out.push({ h0, h1, x0:Z.wide, x1:100-Z.wide, role:mid, lv:lv(mid) });
    out.push({ h0, h1, x0:100-Z.wide, x1:100, role:r, lv:lv(r) });
  }
  return out;
}
/**
 * 盤面に重ねる適性の色(動かしている間だけ出す)。map(h,x) → [左%, 上%] は、その盤面の座標の変換(SQUAD は sqPos、試合は bdPos)
 */
function aptOverlaySvg(card,map){
  let g='';
  for(const z of aptZones(card)){ if(!z.lv)continue;
    const a=map(z.h1,z.x0), b=map(z.h0,z.x1), F=APT_FILL[z.lv];
    g+='<rect x="'+Math.min(a[0],b[0]).toFixed(2)+'" y="'+Math.min(a[1],b[1]).toFixed(2)+'" width="'+Math.abs(b[0]-a[0]).toFixed(2)+'" height="'+Math.abs(b[1]-a[1]).toFixed(2)+'" fill="'+F[0]+'" fill-opacity="'+F[1]+'"/>'; }
  return '<svg class="apt-ov" viewBox="0 0 100 100" preserveAspectRatio="none">'+g+'</svg>';
}
/** カードの裏の、小さなピッチの適性マップ(縦。自ゴールが下)。区分ごとに役割の名前 */
function aptMapSvg(card){
  const W=60, H=84, X=x=>x/100*W, Y=h=>H-h*H;
  let g='<rect x="0" y="0" width="'+W+'" height="'+H+'" fill="#1d6a33"/>';
  // 名前はポジションごとに1回だけ(サイドの MF・WG は縦に何段かあるので、まとめた範囲の真ん中に。→docs/14 §14.80)
  const box={};
  for(const z of aptZones(card)){
    const F=z.lv?APT_FILL[z.lv]:null, x=X(z.x0), y=Y(z.h1), w=X(z.x1)-X(z.x0), h=Y(z.h0)-Y(z.h1);
    if(F)g+='<rect x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+w.toFixed(1)+'" height="'+h.toFixed(1)+'" fill="'+F[0]+'" fill-opacity="'+Math.min(1,F[1]*1.8)+'"/>';
    if(z.lv==="own"){ const B=box[z.role]||(box[z.role]={ x0:x, x1:x+w, y0:y, y1:y+h });
      B.x0=Math.min(B.x0,x); B.x1=Math.max(B.x1,x+w); B.y0=Math.min(B.y0,y); B.y1=Math.max(B.y1,y+h); }
  }
  for(const role in box){ const B=box[role];
    g+='<text x="'+((B.x0+B.x1)/2).toFixed(1)+'" y="'+((B.y0+B.y1)/2+2).toFixed(1)+'" text-anchor="middle" font-size="5.5" font-weight="700" fill="#fff">'+role+'</text>'; }
  g+='<g fill="none" stroke="#fff" stroke-opacity=".55" stroke-width=".6"><rect x="1" y="1" width="'+(W-2)+'" height="'+(H-2)+'"/><line x1="1" y1="'+H/2+'" x2="'+(W-1)+'" y2="'+H/2+'"/>'+
    '<circle cx="'+W/2+'" cy="'+H/2+'" r="6"/><rect x="'+(W*0.25)+'" y="'+(H-12)+'" width="'+(W*0.5)+'" height="11"/><rect x="'+(W*0.25)+'" y="1" width="'+(W*0.5)+'" height="11"/></g>';
  return '<svg class="apt-map" viewBox="0 0 '+W+' '+H+'">'+g+'</svg>';
}

/* ---- 戦力のレーダー(6軸の六角形) ---- */
const RADAR_AX=["O","R","S","D","C","P"];     // 時計回り(上がオフェンス)。向かい合う軸が成長グラフの対角(OFE↔DEF・TEC↔STA・SPE↔POW。→docs/15 §15.1)
/**
 * レーダー。線と軸の名前は文字の色(currentColor)。地の明るさは CSS の .radar の color で合わせる
 * sets … [{ v:{O:0〜1,...}, color, fill }](2つ重ねると比べられる)。labels … 軸の名前を出すか。gold … { 軸:true } の名前を金色で光らせる(成長グラフ)
 */
function radarSvg(sets,opts){
  opts=opts||{};
  const R=40, cx=50, cy=50, pt=(i,r)=>{ const a=-Math.PI/2+i*Math.PI/3; return [cx+Math.cos(a)*r,cy+Math.sin(a)*r]; };
  const ring=k=>RADAR_AX.map((_,i)=>pt(i,R*k).map(n=>n.toFixed(1)).join(",")).join(" ");
  let g='<g class="rd-grid" fill="none" stroke="currentColor" stroke-opacity=".2" stroke-width=".6">'+[1,0.75,0.5,0.25].map(k=>'<polygon points="'+ring(k)+'"/>').join("")+
    RADAR_AX.map((_,i)=>{ const p=pt(i,R); return '<line x1="'+cx+'" y1="'+cy+'" x2="'+p[0].toFixed(1)+'" y2="'+p[1].toFixed(1)+'"/>'; }).join("")+'</g>';
  for(const s of sets){
    const pts=RADAR_AX.map((a,i)=>pt(i,R*Math.max(0.04,Math.min(1,s.v[a]||0))).map(n=>n.toFixed(1)).join(",")).join(" ");
    const lt=lightColor(s.color);   // 白など明るいチームの色は、白い地で見えないので濃い灰色に(→docs/14 §14.164)
    g+='<polygon points="'+pts+'" fill="'+(lt?"#8b919a":(s.fill||s.color))+'" fill-opacity="'+(s.op!=null?s.op:0.35)+'" stroke="'+(lt?"#3c4048":s.color)+'" stroke-width="1.4"/>';
  }
  if(opts.labels!==false)g+=RADAR_AX.map((a,i)=>{ const p=pt(i,R+7.5); return '<text x="'+p[0].toFixed(1)+'" y="'+(p[1]+2.4).toFixed(1)+'" text-anchor="middle" font-size="7.6" font-weight="700" '+(opts.hl&&opts.hl[a]?'class="h'+opts.hl[a]+'"':opts.gold&&opts.gold[a]?'class="gd" fill="#e8b11c"':'fill="currentColor"')+'>'+AXIS_ABBR[a]+(opts.vals&&opts.vals[a]!=null?'<tspan class="vv" x="'+p[0].toFixed(1)+'" dy="6.6">'+opts.vals[a].toFixed(1)+'</tspan>':'')+(opts.delta&&opts.delta[a]?'<tspan class="dv '+(opts.delta[a]>0?'u':'d')+'" x="'+p[0].toFixed(1)+'" dy="6.6">'+(opts.delta[a]>0?'+':'')+opts.delta[a].toFixed(1)+'</tspan>':'')+'</text>'; }).join("");
  return '<svg class="radar'+(opts.cls?' '+opts.cls:'')+'" viewBox="-6 -2 112 '+(opts.vals||opts.delta?112:104)+'">'+g+'</svg>';
}
/** 明るい色か(#rgb / #rrggbb。明るさ 0.8 以上) */
function lightColor(c){
  const m=/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c||""); if(!m)return false;
  const h=m[1].length===3?m[1].replace(/./g,x=>x+x):m[1], n=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255);
  return 0.2126*n[0]+0.7152*n[1]+0.0722*n[2]>=0.8;
}
/** チームの戦力の6軸を 0〜1 に(先発の能力の上位6人の平均)。cards … 先発11人のカード */
function teamAxes(cards){
  const v={};
  for(const a of RADAR_AX){ const f=AXIS_STAT[a], top=cards.map(c=>f(c)).sort((x,y)=>y-x).slice(0,6);
    const base=top.reduce((s,x)=>s+x,0)/(top.length||1);
    v[a]=(base-8)/9; }                         // 能力の目盛りは実際の幅(8〜17)に合わせる
  return v;
}

/* ---- カードの裏(本家のカードの裏の構成にならう。意匠は独自) ---- */
/** c … カード(育成を入れたものでもよい)。x … { stars:[個,特], extra:'追加の行の HTML', front:'左端に出すカードの表面の HTML' } */
function cardBackHtml(c,x){
  x=x||{};
  const sk=c.skill?SKILLS[c.skill]:null, st=styleOfCard(c), R=typeof rareOfCard==="function"?rareOfCard(c):null;
  const bar=k=>{ const v=c[k], w=v/STAT_MAX*100; return '<div class="cb-st"><i>'+STAT_LABEL[k]+'</i><em><u style="width:'+w.toFixed(0)+'%"></u></em><b>'+(Math.round(v*10)/10)+'</b></div>'; };
  return '<div class="cardback r-'+(c.rar||"B")+'">'+
    '<div class="cb-head"><b class="cb-no">'+c.no+'</b><div><b>'+nameOf(c)+'</b><small>'+(typeof cardNoOf==="function"?cardNoOf(c)+' ・ ':'')+(typeof clubOfCard==="function"?clubOfCard(c):'')+(c.age?' ・ '+c.age+'歳':'')+'</small></div>'+
      '<span class="cb-pos '+c.pos.toLowerCase()+'">'+c.pos+'</span></div>'+
    '<div class="cb-body'+(x.front?' wf':'')+'">'+(x.front?'<div class="cb-front">'+x.front+'</div>':'')+'<div class="cb-map">'+aptMapSvg(c)+'<small>'+c.roles.join(" / ")+'</small></div>'+
      '<div class="cb-sts">'+STATS.map(bar).join("")+'<div class="cb-tot">合計 <b>'+Math.round(STATS.reduce((s,k)=>s+c[k],0))+'</b>'+
        (x.stars?' ・ 個★'+x.stars[0]+' 特★'+x.stars[1]:'')+'</div></div></div>'+
    '<div class="cb-foot">'+(sk?'<p><b>★'+sk.label+'</b> '+sk.desc+'</p>':'')+
      (st?'<p><b>KP: '+st.name+'</b> <small>'+(st.scope==="team"?"全体":"個人")+'・'+AXIS_ABBR[st.axis]+'</small></p>':'')+
      (R?'<p class="cb-rare"><b>RARE KP</b> '+((x.ss||0)>=5?R.name:'？？？(特殊能力★5で解放)')+'</p>':'')+
      '<p class="dim">キャプテンシー '+CAP_MARK[capApt(c)]+(typeof natTxt==="function"?' ・ '+natTxt(c):'')+'</p>'+(x.extra||'')+'</div></div>';
}
