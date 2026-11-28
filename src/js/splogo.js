/**
 * スポンサーの架空の企業ロゴ(→docs/35)。社名(業種の頭 + 尾)から、マーク・英字のロゴタイプ・会社の色を決める。
 * 1つの設計図(spLogoSpec)を、画面用の SVG(spLogoSvg)と試合の背景のキャンバス(spLogoDraw)の2通りに描く。
 * 実在の企業のロゴに似る形は使わない。書体はゲームに入っている Oswald と Barlow Condensed だけ
 */
const SPL_ROMA={ "ミナト":"MINATO","ヒカリ":"HIKARI","アオバ":"AOBA","シンセイ":"SHINSEI","ユメノ":"YUMENO","カゼミチ":"KAZEMICHI","ハヤブサ":"HAYABUSA",
  "ミライ":"MIRAI","アークス":"ARX","ソウマ":"SOMA","ミノリ":"MINORI","アサヒノ":"ASAHINO","ユタカ":"YUTAKA","ハルカ":"HARUKA","ミドリ":"MIDORI",
  "ストライダ":"STRIDA","ハヤテ":"HAYATE","ジンバ":"JINBA","アスリオ":"ATHLIO","トップス":"TOPS","ネクサ":"NEXA","ルミナ":"LUMINA","カナタ":"KANATA",
  "ソラ":"SORA","ゼニス":"ZENITH","ピクセル":"PIXEL","スターリ":"STARRY","ノヴァ":"NOVA","ワンダ":"WONDA","ミラージュ":"MIRAGE","ツバサ":"TSUBASA",
  "アオゾラ":"AOZORA","セレスタ":"CELESTA","オリオン":"ORION","カモメ":"KAMOME","シズク":"SHIZUKU","イズミ":"IZUMI","ミナモ":"MINAMO","サワ":"SAWA",
  "アクア":"AQUA","ケンセイ":"KENSEI","ヤスラギ":"YASURAGI","ミマモリ":"MIMAMORI","ユウキ":"YUKI","サクラ":"SAKURA","ヤマト":"YAMATO","コガネ":"KOGANE",
  "アストラ":"ASTRA","グランデ":"GRANDE","ホクト":"HOKUTO","ステラ":"STELLA","ヒノデ":"HINODE","アカツキ":"AKATSUKI","ルクス":"LUX",
  "ロイヤル・":"ROYAL","サルタン・":"SULTAN","オアシス・":"OASIS","デザートローズ・":"DESERT ROSE","ゴールデンファルコン・":"GOLDEN FALCON" };
const SPL_SUF={ "電機":"ELECTRIC","家電":"","エレクトリック":"ELECTRIC","自動車":"AUTOMOBILE","モーターズ":"MOTORS","オート":"AUTO","食品":"FOODS",
  "フーズ":"FOODS","ニュートリション":"NUTRITION","スポーツ":"SPORTS","アスレチック":"ATHLETIC","テック":"TECH","デバイス":"DEVICES","システムズ":"SYSTEMS",
  "ゲームス":"GAMES","エンタテインメント":"ENTERTAINMENT","トラベル":"TRAVEL","エアラインズ":"AIRLINES","ツーリスト":"TOURIST","飲料":"BEVERAGE",
  "ビバレッジ":"BEVERAGE","ウォーター":"WATER","メディカル":"MEDICAL","製薬":"PHARMA","ヘルスケア":"HEALTHCARE","銀行":"BANK","証券":"SECURITIES",
  "フィナンシャル":"FINANCIAL","放送":"BROADCASTING","エンタープライズ":"ENTERPRISE","プロダクション":"PRODUCTION","インベストメント":"INVESTMENT",
  "キャピタル":"CAPITAL","ホールディングス":"HOLDINGS" };
/** 業種ごとの会社の色の組([主, 差し色])と、マーク・型の固定 */
const SPL_IND={
  car:{ col:[["#c8102e","#1b1b1b"],["#1d3c8f","#9aa6b8"],["#1b1b1b","#c8102e"]], mark:"wing" },
  kaden:{ col:[["#0067c0","#5ab4ff"],["#e60033","#333333"]], mark:"spark" },
  it:{ col:[["#5b2bd6","#22c3e6"],["#0a7cff","#1b1b1b"]], mark:"hex" },
  drink:{ col:[["#0096d6","#7fd3ff"],["#00a650","#9be3b4"]], mark:"drop" },
  sports:{ col:[["#1b1b1b","#ff4e00"],["#e4002b","#1b1b1b"]], mark:"slash", type:2 },
  finance:{ col:[["#004a2f","#c9a227"],["#0b2a5b","#c9a227"]], mark:"pillar", type:1 },
  travel:{ col:[["#00438a","#e63946"],["#0d7aa8","#f4b400"]], mark:"bird" },
  game:{ col:[["#e4007f","#ffd400"],["#ff3b30","#1b1b1b"]], mark:"play" },
  medic:{ col:[["#00a19a","#bdeeea"],["#1f5fbf","#bcd6ff"]], mark:"plus", type:1 },
  media:{ col:[["#ff7a00","#1b1b1b"],["#c8102e","#ffd400"]], mark:"star" },
  food:{ col:[["#3a9b3a","#f2b705"],["#d35400","#3a9b3a"]], mark:"leaf" },
  oil:{ col:[["#0b3b2e","#d4af37"]], mark:"crown", type:2 } };
const splHash=s=>{ let h=2166136261; for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619); return h>>>0; };
/** マークの形(40×40)。p = 塗り / s = 線。円や四角も path で書く(キャンバスの Path2D でも描けるように) */
const SPL_CIRC=(cx,cy,r)=>"M"+(cx-r)+" "+cy+"a"+r+" "+r+" 0 1 0 "+(2*r)+" 0a"+r+" "+r+" 0 1 0 "+(-2*r)+" 0Z";
function splMark(k,c1,c2,w){
  const W=w||"#fff";
  switch(k){
    case "wing": return [{ p:"M2 26L20 8L38 26L30 26L20 16L10 26Z", f:c1 },{ p:"M8 32L20 20L32 32L26 32L20 26L14 32Z", f:c2 }];
    case "spark": return [{ p:SPL_CIRC(20,20,17), f:c1 },{ p:"M22 6L12 22L19 22L16 34L28 16L21 16Z", f:W }];
    case "hex": return [{ p:"M20 2L36 11L36 29L20 38L4 29L4 11Z", f:c1 },{ p:"M20 2L36 11L20 20L4 11Z", f:c2 },{ p:"M20 20L20 38L4 29L4 11Z", f:"rgba(0,0,0,.18)" }];
    case "drop": return [{ p:"M20 2C28 14 34 20 34 27A14 12 0 0 1 6 27C6 20 12 14 20 2Z", f:c1 },{ s:"M13 26A8 8 0 0 0 20 33", c:W, w:3 }];
    case "slash": return [{ p:"M4 34L16 6L24 6L12 34Z", f:c1 },{ p:"M16 34L28 6L36 6L24 34Z", f:c2 }];
    case "pillar": return [{ p:"M20 3L37 12L3 12Z", f:c1 },{ p:"M6 14h5v16h-5zM17.5 14h5v16h-5zM29 14h5v16h-5z", f:c1 },{ p:"M3 32h34v5h-34z", f:c2 }];
    case "bird": return [{ p:"M2 24C12 12 22 10 38 6C28 14 24 20 20 30C16 24 10 22 2 24Z", f:c1 },{ p:SPL_CIRC(31,27,5), f:c2 }];
    case "play": return [{ p:"M11 4h18a9 9 0 0 1 9 9v14a9 9 0 0 1-9 9H11a9 9 0 0 1-9-9V13a9 9 0 0 1 9-9Z", f:c1 },{ p:"M15 12L29 20L15 28Z", f:c2 }];
    case "plus": return [{ p:SPL_CIRC(20,20,18), f:c1 },{ p:"M16 8h8v8h8v8h-8v8h-8v-8H8v-8h8z", f:W }];
    case "star": return [{ p:"M20 2L24.5 15L38 15L27 23L31 37L20 28.5L9 37L13 23L2 15L15.5 15Z", f:c1 },{ p:SPL_CIRC(20,20,4.5), f:c2 }];
    case "leaf": return [{ p:"M6 34C6 14 18 4 36 4C36 22 26 34 6 34Z", f:c1 },{ s:"M8 32C16 22 24 14 32 8", c:c2, w:2.6 }];
    case "crown": return [{ p:"M4 30L6 10L14 20L20 6L26 20L34 10L36 30Z", f:c2 },{ p:"M4 31h32v5h-32z", f:c1 }];
  }
  return [];
}
/** 社名を頭と尾に分ける(業種の候補と照らし合わせる) */
function splParts(sp){
  const ind=typeof spIndOf==="function"?spIndOf(sp.ind):null, nm=sp.name||"";
  const pre=ind&&ind.pre.find(p=>nm.indexOf(p)===0)||"", suf=ind&&ind.suf.find(s=>nm.slice(pre.length)===s)||nm.slice(pre.length);
  return { pre, suf };
}
/** 会社の色の組 */
function spColors(sp){
  const I=SPL_IND[sp.ind]||SPL_IND.car;
  return I.col[splHash(sp.name||"")%I.col.length];
}
/**
 * ロゴの設計図。高さ 40 の座標で { W, parts }。parts は
 *   { g:[マークの形], x, y, k }(平行移動と拡大)/ { r:[x,y,w,h], f } / { t:文字, x, y, fs, fam, len, f, ls, op }
 * fam … "o7" Oswald 700 / "o5" Oswald 500 / "b8" Barlow Condensed 800 斜体。len … 文字の幅(この幅に合わせて描く)
 */
function spLogoSpec(sp,onDark){
  const I=SPL_IND[sp.ind]||SPL_IND.car, h=splHash(sp.name||""), [c1,c2]=spColors(sp), P=splParts(sp);
  const w1=SPL_ROMA[P.pre]||"", w2=SPL_SUF[P.suf]!=null?SPL_SUF[P.suf]:"", t=I.type!=null?I.type:(h>>3)%3;
  if(!w1)return { W:10*(sp.name||"").length+10, parts:[{ t:sp.name||"", x:4, y:27, fs:20, fam:"o7", len:10*(sp.name||"").length, f:onDark?"#fff":c1 }] };
  if(t===1){   // B 会社の色の帯に白抜き
    const L1=w1.length*11.2, L2=w2?w2.length*6.2:0, W=40+L1+(w2?L2+10:0)+10, bg=onDark?"#fff":c1, fg=onDark?c1:"#fff";
    return { W, parts:[{ r:[0,2,W,36], f:bg },{ g:splMark(I.mark,fg,onDark?c2:c2,bg), x:5, y:5, k:0.75 },
      { t:w1, x:40, y:28, fs:21, fam:"o7", len:L1, f:fg, ls:1 }].concat(w2?[{ t:w2, x:40+L1+8, y:27, fs:10, fam:"o5", len:L2, f:fg, op:0.85 }]:[]) };
  }
  if(t===2){   // C 斜体の文字 + 下線の帯
    const L1=w1.length*15.5, W=L1+14;
    return { W, parts:[{ t:w1, x:3, y:29, fs:32, fam:"b8", len:L1, f:onDark?"#fff":c1 },{ p:"M5 33L"+(W-5)+" 31L"+(W-9)+" 36.5L2 37.5Z", f:c2 }] };
  }
  // A マーク + 横文字(下に添え字)
  const L1=w1.length*12.6, L2=w2?w2.length*6.6:0, W=47+Math.max(L1,L2)+4;
  const inner=I.mark==="play"||I.mark==="star"||I.mark==="hex";   // 模様がマークの中にあるものは、暗い地では会社の色で抜く
  return { W, parts:[{ g:splMark(I.mark,onDark?"#fff":c1,onDark?(inner?c1:"rgba(255,255,255,.6)"):c2,onDark?c1:"#fff"), x:0, y:0, k:1 },
    { t:w1, x:47, y:w2?24:28, fs:w2?23:26, fam:"o7", len:L1, f:onDark?"#fff":"#151515" }].concat(w2?[{ t:w2, x:48, y:36, fs:9.5, fam:"o5", len:L2, f:onDark?"#fff":c1, ls:2 }]:[]) };
}
const SPL_FONT={ o7:['Oswald',700,'normal'], o5:['Oswald',500,'normal'], b8:['Barlow Condensed',800,'italic'] };
/** 画面用の SVG。cls … クラス名 */
function spLogoSvg(sp,onDark,cls){
  const L=spLogoSpec(sp,onDark), esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;");
  const one=q=>q.g?'<g transform="translate('+q.x+','+q.y+') scale('+q.k+')">'+q.g.map(m=>m.p?'<path d="'+m.p+'" fill="'+m.f+'"/>':'<path d="'+m.s+'" fill="none" stroke="'+m.c+'" stroke-width="'+m.w+'"/>').join("")+'</g>'
    :q.r?'<rect x="'+q.r[0]+'" y="'+q.r[1]+'" width="'+q.r[2]+'" height="'+q.r[3]+'" fill="'+q.f+'"/>'
    :q.p?'<path d="'+q.p+'" fill="'+q.f+'"/>'
    :'<text x="'+q.x+'" y="'+q.y+'" font-family="'+SPL_FONT[q.fam][0]+'" font-weight="'+SPL_FONT[q.fam][1]+'" font-style="'+SPL_FONT[q.fam][2]+'" font-size="'+q.fs+'"'+
      ' textLength="'+q.len.toFixed(1)+'" lengthAdjust="spacingAndGlyphs" fill="'+q.f+'"'+(q.op?' opacity="'+q.op+'"':'')+'>'+esc(q.t)+'</text>';
  return '<svg class="'+(cls||"splogo")+'" viewBox="0 0 '+L.W.toFixed(1)+' 40" role="img" aria-label="'+esc(sp.name||"")+'">'+L.parts.map(one).join("")+'</svg>';
}
/** キャンバスに描く(試合の奥の広告の帯)。cx・cy を中心に、高さ h・幅 maxW に収める */
function spLogoDraw(c,sp,onDark,cx,cy,h,maxW){
  const L=spLogoSpec(sp,onDark), k=Math.min(h/40,maxW/L.W);
  c.save(); c.translate(cx-L.W*k/2,cy-20*k); c.scale(k,k);
  for(const q of L.parts){
    if(q.g){ c.save(); c.translate(q.x,q.y); c.scale(q.k,q.k);
      for(const m of q.g){ const P=new Path2D(m.p||m.s); if(m.p){ c.fillStyle=m.f; c.fill(P); } else { c.strokeStyle=m.c; c.lineWidth=m.w; c.stroke(P); } }
      c.restore(); }
    else if(q.r){ c.fillStyle=q.f; c.fillRect(q.r[0],q.r[1],q.r[2],q.r[3]); }
    else if(q.p){ c.fillStyle=q.f; c.fill(new Path2D(q.p)); }
    else { const F=SPL_FONT[q.fam]; c.font=F[2]+" "+F[1]+" "+q.fs+"px '"+F[0]+"',sans-serif"; c.fillStyle=q.f; c.globalAlpha=q.op||1;
      c.textAlign="left"; c.textBaseline="alphabetic";
      const nw=c.measureText(q.t).width; c.save(); c.translate(q.x,q.y); c.scale(q.len/Math.max(1,nw),1); c.fillText(q.t,0,0); c.restore(); c.globalAlpha=1; }
  }
  c.restore();
}
/** パートナー企業(試合の広告の帯の残りの枠。→docs/35 §35.3)。自分のスポンサーと違う業種から、クラブのたねで決まった n 社 */
function spPartners(S,n){
  const ex=S&&S.biz&&S.biz.sp?S.biz.sp.ind:null, seed=(S&&S.seed||7)>>>0, out=[];
  const inds=SP_IND.filter(x=>x.id!==ex).map((x,i)=>({ x, r:splHash(seed+":"+x.id) })).sort((a,b)=>a.r-b.r).map(o=>o.x);
  for(let i=0;i<Math.min(n,inds.length);i++){ const x=inds[i], r=splHash(seed+":pn:"+x.id);
    out.push({ ind:x.id, name:x.pre[r%x.pre.length]+x.suf[(r>>5)%x.suf.length], dark:(r>>9)%2===0 }); }
  return out;
}
