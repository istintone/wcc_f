/* =========================================================================
   wcc_f — 設定とデータ(→docs/01 §1.4・§1.5)
   ・実名パック: JSON ファイルを選んで読み込む。**その端末の中だけ**に保存し、表示名を差し替える
     (本体には実名を入れない。fetch で取りに行かない)
   ・セーブの書き出し / 読み込み: 機種変更やブラウザのデータ消去に備える
   ========================================================================= */

const PACK_KEY="wcc_f.pack.v1";
/** テーマ(→docs/07 §7.8)。色は theme.css のトークンで決まる。ここは名前と体のクラスだけ */
// bk(既定)は th-wr の形をそのまま使い、色の組だけを暗くする(body に th-wr と th-bk の両方を付ける)
const THEMES={ bk:"ブラック × レッド", wr:"ホワイト × レッド", navy:"ネイビー × ゴールド" };
const THEME_KEY="wcc_f.theme.v2";            // 既定を bk に変えたので、前の保存(いつも wr が入っている)は読まない
function applyTheme(id){
  if(!THEMES[id])id="bk";
  Object.keys(THEMES).forEach(k=>document.body.classList.toggle("th-"+k,k===id));
  if(id==="bk")document.body.classList.add("th-wr");
  if(typeof LOGO_IMG!=="undefined"&&LOGO_IMG.wm)document.body.style.setProperty("--logo-wm",'url("'+LOGO_IMG.wm+'")');   // 監督室の地の透かし(neon.css。→docs/14 §14.19)
  try{ localStorage.setItem(THEME_KEY,id); }catch(e){}
  return id;
}
function storedTheme(){ try{ return localStorage.getItem(THEME_KEY)||"bk"; }catch(e){ return "bk"; } }

/** 実名パックの形を確かめる。{ names:{カードid:名前}, teams:{クラブid:{name}} } */
function checkPack(d){
  if(!d||typeof d!=="object"||typeof d.names!=="object"||typeof d.teams!=="object")return "形が違う(names と teams が要る)";
  const n=Object.keys(d.names).filter(id=>CARDS[id]&&typeof d.names[id]==="string").length;
  if(!n)return "このゲームのカードに当てはまる名前が1つも無い";
  return null;
}
/** パックを PACK に流し込む(前のパックの名前は消す) */
function applyPack(d){
  for(const k of Object.keys(PACK.names))delete PACK.names[k];
  for(const k of Object.keys(PACK.teams))delete PACK.teams[k];
  if(!d)return 0;
  let n=0;
  for(const id in d.names)if(CARDS[id]&&typeof d.names[id]==="string"){ PACK.names[id]=d.names[id]; n++; }
  for(const id in d.teams)if(TEAMS[id]&&d.teams[id]&&typeof d.teams[id].name==="string")PACK.teams[id]={ name:d.teams[id].name };
  return n;
}
/** 起動時: 端末に保存したパックがあれば流し込む */
function loadStoredPack(){
  try{
    const t=localStorage.getItem(PACK_KEY);
    if(!t)return 0;
    const d=JSON.parse(t);
    return checkPack(d)?0:applyPack(d);
  }catch(e){ return 0; }
}
const packActive=()=>Object.keys(PACK.names).length>0;

/** ファイルを文字列で読む(file:// でも動く。fetch は使わない) */
function readFileText(file){
  return new Promise((ok,ng)=>{ const r=new FileReader(); r.onload=()=>ok(r.result); r.onerror=()=>ng(r.error); r.readAsText(file); });
}
/** 文字列をファイルとして保存させる。保存できない端末(古い iOS など)では、画面に出してコピーしてもらう */
function saveText(name,text){
  try{
    const a=document.createElement("a");
    a.href=URL.createObjectURL(new Blob([text],{ type:"application/json" }));
    a.download=name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),4000);
    return true;
  }catch(e){ return false; }
}

/* ---- 画面(クラブハウスの下の「設定・データ」) ---- */

function settingsHtml(){
  if(!CL.set)return '<footer class="cft"><button class="btn btn-sub" data-act="set">設定・データ</button></footer>';
  const S=CL.S, kb=(JSON.stringify(S).length/1024).toFixed(1);
  return '<section class="card set"><h3>設定・データ <small><button class="lnk" data-act="set">閉じる</button></small></h3>'+
    // 音: 効果音と BGM を別々に(→docs/14 第4弾)
    '<h4>音</h4><div class="tabs"><button class="tab'+(SND.on?' on':'')+'" data-act="sndtoggle">効果音 '+(SND.on?'あり':'なし')+'</button>'+
      '<button class="tab'+(BGM.on?' on':'')+'" data-act="bgmtoggle">BGM '+(BGM.on?'あり':'なし')+'</button></div>'+
    '<h4>テーマ</h4><div class="tabs">'+Object.keys(THEMES).map(k=>'<button class="tab'+(document.body.classList.contains("th-"+k)&&(k!=="wr"||!document.body.classList.contains("th-bk"))?' on':'')+
      '" data-act="theme" data-v="'+k+'">'+THEMES[k]+'</button>').join("")+'</div>'+
    '<h4>実名パック</h4>'+
    '<p class="dim">'+(packActive()?'読み込み済み('+Object.keys(PACK.names).length+'人)。この端末の中だけで実名を表示している'
      :'未読み込み(偽名で表示中)。パックのファイル(.json)を選ぶと、この端末の中だけ実名で表示する')+'</p>'+
    '<label class="btn btn-sub file">パックを読み込む<input type="file" accept=".json,application/json" data-file="pack"></label>'+
    (packActive()?'<button class="btn btn-sub" data-act="unpack">パックを外す(偽名に戻す)</button>':'')+
    '<h4>セーブ</h4>'+
    '<p class="dim">第'+S.term+'任期 '+S.played+'試合目 ・ カード '+Object.keys(S.coll).length+'種 ・ '+kb+' KB。'+
      'ブラウザのデータを消すとセーブも消える。機種変更の前は書き出しておく</p>'+
    '<button class="btn btn-sub" data-act="export">セーブを書き出す(ファイル)</button>'+
    '<button class="btn btn-sub" data-act="copy">セーブをコピーする(テキスト)</button>'+
    '<label class="btn btn-sub file">セーブを読み込む(ファイル)<input type="file" accept=".json,application/json,text/plain" data-file="save"></label>'+
    (CL.setMsg?'<p class="hint">'+CL.setMsg+'</p>':'')+
    (CL.copyText?'<textarea class="cp" readonly>'+CL.copyText.replace(/</g,"&lt;")+'</textarea>':'')+
    (rawBad()?'<h4>退避したセーブ</h4><p class="dim">読めなかった前のセーブを、消さずに取ってある。書き出して保管するか、要らなければ消す</p>'+
      '<button class="btn btn-sub" data-act="exbad">退避したセーブを書き出す</button>'+
      '<button class="btn btn-sub" data-act="rmbad">退避したセーブを消す</button>':'')+
    '<h4>最初から</h4>'+
    '<button class="btn btn-sub" data-act="reset">'+(CL.armReset?"本当に最初からやり直す(セーブが消える)":"最初からやり直す")+'</button>'+
    '</section>';
}
function rawBad(){ try{ return CL.store.getItem(SAVE_BAD_KEY); }catch(e){ return null; } }
function settingsMsg(t){ CL.setMsg=t; showClub(true); }
function onSettingsClick(act,b){
  const S=CL.S;
  if(act==="sndtoggle"){ sndUnlock(); sndSetOn(!SND.on); showClub(true); return true; }
  if(act==="bgmtoggle"){ sndUnlock(); bgmSetOn(!BGM.on); showClub(true); return true; }
  if(act==="theme"){ applyTheme(b.dataset.v); showClub(true); return true; }
  if(act==="exbad"){
    settingsMsg(saveText("wcc_f-save-unreadable.json",rawBad()||"")?"書き出した: wcc_f-save-unreadable.json":"この端末ではファイルにできなかった");
    return true;
  }
  if(act==="rmbad"){ try{ [SAVE_BAD_KEY,SAVE_BAD_KEY+".1",SAVE_BAD_KEY+".2"].forEach(k=>CL.store.removeItem(k)); }catch(e){} settingsMsg("退避したセーブを消した"); return true; }
  if(act==="set"){ CL.alert=""; CL.set=!CL.set; CL.setMsg=""; CL.copyText=""; showClub(true); return true; }
  if(act==="unpack"){
    try{ localStorage.removeItem(PACK_KEY); }catch(e){}
    applyPack(null); settingsMsg("パックを外した(偽名に戻した)"); return true;
  }
  if(act==="export"){
    const name="wcc_f-save-t"+S.term+"-"+S.played+".json";
    settingsMsg(saveText(name,JSON.stringify(S))?"書き出した: "+name:"この端末ではファイルにできなかった。「コピーする」を使う");
    return true;
  }
  if(act==="copy"){
    const t=JSON.stringify(S);
    CL.copyText=t;
    settingsMsg("下の欄の文字がセーブ。メモ帳などに貼って保存する");   // 先に欄を出す(許可待ちで止まらない)
    try{ navigator.clipboard.writeText(t).then(()=>settingsMsg("コピーした。メモ帳などに貼って保存する"),
      ()=>settingsMsg("下の欄を長押しして全部選び、コピーする")); }
    catch(e){ settingsMsg("下の欄を長押しして全部選び、コピーする"); }
    return true;
  }
  return false;
}
/** ファイルが選ばれたとき(パック / セーブ) */
async function onSettingsFile(input){
  const f=input.files&&input.files[0], kind=input.dataset.file;
  if(!f)return;
  let text="";
  try{ text=await readFileText(f); }catch(e){ settingsMsg("ファイルを読めなかった"); return; }
  if(kind==="pack"){
    let d=null; try{ d=JSON.parse(text); }catch(e){}
    const bad=checkPack(d);
    if(bad){ settingsMsg("パックを読み込めなかった: "+bad); return; }
    try{ localStorage.setItem(PACK_KEY,JSON.stringify(d)); }catch(e){}
    settingsMsg("パックを読み込んだ("+applyPack(d)+"人を実名で表示)");
  }else{
    const box={ v:text, getItem(){ return this.v; }, setItem(){}, removeItem(){} };
    const L=loadCareer(box);
    if(!L){ settingsMsg("セーブを読み込めなかった(形が違うか、壊れている)"); return; }
    CL.S=L; CL.W=worldOf(L); CL.msg=[]; CL.sel=null;
    persist(L);
    settingsMsg("セーブを読み込んだ(第"+L.term+"任期 "+L.played+"試合目)");
  }
}
