import sqlite from 'sqlite3';
import { Sequelize } from 'sequelize';
import { initReplayFixture, ReplayFixture } from '../../main/backend/entities/replayFixture';
import { initAuditEvent } from '../../main/backend/entities/auditEvent';
import {
  replaySanitizedFixtures,
  saveReplayFixture,
} from '../../main/backend/services/replayService';

describe('sanitized platform replay', () => {
  it('replays unattended delivery outcomes without screenshots or personal data', () => {
    const result = replaySanitizedFixtures([
      { platformId: 'win_qianniu', source: 'llm', retrievalStatus: 'hit', ocrConfidence: 0.95, expectedAllowed: true },
      { platformId: 'win_wechat', source: 'llm', retrievalStatus: 'no_hit', ocrConfidence: 0.95, expectedAllowed: true },
    ]);
    expect(result.map((row) => row.passed)).toEqual([true, true]);
  });

  it('saves only sanitized replay fixtures', async () => {
    const database = new Sequelize({ dialect: 'sqlite', dialectModule: sqlite, storage: ':memory:', logging: false });
    initReplayFixture(database); initAuditEvent(database); await database.sync();
    await saveReplayFixture({ name: '安全回放', fixtures: [{ content: '联系 13800138000 或 a@b.com', expectedAllowed: false }] });
    await expect(ReplayFixture.findOne()).resolves.toMatchObject({ name: '安全回放', fixtures: [expect.objectContaining({ content: expect.stringContaining('[已脱敏]') })] });
    await database.close();
  });
});
