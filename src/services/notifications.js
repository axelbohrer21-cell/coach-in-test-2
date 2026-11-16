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
  async getPreferences(userId) {
    const {data,error}=await supabase.from('notification_preferences').select('*').eq('user_id',userId).maybeSingle(); if(error)throw error;
    return data || {user_id:userId,booking_requests:true,booking_decisions:true,booking_changes:true,reminders_24h:true,messages:true,progress:true,session_changes:true};
  },
  async savePreferences(userId,preferences) {
    const payload={user_id:userId,booking_requests:!!preferences.booking_requests,booking_decisions:!!preferences.booking_decisions,booking_changes:!!preferences.booking_changes,reminders_24h:!!preferences.reminders_24h,messages:!!preferences.messages,progress:!!preferences.progress,session_changes:!!preferences.session_changes,updated_at:new Date().toISOString()};
    const {data,error}=await supabase.from('notification_preferences').upsert(payload,{onConflict:'user_id'}).select().single(); if(error)throw error; return data;
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
