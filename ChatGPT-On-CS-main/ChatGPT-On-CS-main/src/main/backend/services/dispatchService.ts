import socketIo from 'socket.io';
import { BrowserWindow } from 'electron';
import { Platform, ReplyDTO, StrategyServiceStatusEnum } from '../types';
import { emitAndWait } from '../../utils';
import { MessageService } from './messageService';
import PluginService from './pluginService';
import { ConfigController } from '../controllers/configController';
import { MessageController } from '../controllers/messageController';
import { Instance } from '../entities/instance';
import { CTX_APP_ID, CTX_INSTANCE_ID, PluginDefaultRunCode } from '../constants';
import { LoggerService } from './loggerService';
import { getPlatformStatuses } from './platformRuntimeService';

export class DispatchService {
  // TypeScript 构造函数参数修饰符已自动完成赋值，无需手动 this.x = x
  constructor(
    private mainWindow: BrowserWindow,
    private log: LoggerService,
    private io: socketIo.Server,
    private configController: ConfigController,
    private messageService: MessageService,
    private messageController: MessageController,
    private pluginService: PluginService,
  ) {}

  public registerHandlers(socket: socketIo.Socket): void {
    socket.on('messageService-broadcast', async (msg: any, callback) => {
      const { event, data } = msg;
      if (event === 'key_esc') {
        const change = await this.configController.escKeyDowHandler();
        if (change) {
          this.syncConfig();
          this.receiveBroadcast({
            event: 'has_paused',
            data: {},
          });
        }
      } else {
        this.receiveBroadcast(msg);
      }

      callback({
        event,
        data,
      });
    });

    socket.on('messageService-getMessages', async (data, callback) => {
      const reply = await this.createReply(data);
      callback(reply);
    });
  }

  public async createReply(data: {
    ctx: Record<string, string>;
    msgs: Array<{
      sender: string;
      content: string;
      role: 'SELF' | 'OTHER' | 'SYSTEM';
      type: 'TEXT' | 'IMAGE' | 'VIDEO' | 'FILE' | 'NO_REPLY';
    }>;
  }): Promise<ReplyDTO> {
    const { ctx, msgs } = data;
    const ctxMap = new Map<string, string>();
    Object.keys(ctx).forEach((key) => {
      ctxMap.set(key, ctx[key]);
    });

    let reply: ReplyDTO;
    const cfg = await this.configController.get(ctxMap);
    const appId = ctxMap.get(CTX_APP_ID);
    const instanceId = ctxMap.get(CTX_INSTANCE_ID);

    const isActive = await this.configController.checkConfigActive({
      appId,
      instanceId,
    });
    if (!isActive) {
      this.log.info(`平台 ${appId || 'global'} 未激活，跳过回复生成`);
      return {
        type: 'NO_REPLY',
        content: '',
        source: 'default',
        safeToAutoSend: false,
      };
    }

    if (!cfg.has_use_gpt) {
      this.log.info(`平台 ${appId || 'global'} 未启用 GPT，跳过回复生成`);
      return {
        type: 'NO_REPLY',
        content: '',
        source: 'default',
        safeToAutoSend: false,
      };
    }

    await this.messageService.extractMsgInfo(cfg, ctxMap, msgs);
    const history = await this.messageController.getConversationMessages(
      ctxMap,
      Math.max(cfg.context_count || 0, 0),
    );
    const contextualMessages = [...history, ...msgs];

    try {
      if (cfg.use_plugin && cfg.plugin_id) {
        reply = await this.pluginService.executePlugin(
          cfg.plugin_id,
          ctxMap,
          contextualMessages,
        );
        reply = {
          ...reply,
          source: reply.source || 'plugin',
          safeToAutoSend: reply.safeToAutoSend ?? true,
        };
        this.log.info(`使用自定义插件回复: ${reply.content}`);
      } else {
        const replyData = await this.pluginService.executePluginCode(
          PluginDefaultRunCode,
          ctxMap,
          contextualMessages,
        );
        reply = replyData.data;
      }
    } catch (error) {
      console.error('Failed to execute plugin', error);
      this.log.error(
        `回复失败: ${
          error instanceof Error ? error.message : String(error)
        }，使用默认回复`,
      );
      reply = await this.messageService.getDefaultReply(cfg);
    }

    if (reply.type !== 'NO_REPLY') {
      await this.messageController.saveMessages(ctxMap, reply, msgs);
    }
    return reply;
  }

  public receiveBroadcast(msg: any): void {
    this.mainWindow.webContents.send('broadcast', msg);
  }

  public async checkHealth(): Promise<boolean> {
    // 如果没有 Socket.IO 客户端连接（Python 后端未运行），直接返回 false
    if (this.io.sockets.sockets.size === 0) {
      return false;
    }
    try {
      await emitAndWait(this.io, 'systemService-health', undefined, 5000);
      return true;
    } catch (error) {
      console.error('Failed to check health', error);
      return false;
    }
  }

  public async syncConfig(): Promise<boolean> {
    // 如果没有 Socket.IO 客户端连接（Python 后端未运行），直接返回 false
    if (this.io.sockets.sockets.size === 0) {
      return false;
    }
    try {
      const driverCfg = await this.configController.getConfigByType({
        appId: undefined,
        instanceId: undefined,
        type: 'driver',
      });

      if (!driverCfg) {
        return false;
      }

      // 类型守卫：确保获取到的是 DriverConfig
      const hasPaused =
        'hasPaused' in driverCfg
          ? (driverCfg as { hasPaused: boolean }).hasPaused
          : false;

      const genericCfg = await this.configController.getConfigByType({
        appId: undefined,
        instanceId: undefined,
        type: 'generic',
      });

      if (!genericCfg) {
        return false;
      }

      // 类型守卫：确保获取到的是 GenericConfig
      const jdr =
        'jinritemaiDefaultReplyMatch' in genericCfg
          ? ((genericCfg as { jinritemaiDefaultReplyMatch: string })
              .jinritemaiDefaultReplyMatch ??
            '很高兴为您服务，请问有什么可以帮您？')
          : '很高兴为您服务，请问有什么可以帮您？';

      const twkey =
        'truncateWordKey' in genericCfg
          ? ((genericCfg as { truncateWordKey: string }).truncateWordKey ?? '')
          : '';

      const twcount =
        'truncateWordCount' in genericCfg
          ? ((genericCfg as { truncateWordCount: number }).truncateWordCount ??
            210)
          : 210;

      await emitAndWait(this.io, 'strategyService-updateStatus', {
        status: hasPaused
          ? StrategyServiceStatusEnum.STOPPED
          : StrategyServiceStatusEnum.RUNNING,
        jdr,
        twkey,
        twcount,
      });

      const instances = await Instance.findAll();
      await this.updateTasks(instances);
      return true;
    } catch (error) {
      console.error('Failed to sync config', error);
      return false;
    }
  }

  public async runTask(appId?: string): Promise<void> {
    if (this.io.sockets.sockets.size === 0) {
      throw new Error('后端组件尚未连接，请稍后重试');
    }

    this.io.emit('strategyService-run');
  }

  public async stopTask(appId?: string): Promise<void> {
    if (this.io.sockets.sockets.size === 0) {
      return;
    }

    this.io.emit('strategyService-stop');
  }

  public async updateTasks(tasks: Instance[]): Promise<
    | {
        task_id: string;
        env_id: string;
        error?: string;
      }[]
    | null
  > {
    // 如果没有 Socket.IO 客户端连接（Python 后端未运行），直接返回 null
    if (this.io.sockets.sockets.size === 0) {
      return null;
    }
    try {
      return await emitAndWait(
        this.io,
        'strategyService-updateTasks',
        {
          tasks: tasks.map((task) => ({
            task_id: task.id,
            app_id: task.app_id,
            env_id: task.env_id,
          })),
        },
        5000,
      );
    } catch (error) {
      console.error('Failed to add task', error);
      return null;
    }
  }

  public async getAllPlatforms(): Promise<Platform[]> {
    return getPlatformStatuses();
  }
}
