# Synthetic financial reconciliation worksheet

Use minor currency units throughout. Run this against synthetic or approved scrubbed data before considering any real member or payroll activation.

| Check | Expected relationship | Local fixture result |
| --- | --- | --- |
| Wallet liability | paid principal + promotional bonus = displayed balance | 10,000 + 1,000 = 11,000 |
| Redemption | principal and bonus debit sum to tender amount | 909 + 91 = 1,000 at 10:1 paid-to-bonus ratio |
| Refund | returned principal and bonus match stored original tender allocation | 454 + 46 = 500 partial refund |
| Commission quote | one basis per completed segment | 1,000 original at 40% = 400; 800 discounted = 320; 600 paid-only = 240; fixed = 300 |
| Two service segments | split the booking total by listed segment prices, put rounding remainder on the last segment | listed 60,000 + 40,000; paid 48,000 + 32,000; 40% commission 19,200 + 12,800 |
| Payroll draft | base + hourly + approved overtime + commission | 50,000 + 96,000 + 18,000 + 24,000 = 188,000 |
| Late refund | approved old payslip remains fixed; new period gets reversal | old 188,000; next period adjustment -12,000 |
| Second late refund | each confirmed refund has one adjustment; a new draft recalculates next period | second adjustment -6,000; revised next period 32,000; old period 188,000 |
| Coupon/package event | issued minus reserved and cancelled plus released/refunded = available units; redeemed consumes a reservation | coupon 2 issued, 1 reserved and redeemed, 1 refunded; 2 available |

For each candidate period, export source booking IDs, paid booking/refund IDs, employee ID, rule version, attendance event and correction IDs, approved leave/overtime IDs, and all ledger entry IDs. Check unique idempotency keys, tenant/location scope, nonnegative remaining balances, outbox retries, and unexplained differences. Compare balances to the existing `booking_payments` and `booking_refunds` settlements; the new member ledger is not a second payment processor.

Current local suite verifies the fixture arithmetic, immutable approved lines and duplicate/cross-tenant benefit attempts. It does not establish contract classification, tax treatment, labor-law compliance, or settlement with a real payment processor. New stored value and payroll writes are guarded by `APP_ENV=test` plus `MEMBER_VALUE_TEST_ONLY=true` or `PAYROLL_TEST_ONLY=true` respectively.
