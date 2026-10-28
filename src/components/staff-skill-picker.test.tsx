import {expect,it,vi} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import {StaffSkillPicker} from "./staff-skill-picker";
vi.mock("./language-provider",()=>({useLanguage:()=>({t:(value:string)=>value})}));
it("retains selected values while server skill options are loading",()=>{
  const value=["技能24"];
  const html=renderToStaticMarkup(<StaffSkillPicker scope="organization=demo&location=taipei" value={value} onChange={()=>{}}/>);
  expect((html.match(/type="checkbox"/g) ?? []).length).toBe(0);
  expect(html).toContain("搜尋技能");
  expect(html).toContain("載入中");
  expect(html).not.toContain("尚未建立技能項目");
  expect(value).toEqual(["技能24"]);
});
