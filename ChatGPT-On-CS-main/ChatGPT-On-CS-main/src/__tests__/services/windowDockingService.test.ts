import { calculateDockedBounds } from '../../main/services/windowDockingService';

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

