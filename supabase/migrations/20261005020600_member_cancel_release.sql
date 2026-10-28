-- Release outstanding synthetic entitlement reservations when a booking cancels.
-- Redeemed units remain consumed until an approved refund creates a REFUNDED event.
create function beauty_private.release_member_reservations_on_cancel() returns trigger
language plpgsql as $$
declare reservation record;
begin
  if new.status <> 'CANCELLED' or old.status = 'CANCELLED' then return new; end if;
  update public.member_wallet_reservations
    set status='RELEASED'
    where organization_id=new.organization_id and booking_id=new.id
      and status='RESERVED';
  for reservation in
    select issue_id,
      sum(case when kind='RESERVED' then quantity else 0 end)
      - sum(case when kind in ('REDEEMED','RELEASED') then quantity else 0 end)
        as outstanding
    from public.member_benefit_events
    where booking_id=new.id
    group by issue_id
  loop
    if reservation.outstanding > 0 then
      insert into public.member_benefit_events
        (issue_id,kind,quantity,quantity_delta,idempotency_hash,booking_id)
      values (reservation.issue_id,'RELEASED',reservation.outstanding,
        reservation.outstanding,
        encode(extensions.digest('cancel:'||new.id::text||':'||reservation.issue_id::text,
          'sha256'),'hex'),new.id);
    end if;
  end loop;
  return new;
end $$;
create trigger member_reservations_cancel_release
  after update of status on public.bookings
  for each row execute function beauty_private.release_member_reservations_on_cancel();
