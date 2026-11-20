/** Recommandations fondées sur des journées d'observation distinctes. */
function normalize(value){return String(value||'').toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
function dayKey(row){const value=String(row?.evaluated_at||row?.created_at||row?.session_date||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(value)?value:null;}
function recentPriority(evaluations,evaluationCriteria,playerId){
  const reports=evaluations.filter(row=>row.player_id===playerId&&dayKey(row)).sort((a,b)=>String(b.evaluated_at||b.created_at||'').localeCompare(String(a.evaluated_at||a.created_at||'')));
  const dates=[...new Set(reports.map(dayKey))].slice(0,3);
  if(dates.length<3)return null;
  const dateById=new Map(reports.map(row=>[row.id,dayKey(row)]));
  const counts=new Map();
  evaluationCriteria.filter(row=>row.criterion_type==='improvement'&&dates.includes(dateById.get(row.evaluation_id))).forEach(row=>{
    const key=row.criterion_id||normalize(row.criterion);if(!key)return;
    if(!counts.has(key))counts.set(key,{criterion_id:row.criterion_id||null,criterion:row.criterion||'Axe de progression',main_theme:row.main_theme||'',subtheme:row.subtheme||'',days:new Set(),measuredDays:new Set()});
    const item=counts.get(key),date=dateById.get(row.evaluation_id);item.days.add(date);
    if(row.measured_value!==null&&row.measured_value!==undefined&&row.measured_value!=='')item.measuredDays.add(date);
  });
  return [...counts.values()].map(row=>({...row,occurrences:row.days.size,measuredOccurrences:row.measuredDays.size,confidence:row.days.size>=2?'récurrent':'à confirmer'}))
    .filter(row=>row.occurrences>=2).sort((a,b)=>b.occurrences-a.occurrences||b.measuredOccurrences-a.measuredOccurrences||a.criterion.localeCompare(b.criterion,'fr'))[0]||null;
}
function itemScore(item,priority){
  const text=normalize([item.title,item.theme,item.subtheme,item.objective,item.instructions,item.setup,(item.keywords||[]).join(' ')].join(' '));
  const count=terms=>terms.filter(term=>term.length>2&&text.includes(term)).length;
  return count(normalize(priority.criterion).split(/[^a-z0-9]+/))*5+count(normalize(priority.subtheme).split(/[^a-z0-9]+/))*3+count(normalize(priority.main_theme).split(/[^a-z0-9]+/))*2;
}
function sessionText(session){return normalize([session.theme,session.exercise_1,session.exercise_2].join(' '));}
function isRecentRepeat(item,sessions,playerId){
  const recent=sessions.filter(row=>row.player_id===playerId).sort((a,b)=>String(b.session_date||'').localeCompare(String(a.session_date||''))).slice(0,2);
  const title=normalize(item.title);return Boolean(title&&recent.some(row=>sessionText(row).includes(title)));
}
export function recommendSessionExercises({playerId,evaluations=[],evaluationCriteria=[],library=[],sessions=[],challenges=[],videoAnalyses=[]}={}){
  if(!playerId)return null;
  const playerReports=evaluations.filter(row=>row.player_id===playerId),priority=recentPriority(evaluations,evaluationCriteria,playerId);
  const activeChallenge=challenges.find(row=>row.player_id===playerId&&row.status==='active')||null;
  if(!priority)return {priority:null,activeChallenge,exerciseOne:null,exerciseTwo:null,reportCount:playerReports.length,observationDayCount:new Set(playerReports.map(dayKey).filter(Boolean)).size,reason:'Priorité non déterminée : trois journées d’observation distinctes sont nécessaires. Plusieurs bilans saisis le même jour ne comptent que comme une seule journée.'};
  const recentVideos=videoAnalyses.filter(row=>row.player_id===playerId).sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))).slice(0,2);
  const videoText=normalize(recentVideos.map(row=>[row.coach_summary,row.observations,row.recommendation].join(' ')).join(' '));
  const candidates=library.filter(item=>item.category==='particulier').map(item=>{
    const score=itemScore(item,priority)+(videoText&&normalize([item.title,item.theme,item.subtheme,item.objective,item.instructions].join(' ')).split(/[^a-z0-9]+/).some(token=>token.length>3&&videoText.includes(token))?1:0);
    const repeat=isRecentRepeat(item,sessions,playerId);
    return {item,score:score-(repeat?12:0),repeat};
  }).filter(row=>row.score>0).sort((a,b)=>b.score-a.score||String(a.item.title).localeCompare(String(b.item.title),'fr'));
  const first=candidates[0]||null,second=candidates.find(row=>row.item.id!==first?.item.id&&row.score>=Math.max(3,first.score-8))||null;
  return {priority,activeChallenge,exerciseOne:first?.item||null,exerciseTwo:second?.item||null,reportCount:playerReports.length,observationDayCount:3,videoSignalUsed:Boolean(videoText&&candidates.some(row=>normalize([row.item.title,row.item.theme,row.item.subtheme,row.item.objective,row.item.instructions].join(' ')).split(/[^a-z0-9]+/).some(token=>token.length>3&&videoText.includes(token)))),reason:first?'Priorité observée sur au moins deux journées distinctes parmi les trois dernières. Les exercices correspondent aux mots-clés du critère, du sous-thème et du thème.':'Priorité confirmée, mais aucun exercice de la bibliothèque privée ne correspond assez précisément. La création originale peut construire des situations à partir du critère et du programme pédagogique.',varietyApplied:Boolean(first&&!first.repeat)};
}
export function buildSessionCoachingPlan(recommendation,duration=90){
  const priority=recommendation?.priority;
  if(!priority?.criterion)return {objective:'Séance d’observation : choisir un comportement de jeu à évaluer avant de fixer une priorité.',cue:'Observer une situation représentative et noter des faits précis.',constraint:'Conserver une situation simple et relever les comportements observés.',success:'Obtenir une première référence puis la comparer lors de deux autres journées d’observation.',challenge:recommendation?.activeChallenge?.objective||null};
  return {objective:'Faire progresser « '+priority.criterion+' » et vérifier son transfert en situation de points.',cue:priority.subtheme?'Repère de travail : '+priority.subtheme+'. Une seule consigne à la fois.':'Garder une intention observable : '+priority.criterion+'.',constraint:Number(duration)<=60?'Faire évoluer une seule variable à la fois.':'Passer du contrôle à la variation, puis à la décision en points.',success:'Atteindre au moins 6 réalisations sur 10 dans la série de référence, puis vérifier le transfert en points.',challenge:recommendation?.activeChallenge?.objective||null};
}
export function buildMatchTransfer(priority){
  return priority?.criterion?'Situation de points : chercher volontairement à mettre en pratique « '+priority.criterion+' ». Relever les réussites observables et leur contexte.':'Jouer des points libres et relever les comportements observés sans annoncer de priorité prématurée.';
}
