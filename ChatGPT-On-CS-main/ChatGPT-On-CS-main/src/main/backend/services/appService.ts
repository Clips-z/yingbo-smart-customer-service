import { Sequelize, Transaction } from 'sequelize';
import { DispatchService } from './dispatchService';
import { Instance } from '../entities/instance';
import { Config } from '../entities/config';
import { Plugin } from '../entities/plugin';

const LOCAL_COMPAT_PLATFORM_IDS = new Set([
  'win_qianniu',
  'win_jinmai',
  'win_wechat',
  'win_wecom',
  'win_pdd',
  'win_douyin',
]);

export class AppService {
  private dispatchService: DispatchService;

  private sequelize: Sequelize;

  constructor(dispatchService: DispatchService, sequelize: Sequelize) {
    this.dispatchService = dispatchService;
    this.sequelize = sequelize;
  }

  public async getTasks(): Promise<
    {
      task_id: string;
      env_id: string;
      app_id: string;
    }[]
  > {
    const instances = await Instance.findAll();
    return instances.map((instance) => ({
      task_id: String(instance.id),
      env_id: instance.env_id,
      app_id: instance.app_id,
    }));
  }

  /**
   * 初始化全部任务
   */
  public async initTasks(): Promise<void> {
    await this.dispatchService.syncConfig();
  }

  /**
   * 添加一个任务
   */
  public async addTask(appId: string): Promise<Instance | null> {
    // 使用事务
    const instance = await this.sequelize
      .transaction(async (t: Transaction) => {
        const instance = await Instance.create(
          {
            app_id: appId,
            created_at: new Date(),
          },
          { transaction: t },
        );

        const tasks = await Instance.findAll({ transaction: t });
        const result = await this.dispatchService.updateTasks(tasks);
        const isLocalCompat = LOCAL_COMPAT_PLATFORM_IDS.has(appId);
        if (!result && !isLocalCompat) {
          throw new Error('Failed to create collector task');
        }

        if (Array.isArray(result)) {
          const failedTask = result.find((task) => task.error);
          if (failedTask && !isLocalCompat) {
            throw new Error(failedTask.error);
          }

          const target = result.find(
            (task) => String(task.task_id) === String(instance.id),
          );
          instance.env_id = target?.env_id || String(instance.id);
        } else {
          // The bundled collector applies the task but acknowledges without data.
          instance.env_id = String(instance.id);
        }
        await instance.save({ transaction: t });

        if (isLocalCompat) {
          const [config] = await Config.findOrCreate({
            where: { platform_id: appId, instance_id: '' },
            defaults: {
              platform_id: appId,
              instance_id: '',
              global: false,
              active: true,
            },
            transaction: t,
          });
          if (!config.active) {
            await config.update({ active: true }, { transaction: t });
          }
        }
        return instance;
      })
      .catch((error) => {
        // 处理错误
        console.error('Transaction failed:', error);
        throw error; // 可根据需求自定义错误处理逻辑
      });

    await this.dispatchService.syncConfig();
    return instance;
  }

  /**
   * 移除一个任务
   */
  public async removeTask(taskId: string): Promise<boolean> {
    const instance = await Instance.findByPk(taskId);

    if (!instance) {
      return false;
    }

    await instance.destroy();

    // 找到对应的 Config 删除
    const config = await Config.findOne({
      where: { instance_id: taskId },
    });
    if (config) {
      // 检查是否使用插件
      if (config.plugin_id) {
        const plugin = await Plugin.findOne({
          where: { id: config.plugin_id },
        });
        if (plugin) {
          await plugin.destroy();
        }
      }

      await config.destroy();
    }

    await this.dispatchService.syncConfig();
    return true;
  }
}
