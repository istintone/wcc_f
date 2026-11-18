"use strict";
/* =========================================================================
   wcc_f — データと数値
   確率・係数・閾値はすべて TUNING に置く(ロジックに直書きしない)。
   座標系は「自軍フレーム」: h = 0(自陣ゴール) 〜 1(敵陣ゴール) / x = 0〜100(左右)
   ========================================================================= */

const STAT_MAX=20;
const STATS=["off","def","tec","pow","spd","sta"];
const STAT_LABEL={ off:"攻撃", def:"守備", tec:"技術", pow:"パワー", spd:"スピード", sta:"スタミナ" };

const TUNING={
  // 判定の揺らぎ。攻守それぞれに独立して乗る(0.6〜1.4)
  rng:{ min:0.6, span:0.8 },
  // 時計。1ステップ = 1アクション。前後半それぞれ stepsPerHalf + アディショナル
  clock:{ stepsPerHalf:110, at1:[1,5], at2:[3,9] },
  // カードの位置 → 役割(→docs/02 §2.3)
  zone:{ dfH:0.36, fwH:0.68, wide:27, dmfH:0.47, omfH:0.58 },
  // 役割の適性。own=得意な役割 / group=同じポジション / near=隣 / far=DF↔FW / gk=GKとフィールドの取り違え
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
  shot:{ minH:0.62, forceH:0.55, base:0.03, depth:0.74, wideCut:0.6,
         dead:0.50, minRange:0.12, angle:0.45,
         thBlock:1.25, accBase:0.50, accTec:0.40, accRange:0.55,
         rangePow:1.0, gapPow:0.45, thGoal:1.13,
         rebound:0.25,
         // セットプレーからのシュート。PK は圧縮(gapPow)を掛けず、別の閾値で競る
         midH:0.80, pkAcc:0.90, thPk:0.66, hdrAcc:0.70, hdrPow:0.85, fkAcc:0.90, fkPow:1.10 },
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
          stepH:0.012, stepX:1.5, gkStep:2.5 },
  // KP(→docs/04)。1クラブに1人。試合中も変えられる。recv = どのスタイルでも KP にボールが少し集まる
  kp:{ recv:1.25 },
  // スタイルのランク(→docs/04 §4.5)。軸の値 = その能力の上位 top 人の平均 + 連携の上乗せ
  //   th … B / A / S になる値 / k … 「得るもの」に掛かる倍率(失うものには掛からない)
  //   spStar/spEvo … KP の特殊能力の★1つごと / ★5で、軸の値に乗る量(→docs/05 §5.4)
  rank:{ top:6, th:[13.6,15.0,16.4], k:{ C:0.5, B:0.8, A:1.0, S:1.25 }, spStar:0.2, spEvo:0.5 },
  // 連携(→docs/04 §4.6)。段は 1〜3
  //   pass … 線で結ばれた2人のパスに、段ごとに乗る強さ
  //   full/rank … 盤面に居る線の段の合計がこの値で満点。満点で軸の値に rank が乗る
  link:{ pass:0.04, full:50, rank:1.0 },
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
  //   promoteRank … 周の終わりにこの順位以内なら、リーグの格が上がる
  //   prize       … 賞金(億)。cup は格ごとの1勝ぶん。優勝は titleK 倍が上乗せ
  //   linkTier    … 段1つごとに増える線の本数 / tierGraph … 段ごとの戦力グラフの上乗せ(相手は育成しない代わり)
  club:{ termLen:100, tierStat:[-1.6,-0.9,-0.3,0.4,1.1], statNoise:1.2, linkBase:6, linkTier:4,
         tierGraph:[-0.3,0,0.3,0.6,0.9],
         leagueTiers:[[1,1,2,2,2,3,3],[2,2,3,3,3,4,4],[3,3,4,4,4,5,5]], promoteRank:2,
         prize:{ league:1, leagueRank:[12,7,4,2,1,0,0,0], friendly:0.3, titleK:4,
                 cup:{ E:1.5, D:2, C:3, B:5, A:7, S:10 } },
         historyMax:120 },
  // 育成(→docs/05 §5.3〜5.6)
  //   startOff/startKeep … 任期の初めは能力がこれだけ低い(育てて戻す)。startKeep 以下の能力は下げない
  //   spChance … 練習の枠が特殊練習に差し替わる率(施設レベル1つごと)
  //   ind  … 個人能力。need=★1〜4に要る経験 / awake=★4から兆しまで / train・trainFit・match=もらえる経験
  //          starUp=★1つで伸びる能力 / awakeP=フレンドリー勝利で覚醒する率 / awakeUp=2つ目・3つ目が上がる率
  //   sp   … 特殊能力。meet=ミーティングの経験 / train=特殊練習の星1つぶん / qOk・qNg=3択が合ったとき・外したときの成功率
  //          failKeep=失敗で残る経験の割合 / star5P=フレンドリー勝利で★5になる率 / buff=★1つでバフが強まる割合
  //   link … 連携。need=薄線・太線に要る経験 / match=一緒に試合に出た経験 / lounge=大成功・成功・失敗の経験
  //          pFit・pMid・pBad=3択が合う手・次点・合わない手のときの [大成功, 成功, 失敗] の率
  //          hintNoise=ラウンジの様子の文が、本当の相性と1つずれて見える率
  //          goldP=黄金線になる率(**1試合に生まれる黄金線は1本まで**)
  //   graph… 戦力グラフ。basic=基本練習 / up・upAll・down=特殊練習 / decay=練習のたびに全軸が0へ戻る割合
  //   set  … セットプレイの練習。星1つぶん / 上限(FK・CK・PK に掛かる)
  //   mot  … モチベーション(ケガ/絶不調/不調/好調/絶好調)の倍率と、上下する率
  //   int  … 練習の強度(軽め/普通/ハード)。k=経験とグラフの伸び / fat=たまる疲労
  //          matchLoad=試合に出たぶんの疲労 / recover=次の試合までに残る割合 / fatMax=上限 / tiredSign=「！」が付く疲労
  //   age  … 年齢による違い(→docs/05 §5.4)。若いほど育ちやすいが、やる気の上下が大きい
  //          band=年齢の区切り / grow=区切りごとの伸びやすさ / swing=やる気の上下の起きやすさ
  //   abil … 能力による違い。得意な2能力の平均が ref より高いほど、伸びが遅い(1ごとに k、lo〜hi に収める)
  //   育成の釣り合いの基準(→docs/08 §8.5): 1人に5〜10試合ぶん集中すると覚醒。関わらない選手は練習と試合だけでは★1〜2どまり
  //          ind.train・trainFit・spTrain・match = 全員に入る経験(小さく) / comm.ind = 個人練習で入る経験(大きく)
  //   comm … コミュニケーション。max=1試合の回数 / ind=個人練習の経験 / talk・talkLow=声かけで上がるやる気(落ちている選手は2段)
  grow:{ startOff:-1.4, startKeep:6, spChance:0.12,
         ind:{ need:[26,48,68,94], awake:40, train:0.4, trainFit:0.4, spTrain:0.4, match:0.3, starUp:0.5, awakeP:0.6, awakeUp:[1,0.6,0.4] },
         sp:{ need:[12,18,24,30], awake:30, meet:14, train:1, qOk:0.85, qNg:0.35, failKeep:0.5, star5P:0.6, buff:0.05 },
         link:{ need:[10,30], match:1, lounge:[8,4,0], goldP:0.5, hintNoise:0.25,
                pFit:[0.60,0.35,0.05], pMid:[0.15,0.60,0.25], pBad:[0.05,0.35,0.60] },
         graph:{ basic:0.12, up:0.10, upAll:0.06, down:0.08, decay:0.985, min:-2, max:3 },
         set:{ per:0.02, max:0.2 },
         mot:{ mul:[0.80,0.92,0.97,1.02,1.06], start:3, winUp:0.35, loseDown:0.30, drawSwing:0.15,
           // 控え(→docs/08 §8.4): 出番の無い試合が benchGrace 続くと下がり始める。勝てば控えも少し上がる。
           // どの選手も、何も起きなかった試合では普通(start)へ revert の率で戻る
           benchGrace:3, benchDown:0.25, teamWinUp:0.12, revert:0.15 },
         int:{ k:[0.5,1.0,1.6], fat:[0,0.02,0.05], matchLoad:0.02, recover:0.4, fatMax:0.20, tiredSign:0.04 },
         comm:{ max:3, ind:20, talk:1, talkLow:2 },
         age:{ band:[21,24,28,31], grow:[1.40,1.20,1.00,0.85,0.70], swing:[1.6,1.25,1.0,0.75,0.55] },
         abil:{ ref:14, k:0.04, lo:0.80, hi:1.20 } },
  // 任期の終わり(→docs/05 §5.8)
  //   salaryBase/salaryK … 年俸 = 基本 + その任期の賞金 × K + 称号の上乗せ(億)
  //   facAt … 累計の年俸がこの額に届くごとに施設レベルが1つ上がる(1〜5)
  //   follow/bondMin … 次の任期についてくる選手の数の上限 / 要る絆
  term:{ salaryBase:20, salaryK:0.15, facAt:[80,200,380,640], follow:3, bondMin:6 },
  // カード(→docs/06)
  //   rate  … 払い出しのレアリティの率(白 / 黒 / キラ / レジェンド)
  //   trait … 特徴(+/−)1つぶんの能力 / lowK … 低い能力(6以下)に格が乗る割合
  //   gradeBase/gradeK … 格を能力のずれに換算する: (格 − base) × K。相手の段(段4 ≒ +0.4 / 段5 ≒ +1.1)に揃える
  pack:{ rate:{ W:0.60, B:0.30, K:0.085, L:0.015 }, trait:1.5, lowK:0.5, gradeBase:0.9, gradeK:0.8 },
  // PK戦。5人ずつ蹴り、決まらなければ1人ずつ。maxKicks は打ち切り(暴走を防ぐ安全網)
  pso:{ kicks:5, maxKicks:30 },
  // 再生(見た目だけ。結果には触れない)
  play:{ stepMs:620, shotMs:520, kickMs:450, goalHold:1900, shotHold:420, foulHold:800, cardHold:1500, psoHold:650 }
};

const GROUP_OF={ GK:"GK", CB:"DF", SB:"DF", DMF:"MF", CMF:"MF", SMF:"MF", OMF:"MF", WG:"FW", CF:"FW" };

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
 *   axis  … 効きを決める戦力グラフの軸(O/D/R/C/S/P)
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
  T01:{ name:"ショートパスワーク", scope:"team", axis:"R", kind:"atk",
        get:"安全に繋ぎ、競り合いに強い", lose:"前進が遅く、撃たない",
        gain:{ safe:1.6, riskK:1.10 }, cost:{ gainK:0.85, urgeK:0.8 } },
  T02:{ name:"ダイレクトプレイ", scope:"team", axis:"S", kind:"atk",
        get:"一発で届く手を選び、前進が大きい", lose:"パスが通りにくい",
        gain:{ direct:1.8, gainK:1.12 }, cost:{ riskK:0.94 } },
  T03:{ name:"ショートカウンター", scope:"team", axis:"S", kind:"atk",
        get:"敵陣で奪ってすぐが速くて強い", lose:"遅攻が弱い",
        gain:{ fastK:1.20, fastTo:2.5 }, cost:{ fastN:2, fastZone:"opp", slowK:0.93 } },
  T04:{ name:"ロングカウンター", scope:"team", axis:"S", kind:"def",
        get:"自陣で奪ったら前線へ一発。前線は高い位置で待つ", lose:"中盤の守備が薄い",
        gain:{ fastK:1.22, fastTo:3.5 }, cost:{ fastN:2, fastZone:"own", fwStay:0.4, lowK:0.93 } },
  T05:{ name:"スルーパス重視", scope:"team", axis:"O", kind:"atk",
        get:"スルーパス・ラストパスを選びやすく、通りやすい", lose:"オフサイドが増える",
        gain:{ chW:{ cmThru:1.8, omLast:1.8, cbVert:1.4, cfRun:1.4 }, chS:1.10 }, cost:{ offRisk:1.5 } },
  T06:{ name:"センターポスト", scope:"team", axis:"O", kind:"atk",
        get:"前線の的に当てて落とす。CF にボールが集まる", lose:"サイドを使わない",
        gain:{ recvRole:{ CF:1.8 }, chW:{ cfLay:2.0, omKeep:1.5 }, chS:1.15 }, cost:{ lane:{ out:0.6, box:0.7 } } },
  T07:{ name:"ハイタワー", scope:"team", axis:"P", kind:"atk",
        get:"クロスとロングボールを選び、空中戦が強い", lose:"足元の崩しが減る",
        gain:{ chW:{ smCross:1.8, wgCross:1.8, sbEarly:1.8, cbFeed:1.6, gkLong:1.6 }, chS:1.08, aerial:1.20 },
        cost:{ lane:{ in:0.6, same:0.8 } } },
  T08:{ name:"キープレイヤーアタック", scope:"team", axis:"O", kind:"atk",
        get:"KP にボールを集め、KP の競り合いが強い", lose:"KP 以外へのパスが通りにくい",
        gain:{ kpRecv:3.0, kpS:1.12 }, cost:{ nonKpQ:0.94 } },
  T09:{ name:"コンビネーションプレイ", scope:"team", axis:"R", kind:"atk",
        get:"連携の線の効果が倍", lose:"線の無い相手へのパスが弱い",
        gain:{ linkK:2.0 }, cost:{ noLinkK:0.95 } },
  T10:{ name:"全員攻撃", scope:"team", axis:"O", kind:"atk",
        get:"隊列を押し上げ、撃ちに行く", lose:"裏が空く",
        gain:{ push:0.06, urgeK:1.15 }, cost:{ beaten:1.08 } },
  T11:{ name:"プレッシング", scope:"team", axis:"C", kind:"atk",
        get:"ボールが敵陣にあるとき守備が強い", lose:"自陣で弱い。スタミナを使う",
        gain:{ highK:1.30 }, cost:{ lowK:0.95, sta:1.22 } },
  T12:{ name:"リトリート", scope:"team", axis:"D", kind:"def",
        get:"自陣で守備が強く、シュートブロックも強い", lose:"敵陣で持たせる",
        gain:{ lowK:1.10, blk:1.25 }, cost:{ highK:0.82 } },
  T13:{ name:"ラインコントロール", scope:"team", axis:"D", kind:"def",
        get:"相手のオフサイドが増える", lose:"裏を取られると戻れない",
        gain:{ off:2.0 }, cost:{ beaten:1.30 } },
  T14:{ name:"オーガナイズドディフェンス", scope:"team", axis:"D", kind:"def",
        get:"人数の厚みがよく効き、反則が減る", lose:"1対1の寄せが緩い",
        gain:{ covK:1.6, foulK:0.7 }, cost:{ pressK:0.93 } },
  T15:{ name:"マンツーマンディフェンス", scope:"team", axis:"D", kind:"def",
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
  "4-3-3":[[0.05,50],[0.26,86],[0.20,62],[0.20,38],[0.26,14],[0.42,50],[0.52,68],[0.60,36],[0.78,86],[0.84,50],[0.78,14]],
  "4-4-2":[[0.05,50],[0.26,86],[0.20,62],[0.20,38],[0.26,14],[0.52,86],[0.44,60],[0.52,40],[0.52,14],[0.82,60],[0.76,40]],
  "4-2-3-1":[[0.05,50],[0.26,86],[0.20,62],[0.20,38],[0.26,14],[0.42,60],[0.42,40],[0.60,84],[0.62,50],[0.60,16],[0.84,50]],
  "3-5-2":[[0.05,50],[0.20,70],[0.20,50],[0.20,30],[0.44,50],[0.52,66],[0.52,34],[0.50,88],[0.50,12],[0.82,60],[0.78,40]]
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
const CARDS={};
CARD_ROWS.forEach(r=>{
  CARDS[r[0]]={ id:r[0], no:r[1], name:r[2], pos:r[3], roles:r[4],
    off:r[5], def:r[6], tec:r[7], pow:r[8], spd:r[9], sta:r[10], skill:r[11]||null, age:CARD_AGE[r[0]]||26 };
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

/**
 * 表示の差し替え層。実名パックや画像はここへ流し込む(→docs/01 §1.4)。
 * 本体には架空名だけを持ち、PACK は端末に読み込んだときだけ埋まる。
 */
const PACK={ names:{}, teams:{}, images:{} };
const nameOf=card=>PACK.names[card.id]||card.name;
const teamNameOf=t=>(PACK.teams[t.id]&&PACK.teams[t.id].name)||t.name;
