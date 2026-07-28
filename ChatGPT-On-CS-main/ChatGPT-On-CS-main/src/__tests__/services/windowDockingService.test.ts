import {
  calculateDockedBounds,
  chooseCompanionTarget,
  CompanionTargetWindow,
  normalizeCompanionDockState,
  resolveDockSide,
  WindowDockingService,
} from '../../main/services/windowDockingService';

const workArea = { x: 0, y: 0, width: 1920, height: 1040 };

describe('calculateDockedBounds', () => {
  test('attaches to the right edge of Qianniu', () => {
    expect(
      calculateDockedBounds({
        target: { x: 200, y: 40, width: 1200, height: 900 },
        panelWidth: 372,
        side: 'right',
        workArea,
      }),
    ).toEqual({ x: 1400, y: 40, width: 372, height: 900 });
  });

  test('attaches to the left edge of Qianniu', () => {
    expect(
      calculateDockedBounds({
        target: { x: 500, y: 20, width: 1000, height: 900 },
        panelWidth: 372,
        side: 'left',
        workArea,
      }),
    ).toEqual({ x: 128, y: 20, width: 372, height: 900 });
  });

  test('keeps the panel inside a negative-coordinate monitor', () => {
    expect(
      calculateDockedBounds({
        target: { x: -1500, y: -20, width: 1400, height: 1200 },
        panelWidth: 372,
        side: 'right',
        workArea: { x: -1920, y: 0, width: 1920, height: 1040 },
      }),
    ).toEqual({ x: -372, y: 0, width: 372, height: 1040 });
  });

  test('supports a collapsed rail', () => {
    expect(
      calculateDockedBounds({
        target: { x: 100, y: 50, width: 1200, height: 800 },
        panelWidth: 56,
        side: 'right',
        workArea,
      }).width,
    ).toBe(56);
  });
});

const target = (
  platformId: CompanionTargetWindow['platformId'],
  foreground = false,
): CompanionTargetWindow => ({
  platformId,
  hwnd: platformId === 'win_qianniu' ? 1 : platformId === 'win_wechat' ? 2 : 3,
  x: 100,
  y: 100,
  width: 900,
  height: 700,
  minimized: false,
  foreground,
});

describe('chooseCompanionTarget', () => {
  test('follows the foreground supported platform', () => {
    expect(
      chooseCompanionTarget(
        [target('win_qianniu'), target('win_wechat', true)],
        'follow',
        'win_qianniu',
      )?.platformId,
    ).toBe('win_wechat');
  });

  test('honors a locked platform even when another platform is foreground', () => {
    expect(
      chooseCompanionTarget(
        [target('win_wechat', true), target('win_wecom')],
        'win_wecom',
        'win_wechat',
      )?.platformId,
    ).toBe('win_wecom');
  });

  test('keeps the previous platform while a non-platform window is foreground', () => {
    expect(
      chooseCompanionTarget(
        [target('win_qianniu'), target('win_wechat')],
        'follow',
        'win_wechat',
      )?.platformId,
    ).toBe('win_wechat');
  });

  test('uses a deterministic fallback when no previous platform is available', () => {
    expect(
      chooseCompanionTarget(
        [target('win_wecom'), target('win_qianniu')],
        'follow',
      )?.platformId,
    ).toBe('win_qianniu');
  });
});

describe('companion docking preferences', () => {
  test('migrates a legacy Qianniu side without changing other platform defaults', () => {
    const state = normalizeCompanionDockState({ attached: true, side: 'left' });
    expect(state.targetMode).toBe('follow');
    expect(state.sideByPlatform).toEqual({ win_qianniu: 'left' });
    expect(resolveDockSide(state, 'win_qianniu')).toBe('left');
    expect(resolveDockSide(state, 'win_wechat')).toBe('right');
  });

  test('keeps independent sides for each platform', () => {
    const state = normalizeCompanionDockState({
      side: 'right',
      sideByPlatform: {
        win_qianniu: 'left',
        win_wechat: 'right',
        win_wecom: 'left',
      },
    });
    expect(resolveDockSide(state, 'win_qianniu')).toBe('left');
    expect(resolveDockSide(state, 'win_wechat')).toBe('right');
    expect(resolveDockSide(state, 'win_wecom')).toBe('left');
  });

  test('rejects invalid persisted platform modes', () => {
    const state = normalizeCompanionDockState({
      targetMode: 'unknown' as never,
      activePlatformId: 'invalid' as never,
    });
    expect(state.targetMode).toBe('follow');
    expect(state.activePlatformId).toBeUndefined();
  });
});

describe('WindowDockingService floating mode', () => {
  test('keeps following the foreground platform without moving the floating panel', async () => {
    const panel = {
      isDestroyed: () => false,
      setBounds: jest.fn(),
    };
    const locateTargets = jest.fn().mockResolvedValue([
      target('win_qianniu'),
      target('win_wechat', true),
    ]);
    const service = new WindowDockingService(
      panel as never,
      {
        attached: false,
        targetMode: 'follow',
        activePlatformId: 'win_qianniu',
      },
      locateTargets,
      0,
    );

    await (service as any).sync();
    await (service as any).sync();

    expect(service.getState().targetFound).toBe(true);
    expect(service.getState().activePlatformId).toBe('win_wechat');
    expect(panel.setBounds).not.toHaveBeenCalled();
  });
});
