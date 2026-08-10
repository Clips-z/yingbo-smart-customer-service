import { renderQianniuOfficialBridgePage } from '../../main/backend/services/qianniuOfficialBridgePage';

describe('renderQianniuOfficialBridgePage', () => {
  it('uses official contact and fill APIs without exposing send', () => {
    const html = renderQianniuOfficialBridgePage();

    expect(html).toContain('https://g.alicdn.com/sj/qn/jssdk.js');
    expect(html).toContain('wangwang.active_contact_changed');
    expect(html).toContain("invoke('getActiveUser'");
    expect(html).toContain("invoke('insertText2Inputbox'");
    expect(html).toContain("invokeMiniapp('imGetActiveUser'");
    expect(html).toContain("invokeMiniapp('imInsertText2Inputbox'");
    expect(html).toContain("invokeMiniapp('openChat'");
    expect(html).toContain("invoke('openChat'");
    expect(html).toContain('my.qn.onImActiveContactChanged');
    expect(html).toContain('function detectRuntime()');
    expect(html).toContain('未检测到千牛官方 API');
    expect(html).toContain('/commands');
    expect(html).not.toContain("cmd: 'send'");
  });

  it('emits valid browser JavaScript and does not republish during fill', () => {
    const html = renderQianniuOfficialBridgePage();
    const scripts = Array.from(
      html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g),
      (match) => match[1],
    ).filter(Boolean);

    expect(scripts).toHaveLength(1);
    expect(() => new Function(scripts[0])).not.toThrow();

    const executeBody = scripts[0].slice(
      scripts[0].indexOf('function execute(command)'),
      scripts[0].indexOf('function poll()'),
    );
    expect(executeBody).toContain('return readContact()');
    expect(executeBody).not.toContain('publishContact');
    expect(html).toContain('迎波千牛桥接');
  });
});
