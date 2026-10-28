import {renderToStaticMarkup} from "react-dom/server";
import {expect, it} from "vitest";
import {MerchantReportDashboard} from "./merchant-report-dashboard";

it("renders all report sections and nine readable statuses without tabs or pagination",()=>{
  const html=renderToStaticMarkup(<MerchantReportDashboard data={{stats:{currency:"TWD"},bookings:[
    {status:"COMPLETED",serviceName:"Synthetic facial",totalMinor:10000},
    {status:"COMPLETED",serviceName:"Synthetic facial",totalMinor:20000},
    {status:"RESCHEDULED",serviceName:"Synthetic facial",totalMinor:990000},
  ]}}/>);
  expect(html).toContain("服務營收");expect(html).toContain("預約狀態");
  for(const label of ["待訂金","已確認","已報到","服務中","已完成","已取消","未到店","已失效","已改期"]) expect(html).toContain(label);
  expect(html).not.toMatch(/PENDING_PAYMENT|RESCHEDULED|<button/);
  expect(html).toContain("$300");expect(html).not.toContain("$9,900");
});

it("bounds a long service breakdown while retaining all dashboard sections",()=>{
  const html=renderToStaticMarkup(<MerchantReportDashboard data={{stats:{currency:"TWD"},bookings:Array.from({length:9},(_,i)=>({status:"COMPLETED",serviceName:`保養服務 ${i+1}`,totalMinor:10000*(9-i)}))}}/>);
  expect((html.match(/class="merchant-report-row"/g) ?? []).length).toBe(6);
  expect(html).toContain("1-6 / 9");expect(html).toContain("下一頁");
  expect(html).toContain("預約狀態");expect(html).toContain("完成服務合計");
});
