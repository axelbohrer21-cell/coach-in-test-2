import { supabase } from '../core/supabase.js';
import { validatePlanningAgentSearch } from '../domain/planning-agent.js';

export const planningAgentService = {
  async suggestSlots({ date, durationMinutes, coachId, role, userId, linkedCoachIds, today }) {
    const search = validatePlanningAgentSearch({
      date,
      durationMinutes,
      coachId,
      role,
      userId,
      linkedCoachIds,
      today
    });
    const { data, error } = await supabase.rpc('get_private_booking_suggestions', {
      p_coach_id: search.coachId,
      p_session_date: search.date,
      p_duration_minutes: search.durationMinutes
    });
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }
};
