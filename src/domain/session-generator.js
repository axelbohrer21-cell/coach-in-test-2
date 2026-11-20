import groupProgram from '../data/group-course-program.json' with { type: 'json' };

const normalize = value => String(value || '')
  .toLocaleLowerCase('fr')
  .normalize('NFD')
  .replace(/[\\u0300-\\u036f]/g, '')
  .replace(/[^a-z0-9 ]/g, ' ')
  .replace(/\\s+/g, ' ')
  .trim();

const THEME_TERMS = [
  { key: 'service', terms: ['service', 'mise en jeu', 'premiere balle', 'deuxieme balle', 'slice'] },
  { key: 'retour', terms: ['retour', 'return', 'relance', 'retourne'] },
  { key: 'volley', terms: ['volee', 'volley', 'filet', 'montee'] },
  { key: 'attaque', terms: ['attaque', 'agressivite', 'decalage', 'balle favorable'] },
  { key: 'defense', terms: ['defense', 'defensif', 'couverture', 'lateral', 'lateraux'] },
  { key: 'construction', terms: ['construction', 'regularite', 'longueur', 'faire bouger', 'fond de court', 'cd', 'revers', 'avant arriere'] },
  { key: 'double', terms: ['double', 'jeu en double'] },
];

function requestedTerms(value) {
  const text = normalize(value);
  const matched = THEME_TERMS.filter(group => group.terms.some(term => text.includes(normalize(term))));
  return [...new Set(matched.flatMap(group => group.terms.filter(term => text.includes(normalize(term)) || group.terms.length === 1)))];
}

function chooseSourceWeek({ theme, selectedObjective, customObjective, priority, recentSessions }) {
  const candidates = [customObjective, selectedObjective?.label, selectedObjective?.theme, theme, priority?.main_theme, priority?.criterion]
    .map(value => String(value || '').trim()).filter(Boolean);
  const recentWeeks = new Set((recentSessions || []).slice(0, 3).map(session => Number(session.source_week)).filter(Boolean));
  const sourceWeeks = (groupProgram.weeks || []).filter(week => (week.courts || []).some(content => String(content || '').trim()));

  for (const request of candidates) {
    const text = normalize(request);
    const groups = THEME_TERMS.filter(group => group.terms.some(term => text.includes(normalize(term))));
    const terms = [...new Set(groups.flatMap(group => group.terms))];
    if (!terms.length) continue;
    const ranked = sourceWeeks.map(week => {
      const label = normalize(String(week.theme || '').replace(/^semaine\\s+\\d+\\s*:?\\s*/, ''));
      const score = terms.reduce((total, term) => total + (label.includes(normalize(term)) ? (normalize(term).length > 4 ? 3 : 1) : 0), 0);
      return { week, score, recentlyUsed: recentWeeks.has(Number(week.week)) };
    })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || Number(a.recentlyUsed) - Number(b.recentlyUsed) || Number(a.week.week) - Number(b.week.week));
    if (ranked[0]) return ranked[0].week;
  }
  return null;
}

function distributeMinutes(total, count) {
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

/**
 * The collective course workbook is the only exercise source for generated sessions.
 * Court instructions are kept verbatim; this function only structures and times them.
 */
export function generateOriginalSession({
  theme = 'construction',
  selectedObjective = null,
  customObjective = '',
  playerName = 'le joueur',
  level = 'Intermédiaire',
  difficulty = 'progressive',
  priorAdjustment = null,
  age = null,
  playerType = 'Loisir',
  duration = 90,
  priority = null,
  challenge = null,
  recentSessions = [],
  customExercises = []
} = {}) {
  const minutes = [60, 90, 120].includes(Number(duration)) ? Number(duration) : 90;
  const sourceWeek = chooseSourceWeek({ theme, selectedObjective, customObjective, priority, recentSessions });
  const sourceTheme = sourceWeek
    ? String(sourceWeek.theme || '').replace(/^SEMAINE\\s+\\d+\\s*:\\s*/i, '').trim()
    : String(selectedObjective?.theme || theme || 'Programme collectif');

  const courts = (sourceWeek?.courts || [])
    .map((instruction, index) => ({ instruction: String(instruction || '').trim(), court: index + 1 }))
    .filter(item => item.instruction);
  const allocations = distributeMinutes(minutes, courts.length || 1);
  const phases = courts.map((item, index) => ({
    name: 'Terrain ' + item.court,
    minutes: allocations[index],
    objective: sourceTheme,
    content: item.instruction,
    source_week: Number(sourceWeek.week)
  }));

  const sourceLabel = sourceWeek
    ? 'Source : Cours de l’année.xlsx · Semaine ' + sourceWeek.week + ' · ' + sourceTheme
    : 'Aucun atelier correspondant à ce thème dans le programme collectif fourni.';
  const exerciseText = phases.map(phase =>
    phase.name.toUpperCase() + ' · ' + phase.minutes + ' min\\n' + phase.content
  );
  const coachingNotes = [
    'Joueur : ' + playerName + ' · Profil : ' + playerType + ' · Niveau : ' + level,
    sourceLabel,
    'Les consignes des terrains sont reprises du programme collectif sans ajout ni remplacement.'
  ].join('\\n');

  return {
    generated: true,
    generation_mode: 'original',
    theme: sourceTheme,
    focus: sourceTheme,
    objective_criteria: [],
    duration_minutes: minutes,
    objective: sourceWeek ? 'Thème de la semaine : ' + sourceTheme : sourceLabel,
    coaching_notes: coachingNotes,
    exercise_1: exerciseText.slice(0, 2).join('\\n\\n'),
    exercise_2: exerciseText.slice(2).join('\\n\\n'),
    player_visible_summary: sourceWeek
      ? 'Séance construite à partir de la semaine ' + sourceWeek.week + ' du programme collectif.'
      : sourceLabel,
    success_criteria: 'Respecter la consigne exacte de chaque atelier et observer son application dans le jeu.',
    adaptation: 'Contenu issu du programme collectif',
    difficulty: difficulty === 'hard' ? 'Exigeant' : difficulty === 'easy' ? 'Accessible' : 'Progressif',
    difficulty_rule: 'Adapter uniquement le rythme et les distances au niveau du joueur, sans modifier la consigne pédagogique source.',
    progression: priorAdjustment || null,
    phases,
    exercise_count: phases.length,
    coach_feed_count: 0,
    source_week: sourceWeek ? Number(sourceWeek.week) : null,
    source_file: 'Cours de l’année.xlsx'
  };
}
