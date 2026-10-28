import {describe, expect, it} from 'vitest';
import {resolveLocale} from './locale';
import {english, translate, translateError, type MessageKey} from './messages';
import {workspaceMessages} from './workspace-messages';

describe('interface language negotiation', () => {
  it.each([
    [undefined, 'en-US,en;q=0.9', 'en'],
    [undefined, 'vi-VN,vi;q=0.9,en;q=0.8', 'vi'],
    ['vi', 'zh-TW', 'vi'],
    ['auto', 'fr-FR,vi;q=0.8,en;q=0.5', 'vi'],
    [undefined, 'zh-TW,zh;q=0.9,en;q=0.8', 'zh-TW'],
    [undefined, 'zh-Hant-HK', 'zh-TW'],
    [undefined, 'fr-FR,en-GB;q=0.8', 'en'],
    [undefined, 'en;q=0.4,zh-Hant;q=0.9', 'zh-TW'],
    [undefined, 'en;q=0,fr', 'zh-TW'],
    [undefined, 'en;q=invalid', 'zh-TW'],
    ['en', 'zh-TW', 'en'],
    ['zh-TW', 'en-US', 'zh-TW'],
    ['auto', 'en-US', 'en'],
    ['invalid', 'en-US', 'en'],
    [undefined, null, 'zh-TW'],
  ])('resolves %s / %s to %s', (preference, header, expected) => {
    expect(resolveLocale(preference, header)).toBe(expected);
  });
  it('provides all three languages for every migrated message', () => {
    for (const key of Object.keys(english) as MessageKey[]) {
      expect(translate('zh-TW', key)).toBe(key);
      expect(translate('en', key).trim()).not.toBe('');
      expect(translate('en', key)).not.toMatch(/\p{Script=Han}/u);
      expect(translate('vi', key).trim()).not.toBe('');
      expect(translate('vi', key)).not.toMatch(/\p{Script=Han}/u);
    }
    for (const [key, values] of Object.entries(workspaceMessages)) {
      expect(translate('zh-TW', key)).toBe(key);
      expect(translate('en', key)).not.toMatch(/\p{Script=Han}/u);
      expect(translate('vi', key)).not.toMatch(/\p{Script=Han}/u);
      expect(values).toHaveLength(2);
    }
  });
  it('maps known public failures and never exposes unknown diagnostics in English', () => {
    expect(translateError('en', '此時段已被預約，請重新選擇。')).toContain('no longer available');
    expect(translateError('en', 'database postgres://secret')).not.toContain('secret');
    expect(translateError('en', '未知安全中文訊息')).toContain('try again');
    expect(translateError('vi', 'database postgres://secret')).not.toContain('secret');
    expect(translateError('vi', '此美容師當時未排班或休假，請選擇其他人員')).toContain('nghỉ phép');
  });
});
