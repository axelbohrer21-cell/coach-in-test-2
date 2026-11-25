-- Finish the preview index and RLS alignment for the restored referral and push objects.

create index if not exists idx_coach_referral_invites_referred_coach_id
  on public.coach_referral_invites(referred_coach_id);
create index if not exists idx_coach_referral_links_current_invite_id
  on public.coach_referral_links(current_invite_id);
create index if not exists idx_coach_referrals_sponsor_coach_id
  on public.coach_referrals(sponsor_coach_id);

drop index if exists public.push_subscriptions_user_id_idx;

drop policy if exists "Users manage own push subscriptions" on public.push_subscriptions;
create policy "Users manage own push subscriptions"
on public.push_subscriptions for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
