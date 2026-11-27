-- Index foreign-key columns used by referral relationships.
-- These indexes are safe additive changes and do not alter referral records.

create index if not exists idx_coach_referral_invites_referred_coach_id
  on public.coach_referral_invites (referred_coach_id);

create index if not exists idx_coach_referral_links_current_invite_id
  on public.coach_referral_links (current_invite_id);

create index if not exists idx_coach_referrals_sponsor_coach_id
  on public.coach_referrals (sponsor_coach_id);
