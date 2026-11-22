import { state } from '../core/state.js';
import { escapeHtml, formatDate } from '../core/dom.js';

const safe = value => escapeHtml(String(value ?? ''));
const safeHttpUrl = value => { try { const url = new URL(String(value||'')); return ['https:','http:'].includes(url.protocol) ? safe(url.href) : ''; } catch (_) { return ''; } };
const localToday = () => {
  const date = new Date();
  return [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0')].join('-');
};
const formatStamp = value => value ? new Date(value).toLocaleString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}) : 'Date à préciser';
const initials = profile => [profile?.first_name?.[0],profile?.last_name?.[0]].filter(Boolean).join('').toUpperCase() || 'CI';

export function playerUltimateCard() {
  const profile=state.profile||{}, sessions=state.sessions||[], achievements=state.achievements||[];
  const reports=[...(state.evaluations||[])].sort((a,b)=>String(b.evaluated_at||b.created_at||'').localeCompare(String(a.evaluated_at||a.created_at||'')));
  const axes=[['TEC','technical_score'],['TAC','tactical_score'],['PHY','physical_score'],['MEN','mental_score']];
  const overall=row=>{
    const values=axes.map(([,key])=>row[key]===null||row[key]===undefined||row[key]===''?null:Number(row[key])).filter(value=>Number.isFinite(value)&&value>=0&&value<=20);
    if(values.length)return values.reduce((sum,value)=>sum+value,0)/values.length;
    const fallback=Number(row.score);
    return Number.isFinite(fallback)&&fallback>=0&&fallback<=20?fallback:null;
  };
  const best=reports.map(overall).filter(value=>value!==null).reduce((max,value)=>Math.max(max,value),-1);
  const ovr=best<0?null:Math.round(best*5);
  const tier=ovr===null||ovr<55?{id:'bronze',name:'Bronze',next:'Argent',min:0,max:55,mark:'I'}:ovr<70?{id:'silver',name:'Argent',next:'Or',min:55,max:70,mark:'II'}:ovr<85?{id:'gold',name:'Or',next:'Platine',min:70,max:85,mark:'III'}:{id:'platinum',name:'Platine',next:null,min:85,max:100,mark:'IV'};
  const latest=reports[0]||null;
  const stats=axes.map(([label,key])=>{
    const raw=latest?.[key],value=raw===null||raw===undefined||raw===''?null:Number(raw),valid=Number.isFinite(value)&&value>=0&&value<=20;
    return '<div class="fut-stat"><span>'+label+'</span><strong>'+(valid?Math.round(value*5):'—')+'</strong><i><b style="width:'+(valid?value/20*100:0)+'%"></b></i></div>';
  }).join('');
  const photo=String(profile.avatar_url||'');
  const portrait=photo.startsWith('https://')?'<img src="'+safe(photo)+'" alt="Portrait du joueur">':'<div class="fut-card-photo-placeholder"><strong>'+safe(initials(profile))+'</strong><span>PHOTO JOUEUR</span><small>Portrait à ajouter</small></div>';
  const progress=tier.next?Math.max(0,Math.min(100,((ovr||0)-tier.min)/(tier.max-tier.min)*100)):100;
  return '<section class="player-game-card fut-inspired-card tier-'+tier.id+'"><div class="fut-card-top"><span>COACH IN <b>PLAYER CARD</b></span><span>SAISON 2026 / 2027</span></div><div class="fut-card-layout"><div class="fut-card-portrait">'+portrait+'<div class="fut-card-photo-shade"></div><div class="fut-card-overall"><strong>'+(ovr===null?'—':ovr)+'</strong><span>OVR</span></div><div class="fut-card-crest"><span>'+tier.mark+'</span><b>'+tier.name.toUpperCase()+'</b></div><div class="fut-card-player-name"><h2>'+safe(profile.first_name)+' '+safe(profile.last_name)+'</h2><span>'+safe(profile.fft_ranking||'Classement à renseigner')+' · '+safe(profile.age_category||'TENNIS')+'</span></div></div><div class="fut-card-details"><div class="fut-card-tierline"><span class="game-tier-emblem">'+tier.mark+'</span><div><small>CARTE ÉVOLUTIVE</small><strong>'+tier.name.toUpperCase()+'</strong></div><span class="fut-tier-level">NIVEAU '+tier.mark+'</span></div><div class="fut-card-stat-grid">'+stats+'</div><div class="game-card-progress"><div><span>'+(tier.next?'PROGRESSION VERS '+tier.next.toUpperCase():'RANG MAXIMAL ATTEINT')+'</span><b>'+(tier.next?(ovr||0)-tier.min+' / '+(tier.max-tier.min)+' pts':'MAX')+'</b></div><i><b style="width:'+progress+'%"></b></i></div><div class="fut-card-foot"><span><b>'+sessions.length+'</b> SÉANCES</span><span><b>'+achievements.length+'</b> BADGES</span><span>'+safe(profile.player_type||'JOUEUR')+'</span></div></div></div></section>';
}

export function playerTennisPage() {
  const profile = state.profile || {};
  const details = state.playerProfileDetails || {};
  const sessions = state.sessions || [];
  const reports = state.evaluations || [];
  const achievements = state.achievements || [];
  const matches = state.matchJournal || [];
  const monthKey = localToday().slice(0,7);
  const monthLabel = new Date(monthKey+'-15T12:00:00').toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
  const monthSessions = sessions.filter(row => String(row.session_date||'').startsWith(monthKey));
  const monthReports = reports.filter(row => String(row.evaluated_at||row.created_at||'').startsWith(monthKey));
  const monthAchievements = achievements.filter(row => String(row.unlocked_at||'').startsWith(monthKey));
  const monthMinutes = monthSessions.reduce((sum,row)=>sum+Number(row.duration_minutes||0),0);
  const monthScores = monthReports.map(row=>Number(row.score)).filter(value=>Number.isFinite(value)&&value>=0&&value<=20);
  const avgScore = monthScores.length ? monthScores.reduce((a,b)=>a+b,0)/monthScores.length : null;

  const latestChallenge = (state.challenges||[]).find(row=>row.status==='active');
  const wins = matches.filter(row=>row.result==='Victoire').length;
  const bestRecent = matches.find(row=>row.result==='Victoire');
  const skills = achievements.slice(0,6).map(row=>'<span class="passport-skill">✦ '+safe(row.criterion)+'</span>').join('');
  return `
    <section class="passport-hero">
      <div class="passport-avatar passport-avatar-current">${String(profile.avatar_url||'').startsWith('https://')?'<img src="'+safe(profile.avatar_url)+'" alt="Portrait du joueur">':safe(initials(profile))}</div>
      <div class="passport-identity"><p class="eyebrow">MON PROFIL TENNIS · COACH IN</p><h2>${safe(profile.first_name)} ${safe(profile.last_name)}</h2><p>${safe(profile.player_type||'Profil joueur')} · ${safe(profile.age_category||'Catégorie non renseignée')}</p><div class="passport-tags"><span>Classement FFT : <b>${safe(profile.fft_ranking||'Non renseigné')}</b></span><span>Depuis le ${formatDate(profile.created_at,{month:'long',year:'numeric'})}</span></div></div>
      <span class="passport-stamp">CI<span>+</span></span>
    </section>
    <div class="stats-grid passport-stats">
      <article class="stat-card blue"><span>Séances réalisées</span><strong>${sessions.length}</strong><small>${Math.round(sessions.reduce((sum,row)=>sum+Number(row.duration_minutes||0),0)/60)} h sur le terrain</small></article>
      <article class="stat-card purple"><span>Bilans partagés</span><strong>${reports.length}</strong><small>Évaluations accessibles</small></article>
      <article class="stat-card green"><span>Compétences validées</span><strong>${achievements.length}</strong><small>Réussites débloquées</small></article>
      <article class="stat-card orange"><span>Matchs renseignés</span><strong>${matches.length}</strong><small>${wins} victoire(s) dans ton journal</small></article>
    </div>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">TON IDENTITÉ DE JOUEUR</p><h2>Ce qui te motive</h2></div><span class="tag">Modifiable par toi</span></div>
      <form id="player-profile-details-form" class="form-grid">
        <label class="span-2">Mon objectif principal<textarea name="objective" rows="2" maxlength="500" placeholder="Ex. : gagner en régularité, passer un classement…">${safe(details.objective)}</textarea></label>
        <label>Ce qui me motive<textarea name="motivation" rows="2" maxlength="500" placeholder="Ce qui me donne envie de jouer…">${safe(details.motivation)}</textarea></label>
        <label>Mes points forts<textarea name="strengths" rows="2" maxlength="500" placeholder="Mes qualités sur le court…">${safe(details.strengths)}</textarea></label>
        <label class="span-2">Mon prochain axe de travail<textarea name="focus" rows="2" maxlength="500" placeholder="Ce que je veux améliorer…">${safe(details.focus)}</textarea></label>
        <div class="span-2 dialog-actions"><button class="btn primary" type="submit">Enregistrer mon profil</button></div>
      </form>
    </section>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">MES ACQUIS</p><h2>Les compétences gagnées</h2></div><span class="tag tag-green">${achievements.length} palier(s)</span></div>
      <div class="passport-skills">${skills||'<p class="chart-empty">Tes réussites validées par tes coachs apparaîtront ici. Elles ne sont jamais ajoutées automatiquement.</p>'}</div>
      ${bestRecent?'<p class="passport-highlight">🏆 Dernière victoire renseignée : <b>'+safe(bestRecent.opponent_name||'Adversaire')+'</b> · '+safe(bestRecent.score||'Score non renseigné')+'</p>':''}
    </section>
    <section class="panel monthly-review">
      <div class="section-heading"><div><p class="eyebrow">BILAN AUTOMATIQUE</p><h2>Ton mois de ${safe(monthLabel)}</h2></div><span class="tag">Données réelles</span></div>
      <div class="monthly-review-grid">
        <article><span>Séances</span><strong>${monthSessions.length}</strong><small>${Math.floor(monthMinutes/60)} h ${monthMinutes%60} min de tennis</small></article>
        <article><span>Bilans partagés</span><strong>${monthReports.length}</strong><small>${avgScore===null?'Pas de score ce mois-ci':'Moyenne des scores : '+avgScore.toFixed(1).replace('.',',')+'/20'}</small></article>
        <article><span>Réussites</span><strong>${monthAchievements.length}</strong><small>Débloquées ce mois-ci</small></article>
      </div>
      <div class="monthly-review-notes">
        <div><b>Ce qui a été travaillé</b><p>${monthSessions.length?[...new Set(monthSessions.map(row=>row.theme).filter(Boolean))].map(safe).join(' · ')||'Séances enregistrées sans thème précisé':'Aucune séance enregistrée ce mois-ci.'}</p></div>
        <div><b>Le regard de tes coachs</b><p>${monthReports.map(row=>row.player_visible_comment).filter(Boolean).slice(0,2).map(safe).join(' · ')||'Aucun commentaire partagé ce mois-ci.'}</p></div>
        <div><b>Ton prochain cap</b><p>${latestChallenge?safe(latestChallenge.criterion)+' — '+safe(latestChallenge.objective||'Défi en cours'):'Ton prochain objectif sera affiché ici dès qu’un défi sera défini avec ton coach.'}</p></div>
      </div>
      <p class="tiny muted">Ce bilan résume les séances, scores, commentaires et réussites enregistrés pendant le mois. Il ne remplace pas l’analyse pédagogique de ton coach.</p>
    </section>`;
}

export function playerMatchesPage() {
  const rows = [...(state.matchJournal||[])].sort((a,b)=>String(b.match_date).localeCompare(String(a.match_date)));
  const wins=rows.filter(row=>row.result==='Victoire').length;
  const losses=rows.filter(row=>row.result==='Défaite').length;
  return `
    <section class="welcome-panel match-journal-hero"><div><p class="eyebrow">MON TENNIS · JOURNAL DE MATCH</p><h2>Chaque match t’apprend quelque chose.</h2><p>Note tes résultats, tes sensations et ce que tu veux retrouver à l’entraînement. Ce journal reste privé : seul ton compte joueur y accède.</p></div><div class="welcome-mark">✎</div></section>
    <div class="stats-grid"><article class="stat-card green"><span>Victoires</span><strong>${wins}</strong><small>Matchs renseignés</small></article><article class="stat-card orange"><span>Défaites</span><strong>${losses}</strong><small>Matchs renseignés</small></article><article class="stat-card blue"><span>Matchs</span><strong>${rows.length}</strong><small>Dans ton journal personnel</small></article><article class="stat-card purple"><span>Taux de victoire</span><strong>${rows.length?Math.round(wins/rows.length*100)+'%':'—'}</strong><small>Sur les résultats renseignés</small></article></div>
    <section class="panel"><div class="section-heading"><div><p class="eyebrow">APRÈS TON MATCH</p><h2>Ajouter un match</h2></div><span class="tag">Carnet personnel</span></div>
      <form id="player-match-form" class="form-grid">
        <label>Date du match<input type="date" name="match_date" value="${localToday()}" required></label>
        <label>Résultat<select name="result" required><option value="Victoire">Victoire</option><option value="Défaite">Défaite</option><option value="Égalité">Égalité</option></select></label>
        <label>Adversaire<input name="opponent_name" maxlength="100" placeholder="Nom de l’adversaire" required></label>
        <label>Classement adverse<input name="opponent_ranking" maxlength="30" placeholder="Ex. : 15/3"></label>
        <label>Tournoi / championnat<input name="competition" maxlength="120" placeholder="Nom de la compétition"></label>
        <label>Score<input name="score" maxlength="80" placeholder="Ex. : 6/4 3/6 10/7"></label>
        <label class="span-2">Comment je me suis senti<textarea name="feelings" rows="2" maxlength="800" placeholder="Énergie, confiance, stress, concentration…"></textarea></label>
        <label>Ce qui a bien fonctionné<textarea name="worked_well" rows="3" maxlength="1000" placeholder="Mes réussites du jour…"></textarea></label>
        <label>Ce que je veux améliorer<textarea name="to_improve" rows="3" maxlength="1000" placeholder="Un point à retravailler…"></textarea></label>
        <div class="span-2 dialog-actions"><button class="btn primary" type="submit">＋ Enregistrer mon match</button></div>
      </form>
    </section>
    <section class="panel"><div class="section-heading"><div><p class="eyebrow">MON HISTORIQUE</p><h2>Mes matchs</h2></div><span class="tag">${rows.length} enregistré(s)</span></div>
      ${rows.map(row=>`<article class="match-journal-card"><div class="match-journal-top"><div><span class="journal-date">${formatDate(row.match_date,{day:'2-digit',month:'long',year:'numeric'})} · ${safe(row.competition||'Match')}</span><h3>${safe(row.opponent_name||'Adversaire')} <small>${safe(row.opponent_ranking||'')}</small></h3></div><span class="tag ${row.result==='Victoire'?'tag-green':row.result==='Défaite'?'tag-orange':''}">${safe(row.result)}</span></div><strong class="match-score">${safe(row.score||'Score non renseigné')}</strong><div class="match-reflection-grid"><div><b>Mes sensations</b><p>${safe(row.feelings||'Non renseigné')}</p></div><div><b>Ce qui a marché</b><p>${safe(row.worked_well||'Non renseigné')}</p></div><div><b>À retravailler</b><p>${safe(row.to_improve||'Non renseigné')}</p></div></div><div class="match-card-actions"><button class="btn danger" data-delete-match="${safe(row.id)}">Supprimer</button></div></article>`).join('')||'<div class="empty-state"><div class="empty-icon">✎</div><h3>Ton journal commence ici</h3><p>Ajoute ton prochain match pour garder une trace de tes sensations et de tes progrès.</p></div>'}
    </section>`;
}

export function clubLifePage(isCoach=false) {
  const events=[...(state.clubEvents||[])].sort((a,b)=>String(a.starts_at).localeCompare(String(b.starts_at)));
  const upcoming=events.filter(row=>new Date(row.starts_at)>=new Date());
  const past=events.filter(row=>new Date(row.starts_at)<new Date());
  const eventCard=row=>{const link=safeHttpUrl(row.signup_url);return `<article class="club-event-card"><div class="club-event-date"><strong>${new Date(row.starts_at).toLocaleDateString('fr-FR',{day:'2-digit'})}</strong><span>${new Date(row.starts_at).toLocaleDateString('fr-FR',{month:'short'})}</span></div><div class="club-event-body"><span class="eyebrow">${safe(row.event_type||'Événement')}</span><h3>${safe(row.title)}</h3><p>${safe(row.description||'')}</p><small>◷ ${formatStamp(row.starts_at)} ${row.ends_at?' → '+new Date(row.ends_at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):''} · ◉ ${safe(row.location||'Lieu à confirmer')}</small>${link?'<a class="btn subtle club-signup" href="'+link+'" target="_blank" rel="noopener noreferrer">Informations / inscription ↗</a>':''}</div>${isCoach&&row.created_by===state.user?.id?'<button class="btn danger" data-delete-club-event="'+safe(row.id)+'">Supprimer</button>':''}</article>`;};
  return `
    <section class="welcome-panel club-life-hero"><div><p class="eyebrow">MON CLUB · LA VIE DU CLUB</p><h2>Le tennis se vit aussi en dehors du court.</h2><p>Retrouve ici les tournois, animations, stages et rendez-vous proposés par le club.</p></div><div class="welcome-mark">♧</div></section>
    ${isCoach?`<section class="panel"><div class="section-heading"><div><p class="eyebrow">COMMUNICATION CLUB</p><h2>Publier un événement</h2></div><span class="tag">Visible par les joueurs</span></div><form id="club-event-form" class="form-grid">
      <label class="span-2">Nom de l’événement<input name="title" maxlength="140" placeholder="Ex. : Tournoi interne de printemps" required></label>
      <label>Type<select name="event_type"><option>Tournoi</option><option>Stage</option><option>Animation</option><option>Vie du club</option><option>Compétition</option><option>Autre</option></select></label>
      <label>Lieu<input name="location" maxlength="160" placeholder="Ex. : Tennis Club…"></label>
      <label>Date et heure de début<input type="datetime-local" name="starts_at" required></label>
      <label>Date et heure de fin<input type="datetime-local" name="ends_at"></label>
      <label class="span-2">Description<textarea name="description" rows="3" maxlength="1500" placeholder="Programme, public concerné, informations utiles…"></textarea></label>
      <label class="span-2">Lien d’inscription (facultatif)<input type="url" name="signup_url" placeholder="https://…"></label>
      <div class="span-2 dialog-actions"><button class="btn primary" type="submit">＋ Publier dans la vie du club</button></div>
    </form></section>`:''}
    <section class="panel"><div class="section-heading"><div><p class="eyebrow">À VENIR</p><h2>Les prochains rendez-vous</h2></div><span class="tag tag-green">${upcoming.length} événement(s)</span></div>${upcoming.map(eventCard).join('')||'<div class="empty-state"><h3>Pas encore d’événement annoncé</h3><p>Les prochains tournois, stages et animations apparaîtront ici.</p></div>'}</section>
    ${past.length?`<section class="panel"><div class="section-heading"><div><p class="eyebrow">SOUVENIRS DU CLUB</p><h2>Événements passés</h2></div></div>${past.slice().reverse().map(eventCard).join('')}</section>`:''}`;
}
