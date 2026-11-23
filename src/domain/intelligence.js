/** Analyses de progression fondées sur des journées d'observation distinctes. */
import { recommendSessionExercises } from './session-recommendations.js';
const SCORE_FIELDS = [['Technique','technical_score'],['Tactique','tactical_score'],['Physique','physical_score'],['Mental','mental_score']];
function dateKey(row) {
  const value = row?.evaluated_at || row?.created_at || row?.session_date || '';
  const date = String(value).slice(0,10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}
function dateValue(row) {
  const time=Date.parse(row?.evaluated_at||row?.created_at||row?.session_date||'');
  return Number.isFinite(time)?time:0;
}
function groupByObservationDay(reports) {
  const groups=new Map();
  reports.forEach(row=>{
    const key=dateKey(row);
    if(!key)return;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(row);
  });
  return [...groups.entries()].map(([date,rows])=>({date,rows})).sort((a,b)=>b.date.localeCompare(a.date));
}
function dailyScore(days,key) {
  return days.map(day=>{
    const values=day.rows.map(row=>Number(row[key])).filter(value=>Number.isFinite(value)&&value>=0&&value<=20);
    return values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;
  }).filter(value=>value!==null);
}
function average(values) {
  return values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;
}
export function analyzePlayerProgress({player,evaluations=[],evaluationCriteria=[],sessions=[],videoAnalyses=[],challenges=[],now=Date.now()}) {
  const reports=[...evaluations].filter(row=>row.player_id===player.id).sort((a,b)=>dateValue(b)-dateValue(a));
  const days=groupByObservationDay(reports);
  const recentDays=days.slice(0,3),previousDays=days.slice(3,6);
  const recentIds=new Set(recentDays.flatMap(day=>day.rows.map(row=>row.id)));
  const previousIds=new Set(previousDays.flatMap(day=>day.rows.map(row=>row.id)));
  const recentCriteria=evaluationCriteria.filter(row=>recentIds.has(row.evaluation_id));
  const previousCriteria=evaluationCriteria.filter(row=>previousIds.has(row.evaluation_id));
  const dayByEvaluation=new Map(days.flatMap(day=>day.rows.map(row=>[row.id,day.date])));
  const countCriteria=(rows,type)=>{
    const grouped=new Map();
    rows.filter(row=>row.criterion_type===type).forEach(row=>{
      const key=row.criterion_id||row.criterion;
      if(!key)return;
      if(!grouped.has(key))grouped.set(key,{criterion_id:row.criterion_id||null,criterion:row.criterion||'Critère non nommé',main_theme:row.main_theme||'',subtheme:row.subtheme||'',days:new Set()});
      const day=dayByEvaluation.get(row.evaluation_id);
      if(day)grouped.get(key).days.add(day);
    });
    return [...grouped.values()].map(row=>({...row,occurrences:row.days.size}))
      .sort((a,b)=>b.occurrences-a.occurrences||a.criterion.localeCompare(b.criterion,'fr'));
  };
  const enoughObservationDays=recentDays.length>=3;
  const strengths=(enoughObservationDays?countCriteria(recentCriteria,'positive').filter(row=>row.occurrences>=2):[]).slice(0,3);
  const difficulties=(enoughObservationDays?countCriteria(recentCriteria,'improvement').filter(row=>row.occurrences>=2):[]).slice(0,3);
  const trends=SCORE_FIELDS.map(([label,key])=>{
    const currentValues=dailyScore(recentDays,key),previousValues=dailyScore(previousDays,key);
    const current=average(currentValues),prior=average(previousValues);
    const enoughHistory=currentValues.length>=3&&previousValues.length>=3;
    return {label,current,previous:prior,currentCount:currentValues.length,previousCount:previousValues.length,delta:current===null||prior===null||!enoughHistory?null:Number((current-prior).toFixed(1))};
  });
  const priority=difficulties[0]||null;
  const playerSessions=sessions.filter(row=>row.player_id===player.id).sort((a,b)=>String(b.session_date||'').localeCompare(String(a.session_date||'')));
  const playerVideos=videoAnalyses.filter(row=>row.player_id===player.id);
  const activeChallenge=challenges.find(row=>row.player_id===player.id&&row.status==='active')||null;
  const lastReportDate=days[0]?.date||null;
  const lastSessionDate=playerSessions[0]?.session_date||null;
  const reportAgeDays=lastReportDate?Math.max(0,Math.floor((now-Date.parse(lastReportDate+'T12:00:00'))/86400000)):null;
  const sessionAgeDays=lastSessionDate?Math.max(0,Math.floor((now-Date.parse(lastSessionDate+'T12:00:00'))/86400000)):null;
  const criteriaConfidence=!enoughObservationDays?'insufficient':(strengths.length||difficulties.length?'recurrent':'no-recurrence');
  let status='À suivre',statusReason='Données encore insuffisantes pour dégager une tendance fiable.';
  if(!reports.length){status='Premier bilan à réaliser';statusReason='Aucun bilan enregistré dans cet espace coach.';}
  else if(reportAgeDays!==null&&reportAgeDays>30){status='Bilan à actualiser';statusReason='Le dernier bilan remonte à plus de 30 jours.';}
  else if(!enoughObservationDays){status='Observations à consolider';statusReason='Les bilans doivent couvrir trois journées distinctes avant de confirmer une récurrence.';}
  else if(difficulties.length){status='Axe de progression identifié';statusReason='Un même point à travailler revient sur plusieurs journées d’observation.';}
  else if(strengths.length){status='Progression positive observée';statusReason='Des réussites sont confirmées sur plusieurs journées d’observation.';}
  const reliableScoreSectors=trends.filter(row=>row.currentCount>=3);
  const lowestSector=reliableScoreSectors.sort((a,b)=>a.current-b.current)[0]||null;
  const suggestedFocus=priority?'Travailler : '+priority.criterion:lowestSector?'Consolider le secteur : '+lowestSector.label:'Réaliser des observations sur plusieurs journées pour établir une priorité';
  const fastestProgress=trends.filter(row=>row.delta!==null&&row.delta>0).sort((a,b)=>b.delta-a.delta)[0]||null;
  const stagnation=trends.filter(row=>row.delta!==null&&Math.abs(row.delta)<0.5).map(row=>row.label);
  const decliningAreas=trends.filter(row=>row.delta!==null&&row.delta< -0.5).sort((a,b)=>a.delta-b.delta);
  const planFocus=priority?.criterion||(decliningAreas[0]?decliningAreas[0].label:lowestSector?.label||null);
  const hasReliableFocus=Boolean(priority||lowestSector);
  const fourWeekPlan=days.length>=3&&hasReliableFocus?[
    {week:1,title:'Reconstruction des repères',objective:'Observer '+planFocus+' dans une situation simple et reproductible.',success:'Établir une référence mesurable sur une série définie.'},
    {week:2,title:'Répétition maîtrisée',objective:'Stabiliser '+planFocus+' en conservant une seule consigne.',success:'Comparer le nombre de réussites à la référence initiale.'},
    {week:3,title:'Lecture et décision',objective:'Introduire une information à lire et laisser le joueur choisir sa réponse.',success:'Relever les choix adaptés dans une série de situations.'},
    {week:4,title:'Transfert et validation',objective:'Réinvestir '+planFocus+' dans des points à thème puis réaliser un nouveau bilan.',success:'Comparer les observations sur une nouvelle journée.'}
  ]:[];
  return {
    playerId:player.id,playerName:[player.first_name,player.last_name].filter(Boolean).join(' ')||'Joueur',
    reportCount:reports.length,observationDayCount:days.length,recentObservationDays:recentDays.map(day=>day.date),
    sessionCount:playerSessions.length,videoCount:playerVideos.length,lastReportDate,lastSessionDate,reportAgeDays,sessionAgeDays,
    status,statusReason,strengths,difficulties,trends,priority,criteriaConfidence,suggestedFocus,activeChallenge,
    fastestProgress,stagnation,decliningAreas,fourWeekPlan
  };
}
export function buildCoachIntelligence({players=[],evaluations=[],evaluationCriteria=[],sessions=[],videoAnalyses=[],challenges=[],now=Date.now()}={}) {
  const activePlayers=players.filter(player=>!player.archived_at);
  const insights=activePlayers.map(player=>analyzePlayerProgress({player,evaluations,evaluationCriteria,sessions,videoAnalyses,challenges,now}));
  const common=new Map();
  insights.forEach(insight=>insight.difficulties.forEach(item=>{
    const key=item.criterion_id||item.criterion;
    if(!common.has(key))common.set(key,{criterion:item.criterion,players:new Set()});
    common.get(key).players.add(insight.playerId);
  }));
  const recurringThemes=[...common.values()].map(item=>({criterion:item.criterion,playerCount:item.players.size})).sort((a,b)=>b.playerCount-a.playerCount||a.criterion.localeCompare(b.criterion,'fr'));
  return {
    insights,playersWithoutReport:insights.filter(row=>row.reportCount===0).length,
    reportsToRefresh:insights.filter(row=>row.reportAgeDays!==null&&row.reportAgeDays>30).length,
    playersWithPriority:insights.filter(row=>row.priority).length,recurringThemes
  };
}
export function buildAdaptiveTrainingProgram({player,evaluations=[],evaluationCriteria=[],sessions=[],videoAnalyses=[],challenges=[],library=[],now=Date.now()}={}) {
  if(!player?.id)return {ready:false,reason:'Joueur introuvable.',sessions:[]};
  const analysis=analyzePlayerProgress({player,evaluations,evaluationCriteria,sessions,videoAnalyses,challenges,now});
  if(analysis.observationDayCount<3||(!analysis.priority&&!analysis.trends.some(row=>row.currentCount>=3))){
    return {ready:false,reason:'Il faut trois journées d’observation distinctes et une priorité répétée ou trois notes comparables pour construire un cycle personnalisé.',analysis,sessions:[]};
  }
  const recommendation=recommendSessionExercises({playerId:player.id,evaluations,evaluationCriteria,library,sessions,challenges,videoAnalyses});
  const exercises=[recommendation?.exerciseOne,recommendation?.exerciseTwo].filter(Boolean);
  const focus=analysis.priority?.criterion||analysis.suggestedFocus;
  const stages=[
    {title:'État des lieux et repères',objective:'Observer le comportement ciblé et établir une référence stable.',action:'Faire réaliser des séries courtes sans multiplier les consignes.',success:'Relever les réussites et les conditions dans lesquelles elles apparaissent.',stage:'Diagnostic'},
    {title:'Répétition maîtrisée',objective:'Stabiliser '+focus+' dans une situation simple.',action:'Garder une seule consigne et un rythme contrôlé.',success:'Comparer les réussites à la référence de départ.',stage:'Stabilisation'},
    {title:'Régularité sous contrôle',objective:'Répéter le comportement avec une qualité constante.',action:'Allonger les séries sans augmenter la difficulté.',success:'Conserver la qualité sur deux séries successives.',stage:'Stabilisation'},
    {title:'Première variation',objective:'Faire évoluer une seule variable : direction, hauteur, rythme ou déplacement.',action:'Introduire une variation à la fois.',success:'Retrouver le comportement malgré la variation.',stage:'Variabilité'},
    {title:'Variation et déplacement',objective:'Maintenir '+focus+' avec un déplacement ou une balle différente.',action:'Alterner une situation connue et une situation nouvelle.',success:'Relever la qualité de réponse sur les deux situations.',stage:'Variabilité'},
    {title:'Lecture de trajectoire',objective:'Identifier l’information utile avant de déclencher la réponse.',action:'Faire verbaliser la lecture puis laisser le joueur agir.',success:'Faire un choix adapté dans la majorité des situations observées.',stage:'Prise de décision'},
    {title:'Choix tactique',objective:'Choisir quand et comment utiliser '+focus+' selon la situation.',action:'Proposer deux réponses possibles et faire justifier le choix.',success:'Observer la pertinence du choix indépendamment du résultat.',stage:'Prise de décision'},
    {title:'Enchaînement et construction',objective:'Relier le comportement travaillé à la frappe ou décision suivante.',action:'Construire des séquences de deux à trois frappes.',success:'Enchaîner sans perdre l’intention initiale.',stage:'Enchaînement'},
    {title:'Transfert en points à thème',objective:'Réinvestir '+focus+' dans des points avec une contrainte tactique.',action:'Laisser jouer, observer et corriger après la séquence.',success:'Retrouver le comportement dans les points à thème.',stage:'Transfert match'},
    {title:'Validation et nouveau cap',objective:'Mesurer les acquis, identifier ce qui est transféré et définir la prochaine priorité.',action:'Comparer les observations au point de départ puis réaliser un bilan actualisé.',success:'Valider les acquis observables et choisir le prochain axe.',stage:'Bilan de cycle'}
  ];
  return {
    ready:true,playerId:player.id,playerName:analysis.playerName,focus,status:analysis.status,
    reason:recommendation?.reason||'Cycle construit à partir des observations disponibles.',
    activeChallenge:analysis.activeChallenge,
    completedSessionCount:sessions.filter(row=>row.player_id===player.id&&row.status!=='cancelled').length,
    sessions:stages.map((phase,index)=>({...phase,number:index+1,focus,exercise:exercises.length?exercises[index%exercises.length]:null,challenge:analysis.activeChallenge?.objective||analysis.activeChallenge?.criterion||null}))
  };
}
