import fs from 'fs';
import path from 'path';

describe('QianNiu miniapp bridge', () => {
  const root = path.join(process.cwd(), 'integrations', 'qianniu-miniapp');
  const source = fs.readFileSync(
    path.join(root, 'pages', 'index', 'index.js'),
    'utf8',
  );

  it('uses official identity, focus, and fill APIs', () => {
    expect(source).toContain("qnCall('imGetActiveUser'");
    expect(source).toContain('onImActiveContactChanged');
    expect(source).toContain("qnCall('openChat'");
    expect(source).toContain("qnCall('imInsertText2Inputbox'");
    expect(source).toContain("runtime: 'miniapp'");
  });

  it('revalidates security identity and exposes no automatic send command', () => {
    expect(source).toContain('contact.securityUID !== command.securityUID');
    expect(source).toContain('contact.bizDomain !== command.bizDomain');
    expect(source).not.toMatch(/imSend|sendMessage|type:\s*['"]send['"]/);
  });

  it('contains a valid minimal project structure', () => {
    expect(() => JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))).not.toThrow();
    expect(() =>
      JSON.parse(fs.readFileSync(path.join(root, 'mini.project.json'), 'utf8')),
    ).not.toThrow();
    expect(fs.existsSync(path.join(root, 'pages', 'index', 'index.axml'))).toBe(true);
  });
});
