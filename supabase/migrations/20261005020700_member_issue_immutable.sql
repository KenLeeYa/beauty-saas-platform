-- Issued coupon/package terms and identity are immutable; adjustments are events.
create function beauty_private.prevent_member_issue_change() returns trigger
language plpgsql as $$ begin raise exception 'Issued benefit terms are immutable'; end $$;
create trigger member_benefit_issues_immutable
  before update or delete on public.member_benefit_issues
  for each row execute function beauty_private.prevent_member_issue_change();
