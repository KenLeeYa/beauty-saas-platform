import {renderToStaticMarkup} from "react-dom/server";
import {expect, it} from "vitest";
import {NotificationHealthPanel} from "./notification-health-panel";

it("bounds both notification layouts to the same page and preserves retry controls", () => {
  const deliveries=Array.from({length:9},(_,index)=>({
    id:`delivery-${index}`,jobId:`job-${index}`,channel:"LINE",eventType:"BOOKING_CONFIRMED",
    status:"FAILED",jobStatus:"FAILED",attemptCount:1,maxAttempts:3,nextAttemptAt:null,
    errorCode:`fixture-result-${index}`,createdAt:"2026-10-27T00:00:00Z",
  }));
  const html=renderToStaticMarkup(<NotificationHealthPanel integrations={[]}
    health={{pending:0,processing:0,failed:9,deadLetter:0}} deliveries={deliveries}
    timezone="Asia/Taipei" isSubmitting={false} onRetry={async()=>{}}/>);
  expect(html.match(/<article /g)).toHaveLength(6);
  expect(html.match(/fixture-result-5/g)).toHaveLength(2);
  expect(html).not.toContain("fixture-result-6");
  expect(html).toContain("下一頁");
  expect(html.match(/立即重試/g)).toHaveLength(12);
});
