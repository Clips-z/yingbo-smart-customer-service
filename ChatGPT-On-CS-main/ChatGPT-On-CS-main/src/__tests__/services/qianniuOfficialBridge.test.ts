import { QianniuOfficialBridge } from '../../main/backend/services/qianniuOfficialBridge';

describe('QianniuOfficialBridge', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('tracks a fresh official client and active contact', () => {
    const bridge = new QianniuOfficialBridge(5_000, 1_000);
    bridge.heartbeat('plugin-1', 'miniapp', 10_000);
    bridge.observeContact(
      {
        securityUID: 'open-uid-1',
        bizDomain: 'taobao',
        userNick: 'cntaobaoBuyer1',
      },
      10_100,
    );

    expect(bridge.getHealth(14_999)).toMatchObject({
      connected: true,
      clientId: 'plugin-1',
      runtime: 'miniapp',
      currentContact: {
        securityUID: 'open-uid-1',
        bizDomain: 'taobao',
        userNick: 'cntaobaoBuyer1',
      },
    });
    expect(bridge.getHealth(15_101).connected).toBe(false);
  });

  it('rejects fill when the expected contact does not match', async () => {
    const bridge = new QianniuOfficialBridge();
    bridge.heartbeat('plugin-1');
    bridge.observeContact({ securityUID: 'open-uid-1', bizDomain: 'taobao' });

    await expect(
      bridge.requestFill({
        expectedSecurityUID: 'open-uid-2',
        content: '您好',
      }),
    ).rejects.toThrow('官方桥接当前客户不匹配');
  });

  it('queues one verified fill command and resolves after completion', async () => {
    const bridge = new QianniuOfficialBridge();
    bridge.heartbeat('plugin-1');
    bridge.observeContact({
      securityUID: 'open-uid-1',
      bizDomain: 'taobao',
      userNick: 'cntaobaoBuyer1',
    });

    const completion = bridge.requestFill({
      expectedUserNick: 'cntaobaoBuyer1',
      content: '  您好，请问需要什么帮助？  ',
    });
    const command = bridge.pollCommand('plugin-1');

    expect(command).toMatchObject({
      type: 'fill',
      securityUID: 'open-uid-1',
      bizDomain: 'taobao',
      userNick: 'cntaobaoBuyer1',
      content: '您好，请问需要什么帮助？',
    });
    bridge.completeCommand('plugin-1', {
      commandId: command!.id,
      ok: true,
    });

    await expect(completion).resolves.toEqual({
      commandId: command!.id,
      ok: true,
    });
    expect(bridge.pollCommand('plugin-1')).toBeUndefined();
  });

  it('times out an unacknowledged command', async () => {
    jest.useFakeTimers();
    const bridge = new QianniuOfficialBridge(5_000, 100);
    bridge.heartbeat('plugin-1');
    bridge.observeContact({ securityUID: 'open-uid-1', bizDomain: 'taobao' });

    const completion = bridge.requestFill({
      expectedSecurityUID: 'open-uid-1',
      content: '您好',
    });
    jest.advanceTimersByTime(101);

    await expect(completion).rejects.toThrow('官方桥接填入超时');
  });

  it('opens a previously observed customer through an identity-bound focus command', async () => {
    const bridge = new QianniuOfficialBridge();
    bridge.heartbeat('plugin-1', 'miniapp');
    bridge.observeContact({
      securityUID: 'open-uid-a',
      bizDomain: 'taobao',
      userNick: 'cntaobaoBuyerA',
    });
    bridge.observeContact({
      securityUID: 'open-uid-b',
      bizDomain: 'taobao',
      userNick: 'cntaobaoBuyerB',
    });

    const completion = bridge.requestFocus('BuyerA');
    const command = bridge.pollCommand('plugin-1');

    expect(command).toMatchObject({
      type: 'focus',
      securityUID: 'open-uid-a',
      bizDomain: 'taobao',
      userNick: 'cntaobaoBuyerA',
    });
    expect(bridge.matchesCurrentContact('BuyerA')).toBe(false);
    bridge.completeCommand('plugin-1', { commandId: command!.id, ok: true });
    await expect(completion).resolves.toMatchObject({ ok: true });

    bridge.observeContact({
      securityUID: 'open-uid-a',
      bizDomain: 'taobao',
      userNick: 'cntaobaoBuyerA',
    });
    expect(bridge.matchesCurrentContact('BuyerA')).toBe(true);
  });

  it('does not guess a security identity for an unseen customer', async () => {
    const bridge = new QianniuOfficialBridge();
    bridge.heartbeat('plugin-1', 'legacy-jssdk');

    await expect(bridge.requestFocus('unknown-buyer')).rejects.toThrow(
      '尚未缓存目标客户身份',
    );
  });
});
