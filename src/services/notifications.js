import { supabase } from '../core/supabase.js';

export const notificationService = {
  async listPlayer(limit = 40) {
    const { data, error } = await supabase.from('player_notifications').select('*')
      .order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return data || [];
  },
  async listCoach(limit = 40) {
    const { data, error } = await supabase.from('coach_notifications').select('*')
      .order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return data || [];
  },
  async markPlayerRead(id) {
    const { error } = await supabase.from('player_notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  },
  async markCoachRead(id) {
    const { error } = await supabase.from('coach_notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  }
};
