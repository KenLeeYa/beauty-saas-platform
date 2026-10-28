import {readFileSync, readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import ts from 'typescript';
import {describe, expect, it} from 'vitest';
import {english} from './messages';
import {workspaceMessages} from './workspace-messages';
import {legacyMessages} from './legacy-messages';
import {apiMessages} from './api-messages';
import {translate} from './messages';

const files = [
  'src/components/merchant-workspace.tsx', 'src/components/staff-workspace.tsx',
  'src/components/month-calendar.tsx', 'src/modules/crm/components/customer-management.tsx',
  'src/modules/notifications/components/notification-health-panel.tsx',
  'src/app/merchant/operations/review.tsx', 'src/app/merchant/operations/qualification-review.tsx',
  'src/app/line-booking/[store]/attendance-panel.tsx', 'src/app/line-booking/[store]/exception-queue.tsx',
  'src/components/member-benefits.tsx',
  'src/components/public-booking-flow.tsx', 'src/components/booking-manage.tsx',
  'src/components/platform-overview.tsx', 'src/components/platform-billing.tsx',
  'src/components/platform-organization-detail.tsx', 'src/components/organization-feature-controls.tsx',
  'src/components/merchant-application-review.tsx',
  'src/components/merchant-application-form.tsx', 'src/components/scope-selector.tsx',
  'src/app/select-organization/page.tsx', 'src/app/select-location/page.tsx',
];
describe('workspace copy coverage', () => {
  it('covers public error literals and all active JSX translation keys', () => {
    const missing = new Set<string>();
    for (const relative of readdirSync('src', {recursive: true}).map(String).filter(file => /\.tsx?$/.test(file) && !file.includes('.test.'))) {
      const file = `src/${relative.replaceAll('\\', '/')}`;
      const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
      function visit(node: ts.Node) {
        let key: string | undefined;
        if (ts.isNewExpression(node) && node.expression.getText(source) === 'AppError' && node.arguments?.[1] && ts.isStringLiteral(node.arguments[1])) key = node.arguments[1].text;
        if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'message' && ts.isStringLiteral(node.initializer)) key = node.initializer.text;
        if (ts.isCallExpression(node) && node.expression.getText(source) === 't' && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) key = node.arguments[0].text;
        if (file.startsWith('src/app/api/') && ts.isCallExpression(node) &&
            ['jsonError', 'mobileJsonError', 'publicMessage'].includes(node.expression.getText(source)) &&
            node.arguments.at(-1)?.getText(source) !== 'request') missing.add(`${file}: missing request language`);
        if ((file.endsWith('schemas.ts') || ['src/server/http/errors.ts', 'src/server/http/error-messages.ts', 'src/lib/line-booking/validation.ts'].includes(file)) && ts.isStringLiteral(node)) key = node.text;
        if (key && /\p{Script=Han}/u.test(key)) {
          for (const locale of ['en', 'vi'] as const) if (/\p{Script=Han}/u.test(translate(locale, key))) missing.add(`${file}: ${key}`);
        }
        if (ts.isJsxText(node) && /\p{Script=Han}/u.test(node.text) && file !== 'src/components/language-provider.tsx') missing.add(`${file}: ${node.text.trim()}`);
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
    expect([...missing]).toEqual([]);
    for (const [key, pair] of Object.entries(apiMessages)) {
      expect(translate('zh-TW', key)).toBe(key);
      for (const value of pair) expect(value.trim().length).toBeGreaterThan(0);
    }
  });
  it('translates applicant lifecycle, category and selection copy', () => {
    for (const key of ['草稿','已送出','審核中','待補件','已核准','未通過','已撤回','已逾期',
      '美容美體','按摩舒壓','美甲','美睫','美髮','其他','選擇商家','選擇分店',
      '請選擇這次要管理的商家。','請選擇這次要操作的分店。','處理中','送出申請',
      '申請已送出審核。','草稿已儲存。']) {
      for (const locale of ['en','vi'] as const) expect(translate(locale,key)).not.toMatch(/\p{Script=Han}/u);
    }
  });
  it('translates report, invoice and setup choices without changing their identifiers', () => {
    for (const key of ['報表分類','服務營收','預約狀態','目前功能狀態','訂金功能','顧客黑名單',
      '全部帳單','待繳帳單','目前沒有待繳帳單。','帳單明細','待繳金額','不適用','建立日期',
      '開店階段','商家資料','預約設定','開放預約','查看設定','營業日','確認開放預約',
      '待完成','預約規則','訂金設定','週日','週一','週二','週三','週四','週五','週六']) {
      expect(translate('zh-TW',key)).toBe(key);
      for (const locale of ['en','vi'] as const) expect(translate(locale,key)).not.toMatch(/\p{Script=Han}/u);
    }
  });
  it('translates every legacy key without dropping content or leaking status codes', () => {
    for (const [key, pair] of Object.entries(legacyMessages)) {
      expect(translate('zh-TW', key)).toBe(key);
      for (const [index, locale] of (['en', 'vi'] as const).entries()) {
        expect(pair[index].trim().length).toBeGreaterThan(0);
        expect(translate(locale, key)).not.toMatch(/\p{Script=Han}/u);
      }
    }
    for (const status of ['GRACE_PERIOD','OVERDUE','PLATFORM_ADMIN','ORGANIZATION_OWNER','FINANCE_VIEWER']) {
      expect(translate('zh-TW', status)).toMatch(/\p{Script=Han}/u);
      expect(translate('en', status)).not.toBe(status);
      expect(translate('vi', status)).not.toBe(status);
    }
  });
  it.each(files)('%s uses translated literal copy with complete dictionaries', file => {
    const source = ts.createSourceFile(file, readFileSync(resolve(file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const missing: string[] = [];
    function visit(node: ts.Node) {
      if (ts.isJsxText(node) && /\p{Script=Han}/u.test(node.text)) missing.push(node.text.trim());
      if (ts.isCallExpression(node) && node.expression.getText(source) === 't' &&
          node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
        const key = node.arguments[0].text;
        if (!Object.hasOwn(english, key) && !Object.hasOwn(workspaceMessages, key) && !Object.hasOwn(legacyMessages, key) && !Object.hasOwn(apiMessages, key)) missing.push(key);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    expect(missing).toEqual([]);
  });
});
