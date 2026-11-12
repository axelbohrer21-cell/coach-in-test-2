import { supabase } from '../core/supabase.js';
import { validateBooking } from '../domain/tennis.js';

/** Toutes les mutations de réservation passent par des RPC atomiques côté PostgreSQL. */
export const bookingService = {
  async request({ coachId, date, time, duration, court }) {
    validateBooking({ date, time, duration, court });
    const { data, error } = await supabase.rpc('request_private_booking', {
      p_coach_id: coachId,
      p_session_date: date,
      p_start_time: time,
      p_duration_minutes: Number(duration),
      p_court_number: Number(court)
    });
    if (error) throw error;
    return data;
  },
  async review(requestId, decision, note = '') {
    if (!['accepted', 'rejected'].includes(decision)) throw new Error('Décision invalide.');
    const { data, error } = await supabase.rpc('review_private_booking', {
      p_request_id: requestId,
      p_decision: decision,
      p_coach_note: note
    });
    if (error) throw error;
    return data;
  },
  async cancel(requestId) {
    const { data, error } = await supabase.rpc('cancel_private_booking', { p_request_id: requestId });
    if (error) throw error;
    return data;
  }
};
