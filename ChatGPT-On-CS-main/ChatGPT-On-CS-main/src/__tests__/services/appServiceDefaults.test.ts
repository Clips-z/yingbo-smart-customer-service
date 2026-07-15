import { AppService } from '../../main/backend/services/appService';
import { Instance } from '../../main/backend/entities/instance';
import { Config } from '../../main/backend/entities/config';

describe('AppService local compatibility defaults', () => {
  afterEach(() => jest.restoreAllMocks());

  function createService() {
    return new AppService(
      { syncConfig: jest.fn() } as any,
      { transaction: jest.fn() } as any,
    );
  }

  it('creates a missing Qianniu task once', async () => {
    const service = createService();
    const created = { id: 7, app_id: 'win_qianniu' } as Instance;
    jest.spyOn(Instance, 'findOne').mockResolvedValue(null);
    const addTask = jest.spyOn(service, 'addTask').mockResolvedValue(created);

    await expect(service.ensureLocalCompatTask('win_qianniu')).resolves.toBe(
      created,
    );
    expect(addTask).toHaveBeenCalledWith('win_qianniu');
  });

  it('preserves an existing task and activates its platform config', async () => {
    const service = createService();
    const existing = { id: 3, app_id: 'win_qianniu' } as Instance;
    const update = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(Instance, 'findOne').mockResolvedValue(existing);
    jest.spyOn(Config, 'findOrCreate').mockResolvedValue([
      { active: false, update } as any,
      false,
    ]);
    const addTask = jest.spyOn(service, 'addTask');

    await expect(service.ensureLocalCompatTask('win_qianniu')).resolves.toBe(
      existing,
    );
    expect(addTask).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({ active: true });
  });

  it('rejects platforms that are not bundled local collectors', async () => {
    const service = createService();
    await expect(service.ensureLocalCompatTask('cloud_unknown')).rejects.toThrow(
      'Unsupported local compatibility platform',
    );
  });
});
