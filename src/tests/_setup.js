// エンジンを Node に読み込む。DOM に触るファイル(render/board/main)は入れない。
// 並びは build.py の JS_FILES のうち DOM に触らない8つと同じにする。
const fs=require("fs"), path=require("path");
const ENGINE_FILES=["data.js","trainings.js","realcards.js","rarekp.js","engine.js","club.js","pool.js","grow.js","term.js","emblem-art.js","emblem.js"];
const EXPORTS=["TUNING","CARDS","RARE_KP","RARE_MOVES","rareOf","rareOfCard","capApt","setRole","autoSquad","slotValue","persOfClub","COACH_PERS","TEAMS","FORMS","CHANNELS","STAT_MAX","STYLES","SKILLS","AXIS_LABEL","AXIS_ABBR","AXIS_PAIR","PARAM_AXIS","styleAxes","styleRank","graphAdd","graphCap","graphGoldN","mkOffer","makeOffers","pickOffer","offersOf","mgrLv","OF_REGIONS","OF_RARES","misText",
  "createMatch","stepMatch","orderMatch","finishMatch","simulateMatch",
  "makeTeamDef","roleAt","posAt","baseRole","aptOf","matchMin","teamOf",
  "COMPS","CUP_IDS","SCHED","genWorld","newCareer","worldOf","nextFixture","fixtureMatch","declineCup",
  "applyResult","newTerm","playerDef","TRAIN_SP","STATS","MOT_LABEL","LOUNGE_BEST",
  "trainOptions","trainLabel","trainDesc","doTraining","doLounge","doMeeting","doIndTrain","doTalk","skipComm","loungeInfo","meetInfo",
  "commLeft","teamFatigue","INT_LABEL",
  "POOL","RARITY","RAR_ORDER","REAL_IDS","PACK","drawCard","payout","swapSquad","moveSquad","startSquad",
  "TITLES","titleOf","termFacts","followers","facLevel","endTerm","startNextTerm",
  "compatOf","linkBonusOf","newLeague","newCups","pickTitle","drawCup","brAdvance","brAfterGroups","skipSlot","upcoming","linkBonusK","linkCap","ANIMALS","aniOfDate","aniCompat","NAT_NAME","persOf","spReady","hasSign","growCard","growLinks","squadXi","linkOf","sortTable","leagueRound","tierOf","entryOk","saveCareer","loadCareer","clearCareer","SAVE_KEY","SAVE_BAD_KEY","rawSave","backupSave","memStore","fillLayout","setForm","doRest","indProgress","linkProgress","voiceOf","trustLv","matchStats","matchRatings","meetNear","teamPower","dupOf","awakeGain","registerManager","signClub","setTitle","earnedTitles","tsetOf","TITLE_FX","MAB","mabOf","mabRank","toggleMab","htOf","htAvail","toggleHt","HT_BASIC","commSign","indProgress","myTeam","defaultClub","TOWNS","embSvg","clubAbbr","SECS","secOf","secLv","secSay","secGain","chooseSec","answerSecEvent","secFollow","SEC_EVENTS","migrate","newBiz","buildFac","answerStadium","facK","stadOf","bizAfterMatch","spOffers","spRenew","signSponsor","spRankMax","missionTxt","SP_IND","spBoost","spDur","spIndOf"];

function load(){
  const src=ENGINE_FILES
    .map(f=>fs.readFileSync(path.join(__dirname,"..","js",f),"utf8")).join("\n\n");
  return new Function(src+"\n;return {"+EXPORTS.join(",")+"};")();
}
module.exports={ load };
