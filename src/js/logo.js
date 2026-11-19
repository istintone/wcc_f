/* =========================================================================
   wcc_f — ロゴ「スラッシュ・ボール」(→docs/14 第3弾)。独自の意匠。
   本家のロゴは写さない。借りたのは「ボールを描いたスタイリッシュなロゴ」という方向性だけ。
     マーク … 円の中の五角形と放射線の抽象的なボールに、赤い斜めの切れ込みが2本
     文字   … 「WCC + ボール + F」(-8°の斜体)。ボールから金の弧(軌跡)が文字の下へ伸びる
   DOM に触らない(SVG の文字列を返すだけ)。
   ========================================================================= */

/** ボールのマーク。r … 半径(viewBox の単位)、cx/cy … 中心 */
function ballMarkSvg(cx,cy,r,id){
  const P=[], R=r*0.4;
  for(let i=0;i<5;i++){ const a=-Math.PI/2+i*Math.PI*2/5; P.push([cx+Math.cos(a)*R,cy+Math.sin(a)*R]); }
  const pent=P.map(p=>p[0].toFixed(1)+","+p[1].toFixed(1)).join(" ");
  // 五角形の頂点から縁へ放射線(縫い目)
  const rays=P.map(p=>{ const dx=p[0]-cx, dy=p[1]-cy, k=r/Math.hypot(dx,dy)*0.97;
    return '<line x1="'+p[0].toFixed(1)+'" y1="'+p[1].toFixed(1)+'" x2="'+(cx+dx*k).toFixed(1)+'" y2="'+(cy+dy*k).toFixed(1)+'"/>'; }).join("");
  // 斜めの切れ込み2本(ボールの真ん中を左下から右上へ横切る帯。円で切り抜く)
  const band=(o,w)=>'<rect x="'+(cx-r*1.3).toFixed(1)+'" y="'+(cy+o).toFixed(1)+'" width="'+(r*2.6).toFixed(1)+'" height="'+w.toFixed(1)+'"/>';
  return '<g class="lg-ball"><clipPath id="'+id+'"><circle cx="'+cx+'" cy="'+cy+'" r="'+r+'"/></clipPath>'+
    '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="#fff"/>'+
    '<g clip-path="url(#'+id+')"><g stroke="#16181f" stroke-width="'+(r*0.07).toFixed(2)+'" stroke-linecap="round">'+rays+'</g>'+
      '<polygon points="'+pent+'" fill="#16181f"/>'+
      '<g transform="rotate(-28 '+cx+' '+cy+')"><g fill="#fff">'+band(r*0.08,r*0.42)+'</g><g fill="#e01f3d">'+band(r*0.14,r*0.2)+band(r*0.4,r*0.08)+'</g></g></g>'+
    '<circle cx="'+cx+'" cy="'+cy+'" r="'+(r-r*0.035)+'" fill="none" stroke="#16181f" stroke-width="'+(r*0.07).toFixed(2)+'"/></g>';
}
/** マークだけ(アイコン・透かし・看板に) */
function logoMarkSvg(size,cls){
  return '<svg class="lg-mark '+(cls||"")+'" viewBox="0 0 100 100" width="'+size+'" height="'+size+'" aria-hidden="true">'+ballMarkSvg(50,50,46,"lgm"+(cls||""))+'</svg>';
}
/** ロゴ全体(文字・ボール・金の弧・副題)。anim … 入りの動きを付ける */
let LOGO_N=0;
function logoSvg(anim){
  const id="lgc"+(++LOGO_N);
  const F='font-family="Oswald,\'Arial Narrow\',\'Helvetica Neue\',system-ui,sans-serif" font-weight="700" font-style="italic"';
  return '<svg class="lg'+(anim?' anim':'')+'" viewBox="0 0 312 150" role="img" aria-label="wcc_f">'+
    '<defs><linearGradient id="'+id+'g" x1="0" x2="1"><stop offset="0" stop-color="#8a6a1e"/><stop offset=".55" stop-color="#f0cf75"/><stop offset="1" stop-color="#fff3c4"/></linearGradient>'+
      '<linearGradient id="'+id+'s" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>'+
      '<clipPath id="'+id+'t"><text x="6" y="104" '+F+' font-size="104" textLength="168" lengthAdjust="spacingAndGlyphs">WCC</text><text x="254" y="104" '+F+' font-size="104" textLength="44" lengthAdjust="spacingAndGlyphs">F</text></clipPath></defs>'+
    // 金の弧(ボールの軌跡)
    '<path class="lg-arc" d="M10 122 Q 140 138 200 96" fill="none" stroke="url(#'+id+'g)" stroke-width="7" stroke-linecap="round"/>'+
    '<g transform="skewX(-8)">'+
      '<g fill="#000" opacity=".55" transform="translate(5 5)"><text x="6" y="104" '+F+' font-size="104" textLength="168" lengthAdjust="spacingAndGlyphs">WCC</text><text x="254" y="104" '+F+' font-size="104" textLength="44" lengthAdjust="spacingAndGlyphs">F</text></g>'+
      '<g fill="#fff"><text x="6" y="104" '+F+' font-size="104" textLength="168" lengthAdjust="spacingAndGlyphs">WCC</text><text x="254" y="104" '+F+' font-size="104" textLength="44" lengthAdjust="spacingAndGlyphs">F</text></g>'+
      // 文字に走る光沢
      '<g clip-path="url(#'+id+'t)"><rect class="lg-shine" x="-120" y="0" width="70" height="150" fill="url(#'+id+'s)" transform="skewX(-20)"/></g>'+
    '</g>'+
    ballMarkSvg(216,66,33,id+"b")+
    '<text x="156" y="146" text-anchor="middle" font-family="Oswald,\'Arial Narrow\',system-ui,sans-serif" font-weight="400" font-size="13" letter-spacing="6" fill="#fff" opacity=".85">CLUB CARD FOOTBALL</text>'+
    '</svg>';
}
