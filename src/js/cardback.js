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
  const rows=[[0.15,Z.dfH,"CB","SB"],[Z.dfH,Z.dmfH,"DMF","SMF"],[Z.dmfH,Z.omfH,"CMF","SMF"],[Z.omfH,Z.fwH,"OMF","SMF"],[Z.fwH,0.97,"CF","WG"]];
  const lv=role=>{ const a=aptOf(card,role); return a>=A.own?"own":a>=A.group?"group":a>=A.near?"near":null; };
  if(card.pos==="GK")out.push({ h0:0.02, h1:0.15, x0:30, x1:70, role:"GK", lv:"own" });
  else for(const [h0,h1,mid,side] of rows){
    out.push({ h0, h1, x0:0, x1:Z.wide, role:side, lv:lv(side) });
    out.push({ h0, h1, x0:Z.wide, x1:100-Z.wide, role:mid, lv:lv(mid) });
    out.push({ h0, h1, x0:100-Z.wide, x1:100, role:side, lv:lv(side) });
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
  for(const z of aptZones(card)){
    const F=z.lv?APT_FILL[z.lv]:null, x=X(z.x0), y=Y(z.h1), w=X(z.x1)-X(z.x0), h=Y(z.h0)-Y(z.h1);
    if(F)g+='<rect x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+w.toFixed(1)+'" height="'+h.toFixed(1)+'" fill="'+F[0]+'" fill-opacity="'+Math.min(1,F[1]*1.8)+'"/>';
    if(z.lv==="own")g+='<text x="'+(x+w/2).toFixed(1)+'" y="'+(y+h/2+2).toFixed(1)+'" text-anchor="middle" font-size="5.5" font-weight="700" fill="#fff">'+z.role+'</text>';
  }
  g+='<g fill="none" stroke="#fff" stroke-opacity=".55" stroke-width=".6"><rect x="1" y="1" width="'+(W-2)+'" height="'+(H-2)+'"/><line x1="1" y1="'+H/2+'" x2="'+(W-1)+'" y2="'+H/2+'"/>'+
    '<circle cx="'+W/2+'" cy="'+H/2+'" r="6"/><rect x="'+(W*0.25)+'" y="'+(H-12)+'" width="'+(W*0.5)+'" height="11"/><rect x="'+(W*0.25)+'" y="1" width="'+(W*0.5)+'" height="11"/></g>';
  return '<svg class="apt-map" viewBox="0 0 '+W+' '+H+'">'+g+'</svg>';
}

/* ---- 戦力のレーダー(6軸の六角形) ---- */
const RADAR_AX=["O","R","S","P","C","D"];     // 時計回り(上がオフェンス)
/**
 * レーダー。sets … [{ v:{O:0〜1,...}, color, fill }](2つ重ねると比べられる)。labels … 軸の名前を出すか
 */
function radarSvg(sets,opts){
  opts=opts||{};
  const R=40, cx=50, cy=50, pt=(i,r)=>{ const a=-Math.PI/2+i*Math.PI/3; return [cx+Math.cos(a)*r,cy+Math.sin(a)*r]; };
  const ring=k=>RADAR_AX.map((_,i)=>pt(i,R*k).map(n=>n.toFixed(1)).join(",")).join(" ");
  let g='<g fill="none" stroke="rgba(255,255,255,.18)" stroke-width=".6">'+[1,0.75,0.5,0.25].map(k=>'<polygon points="'+ring(k)+'"/>').join("")+
    RADAR_AX.map((_,i)=>{ const p=pt(i,R); return '<line x1="'+cx+'" y1="'+cy+'" x2="'+p[0].toFixed(1)+'" y2="'+p[1].toFixed(1)+'"/>'; }).join("")+'</g>';
  for(const s of sets){
    const pts=RADAR_AX.map((a,i)=>pt(i,R*Math.max(0.04,Math.min(1,s.v[a]||0))).map(n=>n.toFixed(1)).join(",")).join(" ");
    g+='<polygon points="'+pts+'" fill="'+(s.fill||s.color)+'" fill-opacity="'+(s.op!=null?s.op:0.35)+'" stroke="'+s.color+'" stroke-width="1.4"/>';
  }
  if(opts.labels!==false)g+=RADAR_AX.map((a,i)=>{ const p=pt(i,R+7); return '<text x="'+p[0].toFixed(1)+'" y="'+(p[1]+2).toFixed(1)+'" text-anchor="middle" font-size="6.5" font-weight="700" fill="#dfe3ea">'+AXIS_LABEL[a].slice(0,opts.short?2:9)+'</text>'; }).join("");
  return '<svg class="radar'+(opts.cls?' '+opts.cls:'')+'" viewBox="-6 -2 112 104">'+g+'</svg>';
}
/** チームの6軸を 0〜1 に(先発の能力の上位6人の平均 + 戦力グラフの上乗せ)。cards … 先発11人のカード、graph … S.g.graph など */
function teamAxes(cards,graph){
  const v={};
  for(const a of RADAR_AX){ const f=AXIS_STAT[a], top=cards.map(c=>f(c)).sort((x,y)=>y-x).slice(0,6);
    const base=top.reduce((s,x)=>s+x,0)/(top.length||1)+(graph&&graph[a]||0);
    v[a]=(base-8)/9; }                         // 能力の目盛りは実際の幅(8〜17)に合わせる
  return v;
}

/* ---- カードの裏(本家のカードの裏の構成にならう。意匠は独自) ---- */
/** c … カード(育成を入れたものでもよい)。x … { stars:[個,特], extra:'追加の行の HTML' } */
function cardBackHtml(c,x){
  x=x||{};
  const sk=c.skill?SKILLS[c.skill]:null, st=styleOfCard(c), R=typeof rareOfCard==="function"?rareOfCard(c):null;
  const bar=k=>{ const v=c[k], w=v/STAT_MAX*100; return '<div class="cb-st"><i>'+STAT_LABEL[k]+'</i><em><u style="width:'+w.toFixed(0)+'%"></u></em><b>'+(Math.round(v*10)/10)+'</b></div>'; };
  return '<div class="cardback r-'+(c.rar||"B")+'">'+
    '<div class="cb-head"><b class="cb-no">'+c.no+'</b><div><b>'+nameOf(c)+'</b><small>'+(typeof cardNoOf==="function"?cardNoOf(c)+' ・ ':'')+(typeof clubOfCard==="function"?clubOfCard(c):'')+(c.age?' ・ '+c.age+'歳':'')+'</small></div>'+
      '<span class="cb-pos '+c.pos.toLowerCase()+'">'+c.pos+'</span></div>'+
    '<div class="cb-body"><div class="cb-map">'+aptMapSvg(c)+'<small>'+c.roles.join(" / ")+'</small></div>'+
      '<div class="cb-sts">'+STATS.map(bar).join("")+'<div class="cb-tot">合計 <b>'+Math.round(STATS.reduce((s,k)=>s+c[k],0))+'</b>'+
        (x.stars?' ・ 個★'+x.stars[0]+' 特★'+x.stars[1]:'')+'</div></div></div>'+
    '<div class="cb-foot">'+(sk?'<p><b>★'+sk.label+'</b> '+sk.desc+'</p>':'')+
      (st?'<p><b>KP: '+st.name+'</b> <small>'+(st.scope==="team"?"全体":"個人")+'・'+AXIS_LABEL[st.axis]+'</small></p>':'')+
      (R?'<p class="cb-rare"><b>RARE KP</b> '+((x.ss||0)>=5?R.name:'？？？(特殊能力★5で解放)')+'</p>':'')+
      '<p class="dim">キャプテンシー '+CAP_MARK[capApt(c)]+(typeof natTxt==="function"?' ・ '+natTxt(c):'')+'</p>'+(x.extra||'')+'</div></div>';
}
