"use strict";
/* =========================================================================
   wcc_f — データと数値
   確率・係数・閾値はすべて TUNING に置く(ロジックに直書きしない)。
   座標系は「自軍フレーム」: h = 0(自陣ゴール) 〜 1(敵陣ゴール) / x = 0〜100(左右)
   ========================================================================= */

const STAT_MAX=20;
const STATS=["off","def","tec","pow","spd","sta"];
// 能力の表記は本家に合わせた略号(→docs/06)
const STAT_LABEL={ off:"OFE", def:"DEF", tec:"TEC", pow:"POW", spd:"SPE", sta:"STA" };

const TUNING={
  // 判定の揺らぎ。攻守それぞれに独立して乗る(0.6〜1.4)
  rng:{ min:0.6, span:0.8 },
  // 時計。1ステップ = 1アクション。前後半それぞれ stepsPerHalf + アディショナル
  clock:{ stepsPerHalf:110, at1:[1,5], at2:[3,9] },
  // カードの位置 → 役割(→docs/02 §2.3)
  //   cfH … FW の高さのうち、ここより前が CF、後ろが ST(→docs/17。左右の端は高さにかかわらず LWG / RWG)
  zone:{ dfH:0.36, fwH:0.68, wide:27, dmfH:0.47, omfH:0.58, cfH:0.80 },
  // 役割の適性。own=得意な役割 / group=同じポジション(左右の反対側・CF⇔ST もここ。→docs/17)/ near=隣 / far=DF↔FW / gk=GKとフィールドの取り違え
  apt:{ own:1.0, group:0.90, near:0.76, far:0.62, gk:0.35 },
  // 盤面でカードを置ける範囲
  board:{ minH:0.14, maxH:0.94, minX:5, maxX:95, gkH:0.05 },
  // GK(→docs/02 §2.3a)。ペナルティエリアの中だけ動かせる。
  //   baseH   … ゴールライン上の定位置。ここより前に出たぶんが「飛び出し」(0〜1)
  //   sweep   … 飛び出したGKが裏へのボールに対応する強さ(定位置では0)
  //   follow  … シュートの左右に対して寄るべき量 / lat・latSpan … ずれの効き
  //   rush    … 飛び出しが近距離のシュートに効く量 / lob … 遠目のシュートに弱くなる量
  //   farH〜nearH … 「遠目」と「近距離」の境
  gk:{ minH:0.03, maxH:0.15, minX:28, maxX:72, baseH:0.05,
       sweep:0.9, follow:0.5, lat:0.15, latSpan:15,
       rush:0.12, lob:0.36, farH:0.72, nearH:0.90 },
  squad:{ subMax:3 },
  // ボールの位置に合わせて隊列全体が動く量(判定と描画で同じ値を使う)
  block:{ shiftK:0.34 },
  // 競り合い(→docs/02 §2.5)
  duel:{ th:0.40, atkW:0.30, defW:0.60, pressMin:0.30,
         sigH:0.17, sigX:0.20, markSpd:0.5, goalSide:0.55, beaten:1.35,
         covSig:1.6, covBase:1.0, covK:0.20 },
  // パスの受け手
  recv:{ sigH:0.20, sigX:0.22, atk:1.2, qMin:0.45, pull:0.5 },
  // ボールの進み方
  chain:{ gainK:1.0, jit:0.25, toJit:0.06,
          strayFloor:0.15, strayFull:0.42, strayPass:1.6, deepCarry:0.35,
          spread:{ same:8, in:8, out:6, switch:8, box:9, any:0 } },
  // シュート(→docs/02 §2.6)
  shot:{ orderN:5, minH:0.62, forceH:0.55, base:0.03, depth:0.74, wideCut:0.6,
         dead:0.50, minRange:0.12, angle:0.45,
         thBlock:1.25, accBase:0.50, accTec:0.40, accRange:0.55,
         rangePow:1.0, gapPow:0.45, thGoal:1.13,
         rebound:0.25,
         // セットプレーからのシュート。PK は圧縮(gapPow)を掛けず、別の閾値で競る
         midH:0.80, pkAcc:0.90, thPk:0.66, hdrAcc:0.70, hdrPow:0.85, fkAcc:0.90, fkPow:1.10,
         // 流れの中のクロス(→docs/02 §2.15)。サイド(中央から xcWide 以上)からゴール前(xcDeep より深く)へ通ったら、受け手が xcP の率でそのまま頭で合わせる
         xcWide:22, xcDeep:0.82, xcP:0.5 },
  // 反則とセットプレー(→docs/02 §2.10)。**反則の入口は「守備側が競り勝った瞬間」だけ**
  //   foulCarry/foulPass … 止めたのが持ち運び / パスだったときに反則になる率
  //   boxCare            … エリア内では守備者が慎重になる(反則率に掛ける)
  //   yellow/red/pkCardK … 警告・一発退場の率と、PKになる反則での倍率
  //   boxH/boxX          … ペナルティエリア(この高さ以上・中央からこの幅以内)。**実寸**(奥行 16.5m/105m・
  //                        幅 40.3m/68m)。映像と盤面の線もこの値から引く
  //   setH               … これより前の反則はセットプレー。手前はその場で再開
  //   directH/directX/directP/wall … 直接狙える位置・狙う率・壁に当たる率
  //   thAerial/hdrShot   … 空中戦の閾値 / 競り勝ってそのまま撃てる率(残りはこぼれて続く)
  //   ckBlock/ckSave     … ブロック / セーブがコーナーになる率
  //   ckDuel/ckH         … この高さより深くで守備側が止めたとき、コーナーに逃げる率
  //   foulBlock          … エリア内のシュートブロックが反則(PK)になる率
  //   offBase/offSpan    … 最終ラインより前で受けたときのオフサイド率と、出すぎの幅
  rule:{ foulCarry:0.62, foulPass:0.43, boxCare:0.08,
         yellow:0.21, red:0.003, pkCardK:2.5, minPlayers:8,
         boxH:0.843, boxX:29.6, setH:0.60, pkH:0.895,
         directH:0.68, directX:26, directP:0.55, wall:0.24,
         thAerial:1.10, hdrShot:0.55, ckBlock:0.55, ckSave:0.40, ckDuel:0.40, ckH:0.85, foulBlock:0.03,
         offBase:0.22, offSpan:0.10 },
  // スタミナ(→docs/02 §2.7)
  //   perStep/perAct … 毎ステップ / プレーに関わるたびの消耗
  //   fatPow/fatK/fatMax … 消耗が能力に響く形。**減り始めは軽く、半分を切ると急に重い**
  //   tiredAt … これを切ると「足が止まった」と知らせる
  //   htRest  … ハーフタイムの回復量
  stam:{ perStep:0.0031, perAct:0.0105, staReduce:0.55, min:0.20,
         fatPow:1.5, fatK:1.3, fatMax:0.75, tiredAt:0.40, htRest:0.08,
         offBall:{ GK:0.5, CB:0.85, SB:1.2, DMF:1.1, CMF:1.15, SMF:1.25, OMF:1.0, WG:1.1, CF:0.9 },
         wear:{ off:0.5, def:0.5, tec:0.7, pow:0.3, spd:0.9, sta:0 } },
  // 相手監督(→docs/02 §2.8)。**プレイヤーと同じ「カードを動かす」しかできない**
  //   subMin/subAt/every … 交代(この分以降・このスタミナ未満・何ステップごとに見るか)
  //   atkMin/allOutMin   … 負けているとき、この分から前がかり / さらに前へ
  //   up/upLate          … 前がかりで隊列を上げる量
  //   defMin/narrow      … 勝っているとき、この分から中央を固める(左右の幅に掛ける)
  //   markH              … これより高い位置の相手を「前線」と見て最終ラインが付く
  //   markPull/markMax   … 付くときに左右へ寄る割合と上限
  //   stepH/stepX/gkStep … 1ステップに動かせる量(人の手でカードを動かす速さ)
  //   構えに合わせて**指示と KP**も変える(前がかり → ラインを上げ、allOutMin からプレスも /
  //   固める → ラインを下げる)。カードを前後に動かすのはやめ、指示で表す
  coach:{ subMin:55, subAt:0.50, every:8,
          atkMin:60, allOutMin:80,
          defMin:70, narrow:0.65,
          markH:0.62, markPull:0.4, markMax:10,
          stepH:0.012, stepX:1.5, gkStep:2.5,
          // 陣形の変更(→docs/13 §13.3)。ppMin/shieldMin … パワープレー・守備固めを始める分 / ppUp … 前線へ上げる高さ /
          //   ppSb・ppCb … SB・CB を上げる量 / shDown … 下げる FW の高さ / shWide・shDf … SMF・WG と DF を下げる量
          ppMin:78, shieldMin:75, ppUp:0.80, ppSb:0.12, ppCb:0.05, shDown:0.22, shWide:0.08, shDf:0.04,
          // 手薄なスペース(§13.4)。spaceEvery … 数え直す間隔(ステップ)/ sideGap … 左右の守備の人数の差 / pushN … 敵陣に入っている人数(裏を突く)
          spaceEvery:6, sideGap:2, pushN:8,
          // 点差で選ぶ交代(1試合1回)。tacMin … この分から
          tacMin:62,
          // 性格(§13.5)。atk/def … 構えの切り替えの分のずれ / space … スペースを狙い始める分(null は狙わない) / sub … 交代の分のずれ /
          //   shape … 陣形を変えるか / drawAtk … 同点でもこの分から前がかり(null はしない) / pp … パワープレーの分のずれ(null はしない)
          pers:{
            steady:  { name:"堅実",   atk:0,   def:0,   space:25,   sub:0,   shape:true,  drawAtk:null, pp:0 },
            quick:   { name:"即応",   atk:-15, def:-15, space:0,    sub:-10, shape:true,  drawAtk:null, pp:-5 },
            stubborn:{ name:"頑固",   atk:15,  def:15,  space:null, sub:5,   shape:false, drawAtk:null, pp:null },
            attack:  { name:"攻撃的", atk:-5,  def:10,  space:25,   sub:0,   shape:true,  drawAtk:72,   pp:-10 },
            careful: { name:"慎重",   atk:5,   def:-20, space:25,   sub:0,   shape:true,  drawAtk:null, pp:null } } },
  // KP(→docs/04)。1クラブに1人。試合中も変えられる。recv = どのスタイルでも KP にボールが少し集まる
  kp:{ recv:1.25 },
  // レアKP(→docs/11)。WORLD CLASS 以上のカードが ★5 で KP のときに発動
  //   buffK … スキルのバフの上乗せ分に掛ける倍率 / oppTier … 相手はこの強さの段以上で発動(自分は KP の特殊能力 ★5 かつランク G。→docs/15 §15.6)
  //   mvW … 技の札の選ばれやすさ / mvHold … 技を使ったときにモニターに名前を出す時間(ms) / cutMs … カットインの長さ(ms)
  // キャプテン(→docs/12 §12.4)。並びは CP適性 C / B / A / S
  //   sta … チーム全体のスタミナの減りを減らす割合 / back … 負けているときの全能力の上積み
  //   up … 任命したとき本人のやる気が上がる率(任期に1回まで)/ down … 任命したとき重荷で下がる率 / drop … 外された前のキャプテンのやる気が下がる率
  cap:{ sta:[0,0.02,0.04,0.06], back:[0,0.01,0.02,0.03], up:[0,0,0.45,0.7], down:[0.4,0,0,0], drop:0.5 },
  rare:{ buffK:2.0, oppTier:5, mvW:1.6, mvHold:650, cutMs:1300 },
  // スタイルのランク B / A / S / G(→docs/15 §15.5)。**チームの成長グラフだけで決まる**(選手の能力・連携・★は効かない)
  //   th … 必要な軸(2つなら低いほう)が A / S になる値。G は必要な軸がすべて金色 / k … 「得るもの」に掛かる倍率(失うものには掛からない)
  //   none … 成長グラフを持たないチーム(1試合だけのモード)のランク
  // ssCap … KP の選手の特殊能力の★(0〜5)で決まるランクの上限(→docs/14 §14.184)。グラフのランクと、この上限の低いほう
  rank:{ th:[40,75], k:{ C:0.6, B:0.8, A:1.0, S:1.25, G:1.5 }, none:"A", ssCap:["C","B","B","A","S","G"] },
  // 連携(→docs/04 §4.6)。段は 1〜3
  //   pass … 線で結ばれた2人のパスに、段ごとに乗る強さ
  //   full … 盤面に居る線の段の合計の満点の目安
  link:{ pass:0.04, full:50 },
  // 監督の指示(→docs/04 §4.9)
  //   line … ラインを上げる/下げるで隊列がずれる量
  //   sideOn/sideOff … 重視したサイドの選手 / 逆サイドの選手が受け手に選ばれる倍率
  //   pressHigh/pressLow/pressSta … プレス指示の守備の強さ(敵陣/自陣)とスタミナ消費
  //   lineBeaten … ラインを上げたぶん、裏を取られたときに戻れなくなる強さ
  //   lineAtk    … ラインを上げたぶん、敵陣での攻撃に人数が掛かる(下げれば減る)
  //   lineDef    … ラインを下げたぶん、自陣の守備が堅くなる(上げれば薄くなる)
  // 監督の指示 = 十字の戦術ボタン + キーパー(→docs/04 §4.9b)。どれも同時に点けられる
  //   line…カウンターで隊列を下げる量 / lineBeaten・lineAtk・lineDef…隊列の高さの得失(スタイルの push にも効く)
  //   sideOn・sideOff…サイド攻撃で受け手に掛ける倍率 / press*…プレス
  //   center・side・both…手(チャンネル)の行き先ごとの重み(in=真ん中へ / out=外へ / box=エリアへ / switch=逆サイドへ)
  //   centerCarry…中央突破の持ち運び / counterTo・counterN…カウンター: 自陣で奪ってから counterN 手のあいだ、裏へのボールの重み
  //   counterK…その間の攻めの通りやすさ(相手の守備が整う前)
  //   keeper*…キーパー: GK の定位置を上げる量・裏の処理・ループへの弱さ・GK のスタミナ消費
  ins:{ line:0.05, lineBeaten:3, lineAtk:2.4, lineDef:1.6, sideOn:1.6, sideOff:0.6, pressHigh:1.12, pressLow:0.97, pressSta:1.12,
        center:{ in:1.8, box:1.2, out:0.5, switch:0.5 }, centerCarry:1.3,
        side:{ out:1.4, box:1.15, in:0.75 }, both:{ out:1.7, switch:2.0, in:0.65 },
        counterTo:2.6, counterN:4, counterK:1.15,
        // サイド攻撃(→docs/02 §2.15)。指示した側で競るとき、相手のそのサイドの守備(自陣にいる人)が flankN 人より少ないほど通りやすい
        flankX:15, flankH:0.55, flankN:2, flankK:0.14, flankMin:0.8, flankMax:1.3,
        keeperH:0.05, keeperSweep:2.2, keeperLob:1.25, keeperSta:1.3 },
  // スタイルの細かい条件
  //   lateMin … 「終盤」とみなす分 / zoneNear … エリア支配が効く、持ち場からの距離
  //   fastOwn … ロングカウンターが「自陣で奪った」とみなす高さ
  style:{ lateMin:70, zoneNear:0.20, deepH:0.75 },
  // クラブ運営(→docs/05)
  //   termLen     … 1任期の試合数
  //   tierStat    … 相手クラブの強さの段(1〜5)ごとの、能力のひな形からのずれ
  //   statNoise   … 能力のばらつき / linkBase … 連携の線の本数の下限(段のぶん増える)
  //   leagueTiers … リーグの格(1〜3)ごとの、同じリーグに入る7クラブの段
  //   promoteRank … 周の終わりにこの順位以内なら、リーグの格(Div)が上がる / relegateRank … この順位以下なら下がる(→docs/19)
  //   premierGraph … Premier Div の相手の成長グラフ(育成レベル最大。KP の軸は金色)
  //   prize       … 賞金(億)。cup は格ごとの1勝ぶん。優勝は titleK 倍が上乗せ
  //   linkTier    … 段1つごとに増える線の本数 / tierGraph … 段ごとの成長グラフの値(相手は育成しない代わり)/ tierGold … この段以上は既定の KP の軸が金色
  club:{ termLen:100, tierStat:[-0.2,0.5,1.1,1.8,2.5], statNoise:1.2, linkBase:6, linkTier:4,
         tierGraph:[25,45,60,75,90], tierGold:5,
         leagueTiers:[[1,1,2,2,2,3,3],[2,2,3,3,3,4,4],[4,4,5,5,5,5,5]], promoteRank:2, relegateRank:7, premierGraph:95,
         prize:{ league:1, leagueRank:[12,7,4,2,1,0,0,0], gradeK:[1,1.6,2.4], friendly:0.3, titleK:4,
                 cup:{ E:1.5, D:2, C:3, B:5, A:7, S:10 } },
         historyMax:120 },
  // 育成(→docs/05 §5.3〜5.6)
  //   startOff/startKeep … 任期の初めの能力のずれ(2026-11-27 から 0。→docs/14 §14.208)。startKeep 以下の能力は覚醒でも上げない
  //   spChance … 練習の枠が特殊練習に差し替わる率(施設レベル1つごと)
  //   ind  … 個人能力。need=★1〜4に要る経験 / awake=★4から兆しまで / train・trainFit・match=もらえる経験
  //          starUp=★1つで伸びる能力 / awakeP=フレンドリー勝利で覚醒する率 / awakeNew=覚醒のポイントの2つ目から、まだ上がっていない能力に振る率(→docs/14 §14.207)
  //   sp   … 特殊能力。meet=ミーティングの経験 / train=特殊練習の星1つぶん / qOk・qNg=3択が合ったとき・外したときの成功率
  //          failKeep=失敗で残る経験の割合 / star5P=フレンドリー勝利で★5になる率 / buff=★1つでバフが強まる割合
  //   link … 連携。need=薄線・太線に要る経験 / match=一緒に試合に出た経験 / lounge=大成功・成功・失敗の経験
  //          pFit・pMid・pBad=3択が合う手・次点・合わない手のときの [大成功, 成功, 失敗] の率
  //          hintNoise=ラウンジの様子の文が、本当の相性と1つずれて見える率 / trustK=2人の信頼度の段(平均)1つごとに、失敗のぶんが成功に回る率
  //   ★突破(→docs/14 §14.108): qOk・qNg に、信頼度の段 qTrust[段]・監督と選手の動物の相性 qAni[悪い/ふつう/良い] を足し、qMin〜qMax に収める
  //          goldP=黄金線になる率(**1試合に生まれる黄金線は1本まで**)
  //   graph… チームの成長グラフ(→docs/15)。軸は 0〜max。対角の2軸の合計は器 cap(+ 戦術室の段ごとに capFac)を超えない
  //          basic=基本練習 / up・upAll・down=特殊練習(上げる軸・全軸のとき・下げる軸)。戦術室の facK が掛かる
  //          breakP=MAX の軸を伸ばす練習で限界突破(金色・固定)する率 / golden=金色が3つそろったときの黄金期(全員が絶好調)の試合数
  //   set  … セットプレイの練習。星1つぶん / 上限(FK・CK・PK に掛かる)
  //   mot  … モチベーション(ケガ/絶不調/不調/好調/絶好調)の倍率と、上下する率
  //   int  … 練習の強度(軽め/普通/ハード)。k=経験とグラフの伸び / fat=たまる疲労
  //          matchLoad=試合に出たぶんの疲労 / recover=次の試合までに残る割合 / fatMax=上限 / tiredSign=「！」が付く疲労
  //   age  … 年齢による違い(→docs/05 §5.4)。若いほど育ちやすいが、やる気の上下が大きい
  //          band=年齢の区切り / grow=区切りごとの伸びやすさ / swing=やる気の上下の起きやすさ
  //   abil … 能力による違い。得意な2能力の平均が ref より高いほど、伸びが遅い(1ごとに k、lo〜hi に収める)
  //   育成の釣り合いの基準(→docs/08 §8.5): 1人に5〜10試合ぶん集中すると覚醒。関わらない選手は練習と試合だけでは★1〜2どまり
  //          ind.train・trainFit・spTrain・match = 全員に入る経験(小さく) / comm.ind = 個人練習で入る経験(大きく)
  //   comm … コミュニケーション。max=1試合の回数 / ind=個人練習の経験 / talk・talkLow=ケアで上がるやる気(落ちている選手は2段)
  grow:{ startOff:0, startKeep:6, spChance:0.12, evTrainK:1.3, trainEvP:0.10,   // イベントのレア訓練: 経験の倍率・試合ごとに出来事が起きる率(→docs/26 §26.4)
         ind:{ need:[26,48,68,94], awake:40, train:0.4, trainFit:0.4, spTrain:0.4, match:0.3, starUp:0.5, awakeP:0.6, awakeNew:0.5 },
         // dup … 重なったカード(→docs/08 §8.12)。indK … 重なり1枚ごとの個別指導の経験の上乗せ / max … 数える枚数の上限
         //   awakeP … 覚醒で上がる値 1/2/3 の率(重なりなし)/ awakeStep … 重なり1枚ごとに足す率(1 から引き、2・3 に足す)
         commSignK:0.8,   // コミュニケーションの「！」: 次の★・連携の段まで 80% 以上なら付ける
         dup:{ indK:0.1, max:5, awakeP:[0.7,0.25,0.05], awakeStep:[-0.08,0.03,0.05] },
         sp:{ need:[12,18,24,30], awake:30, meet:14, train:1, qOk:0.70, qNg:0.30, qTrust:[0,0.05,0.10,0.15], qAni:[-0.05,0,0.08], qMin:0.10, qMax:0.95, failKeep:0.5, star5P:0.6, buff:0.05,
              // ミーティングは周りにも効く(→docs/08 §8.3・docs/05)。呼んだ先発の、SQUAD の盤面で近い先発 max 人まで(距離 r 以内)
              //   se … 周りに入る特殊能力の経験(meet に対する割合) / up … ★突破が成功したとき周りのやる気が上がる率 / down … 失敗で下がる率
              near:{ r:0.35, max:3, se:0.35, up:0.5, down:0.3 } },
         // bonus … 試合で入る連携の経験の倍率(重なる)。同じ国籍 / 同じ実在クラブ / 同じ動物。nat・club が同じなら相性が悪くても薄線まで育つ
         link:{ need:[10,30], match:1, lounge:[8,4,0], goldP:0.5, hintNoise:0.25, bonus:{ nat:1.5, club:1.5, ani:1.3 },
                pFit:[0.60,0.35,0.05], pMid:[0.15,0.60,0.25], pBad:[0.05,0.35,0.60], trustK:0.04 },
         graph:{ ovrDiv:20, basic:4.5, up:4, upAll:1.7, down:2.5, max:100, cap:130, capFac:[0,4,8,12], breakP:0.3, golden:3 },
         set:{ per:0.02, max:0.2 },
         mot:{ mul:[0.80,0.92,0.97,1.02,1.06], start:3, winUp:0.35, loseDown:0.30, drawSwing:0.15,
           // 控え(→docs/08 §8.4): 出番の無い試合が benchGrace 続くと下がり始める。勝てば控えも少し上がる。
           // どの選手も、何も起きなかった試合では普通(start)へ revert の率で戻る
           benchGrace:3, benchDown:0.25, teamWinUp:0.12, revert:0.15 },
         int:{ k:[0.5,1.0,1.6], fat:[0,0.02,0.05], matchLoad:0.02, recover:0.4, fatMax:0.20, tiredSign:0.04 },
         // 休憩(チーム練習の代わりに1手使う): 疲労が keep の割合まで抜け、普通より下の選手は motUp の率で1段戻る。経験は入らない
         rest:{ keep:0.3, motUp:0.6 },
         // 見える化: 連携の経験がこの割合を超えた組を「育ちそう」として点線で出す / 信頼度(絆)の段の区切り
         soon:0.6, trust:[3,8,15],
         comm:{ max:3, ind:20, talk:1, talkLow:2 },
         age:{ band:[21,24,28,31], grow:[1.40,1.20,1.00,0.85,0.70], swing:[1.6,1.25,1.0,0.75,0.55] },
         abil:{ ref:14, k:0.04, lo:0.80, hi:1.20 } },
  // 任期の終わり(→docs/05 §5.8)
  //   follow/bondMin … 次の任期についてくる選手の数の上限 / 要る絆
  // 監督の年俸(→docs/28): 今の年俸 pay を任期の評価 P で上げ下げする。pay0 … 新しい監督の年俸(億)/ payMin … 下限
  //   req … 求められる評価 R = a + b × log10(1 + pay / c) / up … 上がる係数 = k ÷ (1 + (pay / s)^e) / dn … 下がる係数 = k × (1 + (pay / s)^e) / bump … 安い年俸の底上げ(最大)
  //   w … 評価の重み(title 称号の格 / win 勝率 ÷ winRef)/ cup … 大会の格ごとの優勝 / lg … Div ごとのリーグ優勝 / cupMax … 優勝の合計の上限
  //   mis … クラブの目標(CLUB MISSION)は評価ではなく年俸に直接: 達成で × (1 + up0 ÷ (1 + (pay / upS)^e))、未達で × (1 − dn0 × (1 + (pay / dnS)^e))。own … オーナーの指令1つはその割合の何倍か(→docs/28 §28.10)
  //   rankAt … 監督ランク(1〜5)に要る今の年俸(億)
  term:{ follow:3, bondMin:6, pay0:0.3, payMin:0.3, req:[0.12,0.28,8], up:[1.1,14,1.15], dn:[0.35,90,2.2], bump:1.0,
    w:{ title:0.25, win:0.12, winRef:0.65 }, mis:{ up0:0.12, upS:25, dn0:0.10, dnS:90, e:1.5, own:0.4 }, cup:{ E:0.02, D:0.03, C:0.05, B:0.07, A:0.10, S:0.14 }, lg:[0,0.04,0.07,0.12], cupMax:0.35,
    rankAt:[5,15,35,70] },
  // クラブオファー(→docs/16)。size … 規模ごとの1部での幅(fans・money は部で divK 倍)・成長グラフの初めの幅・スタジアムの段・施設の段
  //   lean … 地域の得意な軸に足す / spread … 監督の格からの差が 0・±1 になる率(残りが ±2)
  //   rareP・rareSal・rareMax … レアオファーの率(累計の年俸 1億ごとに rareSal 増える。上限 rareMax)/ oilMoney … オイルマネークラブに足す資金
  //   target … 期待の格(1〜7)ごとの、任期の獲得賞金の期待値(億)/ targetSal … 届いたときの年俸の上乗せ(× 期待の格)
  //   misP … 期待の格ごとの、大会の初戦のあとにオーナーの指令が出る率 / misWin・misLose … 指令の達成・失敗の年俸(× 期待の格)
  offer:{ size:{ weak:{ fans:[4000,6000],   money:[0,10],   graph:[0,0],   stad:1, fac:0 },
                 mid: { fans:[9000,13000],  money:[10,30],  graph:[10,20], stad:1, fac:0 },
                 big: { fans:[18000,26000], money:[30,60],  graph:[20,35], stad:2, fac:1 },
                 mega:{ fans:[32000,45000], money:[60,100], graph:[35,50], stad:3, fac:1 } },
          divK:[1,0.7,0.5], lean:15, spread:[0.6,0.32], rareP:0.05, rareSal:0.003, rareMax:0.25, oilMoney:100,
          target:[70,80,95,110,125,140,160], targetSal:4,
          misP:[0.1,0.17,0.24,0.31,0.38,0.45,0.5], misWin:4, misLose:3 },
  // カード(→docs/06)
  //   rate  … 払い出しのレアリティの率(白 / 黒 / キラ / レジェンド)
  //   trait … 特徴(+/−)1つぶんの能力 / lowK … 低い能力(6以下)に格が乗る割合
  //   gradeBase/gradeK … 格を能力のずれに換算する: (格 − base) × K。相手の段(段4 ≒ +0.4 / 段5 ≒ +1.1)に揃える
  pack:{ rate:{ W:0.60, B:0.30, K:0.085, L:0.015 }, oilK:2,   // oilK … オイルマネー(レアスポンサー)のときの金パック(K・L)の率の倍率(→docs/23)
    trait:1.5, lowK:0.5, gradeBase:0.9, gradeK:0.8,
    // めくる前の予兆(→docs/07 §7.12)。裏の光り方はレア度どおり。promo の割合で、一段下の光り方から途中で本来の光り方へ上がる
    promo:{ B:0.15, K:0.35, L:0.5 }, promoMs:1300 },
  // 試合の採点(→docs/07 §7.12)。base 点から足し引きして 0.5 刻み・min〜max に収める。記録(イベント)だけから数える
  //   goal/assist … 得点・最後のパス / onT/miss … 枠内・枠外 / passOk … 通したパス・運び(合計は passMax まで)
  //   lost … 奪われた / won … 奪った / save・block … 止めた / concede … 失点(GK) / concedeDf … 失点(DF 1人あたり)
  //   win/lose … 勝ち負け(出た全員) / foul・red … 反則・退場
  rate:{ base:6.0, goal:1.0, assist:0.5, onT:0.1, miss:-0.05, passOk:0.03, passMax:0.6, lost:-0.06, won:0.08,
    save:0.25, block:0.15, concede:-0.35, concedeDf:-0.15, win:0.3, lose:-0.3, foul:-0.05, red:-1.5, min:3.5, max:10 },
  // PK戦。5人ずつ蹴り、決まらなければ1人ずつ。maxKicks は打ち切り(暴走を防ぐ安全網)
  pso:{ kicks:5, maxKicks:30 },
  // クラブの経営(→docs/08 §8.9・docs/05 §5.13)。お金の単位は億
  //   fans0/fansMin … 初めのファン数・下限 / fill … ファンのうち観客になる割合 / price … 1人あたりの入場料
  //   cupK・finalK・friendlyK … 試合の大きさで観客が変わる倍率 / fansWin・fansDraw・fansLose … 1試合ごとのファンの増減
  //   fansStadK … スタジアムの段ごとに勝ったときの増え方が増す割合 / fansTitle・fansPromo・fansStad … 優勝・昇格・改修で増えるファン
  //   stad … スタジアムの段(cap 収容人数 / cost 改修の費用)/ chanceK … 優勝・昇格のときの改修費の割引 / cool … 見送ったあと知らせない試合数
  //   facCost … 施設の段ごとの費用 / facK … 練習場・戦術室・ラウンジの効き目(経験の倍率)/ medFat … 疲労の残り方 / medHeal … ケガの治りやすさ
  biz:{ fans0:6000, fansMin:2000, fill:0.9, price:0.00006, cupK:1.25, finalK:1.6, friendlyK:0.6,
        fansWin:260, fansDraw:60, fansLose:-120, fansStadK:0.15, fansTitle:2500, fansPromo:4000, fansStad:3000,
        stad:[ { cap:8000,  cost:0,   name:"地方の小さなスタジアム" }, { cap:15000, cost:20,  name:"スタンドを広げたスタジアム" },
               { cap:25000, cost:40,  name:"照明塔の立つスタジアム" }, { cap:40000, cost:80,  name:"大きなスタジアム" },
               { cap:60000, cost:130, name:"屋根付きの大スタジアム" } ],   // 費用は1任期の稼ぎ(80〜250億)で配分する前提(→docs/05 §5.13 2026-11-23)
        // sp … スポンサー(→docs/05 §5.14)。マスタは club.js の SP_IND(業種 × ☆1〜5)
        //   rankFans … ☆2〜5 が届くファン数(その7割でも、リーグの格 rankGrade か今の任期の優勝 rankTitles があれば届く)/ pay … ☆ごとの1試合の収入
        //   eff … 報酬の効果の大きさ(☆1〜5)。care・careSec・indSec・loungeSec は率、loungeOk は大成功に足す率、indExp・loungeExp は経験の倍率、
        //         noFat は試合の疲労の倍率、injury はケガの起きやすさの倍率、bench・keepForm はやる気が下がる率の倍率
        sp:{ rareP:0.08, rarePay:1.6,   // レアスポンサー: 候補を出すたびに出る率・☆5 の収入の倍率(→docs/05 §5.14)
             rankFans:[12000,25000,45000,70000], rankGrade:[2,2,3,3], rankTitles:[1,1,2,3], pay:[0.2,0.4,0.7,1.1,1.6],
             eff:{ care:[0.3,0.45,0.6,0.8,1], careSec:[0.15,0.25,0.35,0.45,0.6], indExp:[1.1,1.15,1.2,1.3,1.4], indSec:[0.15,0.25,0.35,0.45,0.6],
                   loungeOk:[0.05,0.08,0.12,0.16,0.2], loungeExp:[1.1,1.15,1.2,1.3,1.4], loungeSec:[0.1,0.15,0.2,0.3,0.4],
                   noFat:[0.85,0.75,0.65,0.5,0.35], injury:[0.8,0.65,0.5,0.35,0.2], bench:[0.7,0.5,0.35,0.2,0], keepForm:[0.7,0.5,0.35,0.2,0] } },
        chanceK:0.8, cool:8, facCost:[15,35,60,90,130], facK:[1,1.1,1.2,1.3,1.4,1.5], medFat:[1,0.9,0.8,0.7,0.6,0.5], medHeal:[0,0.1,0.2,0.3,0.4,0.5] },
  // 称号のセット(→docs/10 §10.2 B)。favorW … 系統に合う特殊練習の重み / 称号ごとの効き目:
  //   spK 特殊練習が出る率の倍率 / cupKeep 大会で負けたときにやる気が下がる率の倍率 / qOk ★突破の成功率に足す / indK 個人練習の経験の倍率
  //   meetK ミーティングの経験の倍率 / loungeOk ラウンジの大成功に足す / giant 格上に勝ったとき出た選手のやる気が上がる率 / setK セットプレイの伸びの倍率
  //   youngK 21歳以下の伸びやすさの倍率 / benchK 控えのやる気が下がる率の倍率 / winUpK 勝ってやる気が上がる率の倍率
  tset:{ favorW:4, legend:{ spK:1.5 }, emperor:{ cupKeep:0.5 }, master:{ qOk:0.07 }, factory:{ indK:1.1 }, magic:{ meetK:1.1 },
    heir:{ loungeOk:0.08 }, assassin:{ giant:0.5 }, tactician:{ setK:1.2 }, native:{ youngK:1.1 }, fickle:{ benchK:0.5 }, fighter:{ winUpK:1.3 } },
  // 監督能力(→docs/10 §10.2 C)。max … 1試合にセットできる数 / rankAt … ランク(I・II・III・マスター)に要る使った試合数 / rankK … ランクごとの効き目の倍率
  //   base … ランク I の効き目(MAB の説明を参照)
  mab:{ max:3, rankAt:[0,10,30,60], rankK:[1,1.25,1.5,2],
    // 全員・グループの力に掛かるもの(center・side・dfc・morale・spurt)は、ほんの少しでも勝敗に大きく響くので小さくしてある
    base:{ center:0.005, side:0.008, counter:0.08, post:0.05, duel:0.05, hotline:0.017, leader:0.05, half:0.01, dfc:0.007,
           stamina:0.017, morale:0.002, setpiece:0.05, saving:0.014, spurt:0.01 } },
  // ハーフタイムの指示(→docs/10 §10.8)。unlock … 覚えるのに要る同じ特殊練習の回数 / max … 登録できる数 / timer … ハーフタイムに選ぶ時間(ミリ秒)
  //   allK … 上がる軸がオフェンス・ディフェンスのときの力の倍率 / otherK … ほかの軸(受ける・追う・防ぐ・スタミナ・空中戦)の倍率
  //   downR … 下がる軸の効き(上がる軸に対する割合)/ basicK … 初めから使える指示の効き / graph … 後半のあいだ成長グラフに足す量(ランクが上がることがある。金色は変わらない)
  // unlock … 称号のレア訓練を何回で指示を身につけるか(任期の中だけ。→docs/26 §26.5)/ budget・stamMul・posMul・kMax … 指示の強さをそろえる物差し / stamK … 消耗の指示のスタミナの減り
  ht:{ unlock:3, budget:1.2, stamMul:1.25, posMul:1.6, kMax:2, stamK:1.5, max:3, timer:8000, pickMs:700, allK:0.012, otherK:0.05, downR:0.6, basicK:0.5, graph:8 },
  // クラブ新聞(→docs/07 §7.13)。max … 残す記事の数 / recent … HOME に出す直近の試合の数
  paper:{ max:30, recent:5 },
  // 秘書(→docs/08 §8.7)。lv … 親密度の段の境目(他人行儀 → 打ち解けた → 信頼 → 相棒)/ follow … 段ごとのフォローの率
  //   match … 試合のたびの親密度 / title … 大会の優勝1つの親密度 / eventP … 試合のあとに監督室の会話が起きる率
  sec:{ lv:[5,20,45], follow:[0.15,0.25,0.35,0.5], match:1, title:3, eventP:0.15,
    // 視察レポートで読める量(親密度の段 0〜3。→docs/14 §14.167)。notes … 所見の数 / key … 要注意人物(kp・atk 攻めの柱・dfn 守りの柱・sub スーパーサブ)
    repHint:0.12,   // HOME で秘書が視察レポートの出来(親密度)をほのめかす率(試合ごと。→docs/14 §14.170)
    rep:{ notes:[1,3,5,99], key:[["kp"],["kp","atk"],["kp","atk","dfn"],["kp","atk","dfn","sub"]] } },
  // ケガ(→docs/08 §8.8)。判定は試合の中、別の乱数で行う(ほかの判定の並びを変えない)
  //   duel … 競り合いで止められた持ち手 / foul … 反則を受けた選手 の起きる率。疲れているほど (1 + fatK × 消耗) 倍
  //   k … ケガをした試合の残りで能力に掛かる倍率(出続ける) / heal … 試合のあとに治る率(続いても maxN 試合で治る) / healTo … 治ったあとの調子
  inj:{ duel:0.00045, foul:0.0058, fatK:4.0, k:0.85, heal:0.5, maxN:3, healTo:2 },
  // 特性の動き(→docs/30)。特性タグが効いている選手(そのポジションで先発)は、試合の処理と映像の両方で特性に合った動きをする
  //   quick … アンカー: 奪って quickN 手目までパスを pass 倍・持ち運びを carry 倍 / h … 隊列の高さのずれ / xIn・xOut … 中央へ寄せる・外へ開く割合
  //   ch … 選ぶ手の重み / recv … [下, 上, 倍率] この高さの範囲で受けやすい / recvLong … ロングボールの受け手 / mark … 守備で競りに行く重み
  //   sweep … GK の飛び出し / lob … 前に出たときの頭越しへの弱さ / save … セーブの上乗せ(壁は至近距離 wallH より奥のシュートだけ)/ amp・drift・press … 映像の上下の幅・横のゆらぎ・寄せ役の選ばれやすさ
  trait:{ quickN:1, quick:{ pass:2.2, carry:0.3 },
    h:{ no95:-0.05, no10:0, sweeper:-0.02, libero:0.03, wingback:0.04, target:0.02, anchor:-0.02, gkSweep:0.015 },
    xIn:{ target:0.3, anchor:0.3, no10:0.08 }, xOut:{ dribbler:0.15, crosser:0.2, wingback:0.15 },
    ch:{ libero:{ cbCarry:1.8 }, wingback:{ sbOver:1.4 }, crosser:{ sbEarly:1.8, smCross:1.8, wgCross:1.8 }, b2b:{ dmCarry:1.4, cmDrib:1.4 },
      fanta:{ omLast:1.5, omDrib:1.5 }, dribbler:{ wgCut:1.2, wgRun:1.2 }, no95:{ cfLay:1.6 }, target:{ cfLay:1.3 } },
    recv:{ no95:[0.45,0.7,1.4], no10:[0.62,0.82,1.6], b2b:[0.75,1,1.4] }, recvLong:{ target:2.0 }, mark:{ stopper:1.25, watchdog:1.6 },
    sweep:{ gkSweep:1.8 }, lob:{ gkSweep:0.5 }, save:{ gkGuard:0.05, gkWall:0.08 }, wallH:0.85,
    amp:{ b2b:1.4 }, drift:{ fanta:2.0 }, press:{ watchdog:0.6, stopper:0.75 } },
  // 試合映像の見え方(→docs/07 §7.11)。斜め上の横から見た立体
  //   far … 奥のタッチラインの縮み(手前 = 1)/ farY・nearY … 奥と手前のタッチラインの高さ(モニターの高さに対する割合)/ nearW … 手前の幅
  //   manH … 手前での選手の高さ / goalH … ゴールの高さ / standH … スタジアムの段ごとの奥のスタンドの高さ
  //   wallV … 奥の壁(広告の帯の下の端)の奥行き(0 = 奥のタッチライン。負は外側)/ boardH … 広告の帯の高さ / boardN … 帯の枠の数
  //   standBlur … 奥のスタンドのぼかし(何分の1に縮めてから引き伸ばすか)/ standDesat・standDim … 色を抜く量・暗くする量(→docs/14 §14.152)
  view:{ far:0.62, farY:0.22, nearY:0.95, nearW:1.0, manH:0.15, goalH:0.075, standH:[0.12,0.15,0.18,0.2,0.22],
    kpRing:{ gap:1.5, w:1.6, spread:9, ms:1400, blur:6 },   // KP の金の光(足元の輪との間・線の太さ・広がる幅 px・1回の長さ ms・光のぼかし。→docs/14 §14.162)
    wallV:-0.07, boardH:0.085, boardN:4, standBlur:2.2, standDesat:0.35, standDim:0.3,
    // ボールを持たない選手の動き(見た目だけ。→docs/07 §7.15)。1人ずつ独立して動く
    //   driftH/driftX … その場のゆらぎ(高さ・左右)/ runRate … 攻めているとき、1秒あたりに走り込みを始める率(スキルの向きで増減)
    //   runH/runX … 走り込みの深さ・横の幅 / runMs … 走り込みの長さ / press/pressN … 守るときボールへ寄せる割合と人数
    //   lag0/lagSpd … 追いつく遅さ(スピードが低いほど遅い)/ evRun … パスが通ったとき、味方の誰かが走り出す率
    mv:{ driftH:0.012, driftX:2.4, runRate:0.22, runH:[0.06,0.13], runX:7, runMs:[1100,1900], press:0.32, pressN:2,
         lag0:110, lagSpd:9, evRun:0.85,
         // 隊列の上下を1人ずつずらす。delay0/delayRnd/delaySpd … ボールへ反応するまでの遅れ(ms)/ amp … 役割ごとの上下の幅(1 = 隊列どおり)
         // shapeTau … 隊列が追うボールの高さをなめらかにする時間(ms)。パス1本ごとに全員が揺れ戻さないように
         shapeTau:900, delay0:90, delayRnd:260, delaySpd:14, amp:{ GK:0.5, CB:0.75, SB:0.9, DMF:0.9, CMF:1.05, SMF:1.05, OMF:1.15, WG:1.2, CF:1.2 } },
    // 走る・止まる(→docs/29 §29.2)。ピッチ 105×68m の画面上の m/ms。v0 + spd × vSpd が最高速、acc・dec が加速・減速(m/ms²)、ball … ボールに絡む人の倍率
    //   bob・lean … 走るときの上下の揺れ(選手の高さに対する割合)と前傾(度)/ stride … 1歩の長さ(m)
    kin:{ v0:0.016, vSpd:0.0011, acc:0.00011, dec:0.00016, ball:1.5, bob:0.045, lean:7, stride:8, face:0.004,
      // 段階2(→docs/29 §29.4): wind … 蹴る前の溜め(プレーの時間の割合)/ arrive … ボールが届く時点(残りはファーストタッチで止まる)
      //   line … 守備のラインをそろえる強さ / pressGap … 寄せる人が保持者の手前で止まる距離(u)/ sup … 攻撃の三角形に寄る強さ / celebMs … ゴールのあと集まる長さ
      wind:0.12, windShot:0.08, arrive:0.9, line:0.75, pressGap:0.025, sup:0.7, celebMs:2200 },
    // 段階3(→docs/29 §29.5)。cam … 中継のカメラ: z0 中盤の寄り / z1 ゴール前の寄り / zoneU ゴール前とみなす端からの距離(u)/ yFollow 縦にボールを追う割合 / tau なめらかさ(ms)
    //   fx … 足元の演出: dustMs 砂埃の長さ / dustCd 同じ人の砂埃の間隔 / skidMs スライディングの跡の長さ / netMs ネットの揺れの長さ / netAmp 揺れの大きさ(u)
    cam:{ z0:1.08, z1:1.22, zoneU:0.28, yFollow:0.4, tau:700 },
    fx:{ dustMs:520, dustCd:650, skidMs:1600, netMs:1400, netAmp:0.02 },
    // セットプレー(→docs/29 §29.6): pre … 蹴る前に帯を出して並びを見せる時間(ms)/ zoom … そのときのカメラの寄りの上乗せ / wallM … 壁までの距離(m)/ wallN … 壁の人数
    sp:{ pre:900, zoom:0.08, wallM:9.15, wallN:4 } },
  // 再生(見た目だけ。結果には触れない)
  //   replayN … リプレイで流し直す、得点までのボールの動きの数 / replaySlow … リプレイの速さ(1 = 通常)/ replayEnd … 終わりの間
  play:{ stepMs:620, shotMs:520, kickMs:450, goalHold:1900, shotHold:420, foulHold:800, cardHold:1500, psoHold:650,
    replayN:5, replaySlow:0.5, replayEnd:600,
    // 盤面のカードの大きさ(→docs/07 §7.11): 盤面の高さ ÷ cardRef の倍率を cardMin〜cardMax に収める(小さい画面で重ならないように)
    cardRef:400, cardMin:0.7, cardMax:1.12, boardAspect:0.7,   // boardAspect … 盤面のピッチの 幅 ÷ 高さ の上限(縦長を保つ)
    // 試合の区切りの字幕(→docs/07 §7.11)。本家と同じく、数秒で自動で進む(ミリ秒)
    capKick:3200, capHalf:4200, capEnd:2400, capOff:300 }   // capOff … 字幕が閉じる動きの長さ(ms。CSS の capOff と合わせる)
};

const GROUP_OF={ GK:"GK", CB:"DF", SB:"DF", DMF:"MF", CMF:"MF", SMF:"MF", OMF:"MF", WG:"FW", CF:"FW",
  LSB:"DF", RSB:"DF", LMF:"MF", RMF:"MF", LWG:"FW", RWG:"FW", ST:"FW" };
/**
 * 細かいポジション(→docs/17。pftb にならう)。カードの「得意な役割」と盤面の表示はこちら。
 *   LWG CF  RWG / LWG ST RWG / LMF OMF RMF / LMF CMF RMF / LMF DMF RMF / LSB CB RSB / GK
 * 試合の動き(手札など)は、これを束ねた役割(baseRole: SB・SMF・WG。ST は CF)で決める
 */
const BASE_ROLE={ LSB:"SB", RSB:"SB", LMF:"SMF", RMF:"SMF", LWG:"WG", RWG:"WG", ST:"CF" };
const baseRole=r=>BASE_ROLE[r]||r;
const LR_ROLE={ SB:["LSB","RSB"], SMF:["LMF","RMF"], WG:["LWG","RWG"] };
/** 左右の無い役割(SB・SMF・WG)を、side("L"|"R")の側にする */
const sidedRoles=(roles,side)=>roles.map(r=>LR_ROLE[r]?LR_ROLE[r][side==="R"?1:0]:r);

/**
 * 役割ごとの手札(3枚ずつ)。「その選手がボールを持ったときに何をするか」。
 *   kind … carry(自分で運ぶ) / pass(味方へ渡す)
 *   stat … 成否を決める能力。得意な手ほど選ばれやすい
 *   risk … 成功のしやすさ / gain … 前進量(残り距離に対する割合。負なら後ろへ)
 *   to   … 一発で届く高さ(ロングボール・クロス)
 *   lane … 左右の行き先
 */
const CHANNELS={
  GK: [{id:"gkLong",  label:"ロングキック",   kind:"pass",  stat:"pow", risk:0.62, gain:0.50, to:0.58, lane:"any"},
       {id:"gkThrow", label:"スロー",         kind:"pass",  stat:"spd", risk:1.00, gain:0.24, lane:"out"},
       {id:"gkShort", label:"短い繋ぎ",       kind:"pass",  stat:"tec", risk:1.10, gain:0.14, lane:"same"}],
  CB: [{id:"cbCarry", label:"持ち上がり",     kind:"carry", stat:"spd", risk:0.90, gain:0.20, lane:"same"},
       {id:"cbVert",  label:"縦パス",         kind:"pass",  stat:"tec", risk:0.86, gain:0.34, lane:"same"},
       {id:"cbFeed",  label:"ロングフィード", kind:"pass",  stat:"pow", risk:0.58, gain:0.55, to:0.74, lane:"any"}],
  SB: [{id:"sbOver",  label:"オーバーラップ", kind:"carry", stat:"spd", risk:0.86, gain:0.40, lane:"out"},
       {id:"sbInner", label:"インナーラップ", kind:"carry", stat:"tec", risk:0.84, gain:0.34, lane:"in"},
       {id:"sbEarly", label:"アーリークロス", kind:"pass",  stat:"pow", risk:0.56, gain:0.50, to:0.88, lane:"box"}],
  DMF:[{id:"dmSpray", label:"散らし",         kind:"pass",  stat:"tec", risk:0.98, gain:0.22, lane:"any"},
       {id:"dmSwitch",label:"サイドチェンジ", kind:"pass",  stat:"pow", risk:0.78, gain:0.30, lane:"switch"},
       {id:"dmCarry", label:"持ち上がり",     kind:"carry", stat:"sta", risk:0.88, gain:0.24, lane:"same"}],
  CMF:[{id:"cmThru",  label:"スルーパス",     kind:"pass",  stat:"tec", risk:0.62, gain:0.50, to:0.82, lane:"same"},
       {id:"cmDrib",  label:"ドリブル",       kind:"carry", stat:"spd", risk:0.80, gain:0.30, lane:"same"},
       {id:"cmWide",  label:"サイドへ展開",   kind:"pass",  stat:"pow", risk:0.88, gain:0.28, lane:"out"}],
  SMF:[{id:"smRun",   label:"縦への突破",     kind:"carry", stat:"spd", risk:0.76, gain:0.42, lane:"out"},
       {id:"smCross", label:"クロス",         kind:"pass",  stat:"pow", risk:0.60, gain:0.50, to:0.90, lane:"box"},
       {id:"smCut",   label:"カットイン",     kind:"carry", stat:"tec", risk:0.78, gain:0.36, lane:"in"}],
  OMF:[{id:"omLast",  label:"ラストパス",     kind:"pass",  stat:"tec", risk:0.58, gain:0.50, to:0.90, lane:"box"},
       {id:"omDrib",  label:"ドリブル突破",   kind:"carry", stat:"spd", risk:0.70, gain:0.40, lane:"in"},
       {id:"omKeep",  label:"キープ",         kind:"carry", stat:"pow", risk:0.95, gain:0.14, lane:"same"}],
  WG: [{id:"wgCut",   label:"カットイン",     kind:"carry", stat:"tec", risk:0.70, gain:0.42, lane:"in"},
       {id:"wgRun",   label:"縦への突破",     kind:"carry", stat:"spd", risk:0.70, gain:0.45, lane:"out"},
       {id:"wgCross", label:"クロス",         kind:"pass",  stat:"pow", risk:0.58, gain:0.50, to:0.90, lane:"box"}],
  CF: [{id:"cfLay",   label:"ポストプレー",   kind:"pass",  stat:"pow", risk:0.92, gain:-0.12, lane:"same"},
       {id:"cfRun",   label:"裏への抜け出し", kind:"carry", stat:"spd", risk:0.58, gain:0.60, lane:"same"},
       {id:"cfTurn",  label:"反転",           kind:"carry", stat:"tec", risk:0.70, gain:0.36, lane:"in"}]
};

/**
 * スタイル(→docs/04)。**KP にしたカードのスキルが引き当てる。同時に有効なのは1つ。**
 *   scope … team(チームの動きを変える) / solo(KP 本人を強める)
 *   axis  … 効きを決める成長グラフの軸(O/D/R/C/S/P)。axes … 2つ要るもの(低いほうでランクが決まる。→docs/15 §15.5)
 *   kind  … 相手監督が選ぶときの分類(atk / def / sup)
 *   gain  … 得るもの。**ランクの倍率が掛かる** / cost … 失うもの。ランクに関係なく満額
 *   fx    … solo のとき KP 本人に乗る効果(語彙はスキルのバフと同じ。ランクの倍率が掛かる)
 *
 *  team の語彙
 *   safe/riskK/gainK/urgeK … 安全な手を選ぶ強さ / 競り合い / 前進量 / 撃ちたがり
 *   direct … 一発で届く手を選びやすい
 *   fastN/fastZone/fastK/fastTo/slowK … 奪って fastN 手以内(opp=敵陣で / own=自陣で奪ったとき)は
 *                                       強く、一発で届く手を選びやすい。それ以外は slowK
 *   fwStay … 守るとき前線が下がらない割合 / chW・chS … 手札ごとの選びやすさと、その手の強さ
 *   lane … 行き先ごとの選びやすさ / recvRole … 役割ごとの受け手の選ばれやすさ
 *   aerial … 空中戦 / kpRecv・kpS … KP に集める・KP の競り合い / nonKpQ … KP 以外へのパスの質
 *   linkK・noLinkK … 連携の線の効き / 線の無い相手へのパス / push … 隊列を押し上げる量
 *   offRisk … 自分たちがオフサイドになる率 / late … 終盤か負けているときの全能力
 *   highK/lowK … ボールが敵陣 / 自陣にあるときの守備 / sta … スタミナ消費 / blk … シュートブロック
 *   off … 相手のオフサイド / beaten … 裏を取られたときの戻れなさ
 *   covK … 人数の厚みの効き / pressK … 1対1の寄せ / foulK … 反則率
 *   antiRecv/antiDuel/antiRank … 相手の KP へのパス・相手の KP の競り合い・相手のスタイルの効き
 *   others … 相手の KP 以外に対する守備
 */
const STYLES={
  T01:{ name:"ショートパスワーク", scope:"team", axis:"R", axes:["R","O"], kind:"atk",
        get:"安全に繋ぎ、競り合いに強い", lose:"前進が遅く、撃たない",
        gain:{ safe:1.6, riskK:1.10 }, cost:{ gainK:0.85, urgeK:0.8 } },
  T02:{ name:"ダイレクトプレイ", scope:"team", axis:"S", kind:"atk",
        get:"一発で届く手を選び、前進が大きい", lose:"パスが通りにくい",
        gain:{ direct:1.8, gainK:1.12 }, cost:{ riskK:0.94 } },
  T03:{ name:"ショートカウンター", scope:"team", axis:"S", axes:["S","C"], kind:"atk",
        get:"敵陣で奪ってすぐが速くて強い", lose:"遅攻が弱い",
        gain:{ fastK:1.20, fastTo:2.5 }, cost:{ fastN:2, fastZone:"opp", slowK:0.93 } },
  T04:{ name:"ロングカウンター", scope:"team", axis:"S", kind:"def",
        get:"自陣で奪ったら前線へ一発。前線は高い位置で待つ", lose:"中盤の守備が薄い",
        gain:{ fastK:1.22, fastTo:3.5 }, cost:{ fastN:2, fastZone:"own", fwStay:0.4, lowK:0.93 } },
  T05:{ name:"スルーパス重視", scope:"team", axis:"O", kind:"atk",
        get:"スルーパス・ラストパスを選びやすく、通りやすい", lose:"オフサイドが増える",
        gain:{ chW:{ cmThru:1.8, omLast:1.8, cbVert:1.4, cfRun:1.4 }, chS:1.10 }, cost:{ offRisk:1.5 } },
  T06:{ name:"センターポスト", scope:"team", axis:"O", axes:["O","P"], kind:"atk",
        get:"前線の的に当てて落とす。CF にボールが集まる", lose:"サイドを使わない",
        gain:{ recvRole:{ CF:1.8 }, chW:{ cfLay:2.0, omKeep:1.5 }, chS:1.15 }, cost:{ lane:{ out:0.6, box:0.7 } } },
  T07:{ name:"ハイタワー", scope:"team", axis:"P", kind:"atk",
        get:"クロスとロングボールを選び、空中戦が強い", lose:"足元の崩しが減る",
        gain:{ chW:{ smCross:1.8, wgCross:1.8, sbEarly:1.8, cbFeed:1.6, gkLong:1.6 }, chS:1.08, aerial:1.20 },
        cost:{ lane:{ in:0.6, same:0.8 } } },
  T08:{ name:"キープレイヤーアタック", scope:"team", axis:"O", kind:"atk",
        get:"KP にボールを集め、KP の競り合いが強い", lose:"KP 以外へのパスが通りにくい",
        gain:{ kpRecv:3.0, kpS:1.12 }, cost:{ nonKpQ:0.94 } },
  T09:{ name:"コンビネーションプレイ", scope:"team", axis:"R", axes:["R","S"], kind:"atk",
        get:"連携の線の効果が倍", lose:"線の無い相手へのパスが弱い",
        gain:{ linkK:2.0 }, cost:{ noLinkK:0.95 } },
  T10:{ name:"全員攻撃", scope:"team", axis:"O", axes:["O","S"], kind:"atk",
        get:"隊列を押し上げ、撃ちに行く", lose:"裏が空く",
        gain:{ push:0.06, urgeK:1.15 }, cost:{ beaten:1.08 } },
  T11:{ name:"プレッシング", scope:"team", axis:"C", axes:["C","S"], kind:"atk",
        get:"ボールが敵陣にあるとき守備が強い", lose:"自陣で弱い。スタミナを使う",
        gain:{ highK:1.30 }, cost:{ lowK:0.95, sta:1.22 } },
  T12:{ name:"リトリート", scope:"team", axis:"D", kind:"def",
        get:"自陣で守備が強く、シュートブロックも強い", lose:"敵陣で持たせる",
        gain:{ lowK:1.10, blk:1.25 }, cost:{ highK:0.82 } },
  T13:{ name:"ラインコントロール", scope:"team", axis:"D", kind:"def",
        get:"相手のオフサイドが増える", lose:"裏を取られると戻れない",
        gain:{ off:2.0 }, cost:{ beaten:1.30 } },
  T14:{ name:"オーガナイズドディフェンス", scope:"team", axis:"D", axes:["D","C"], kind:"def",
        get:"人数の厚みがよく効き、反則が減る", lose:"1対1の寄せが緩い",
        gain:{ covK:1.6, foulK:0.7 }, cost:{ pressK:0.93 } },
  T15:{ name:"マンツーマンディフェンス", scope:"team", axis:"D", axes:["D","P"], kind:"def",
        get:"1対1の寄せが強い", lose:"厚みが効かない。反則が増える",
        gain:{ pressK:1.18 }, cost:{ covK:0.5, foulK:1.3 } },
  T16:{ name:"アンチキープレイヤー", scope:"team", axis:"D", kind:"def",
        get:"相手の KP へのパスと、相手のスタイルの効きを抑える", lose:"KP 以外への守備が緩む",
        gain:{ antiRecv:0.5, antiDuel:0.90, antiRank:0.6 }, cost:{ others:0.96 } },
  T17:{ name:"ファイティングスピリッツ", scope:"team", axis:"O", kind:"sup",
        get:"終盤と、負けているときに全員が強くなる。消耗が減る", lose:"それ以外の時間は何も無い",
        gain:{ late:1.05, sta:0.93 }, cost:{} },

  K01:{ name:"降臨", scope:"solo", axis:"O", kind:"atk", get:"すべてが少しずつ強くなる",
        fx:{ all:1.06 } },
  K02:{ name:"ファンタジーア", scope:"solo", axis:"O", kind:"atk", get:"技術で決まる手ぜんぶ",
        fx:{ ch:["cmThru","omLast","omDrib","wgCut","smCut","cfTurn","cmDrib"], w:1.3, s:1.12, shot:1.05 } },
  K03:{ name:"ラインブレイク", scope:"solo", axis:"O", kind:"atk", get:"裏への抜け出し。裏で受ける",
        fx:{ ch:["cfRun"], w:1.8, s:1.20, recvDeep:1.6 } },
  K04:{ name:"ドリブル突破", scope:"solo", axis:"O", kind:"atk", get:"中央でのドリブル",
        fx:{ ch:["cmDrib","omDrib","cfTurn","dmCarry","cbCarry"], w:1.5, s:1.18 } },
  K05:{ name:"サイド突破", scope:"solo", axis:"O", kind:"atk", get:"サイドでの縦の突破とカットイン",
        fx:{ ch:["wgRun","wgCut","smRun","smCut"], w:1.5, s:1.18 } },
  K06:{ name:"クロス重視", scope:"solo", axis:"O", kind:"atk", get:"クロス",
        fx:{ ch:["smCross","wgCross","sbEarly"], w:1.6, s:1.20 } },
  K07:{ name:"チャンスメイク", scope:"solo", axis:"O", kind:"atk", get:"ラストパス。渡した味方のシュートが決まりやすい",
        fx:{ ch:["omLast","cmThru"], w:1.4, s:1.14, assist:1.12 } },
  K08:{ name:"ゴールハンティング", scope:"solo", axis:"O", kind:"atk", get:"流れの中のシュート",
        fx:{ shot:1.15, urge:1.15 } },
  K09:{ name:"ミドルシュート重視", scope:"solo", axis:"O", kind:"atk", get:"遠目からのシュート。撃てる距離が伸びる",
        fx:{ mid:1.40, urge:1.10, range:0.07 } },
  K10:{ name:"ボールキープ", scope:"solo", axis:"R", kind:"atk", get:"収めて預ける",
        fx:{ ch:["cfLay","omKeep"], w:1.5, s:1.25 } },
  K11:{ name:"ゲームメイク", scope:"solo", axis:"R", kind:"atk", get:"散らし・展開・サイドチェンジ",
        fx:{ ch:["dmSpray","dmSwitch","cmWide","cbVert"], w:1.3, s:1.18 } },
  K12:{ name:"オーバーラップ", scope:"solo", axis:"R", kind:"atk", get:"サイドの上下動。消耗も減る",
        fx:{ ch:["sbOver","sbInner"], w:1.5, s:1.18, sta:0.85 } },
  K13:{ name:"エリア支配", scope:"solo", axis:"R", kind:"sup", get:"持ち場の近くの競り合い(攻守とも)",
        fx:{ zone:1.12 } },
  K14:{ name:"プレースキック重視", scope:"solo", axis:"O", kind:"atk", get:"FK・CK・PK",
        fx:{ fk:1.35, ck:1.25, pkK:1.15 } },
  K15:{ name:"ハードマーク", scope:"solo", axis:"D", kind:"def", get:"持ち運びを止める。相手の KP に特に強い",
        fx:{ def:1.18, on:"carry", vsKp:1.15 } },
  K16:{ name:"カバーリング", scope:"solo", axis:"D", kind:"def", get:"周りの厚みになる。パスを読む",
        fx:{ def:1.15, on:"pass", cov:0.6 } },
  K17:{ name:"チェイシング", scope:"solo", axis:"C", kind:"atk", get:"前線からの守備",
        fx:{ chase:1.30 } },
  K18:{ name:"リベロ", scope:"solo", axis:"D", kind:"def", get:"カバーリングと、後ろからの持ち上がり",
        fx:{ cov:0.4, ch:["cbCarry","cbVert"], w:1.4, s:1.15 } },
  K19:{ name:"ダイナモ", scope:"solo", axis:"S", kind:"sup", get:"スタミナが減りにくい",
        fx:{ sta:0.65 } },
  K20:{ name:"フォアザチーム", scope:"solo", axis:"O", kind:"sup", get:"KP と線で繋がる味方が強くなる",
        fx:{ team:0.03 } },
  K21:{ name:"シュートセービング", scope:"solo", axis:"D", kind:"def", get:"枠内シュート",
        fx:{ gk:1.12 } },
  K22:{ name:"PKセービング", scope:"solo", axis:"D", kind:"def", get:"PK",
        fx:{ pk:1.30 } },
  K23:{ name:"リベロキーパー", scope:"solo", axis:"D", kind:"def", get:"前に出たときの守備範囲。遠目に弱くならない",
        fx:{ sweep:1.8, lob:0.3 } },
  K24:{ name:"GKフィード", scope:"solo", axis:"O", kind:"atk", get:"GK からのボール",
        fx:{ ch:["gkLong","gkThrow","gkShort"], w:1.0, s:1.30 } }
};
const AXIS_LABEL={ O:"オフェンス", D:"ディフェンス", R:"支配", C:"奪取", S:"スピード", P:"パワー" };
/** レーダー・グラフの表記(→docs/14 §14.22)。英語の略で、カードの能力(OFE / DEF / SPE / POW)と同じ3文字にそろえる。
    支配 = TEC、奪取 = STA(本家のテクニック・スタミナ。→docs/15 §15.1) */
const AXIS_ABBR={ O:"OFE", D:"DEF", R:"TEC", C:"STA", S:"SPE", P:"POW" };
/** 成長グラフの対角(→docs/15 §15.1)。対の2軸で器を1つ分け合う */
const AXIS_PAIR={ O:"D", D:"O", S:"P", P:"S", R:"C", C:"R" };
/** スタイルに必要な軸(1つか2つ。→docs/15 §15.5) */
const styleAxes=st=>st.axes||[st.axis];

/**
 * スキル(→docs/04 §4.10)。**カードはスキルを1つ持ち、スキルがスタイルとバフを引き当てる。**
 *   style … KP にしたときに発動するスタイル
 *   buff  … 本人に常時掛かる。**決まった場面だけ**に効き、小さい(おおむね ×1.05〜1.10)
 *  バフと solo スタイルの語彙
 *   ch/w/s … この手札を選びやすく(w)、その競り合いが強い(s) / def/on … on(carry/pass)を止める
 *   shot/mid/aerial/fk/ck/pkK … 流れのシュート / 遠目 / 空中戦 / 直接FK / CK・FKの球質 / PKを蹴る
 *   blk … シュートブロック / gk/pk … GK のセーブ / PK を止める / sweep/lob … 飛び出しの範囲と遠目の弱さ
 *   sta … スタミナの減り / all … 全能力 / recvDeep … 深い位置で受け手に選ばれる
 *   zone … 持ち場の近くの競り合い / cov … 周りの厚みへの加算 / chase … 敵陣での守備
 *   assist … 渡した味方のシュート / urge・range … 撃ちたがり・撃てる距離 / vsKp … 相手の KP を止める
 *   team … 線で繋がる味方の全能力(段ごと)
 */
/**
 * レアKP の技(→docs/11 §11.4)。ch … 手札に足す札(roles の役割のときだけ) / fx … 本人に乗る効果(語彙はスキルのバフと同じ)
 * godsave は 1試合に1回、決まるはずのシュートを止める(engine.js の shoot)
 */
const RARE_MOVES={
  roulette:{ label:"ルーレット", roles:["CMF","OMF","SMF","WG","CF"],
    ch:{id:"mvRou",    label:"ルーレット",     kind:"carry", stat:"tec", risk:0.96, gain:0.28, lane:"same"} },
  longshot:{ label:"ロングシュート", fx:{ range:0.08, mid:1.25 } },
  nolook:  { label:"ノールックパス", roles:["DMF","CMF","OMF","SMF","WG"],
    ch:{id:"mvNoLook", label:"ノールックパス", kind:"pass",  stat:"tec", risk:0.78, gain:0.50, to:0.88, lane:"box"} },
  heel:    { label:"ヒールパス", roles:["CF","OMF","WG","SMF"], fx:{ assist:1.15 },
    ch:{id:"mvHeel",   label:"ヒールパス",     kind:"pass",  stat:"tec", risk:1.00, gain:0.06, lane:"in"} },
  overhead:{ label:"オーバーヘッド", fx:{ aerial:1.25 } },
  sliding: { label:"鉄壁のスライディング", fx:{ def:1.3, on:"carry" } },
  godsave: { label:"神セーブ" }
};
const SKILLS={
  hunter:  { label:"ゴールハンター",       style:"K08", desc:"流れの中のシュートが強い", buff:{ shot:1.06 } },
  ace:     { label:"エース",               style:"T08", desc:"流れの中のシュートが強い", buff:{ shot:1.05 } },
  middle:  { label:"ミドルシューター",     style:"K09", desc:"遠目からのシュートが強い", buff:{ mid:1.15 } },
  runner:  { label:"裏への飛び出し",       style:"K03", desc:"最終ラインの裏へ抜け出す", buff:{ ch:["cfRun"], w:1.3, s:1.08 } },
  drib:    { label:"ドリブラー",           style:"K04", desc:"中央のドリブルで抜きやすい", buff:{ ch:["cmDrib","omDrib","cfTurn"], w:1.2, s:1.07 } },
  wing:    { label:"サイドアタッカー",     style:"K05", desc:"サイドの突破とカットイン", buff:{ ch:["wgRun","wgCut","smRun","smCut"], w:1.2, s:1.07 } },
  cross:   { label:"高精度クロス",         style:"K06", desc:"クロスが味方に合いやすい", buff:{ ch:["smCross","wgCross","sbEarly"], w:1.2, s:1.08 } },
  chance:  { label:"チャンスメイカー",     style:"K07", desc:"ラストパスが通りやすい", buff:{ ch:["omLast","cmThru"], w:1.2, s:1.07 } },
  fanta:   { label:"ファンタジスタ",       style:"K02", desc:"技術を使う手が通りやすい", buff:{ ch:["omLast","omDrib","wgCut","smCut"], w:1.15, s:1.06 } },
  post:    { label:"ポストプレイヤー",     style:"K10", desc:"前線で収めて預ける", buff:{ ch:["cfLay","omKeep"], w:1.2, s:1.10 } },
  target:  { label:"ターゲットマン",       style:"T06", desc:"前線で収めて預ける", buff:{ ch:["cfLay"], w:1.2, s:1.10 } },
  tower:   { label:"ハイタワー",           style:"T07", desc:"空中戦に強い(攻守とも)", buff:{ aerial:1.15 } },
  maker:   { label:"ゲームメイカー",       style:"K11", desc:"散らしと展開が正確", buff:{ ch:["dmSpray","dmSwitch","cmWide"], w:1.1, s:1.08 } },
  passer:  { label:"パスマスター",         style:"T01", desc:"短いパスが正確", buff:{ ch:["dmSpray","cmWide","cbVert"], w:1.1, s:1.06 } },
  thru:    { label:"スルーパサー",         style:"T05", desc:"スルーパスが通りやすい", buff:{ ch:["cmThru","omLast"], w:1.2, s:1.07 } },
  longp:   { label:"ロングパサー",         style:"T02", desc:"長いボールが正確", buff:{ ch:["cbFeed","dmSwitch","gkLong"], w:1.2, s:1.10 } },
  counter: { label:"カウンターの起点",     style:"T03", desc:"スルーパスが通りやすい", buff:{ ch:["cmThru"], w:1.1, s:1.06 } },
  sprint:  { label:"快速アタッカー",       style:"T04", desc:"最終ラインの裏へ抜け出す", buff:{ ch:["cfRun","wgRun"], w:1.2, s:1.07 } },
  combo:   { label:"コンビネーション",     style:"T09", desc:"短いパスが正確", buff:{ ch:["dmSpray","cmWide"], w:1.1, s:1.05 } },
  allout:  { label:"攻撃の旗手",           style:"T10", desc:"サイドを駆け上がる", buff:{ ch:["sbOver","sbInner"], w:1.15, s:1.06 } },
  over:    { label:"オーバーラップ",       style:"K12", desc:"サイドを駆け上がる", buff:{ ch:["sbOver","sbInner"], w:1.2, s:1.07 } },
  area:    { label:"エリアの支配者",       style:"K13", desc:"持ち場の近くの競り合いに強い", buff:{ zone:1.04 } },
  kicker:  { label:"フリーキッカー",       style:"K14", desc:"直接フリーキックが強い", buff:{ fk:1.15 } },
  god:     { label:"フットボールの申し子", style:"K01", desc:"すべてが少し強い", buff:{ all:1.02 } },
  team:    { label:"献身",                 style:"K20", desc:"スタミナが減りにくい", buff:{ sta:0.92 } },
  hunt:    { label:"ボールハンター",       style:"T11", desc:"パスを読んで奪う", buff:{ def:1.06, on:"pass" } },
  chase:   { label:"前線の守備者",         style:"K17", desc:"敵陣での守備が強い", buff:{ chase:1.10 } },
  mark:    { label:"ハードマーカー",       style:"K15", desc:"ドリブルを止める", buff:{ def:1.07, on:"carry" } },
  manmark: { label:"マンマーカー",         style:"T15", desc:"ドリブルを止める", buff:{ def:1.06, on:"carry" } },
  cover:   { label:"カバーリング",         style:"K16", desc:"パスを読んで奪う", buff:{ def:1.07, on:"pass" } },
  libero:  { label:"リベロ",               style:"K18", desc:"後ろから持ち上がる", buff:{ ch:["cbCarry","cbVert"], w:1.2, s:1.06 } },
  leader:  { label:"ディフェンスリーダー", style:"T14", desc:"身体を張ってシュートを止める", buff:{ blk:1.15 } },
  wall:    { label:"ゴール前の壁",         style:"T12", desc:"身体を張ってシュートを止める", buff:{ blk:1.20 } },
  line:    { label:"ラインコントローラー", style:"T13", desc:"パスを読んで奪う", buff:{ def:1.05, on:"pass" } },
  killer:  { label:"エースキラー",         style:"T16", desc:"ドリブルを止める", buff:{ def:1.07, on:"carry" } },
  captain: { label:"闘将",                 style:"T17", desc:"スタミナが減りにくい", buff:{ sta:0.92 } },
  dynamo:  { label:"ダイナモ",             style:"K19", desc:"スタミナが減りにくい", buff:{ sta:0.85 } },
  stopper: { label:"ショットストッパー",   style:"K21", desc:"枠内のシュートを止める", buff:{ gk:1.05 } },
  pkstop:  { label:"PKストッパー",         style:"K22", desc:"PKを止める", buff:{ pk:1.12 } },
  sweeper: { label:"スイーパーキーパー",   style:"K23", desc:"前に出たときの守備範囲が広い", buff:{ sweep:1.3, lob:0.7 } },
  feeder:  { label:"フィードの名手",       style:"K24", desc:"GKからのボールが味方に届く", buff:{ ch:["gkLong","gkThrow","gkShort"], w:1.0, s:1.12 } }
};

/** 陣形の初期配置。[h, x] を GK から順に11人ぶん。試合中はカードを自由に動かせる */
const FORMS={
  "4-3-3":[[0.05,50],[0.26,86],[0.2,62],[0.2,38],[0.26,14],[0.42,47],[0.52,71],[0.6,36],[0.78,86],[0.84,50],[0.78,14]],
  "4-4-2":[[0.05,50],[0.26,86],[0.2,62],[0.2,38],[0.26,14],[0.52,86],[0.44,62],[0.52,38],[0.52,14],[0.82,62],[0.76,38]],
  "4-2-3-1":[[0.05,50],[0.26,86],[0.2,62],[0.2,38],[0.26,14],[0.42,62],[0.42,38],[0.6,84],[0.62,50],[0.6,16],[0.84,50]],
  "3-5-2":[[0.05,50],[0.2,73],[0.2,50],[0.2,27],[0.38,50],[0.565,70],[0.565,30],[0.47,92],[0.47,8],[0.82,62],[0.76,38]],
  // ここから pftb の陣形を wcc_f の物差しに換算して足した(→docs/03・docs/14 §14.139)
  "5-3-2":[[0.05,50],[0.355,88],[0.19,73],[0.21,50],[0.19,27],[0.355,12],[0.4,50],[0.52,73],[0.52,27],[0.82,62],[0.82,38]],
  "4-3-1-2":[[0.05,50],[0.27,85],[0.2,62],[0.2,38],[0.27,15],[0.42,50],[0.5,73],[0.5,27],[0.61,50],[0.82,62],[0.82,38]],
  "5-4-1":[[0.05,50],[0.355,88],[0.19,73],[0.22,50],[0.19,27],[0.355,12],[0.49,62],[0.49,38],[0.53,85],[0.53,15],[0.82,50]],
  "3-4-3":[[0.05,50],[0.2,73],[0.23,50],[0.2,27],[0.47,62],[0.47,38],[0.5,86],[0.5,14],[0.82,82],[0.84,50],[0.82,18]],
  "4-1-4-1":[[0.05,50],[0.27,85],[0.2,62],[0.2,38],[0.27,15],[0.38,50],[0.54,85],[0.54,15],[0.56,62],[0.56,38],[0.82,50]],
  "4-3-2-1":[[0.05,50],[0.27,85],[0.2,62],[0.2,38],[0.27,15],[0.42,50],[0.47,73],[0.47,27],[0.65,62],[0.65,38],[0.83,50]],
  "4-4-2ダイヤ":[[0.05,50],[0.27,85],[0.2,62],[0.2,38],[0.27,15],[0.37,50],[0.52,73],[0.52,27],[0.585,50],[0.86,66],[0.79,34]],
  "4-2-2-2":[[0.05,50],[0.27,86],[0.2,62],[0.2,38],[0.27,14],[0.4,64],[0.4,36],[0.6,72],[0.6,28],[0.86,66],[0.79,34]],
  "ゼロトップ":[[0.05,50],[0.27,85],[0.2,62],[0.2,38],[0.27,15],[0.41,50],[0.51,73],[0.51,27],[0.64,50],[0.8,84],[0.8,16]],
  "4-3-3アシメ":[[0.05,50],[0.27,85],[0.2,62],[0.2,38],[0.27,15],[0.39,50],[0.57,66],[0.54,22],[0.83,86],[0.83,46],[0.75,16]],
  "4-2-4":[[0.05,50],[0.27,85],[0.2,62],[0.2,38],[0.27,15],[0.48,64],[0.48,36],[0.77,88],[0.84,62],[0.76,38],[0.77,12]],
  "9.5番":[[0.05,50],[0.25,85],[0.2,62],[0.2,38],[0.25,15],[0.415,64],[0.415,36],[0.61,80],[0.61,20],[0.595,50],[0.86,50]],
  "4-2-3-1ロー":[[0.05,50],[0.27,85],[0.2,62],[0.2,38],[0.27,15],[0.37,64],[0.37,36],[0.565,50],[0.7,82],[0.83,50],[0.7,18]]
};

/**
 * 選手カード(仮データ・すべて架空)。
 * [id, 背番号, 表示名, ポジション, 得意な役割, off, def, tec, pow, spd, sta, スキル]
 * 表示名は差し替え層(PACK)で上書きできる(→docs/01 §1.4)。
 */
const CARD_ROWS=[
  ["h01", 1,"マレーニ","GK",["GK"],        3,17,11,14,10,10,"stopper"],
  ["h02", 2,"ダルコ",  "DF",["SB"],        9,14,12,11,16,15,"over"],
  ["h03", 4,"ベルグ",  "DF",["CB"],        6,17,10,16,11,12,"leader"],
  ["h04", 5,"ソウザ",  "DF",["CB"],        7,16,12,15,12,12,"cover"],
  ["h05", 3,"リンド",  "DF",["SB"],       10,13,13,10,15,16,"cross"],
  ["h06", 6,"カンテロ","MF",["DMF","CMF"], 8,15,13,13,12,17,"hunt"],
  ["h07", 8,"ヴィレス","MF",["CMF","OMF"],13,10,16,11,12,14,"passer"],
  ["h08",10,"モレッティ","MF",["OMF","CMF"],14, 8,17,10,13,12,"chance"],
  ["h09", 7,"サリフ",  "FW",["WG","SMF"], 15, 6,15, 9,17,12,"wing"],
  ["h10", 9,"グラーフ","FW",["CF"],       18, 5,13,16,14,11,"hunter"],
  ["h11",11,"ニコ",    "FW",["WG"],       15, 6,16, 8,16,12,"fanta"],
  ["h12",12,"オルソ",  "GK",["GK"],        2,15,10,13, 9,10,"pkstop"],
  ["h13",15,"パヴェル","DF",["CB","SB"],   6,15,10,14,12,12,"wall"],
  ["h14",14,"ジョアン","MF",["CMF","DMF"],11,12,14,12,12,15,"dynamo"],
  ["h15",17,"ティモ",  "MF",["SMF","WG"], 13, 8,14, 9,16,13,"counter"],
  ["h16",19,"ブルーノ","FW",["CF"],       16, 5,12,15,13,11,"tower"],

  ["a01", 1,"ケーラー","GK",["GK"],        3,17,10,15, 9,10,"stopper"],
  ["a02", 2,"ハキム",  "DF",["SB"],       10,13,13,10,16,15,"over"],
  ["a03", 4,"ヴァルガ","DF",["CB"],        6,17,11,16,10,12,"line"],
  ["a04", 5,"ドミンゴ","DF",["CB"],        7,16,11,15,12,13,"mark"],
  ["a05", 3,"テオドル","DF",["SB"],        9,14,12,11,15,15,"cross"],
  ["a06", 7,"ラファ",  "MF",["SMF","WG"], 13, 8,15, 9,16,14,"cross"],
  ["a07", 6,"ロドルフォ","MF",["DMF","CMF"], 9,15,15,13,11,16,"maker"],
  ["a08", 8,"ペドラ",  "MF",["CMF","OMF"],13,10,17,10,12,14,"thru"],
  ["a09",11,"ヴィニ",  "MF",["SMF","WG"], 14, 7,15, 9,17,13,"wing"],
  ["a10", 9,"レヴァン","FW",["CF"],       17, 5,14,15,12,11,"target"],
  ["a11",10,"ムバレ",  "FW",["CF","WG"],  17, 5,15,11,18,12,"runner"],
  ["a12",13,"ノイマン","GK",["GK"],        2,15,10,13, 9,10,"sweeper"],
  ["a13",15,"ルカシュ","DF",["CB","SB"],   6,15,10,14,12,12,"killer"],
  ["a14",14,"カミロ",  "MF",["CMF","DMF"],11,12,14,12,12,15,"captain"],
  ["a15",17,"ジェイ",  "MF",["SMF","WG"], 13, 8,14, 9,16,13,"longp"],
  ["a16",19,"オスカル","FW",["CF"],       16, 5,12,15,13,11,"hunter"]
];
/** 年齢(仮データ)。若い選手は能力が低めで育ちやすく、ベテランはその逆(→docs/05 §5.4) */
const CARD_AGE={ h01:30, h02:26, h03:29, h04:27, h05:23, h06:31, h07:25, h08:27, h09:22, h10:29, h11:20, h12:34, h13:21, h14:24, h15:19, h16:32, a01:31, a02:24, a03:30, a04:27, a05:25, a06:23, a07:28, a08:26, a09:21, a10:31, a11:24, a12:20, a13:22, a14:29, a15:19, a16:33 };
/* ---- 国籍と動物占い(→docs/08 §8.6・docs/05 §5.5) ----
 * 動物は wcc_f 独自の12種。4つの群れに3種ずつ。**生年月日から出す**: 1900-01-01 からの日数を 12 で割った余り(tools/gen_cards.py と同じ)。
 * 相性: 同じ群れ = 良い / 群れの並び(草原 → 森 → 海 → 空 → 草原)で隣 = ふつう / 向かいの群れ = 張り合う */
const ANI_GROUP=["草原","森","海","空"];
const ANIMALS=[
  { name:"獅子", g:0 }, { name:"狼", g:1 }, { name:"鯱", g:2 }, { name:"鷲", g:3 },
  { name:"馬",   g:0 }, { name:"熊", g:1 }, { name:"海豚", g:2 }, { name:"隼", g:3 },
  { name:"犀",   g:0 }, { name:"鹿", g:1 }, { name:"鮫", g:2 }, { name:"梟", g:3 }
];
const ANI_ICON=["🦁","🐺","🐋","🦅","🐎","🐻","🐬","🦅","🦏","🦌","🦈","🦉"];
function aniOfDate(y,m,d){ return Math.round((Date.UTC(y,m-1,d)-Date.UTC(1900,0,1))/864e5)%ANIMALS.length; }
/** 動物の相性 2=良い / 1=ふつう / 0=張り合う */
function aniCompat(a,b){ const d=Math.abs(ANIMALS[a].g-ANIMALS[b].g); return d===0?2:d===2?0:1; }
const NAT_NAME={ ENG:"イングランド", SCO:"スコットランド", IRL:"アイルランド", FRA:"フランス", ESP:"スペイン", POR:"ポルトガル",
  ITA:"イタリア", GER:"ドイツ", NED:"オランダ", BEL:"ベルギー", SUI:"スイス", AUT:"オーストリア", CRO:"クロアチア", SRB:"セルビア",
  SVN:"スロベニア", SVK:"スロバキア", POL:"ポーランド", HUN:"ハンガリー", UKR:"ウクライナ", RUS:"ロシア", GEO:"ジョージア", ARM:"アルメニア",
  TUR:"トルコ", GRE:"ギリシャ", MNE:"モンテネグロ", KOS:"コソボ", DEN:"デンマーク", NOR:"ノルウェー", SWE:"スウェーデン",
  BRA:"ブラジル", ARG:"アルゼンチン", URU:"ウルグアイ", COL:"コロンビア", ECU:"エクアドル", USA:"アメリカ", CAN:"カナダ", MEX:"メキシコ", JAM:"ジャマイカ",
  EGY:"エジプト", ALG:"アルジェリア", MAR:"モロッコ", CMR:"カメルーン", CIV:"コートジボワール", NGA:"ナイジェリア", SEN:"セネガル", GUI:"ギニア",
  UZB:"ウズベキスタン", KOR:"韓国", JPN:"日本" };
/** 架空の選手(アズーロFC・ロッソ)の国籍。id から決まる */
const NAT_POOL=["ITA","ITA","ESP","FRA","GER","NED","POR","BRA","ARG","ENG","BEL","CRO","URU","JPN"];

/** チームスタイルの初期セット(→docs/14 §14.177) */
const MAB_DEFAULT=["leader","half","morale"];
/** 監督能力(→docs/10 §10.2 C)。名前は FOOTISTA 2021 にあったもの(調べて分かった10種 + 士気向上)と、wcc_f で足した3種 */
const MAB=[
  { id:"center",   name:"センターアタック強化", desc:"中央の選手(前線・中盤)の力が少し上がる" },
  { id:"side",     name:"サイドアタック強化",   desc:"サイドの選手の力が少し上がる" },
  { id:"counter",  name:"カウンターアタック強化", desc:"奪ってすぐの速い攻めが通りやすい" },
  { id:"post",     name:"ポストプレイ強化",     desc:"FW がボールを受けやすく、空中戦に強い" },
  { id:"duel",     name:"デュエル強化",         desc:"シュートを防ぐ・ボールを追う力が上がる" },
  { id:"hotline",  name:"クラブホットライン強化", desc:"チャンスメイクのパスが効く" },
  { id:"leader",   name:"リーダーシップ",       desc:"KP のスタイルの効き目が上がる" },
  { id:"half",     name:"ハーフタイムケア",     desc:"ハーフタイムにスタミナが少し多く戻る" },
  { id:"dfc",      name:"DFコーチング",         desc:"DF の力が少し上がる" },
  { id:"stamina",  name:"スタミナコントロール", desc:"スタミナが減りにくい" },
  { id:"morale",   name:"士気向上",             desc:"全員の力がほんの少し上がる" },
  { id:"setpiece", name:"セットプレイ強化",     desc:"FK・CK・PK が決まりやすい" },
  { id:"saving",   name:"セービング強化",       desc:"GK のセーブが上がる" },
  { id:"spurt",    name:"ラストスパート",       desc:"75分以降、全員の力が上がる" }
];
const MAB_RANK=["I","II","III","マスター"];
/**
 * ハーフタイムの指示(→docs/10 §10.8)。**特殊練習1つにつき1つ**で、上がる軸・下がる軸は練習と同じ(本家の表と同じ対応)。
 * 同じ特殊練習を TUNING.ht.unlock 回すると覚える。初めから使えるのは HT_BASIC の3つ(上がる軸だけ・効きは小さめ)
 */
const HT_PHRASE={ "1VS1":"1対1で勝負しろ", "1タッチゲーム":"細かくパスを回せ", "3vs1とりかご":"ボールを失うな", "4VS4パスゲーム":"パスワークで崩せ",
  "CK練習":"CKを生かせ", "FK練習":"FKを生かせ", "オーバーラップ":"サイドバックも上がれ", "オフ・ザ・ボールの動き":"ボールの無い所で動け",
  "カテナチオ":"ゴール前に鍵をかけろ", "カバーリング":"互いにカバーしろ", "キック&ラッシュ":"蹴って走れ", "クロスボール":"クロスを放り込め",
  "ゲーゲンプレス":"奪われたらすぐ奪い返せ", "ゲルマン魂":"最後まで諦めるな", "コーチング":"声をかけ合え", "サイドアタック":"サイドを突け",
  "サインプレイ":"練習した形を出せ", "シャトルラン":"走り負けるな", "シャンパンサッカー":"華麗に崩せ", "ショートカウンター":"高い位置で奪って速く",
  "ストップ・ザ・ゲーム":"試合を落ち着かせろ", "セクシーフットボール":"魅せて勝て", "セットプレイ":"セットプレイで仕留めろ", "ダイナミズム":"全員で動け",
  "ダイレクトシュート":"迷わず撃て", "ダイレクトパス":"ワンタッチではたけ", "ダイレクトプレイ":"手数をかけるな", "トータルフットボール":"全員で攻めて全員で守れ",
  "ハイインテンシティー":"強度を上げろ", "ハイプレス":"前から奪いに行け", "パス&ラン":"出したら走れ", "ビルドアップ":"後ろから組み立てろ",
  "フルコート3対3":"数的優位を作れ", "ポジション変更":"ポジションを入れ替えろ", "ポストプレイ":"前線で収めろ", "ポゼッションフットボール":"ボールを握れ",
  "マンマーク":"マークを外すな", "ミニゲーム":"狭い所で勝て", "ムービングフットボール":"動きながら崩せ", "ラインディフェンス":"ラインをそろえろ",
  "リトリート":"一度引いて守れ", "ロングカウンター":"引いて一気に返せ", "攻守の切り替え":"切り替えを速く", "紅白戦":"練習どおりにやれ",
  "組織プレイ":"組織で戦え", "中央突破":"真ん中をこじ開けろ", "特殊セットプレイ":"とっておきを出せ", "非公開練習":"相手の裏をかけ" };
/* ハーフタイムの指示(→docs/26 §26.5)。どの指示にも「代わりに失うもの」がある:
 *   振り分け(down で下がる軸)/ 消耗(stam: 後半のスタミナの減りが TUNING.ht.stamK 倍)/ 限定(pos: その役割の選手にだけ効く)
 * 強さ k は htK が物差しでそろえる */
const HT_BASIC=[
  { id:"b1", name:"気合いを入れ直せ", up:"ODRCSP", down:"", stam:true },
  { id:"b2", name:"集中を切らすな",   up:"DC",     down:"O" },
  { id:"b3", name:"攻めの姿勢を見せろ", up:"OS",   down:"D" }
];
const HT_SPEC={
  "トータルフットボール":{ up:"ODRCSP", stam:true }, "ムービングフットボール":{ up:"ORS", down:"P" }, "攻守の切り替え":{ up:"OD", stam:true },
  "ゲルマン魂":{ up:"PD", down:"S" }, "ハイインテンシティー":{ up:"OPDCS", stam:true }, "ビルドアップ":{ up:"RP", down:"C" },
  "ポゼッションフットボール":{ up:"OR", down:"S" }, "組織プレイ":{ up:"DC", down:"O" }, "ダイレクトパス":{ up:"RS", down:"P" },
  "シャンパンサッカー":{ up:"ORS", down:"D" }, "セクシーフットボール":{ up:"OR", pos:["MF"] }, "サインプレイ":{ up:"RP", down:"O" },
  "1タッチゲーム":{ up:"RS", down:"D" }, "オフ・ザ・ボールの動き":{ up:"OS", pos:["FW"] }, "パス&ラン":{ up:"ORS", stam:true },
  "カテナチオ":{ up:"DC", down:"OS" }, "ショートカウンター":{ up:"OS", down:"R" }, "マンマーク":{ up:"DC", pos:["DF"] },
  "1VS1":{ up:"OS", pos:["FW"] }, "ダイレクトシュート":{ up:"OR", pos:["FW"] }, "ポストプレイ":{ up:"OP", pos:["FW"] },
  "FK練習":{ up:"OP", down:"S" }, "CK練習":{ up:"PD", down:"S" }, "ラインディフェンス":{ up:"DR", down:"S" },
  "ポジション変更":{ up:"ODP", stam:true }, "ミニゲーム":{ up:"RC", down:"P" },
  "ゲーゲンプレス":{ up:"OCS", stam:true }, "ハイプレス":{ up:"C", pos:["FW","MF"] }, "キック&ラッシュ":{ up:"OP", down:"R" },
  "ダイナミズム":{ up:"ODCS", stam:true }, "リトリート":{ up:"DS", down:"O" },
  "紅白戦":{ up:"ODRCSP", stam:true }, "コーチング":{ up:"PD", down:"O" }
};
/** 指示の強さ: budget を「上がる軸の数 − 下がる軸の数 × downR」で割り、代わり(消耗・限定)の分だけ上乗せ(どの指示もほぼ同じ得に) */
function htK(h){
  const X=TUNING.ht, n=Math.max(0.5,h.up.length-(h.down||"").length*X.downR);
  return Math.min(X.kMax,X.budget/n*(h.stam?X.stamMul:1)*(h.pos?X.posMul:1));
}

const CARDS={};
CARD_ROWS.forEach(r=>{
  CARDS[r[0]]={ id:r[0], no:r[1], name:r[2], pos:r[3], roles:r[4],
    off:r[5], def:r[6], tec:r[7], pow:r[8], spd:r[9], sta:r[10], skill:r[11]||null, age:CARD_AGE[r[0]]||26 };
  // 国籍と動物は id から決める疑似の値(誕生日は年齢に合う年の中で id から決まる日)
  const h=hashStr("nat:"+r[0]), c=CARDS[r[0]], y=2025-c.age;
  c.nat=NAT_POOL[h%NAT_POOL.length];
  const day=hashStr("birth:"+r[0])%365, dt=new Date(Date.UTC(y,6,1)+day*864e5);
  c.ani=aniOfDate(dt.getUTCFullYear(),dt.getUTCMonth()+1,dt.getUTCDate());
});

/**
 * クラブ(2つ・架空)。xi は FORMS の並び順(GKが先頭)。
 *   kp    … 既定の KP / links … 連携の線 [カード, カード, 段(1〜3)]
 * 連携は段階3で育つようにする。それまでは固定値(→docs/04 §4.6)
 */
const TEAMS={
  azr:{ id:"azr", name:"アズーロFC", short:"AZR", color:"#2f7fe0", form:"4-3-3", kp:"h10",
        xi:["h01","h02","h03","h04","h05","h06","h07","h08","h09","h10","h11"],
        bench:["h12","h13","h14","h15","h16"],
        links:[["h08","h10",3],["h07","h10",2],["h09","h10",1],["h11","h10",1],["h07","h08",2],
               ["h06","h07",2],["h03","h04",3],["h02","h09",2],["h05","h11",2]] },
  ros:{ id:"ros", name:"ロッソ・ユナイテッド", short:"ROS", color:"#e0483a", form:"4-4-2", kp:"a11",
        xi:["a01","a02","a03","a04","a05","a06","a07","a08","a09","a10","a11"],
        bench:["a12","a13","a14","a15","a16"],
        links:[["a10","a11",3],["a08","a11",2],["a08","a10",1],["a07","a08",2],["a06","a02",2],
               ["a09","a05",2],["a03","a04",3],["a06","a10",1],["a09","a11",2]] }
};

// 架空のカード(CARD_ROWS)の SB・SMF・WG は、所属クラブの既定の陣形で置かれる側(控えは id のたね)で左右に分ける(→docs/17)
for(const t of Object.values(TEAMS)){
  const f=FORMS[t.form];
  t.xi.concat(t.bench).forEach((id,i)=>{ const c=CARDS[id]; if(!c||!c.roles.some(r=>LR_ROLE[r]))return;
    const x=i<11?f[i][1]:null, side=x!=null&&x!==50?(x<50?"L":"R"):(hashStr("side:"+id)%2?"R":"L");
    c.roles=sidedRoles(c.roles,side); });
}
for(const c of Object.values(CARDS))if(c.roles.some(r=>LR_ROLE[r]))c.roles=sidedRoles(c.roles,hashStr("side:"+c.id)%2?"R":"L");

/**
 * 表示の差し替え層。実名パックや画像はここへ流し込む(→docs/01 §1.4)。
 * 本体には架空名だけを持ち、PACK は端末に読み込んだときだけ埋まる。
 */
const PACK={ names:{}, teams:{}, images:{} };
const nameOf=card=>PACK.names[card.id]||card.name;
const teamNameOf=t=>(PACK.teams[t.id]&&PACK.teams[t.id].name)||t.name;

/* ---------- タグ(チームと選手のバフ・デバフ。→docs/23) ----------
 * TAGS: id → { name, scope:"team"|"player", kind, pol:1 バフ / -1 デバフ, desc, dur:試合数 | null(条件が解けるまで), endOn:"win"|"lose", opp:打ち消すタグ, fx:{ 語彙:"+m" … } }
 *   fx の値は「向き + 強さ」: "+m" = ×(1 + 中)、"-m" = ×(1 − 中)。強さは TUNING.tag.str
 *   derived:true … 別の状態から読む(施設充実 = スポンサーの報酬 S.biz.boost)。上限の数には入れない
 *   keep:true … 上限の数に入れず、押し出されない(黄金期)。dur:"graph.golden" のような文字は TUNING.grow から読む
 *   fx の motLock:"on" … 全員(ケガ以外)を絶好調に固定する */
TUNING.tag={
  str:{ s:0.15, m:0.3, l:0.5 },   // 小・中・大
  teamMax:3,                      // チームの汎用(保存するもの)の上限。超えたら残りの試合がいちばん短いものを押し出す
  playerMax:2,                    // 選手の汎用の上限(任期まで続くもの・一過性のもの、それぞれ)
  streak:3                        // 勢い・スランプが付く連勝・連敗の数
};
const TAGS={
  golden:   { name:"黄金期到来",   scope:"team", kind:"gen", pol:1,  keep:true, dur:"graph.golden", fx:{ motLock:"on" }, endMsg:"黄金期がひと区切り(金色の成長グラフはそのまま)", desc:"選手全員が絶好調。調子が落ちない" },
  momentum: { name:"勢い",         scope:"team", kind:"gen", pol:1,  dur:10, endOn:"lose", opp:"slump", fx:{ motUp:"+m" }, desc:"勝ったとき、調子が上がりやすい。負けると消える" },
  slump:    { name:"スランプ",     scope:"team", kind:"gen", pol:-1, dur:null, endOn:"win", opp:"momentum", fx:{ motDown:"+m" }, desc:"負けたとき、調子が下がりやすい。勝つと消える" },
  promo:    { name:"昇格の勢い",   scope:"team", kind:"gen", pol:1,  dur:10, opp:"releg", fx:{ motDown:"-m" }, desc:"チームの調子が落ちにくい" },
  releg:    { name:"降格の重圧",   scope:"team", kind:"gen", pol:-1, dur:10, opp:"promo", fx:{ motDown:"+m" }, desc:"チームの調子が落ちやすい" },
  facTrain: { name:"練習場施設充実",   scope:"team", kind:"gen", pol:1, derived:true, desc:"スポンサーの報酬" },
  facTact:  { name:"戦術室施設充実",   scope:"team", kind:"gen", pol:1, derived:true, desc:"スポンサーの報酬" },
  facLounge:{ name:"ラウンジ施設充実", scope:"team", kind:"gen", pol:1, derived:true, desc:"スポンサーの報酬" },
  facMed:   { name:"メディカル施設充実", scope:"team", kind:"gen", pol:1, derived:true, desc:"スポンサーの報酬" },
  oil:      { name:"オイルマネー",     scope:"team", kind:"gen", pol:1, derived:true, desc:"王族の投資ファンドと契約中。カードの金パック(キラ・レジェンド)が出る率 ×2" }
};
/** スポンサーの報酬の効果 → 施設充実のタグ(オーナーの案: 報酬は施設の名前に寄せる。中身は今の報酬のまま) */
const SP_FAC_TAG={ indExp:"facTrain", indSec:"facTrain", loungeOk:"facLounge", loungeExp:"facLounge", loungeSec:"facLounge",
  care:"facMed", careSec:"facMed", noFat:"facMed", injury:"facMed", bench:"facTact", keepForm:"facTact" };

/* ---- チームの称号(→docs/23 §23.3)----
 * 国の称号: 先発11人が同じ国籍で実際に戦い、試合のあとに確率で付く(重ねるほど上がる。急造では取りにくい)。効くのは先発がその国の11人のときだけ
 * クラブの称号: 黄金期(金色が3つ)に届いたとき、金色の3軸の組み合わせで付く。いつでも効く
 * 能力の上乗せ: stat:[{ who:"all"|"DF"|"MF"|"FW"|"FM"(FW と MF)|"DM"(DF と MF), st:[能力], k:"s"|"m"|"l" }]。量は TUNING.tag.stat、1つの能力の合計は statCap まで */
Object.assign(TUNING.tag,{
  stat:{ s:1, m:2, l:3 },
  statCap:3,
  nation:{ from:5, step:0.03, max:0.30, winK:1.5 }   // その国の11人で戦った試合が from 試合目から判定。率 = step ×(試合数 − from + 1)、上限 max、勝てば ×winK
});
const TITLE_NATION={
  ITA:["カテナチオ",            [{ who:"all", st:["def"], k:"m" }]],
  ENG:["キックアンドラッシュ",  [{ who:"all", st:["spd"], k:"m" }]],
  NED:["トータルフットボール",  [{ who:"all", st:["sta"], k:"m" }]],
  CRO:["バトレニ",              [{ who:"all", st:["tec"], k:"m" }]],
  SWE:["ブローギューラ",        [{ who:"all", st:["spd","tec"], k:"s" }]],
  ESP:["無敵艦隊",              [{ who:"all", st:["tec"], k:"m" }]],
  DEN:["ダニッシュダイナマイト",[{ who:"all", st:["tec"], k:"m" }]],
  GER:["ゲルマン魂",            [{ who:"all", st:["pow"], k:"m" }]],
  FRA:["シャンパンサッカー",    [{ who:"all", st:["tec"], k:"m" },{ who:"MF", st:["off"], k:"s" }]],
  BEL:["ロードダウフェルス",    [{ who:"all", st:["tec"], k:"m" }]],
  POR:["セレソンダスキナス",    [{ who:"all", st:["tec"], k:"m" },{ who:"FW", st:["spd"], k:"s" }]],
  ARG:["セレスティブランコ",    [{ who:"all", st:["off"], k:"m" }]],
  URU:["セレステ",              [{ who:"all", st:["spd"], k:"m" },{ who:"DF", st:["pow"], k:"s" }]],
  BRA:["カナリア軍団",          [{ who:"all", st:["off"], k:"m" },{ who:"all", st:["tec"], k:"s" }]],
  JPN:["大和魂",                [{ who:"all", st:["tec"], k:"m" },{ who:"all", st:["sta"], k:"s" }]]
};
// 金色の3軸(OFE/DEF・SPE/POW・TEC/STA の順に1文字ずつ)→ クラブの称号
const TITLE_CLUB={
  OSR:["銀河系軍団",       [{ who:"all", st:["off","tec"], k:"s" },{ who:"FW", st:["off"], k:"m" }]],
  OSC:["疾風軍団",         [{ who:"all", st:["spd","sta"], k:"s" }]],
  OPR:["王朝",             [{ who:"FM", st:["off","pow"], k:"s" }], { motDown:"-s" }],
  OPC:["鉄血軍団",         [{ who:"FM", st:["pow","sta"], k:"s" }]],
  DSR:["堅守速攻",         [{ who:"DM", st:["spd"], k:"s" },{ who:"FW", st:["off"], k:"s" }]],
  DSC:["鉄壁のハイライン", [{ who:"DF", st:["spd","sta"], k:"m" }]],
  DPR:["王者の風格",       [{ who:"DF", st:["def","tec"], k:"s" }], { motDown:"-m" }],
  DPC:["不沈艦",           [{ who:"DF", st:["def","pow"], k:"m" }]]
};
const TAG_WHO={ all:"全員", DF:"DF", MF:"MF", FW:"FW", FM:"FW・MF", DM:"DF・MF" };
const tagStatTxt=L=>L.map(x=>TAG_WHO[x.who]+"の "+x.st.map(k=>STAT_LABEL[k]).join("・")+" +"+TUNING.tag.stat[x.k]).join("、");
for(const nat in TITLE_NATION){ const [name,stat]=TITLE_NATION[nat];
  TAGS["n_"+nat]={ name, scope:"team", kind:"title", sub:"nation", nat, pol:1, keep:true, dur:null, stat,
    desc:"国の称号。先発がこの国の11人のとき: "+tagStatTxt(stat) }; }
for(const k in TITLE_CLUB){ const [name,stat,fx]=TITLE_CLUB[k];
  TAGS["c_"+k]={ name, scope:"team", kind:"title", sub:"club", pol:1, keep:true, dur:null, stat, fx,
    desc:"クラブの称号(黄金期の形): "+tagStatTxt(stat)+(fx&&fx.motDown?"、調子が落ちにくい":"") }; }

/* ---- 選手のタグ(→docs/23 §23.4)----
 * 汎用: 調子・話題・出場の記録から付く。1人2つまで(残りの短いものから押し出す)。特性: ポジションの色。1人1つ(付け替え)
 * 選手の fx の語彙: inj(ケガの起きやすさ)/ comm(コミュニケーションの成功しやすさ)/ exp(経験の入り)/ motUp・motDown / motLock:"on" /
 *   fat(試合の疲労)/ kp(KP の効き目)/ noInj:"on"(ケガをしない)。teamFx … SQUAD にいるとチームに効く
 * stat の when: 省略 = いつでも / "start" 先発のとき / "sub" 途中出場のとき / "final" 決勝のとき */
TUNING.tag.str.x=1;                       // 「たまらない」など、まるごと消す強さ
TUNING.tag.stat.x=5;                      // MVP の「超」
Object.assign(TUNING.tag,{
  statCapX:5,                             // MVP がいるときの1つの能力の上限
  player:{ propP:0.10, propTrust:2,       // 選手からの提案: 信頼度の段 propTrust 以上の個人練習で propP。1人につき任期に1回
    rookieAge:23, vetAge:31,              // 加入で ROOKIE・ベテラン
    wait:10, rebel:15,                    // 出場なしが続いた試合数で 出番待ち・反抗期
    bandiera:70,                          // バンディエラ: この任期の出場が bandiera に最初に届いた1人だけ(チームに1人)
    superSub:2, ace:10, pillar:30, kpWin:10, iron:20,
    injN:2, careN:5,                      // ケガの回数でケガがち、ケアの回数でケガに強い
    rateMin:7.0, rateN:5 }                // そのポジションで採点 rateMin 以上が rateN 試合続くと特性
});
const ALL6=["off","def","tec","pow","spd","sta"];
Object.assign(TAGS,{
  injRes:  { name:"ケガに強い",   scope:"player", kind:"gen", pol:1,  dur:null, opp:"injProne", fx:{ inj:"-m" }, desc:"ケガをしにくい" },
  injProne:{ name:"ケガがち",     scope:"player", kind:"gen", pol:-1, dur:null, opp:"injRes",   fx:{ inj:"+m" }, desc:"ケガをしやすい" },
  rebel:   { name:"反抗期",       scope:"player", kind:"gen", pol:-1, dur:5, opp:"growth", fx:{ comm:"-m" }, desc:"コミュニケーションが失敗しやすい" },
  growth:  { name:"成長期",       scope:"player", kind:"gen", pol:1,  dur:5, opp:"rebel",  fx:{ comm:"+m", exp:"+s" }, desc:"コミュニケーションが成功しやすく、経験が入りやすい" },
  rookie:  { name:"ROOKIE",       scope:"player", kind:"gen", pol:1,  dur:5, onAdd:"mot4", fx:{ motDown:"-l" }, desc:"加入したての若手。絶好調で始まり、調子が落ちにくい" },
  veteran: { name:"ベテラン",     scope:"player", kind:"gen", pol:1,  dur:5, fx:{ fat:"-x" }, desc:"加入したての熟練。試合の疲労がたまらない" },
  bandiera:{ name:"バンディエラ", scope:"player", kind:"gen", pol:1,  dur:null, fx:{ inj:"-s" }, stat:[{ st:["sta"], k:"s" }], desc:"クラブの顔(チームに1人)。STA +1、ケガをしにくい" },
  supersub:{ name:"スーパーサブ", scope:"player", kind:"gen", pol:1,  dur:null, stat:[{ when:"sub", st:["off","spd","tec","pow"], k:"m" }], desc:"途中出場すると OFE・SPE・TEC・POW +2" },
  ace:     { name:"エース",       scope:"player", kind:"gen", pol:1,  dur:null, stat:[{ when:"start", st:["off","tec","spd"], k:"m" }], desc:"先発すると OFE・TEC・SPE +2" },
  pillar:  { name:"精神的支柱",   scope:"player", kind:"gen", pol:1,  dur:null, teamFx:{ motDown:"-s" }, desc:"SQUAD にいるとチームの調子が落ちにくい" },
  mvp:     { name:"MVP",          scope:"player", kind:"gen", pol:1,  dur:5, capX:true, fx:{ noInj:"on" }, stat:[{ st:ALL6, k:"x" }], desc:"大舞台の主役。能力すべて +5、ケガをしない" },
  strat:   { name:"戦略家",       scope:"player", kind:"gen", pol:1,  dur:null, fx:{ kp:"+s" }, desc:"KP の効き目が上がる" },
  iron:    { name:"鉄人",         scope:"player", kind:"gen", pol:1,  dur:10, fx:{ fat:"-m" }, desc:"試合の疲労がたまりにくい" },
  waiting: { name:"出番待ち",     scope:"player", kind:"gen", pol:-1, dur:null, endOn:"played", fx:{ motDown:"+m" }, desc:"調子が落ちやすい。出場すると「やる気爆発」に変わる" },
  burst:   { name:"やる気爆発",   scope:"player", kind:"gen", pol:1,  dur:1, onAdd:"mot4", fx:{ motLock:"on" }, desc:"待ちに待った出番。次の試合は絶好調" },
  scorer:  { name:"得点感覚",     scope:"player", kind:"gen", pol:1,  dur:3, stat:[{ st:["off"], k:"s" }], desc:"ゴールの匂いがわかる。OFE +1" },
  bigstage:{ name:"大舞台に強い", scope:"player", kind:"gen", pol:1,  dur:null, stat:[{ when:"final", st:ALL6, k:"m" }], desc:"決勝で能力すべて +2" }
});
// 特性(ポジション)。pos のポジションで出たときだけ効く。grp … 選手からの提案で、そのグループ(GK・DF・MF・FW)の選手にも候補に出す
const TRAITS={
  gkGuard:  ["守護神",                ["GK"],                  ["GK"], [{ st:ALL6, k:"s" }]],
  gkSweep:  ["スイーパーキーパー",    ["GK"],                  ["GK"], [{ st:["spd","tec"], k:"m" }]],
  gkWall:   ["壁",                    ["GK"],                  ["GK"], [{ st:["def","pow"], k:"m" }]],
  libero:   ["リベロ",                ["CB"],                  ["DF"], [{ st:["sta","spd"], k:"s" }]],
  sweeper:  ["スイーパー",            ["CB"],                  ["DF"], [{ st:["def","pow"], k:"s" }]],
  stopper:  ["ストッパー",            ["CB"],                  ["DF"], [{ st:["def"], k:"m" }]],
  wingback: ["ウイングバック",        ["LSB","RSB"],           ["DF"], [{ st:["spd","off"], k:"s" }]],
  crosser:  ["クロッサー",            ["LWG","RWG","LSB","RSB","LMF","RMF"], ["DF","MF","FW"], [{ st:["tec","spd"], k:"s" }]],
  watchdog: ["番犬",                  ["DMF"],                 ["MF"], [{ st:["sta","def"], k:"s" }]],
  anchor:   ["アンカー",              ["DMF"],                 ["MF"], [{ st:["tec","off"], k:"s" }]],
  b2b:      ["ボックス・トゥ・ボックス",["CMF"],               ["MF"], [{ st:["sta","off"], k:"s" }]],
  fanta:    ["ファンタジスタ",        ["OMF"],                 ["MF"], [{ st:["tec"], k:"m" }]],
  no10:     ["No.10",                 ["ST","OMF"],            ["MF","FW"], [{ st:["off"], k:"m" }]],
  no95:     ["No.9.5",                ["ST","CF"],             ["FW"], [{ st:["def","sta"], k:"s" }]],
  target:   ["ターゲットマン",        ["CF"],                  ["FW"], [{ st:["pow"], k:"m" }]],
  dribbler: ["ドリブラー",            ["LWG","RWG"],           ["FW"], [{ st:["spd","tec"], k:"s" }]]
};
for(const k in TRAITS){ const [name,pos,grp,stat]=TRAITS[k];
  TAGS["t_"+k]={ name, scope:"player", kind:"trait", pol:1, dur:null, pos, grp, stat,
    desc:"特性("+pos.join("・")+" で出たとき): "+stat.map(x=>x.st.length===6?"能力すべて":x.st.map(s=>STAT_LABEL[s]).join("・")).join("、")+" +"+TUNING.tag.stat[stat[0].k] }; }

/* ---- コンビ(→docs/23 §23.3b)----
 * 条件: メンバーの全員のあいだが黄金線 + 全員の信頼度が combo.trust 以上 + その軸が成長グラフで金色 + ポジションの型が合う(特別なコンビは決められたカードの組)
 * 効き目: メンバーが**全員先発**のとき、メンバーの能力が上がる(型 = 中、特別 = 大)。1人が入れるコンビは1つ、チームに combo.max まで。付いたら任期の終わりまで */
TUNING.tag.combo={ trust:2, max:2 };
// 型の枠: 細かいポジションの集まり
const COMBO_SLOT={ MF:["DMF","CMF","OMF","LMF","RMF"], DM:["DMF","CMF"], DMF:["DMF"], CMF:["CMF"], OS:["OMF","ST"], CB:["CB"], DF:["CB","LSB","RSB"],
  FW:["CF","ST"], ATK:["LWG","RWG","OMF","ST","CF"], MA:["DMF","CMF","OMF","LMF","RMF","LWG","RWG","ST","CF"], GK:["GK"] };
// [id, 名前, 枠(人数ぶん), 軸(どれか1つが金色), 能力]。上から順に探す(人数の多いもの・決めの細かいものが先)
const COMBO_TYPES=[
  ["soukan",  "創造の艦隊",           ["MA","MA","MA","MA","MA"], ["R"],     [{ st:["tec","off"], k:"m" }]],
  ["aun",     "阿吽のパスルート",     ["DMF","CMF","OS"],         ["R"],     [{ st:["off","tec"], k:"s" }]],
  ["shihai",  "支配のトライアングル", ["MF","MF","MF"],           ["R"],     [{ st:["tec"], k:"m" }]],
  ["koushu",  "攻守連動の絆",         ["DM","DM","DM"],           ["D"],     [{ st:["def","sta"], k:"s" }]],
  ["delta",   "デルタプレス",         ["MF","MF","MF"],           ["D"],     [{ st:["def"], k:"m" }]],
  ["kekkai",  "結界のトライアングル", ["DMF","CB","CB"],          ["D"],     [{ st:["def"], k:"m" }]],
  ["sanju",   "ゴール前の三銃士",     ["GK","CB","CB"],           ["D"],     [{ st:["def","pow"], k:"s" }]],
  ["curtain", "鉄のカーテン",         ["DF","DF","DF"],           ["D"],     [{ st:["def"], k:"m" }]],
  ["makai",   "魔の三角地帯",         ["DF","DF","DF"],           ["C"],     [{ st:["sta","def"], k:"s" }]],
  ["akuma",   "悪魔の三重奏",         ["ATK","ATK","ATK"],        ["R"],     [{ st:["off","tec"], k:"s" }]],
  ["kyougeki","挟撃",                 ["CB","CB"],                ["D"],     [{ st:["def"], k:"m" }]],
  ["dlock",   "ダブルロック",         ["CB","CB"],                ["O","P"], [{ st:["def","pow"], k:"s" }]],
  ["tagp",    "タッグパートナー",     ["DF","DF"],                ["P"],     [{ st:["pow"], k:"m" }]],
  ["twin",    "ツインタワー",         ["FW","FW"],                ["O","P"], [{ st:["pow","off"], k:"s" }]],
  ["dimpact", "ダブルインパクト",     ["FW","FW"],                ["O"],     [{ st:["off"], k:"m" }]],
  ["dream",   "ドリームライン",       ["ATK","ATK"],              ["R"],     [{ st:["tec","spd"], k:"s" }]],
  ["ishin",   "以心伝心の絆",         ["MF","FW"],                ["R"],     [{ st:["tec","off"], k:"s" }]]
];
const AX_STAT={ O:"off", D:"def", S:"spd", P:"pow", R:"tec", C:"sta" };
/** コンビの定義(型と特別)を1つの形に: { id, name, n, slots | ids, axes, stat, special } */
const COMBOS={};
for(const [id,name,slots,axes,stat] of COMBO_TYPES)COMBOS["k_"+id]={ id:"k_"+id, name, n:slots.length, slots, axes, stat };
if(typeof SPECIAL_COMBOS!=="undefined")for(const c of SPECIAL_COMBOS)
  COMBOS[c.id]={ id:c.id, name:c.name, n:c.ids.length, ids:c.ids, axes:[c.ax], stat:[{ st:[AX_STAT[c.ax]], k:"l" }], special:true };
const comboDesc=C=>(C.special?"特別なコンビ":"コンビ")+"(全員が先発のとき): "+C.stat.map(x=>x.st.map(s=>STAT_LABEL[s]).join("・")+" +"+TUNING.tag.stat[x.k]).join("、");

/* ---- 第5段(→docs/23): 固有・出来事・自動で付くチームのタグ ---- */
Object.assign(TUNING.tag,{
  unique:{ kamiAge:20, kamiApp:10, princeApp:50, crybadN:2, academyAge:21 },
  event:{ p:0.12 },                       // 試合のあとに出来事が起きる率(1つずつ。答えるまで次は起きない)
  fever:[10000,30000,60000,100000],       // ファンの節目(越えたら「サポーターの熱狂」)
  crowd:3                                 // カップの試合が続いた数で「過密日程」
});
// カードが持つ固有の型(tools/unique_source.txt の「型」)
const UNIQUE_KIND={
  striker:  { stat:[{ st:["off","pow"], k:"l" }] },
  speedster:{ stat:[{ st:["spd","off"], k:"l" }] },
  magic:    { stat:[{ st:["tec","spd"], k:"l" }] },
  flair:    { stat:[{ st:["off","tec"], k:"l" }] },
  maestro:  { stat:[{ st:["tec"], k:"l" }], teamFx:{ motDown:"-s" } },
  wall:     { stat:[{ st:["def","pow"], k:"l" }] },
  keeper:   { stat:[{ st:["def","pow","tec"], k:"m" }] },
  runner:   { stat:[{ st:["spd","sta"], k:"l" }] }
};
const statTxt=L=>L.map(x=>(x.st.length===6?"能力すべて":x.st.map(s=>STAT_LABEL[s]).join("・"))+" "+(x.neg?"−":"+")+TUNING.tag.stat[x.k]).join("、");
// カードが持つ固有はタグ u_カードの id(どの任期でも初めから持つ。保存しない)
if(typeof UNIQUE_CARDS!=="undefined")for(const id in UNIQUE_CARDS){ const u=UNIQUE_CARDS[id], K=UNIQUE_KIND[u.kind];
  TAGS["u_"+id]={ name:u.name, scope:"player", kind:"unique", card:true, pol:1, dur:null, stat:K.stat, teamFx:K.teamFx,
    desc:"固有(このカードだけ): "+statTxt(K.stat)+(K.teamFx?"、SQUAD にいるとチームの調子が落ちにくい":"") }; }
Object.assign(TAGS,{
  // 条件で付く固有(チームに1人ずつ。任期の終わりでクリア)
  kami:    { name:"神の子",           scope:"player", kind:"unique", pol:1, dur:null, stat:[{ st:ALL6, k:"m" },{ when:"final", st:ALL6, k:"s" }], desc:"固有: 20歳以下で能力の合計がチームの頂点。能力すべて +2、決勝ではさらに +1" },
  prince:  { name:"イル・プリンチペ", scope:"player", kind:"unique", pol:1, dur:null, stat:[{ st:["tec","off"], k:"l" }], teamFx:{ motDown:"-s" }, desc:"固有: 長く出続ける TEC 最上位の攻撃の選手。TEC・OFE +3、チームの調子が落ちにくい" },
  crybaby: { name:"クライベイビー",   scope:"player", kind:"unique", pol:1, dur:null, stat:[{ when:"hot", st:ALL6, k:"l" },{ when:"cold", st:ALL6, k:"s", neg:true }], desc:"固有: 気分屋のスター。絶好調のとき能力すべて +3、不調以下では −1" },
  academy: { name:"下部組織の至宝",   scope:"player", kind:"unique", pol:1, dur:null, fx:{ link:"+m" }, stat:[{ st:["tec"], k:"s" }], desc:"固有: 若くして覚醒した生え抜き。連携の経験 ×1.3、TEC +1" },
  // 出来事・自動で付くチームのタグ
  camp:    { name:"合宿",             scope:"team", kind:"gen", pol:1,  dur:5, fx:{ exp:"+m", fat:"+m" }, desc:"練習の経験 ×1.3。ただし疲労がたまりやすい" },
  boom:    { name:"スポンサー景気",   scope:"team", kind:"gen", pol:1,  dur:10, opp:"broke", fx:{ money:"+s" }, desc:"入場料 ×1.15" },
  broke:   { name:"経営難",           scope:"team", kind:"gen", pol:-1, dur:10, opp:"boom",  fx:{ money:"-s" }, desc:"大きな出費のあと。入場料 ×0.85" },
  fever:   { name:"サポーターの熱狂", scope:"team", kind:"gen", pol:1,  dur:5,  fx:{ motDown:"-l" }, desc:"ファンが節目を越えた。調子が落ちにくい" },
  crowded: { name:"過密日程",         scope:"team", kind:"gen", pol:-1, dur:null, endOn:"nocup", fx:{ fat:"+m" }, desc:"カップの試合が続いている。疲労がたまりやすい(カップ以外の試合で消える)" },
  afterglow:{ name:"優勝の余韻",      scope:"team", kind:"gen", pol:1,  dur:3,  fx:{ motUp:"+m" }, desc:"勝ったとき、調子が上がりやすい" },
  // 出来事で付く選手のタグ
  gossip:  { name:"ゴシップ",         scope:"player", kind:"gen", pol:-1, dur:3, fx:{ motUp:"+m", motDown:"+m" }, desc:"週刊誌に追われている。調子が上下しやすい" },
  mood:    { name:"ムードメーカー",   scope:"player", kind:"gen", pol:1,  dur:10, teamFx:{ motUp:"+s" }, desc:"ロッカールームの盛り上げ役。SQUAD にいると、勝ったときチームの調子が上がりやすい" },
  // 話題のタグ(白。→docs/23 §23.11): 能力には効かず、クラブのお金に効く。SQUAD にいる人数ぶん掛け算
  star:    { name:"スター選手",       scope:"player", kind:"fame", pol:0, dur:null, desc:"話題の中心。SQUAD にいると、入場料とスポンサー収入 ×1.3(何人でも掛け算。年俸の稼ぎには数えない)" },
  trouble: { name:"問題児",           scope:"player", kind:"fame", pol:0, bad:true, dur:null, desc:"スポンサーが嫌がる。SQUAD にいると、スポンサー収入 ×0.85(何人でも掛け算)" },
  birthday:{ name:"誕生日",           scope:"player", kind:"gen", pol:1,  dur:1, onAdd:"mot4", fx:{ motLock:"on" }, desc:"仲間に祝ってもらった。次の試合は絶好調" }
});
/*
 * ランダムに起きる出来事(→docs/23 §23.2 の 2)。秘書が知らせ、2択で答える。p: 選手の出来事なら {n} に名前
 *   ch: [ 答え, 結果 ]。結果: team:タグ / player:タグ / bet:[率, 当たり, 外れ](選手のタグ)/ fat:疲労の増減
 */
const TAG_EVENTS=[
  { k:"camp",   q:"地元の企業から、合宿の申し出が届きました。",           ch:[["受ける",{ team:"camp" }],["断る",{}]] },
  { k:"boom",   q:"地元の企業が、協賛を増やしたいそうです。広告に {n} を出してほしいとのこと。", p:true,
    ch:[["受ける",{ team:"boom", player:"gossip" }],["断る",{}]] },
  { k:"rumor",  q:"{n} が移籍の噂に心を乱しているようです。",              p:true, ch:[["話を聞く",{ bet:[0.6,"growth",null] }],["放っておく",{ player:"rebel" }]] },
  { k:"press",  q:"{n} の私生活が週刊誌に載りました。",                    p:true, ch:[["かばう",{}],["本人に任せる",{ bet:[0.5,"mood","gossip"] }]] },
  { k:"mood",   q:"{n} がロッカールームを盛り上げています。",              p:true, ch:[["任せる",{ player:"mood" }],["静かに見守る",{}]] },
  { k:"bday",   q:"今日は {n} の誕生日です。",                             p:true, ch:[["みんなで祝う",{ player:"birthday" }],["普段どおり",{}]] },
  { k:"extra",  q:"{n} が居残りで自主練をしたいと言っています。",          p:true, ch:[["付き合う",{ player:"growth", fat:0.08 }],["休ませる",{ fat:-0.08 }]] },
  // 練習のイベント(→docs/26 §26.4)。tr … 次のチーム練習に1回だけ出るレア訓練(配列なら1つを選ぶ)/ need … スタジアム・施設の条件 / w … 選ばれやすさ(段が高いほど大きい)
  { k:"trMedia", tr:"非公開練習", need:{ stad:5 }, w:5, q:"メディアが練習を取材に来ています。今日は非公開練習にしましょうか？", ch:[["非公開にする",{ train:1 }],["公開のままにする",{}]] },
  { k:"trFans",  tr:"フルコート3対3", need:{ stad:3 }, w:3, q:"サポーターが練習を見に来ています。見せる練習「{t}」をしませんか？", ch:[["やろう",{ train:1 }],["いつもどおりで",{}]] },
  { k:"trLocal", tr:["サイドアタック","中央突破","クロスボール","ロングカウンター"], need:{}, w:1, q:"地元のクラブから練習試合の申し込みです。「{t}」を試せそうです。", ch:[["受ける",{ train:1 }],["断る",{}]] },
  { k:"trPitch1", tr:"3vs1とりかご", need:{ train:1 }, w:1, q:"練習場に新しいミニピッチができました。「{t}」ができますよ。", ch:[["やろう",{ train:1 }],["今回は見送る",{}]] },
  { k:"trPitch2", tr:"4VS4パスゲーム", need:{ train:2 }, w:2, q:"練習場のミニピッチが広くなりました。「{t}」ができますよ。", ch:[["やろう",{ train:1 }],["今回は見送る",{}]] },
  { k:"trPhys1", tr:"シャトルラン", need:{ med:1 }, w:1, q:"フィジカルコーチが来てくれるそうです。「{t}」を見てもらいましょうか？", ch:[["頼む",{ train:1 }],["今回は見送る",{}]] },
  { k:"trPhys3", tr:"オーバーラップ", need:{ med:3 }, w:3, q:"一流のフィジカルコーチが来てくれるそうです。「{t}」を見てもらいましょうか？", ch:[["頼む",{ train:1 }],["今回は見送る",{}]] },
  { k:"trVideo1", tr:"セットプレイ", need:{ tact:1 }, w:1, q:"戦術室で、相手の映像を分析しました。「{t}」を詰めておきましょうか？", ch:[["やろう",{ train:1 }],["今回は見送る",{}]] },
  { k:"trVideo2", tr:"特殊セットプレイ", need:{ tact:2 }, w:2, q:"戦術室の分析で、相手の弱点が見えました。「{t}」を仕込みませんか？", ch:[["仕込もう",{ train:1 }],["今回は見送る",{}]] },
  { k:"trVideo3", tr:"ストップ・ザ・ゲーム", need:{ tact:3 }, w:3, q:"戦術室で、相手のエースの癖まで丸裸にしました。「{t}」をやりましょう。", ch:[["やろう",{ train:1 }],["今回は見送る",{}]] },
  { k:"trOb1", tr:"ダイレクトプレイ", need:{ lounge:1 }, w:1, q:"クラブの OB が顔を出してくれました。「{t}」を教えてくれるそうです。", ch:[["お願いする",{ train:1 }],["今回は見送る",{}]] },
  { k:"trOb3", tr:"カバーリング", need:{ lounge:3 }, w:3, q:"伝説の OB がラウンジに来ています。「{t}」を伝授してくれるそうです。", ch:[["お願いする",{ train:1 }],["今回は見送る",{}]] }
];

/* ---- COACHING NOTE(→docs/23 §23.10)----
 * 見つけたタグを任期をまたいで覚える手帳。付き方(how)と効き目(desc)を見せて、プレイヤーの知識とスキルを育てる。
 * 汎用・条件の固有の付き方はここに書く。称号・特性・カードの固有・コンビは決まりから文を作る(noteHow) */
const NOTE_HOW={
  star:"格上に勝つ・大会で優勝する・昇格を決める試合で活躍する", trouble:"同じ任期にゴシップが2回付く",
  golden:"成長グラフの金色が3つそろう(黄金期)",
  momentum:"3連勝する", slump:"3連敗する",
  promo:"リーグの最終節で昇格を決める", releg:"リーグの最終節で降格する",
  facTrain:"スポンサーのミッションを達成する(報酬が個人練習の系統)", facTact:"スポンサーのミッションを達成する(報酬が控えの不満・好調の維持の系統)",
  facLounge:"スポンサーのミッションを達成する(報酬がラウンジの系統)", facMed:"スポンサーのミッションを達成する(報酬がケア・疲労・ケガの系統)",
  oil:"まれに現れるレアスポンサー(王族の投資ファンド)と契約する",
  camp:"出来事「合宿の申し出」を受ける", boom:"出来事「協賛の増額」を受ける", broke:"スタジアムの改修で資金が費用の半分を切る",
  fever:"ファンが 1万・3万・6万・10万人を越える", crowded:"カップの試合が3つ続く", afterglow:"大会で優勝する",
  injRes:"同じ選手を任期の中で5回メディカルでケアする", injProne:"同じ選手が任期の中で2回ケガをする",
  rebel:"出場なしが15試合続く / 出来事「移籍の噂」を放っておく", growth:"23歳以下の選手の★が上がる / 出来事で話を聞く・自主練に付き合う",
  rookie:"23歳以下の選手を SQUAD に加える", veteran:"31歳以上の選手を SQUAD に加える",
  bandiera:"任期の中でチームでいちばん早く70試合に出場する", supersub:"途中出場で2得点する", ace:"先発で10得点する",
  pillar:"キャプテンとして30試合先発する", mvp:"格 S・A の大会の決勝で MVP になる", strat:"試合の最後の KP として10勝する",
  iron:"20試合続けて先発する", waiting:"出場なしが10試合続く", burst:"「出番待ち」の選手を出場させる",
  scorer:"2試合続けて得点する", bigstage:"決勝で得点する",
  gossip:"出来事「協賛の増額」の広告に出る / 週刊誌の件を本人に任せる", mood:"出来事でロッカールームの盛り上げ役を任せる", birthday:"出来事で誕生日を祝う",
  kami:"20歳以下で能力の合計がチームの頂点の選手が、10試合以上出場する", prince:"TEC がチームでいちばん高い攻撃の選手が、50試合以上出場する",
  crybaby:"高いレアリティの選手に、反抗期・ゴシップ・出番待ちが2回付く", academy:"21歳以下の選手が覚醒する"
};
const NOTE_CAT=[ ["team","チーム"], ["title","称号"], ["player","選手"], ["trait","特性"], ["combo","コンビ"], ["unique","固有"], ["mgr","監督"] ];   // 監督 = 監督称号(→docs/14 §14.147)

/* ---- 選手の声(→docs/14 §14.79)----
 * 育成度・動物・相性は裏の数字にした。その代わり、選手がたまに HOME で自分のことを伝えてくる。ちゃんと選手を見ていると得をする
 *   p … 試合のあとに誰かが話しかけてくる率 / near … 「もう少し」と言い出す進み / ani・comp … 動物・気の合う仲間を話す率(成長の話が無いとき) */
TUNING.voice={ p:0.4, pState:0.6, near:0.7, ani:0.35, comp:0.35, manyTired:4 };   // pState … 調子・疲労・出番の話がある選手がいるときの率 / manyTired … これ以上の先発が疲れていたら秘書がまとめて知らせる
const PV_LINES={
  ind:["最近、自分の成長を感じています。","練習の手応えが変わってきました。もう少しで何かがつかめそうです。","体が軽いんです。もうひと伸びできそうな気がします。"],
  sp:["練習を積めば何かが見えそうです。","戦術の話をもっと聞かせてください。何かがつながりそうなんです。","自分の型が見えてきた気がします。"],
  ani:["{me}が好きな動物は{a}です。","{a}をイメージした動きを取り込んでみます。","{me}、{a}みたいなプレーが目標なんです。"],
  comp:["{n}とは、なんだか気が合う気がします。","{n}とは、もっと一緒にプレーしてみたいです。"]
};
const PV_ME=["俺","僕","私","自分"];
/* 話題のタグ(→docs/23 §23.11)
 *   star … スター1人ごとの入場料とスポンサー収入の倍率 / trouble … 問題児1人ごとのスポンサー収入の倍率
 *   giantN・titleN・promoN … ジャイアントキリング・大会の優勝・昇格の試合でスターになる人数 / gossipN … 問題児になるゴシップの回数(任期の中) */
TUNING.tag.fame={ star:1.3, trouble:0.85, giantN:1, titleN:2, promoN:2, gossipN:2, starCap:4, starGossip:0.02 };   // starCap … スターの倍率の上限 / starGossip … スターが試合のたびにゴシップを付けられる率(→docs/24 §24.6)
