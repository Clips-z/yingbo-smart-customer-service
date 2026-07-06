import { Op } from 'sequelize';
import { Config } from '../entities/config';
import { Plugin } from '../entities/plugin';
import {
  Context,
  GenericConfig,
  LLMConfig,
  AccountConfig,
  PluginConfig,
  DriverConfig,
} from '../types';
import { CTX_APP_ID, CTX_INSTANCE_ID } from '../constants';

export class ConfigController {
  /**
   * 取得适合当前聊天上下文的配置
   * @param ctx 聊天上下文
   * @returns
   */
  public async get(ctx: Context): Promise<Config> {
    const appId = ctx.get(CTX_APP_ID);
    const instanceId = ctx.get(CTX_INSTANCE_ID);

    let config;

    // 先查找实例配置
    if (instanceId) {
      config = await Config.findOne({
        where: { platform_id: appId, instance_id: instanceId },
      });

      // 如果实例配置存在且激活，直接返回
      if (config && config.active) {
        return this.mergeWithGlobalConfig(config);
      }
    }

    // 查找应用级别配置
    if (appId) {
      config = await Config.findOne({
        where: {
          platform_id: appId,
          instance_id: {
            [Op.or]: ['', null],
          },
        },
      });

      // 如果应用级别配置存在且激活，直接返回
      if (config && config.active) {
        return this.mergeWithGlobalConfig(config);
      }
    }

    // 查找全局配置
    config = await Config.findOne({
      where: { global: true },
    });

    // 如果全局配置不存在，创建一个默认的全局配置
    if (!config) {
      config = await Config.create({
        global: true,
      });
    }

    return this.mergeWithGlobalConfig(config);
  }

  /**
   * 合并全局配置到指定配置
   * @param config 指定的配置
   * @returns 合并后的配置
   */
  private async mergeWithGlobalConfig(config: Config): Promise<Config> {
    const globalConfig = await Config.findOne({
      where: { global: true },
    });

    if (globalConfig) {
      // 开关类字段：平台级自己管理，不从全局覆盖
      // （has_paused / has_use_gpt / has_keyword_match 等都是按平台独立控制的）
      // 只在平台级未设置时才继承全局
      if (!config.has_keyword_match && globalConfig.has_keyword_match) {
        config.has_keyword_match = globalConfig.has_keyword_match;
      }
      if (!config.has_use_gpt && globalConfig.has_use_gpt) {
        config.has_use_gpt = globalConfig.has_use_gpt;
      }
      if (!config.has_mouse_close && globalConfig.has_mouse_close) {
        config.has_mouse_close = globalConfig.has_mouse_close;
      }
      if (!config.has_esc_close && globalConfig.has_esc_close) {
        config.has_esc_close = globalConfig.has_esc_close;
      }

      // LLM 字段：按供应商分组继承，避免把全局的 key 发到另一个服务商导致 401
      const localLLMType = config.llm_type;
      const globalLLMType = globalConfig.llm_type;
      if (!localLLMType && globalLLMType) {
        // 本地未设置模型类型，完整继承全局 LLM 配置
        config.llm_type = globalLLMType;
        config.model = globalConfig.model;
        config.key = globalConfig.key;
        config.base_url = globalConfig.base_url;
        config.coze_bot_id = globalConfig.coze_bot_id;
        config.coze_user_id = globalConfig.coze_user_id;
        config.coze_token = globalConfig.coze_token;
        config.coze_api_base = globalConfig.coze_api_base;
      } else if (localLLMType === globalLLMType) {
        // 同一供应商，缺失字段才继承全局
        config.model = config.model || globalConfig.model || '';
        config.key = config.key || globalConfig.key || '';
        config.base_url = config.base_url || globalConfig.base_url || '';
        config.coze_bot_id = config.coze_bot_id || globalConfig.coze_bot_id || '';
        config.coze_user_id =
          config.coze_user_id || globalConfig.coze_user_id || '';
        config.coze_token = config.coze_token || globalConfig.coze_token || '';
        config.coze_api_base =
          config.coze_api_base ||
          globalConfig.coze_api_base ||
          'https://api.coze.cn';
      }
      // 供应商不同时，不继承 key/baseUrl/model 等凭据，防止跨站发错

      // 人设与知识库文本属于通用提示，允许跨模型继承
      config.system_prompt =
        config.system_prompt || globalConfig.system_prompt || '';
      config.knowledge_base =
        config.knowledge_base || globalConfig.knowledge_base || '';
    }

    return config;
  }

  /**
   * 激活或关闭配置
   * @param
   * @returns
   */
  public async activeConfig({
    active,
    appId,
    instanceId,
  }: {
    active: boolean;
    appId: string | undefined;
    instanceId: string | undefined;
  }): Promise<void> {
    let config = null;

    // 优先查找/创建实例级配置
    if (instanceId && appId) {
      config = await Config.findOne({
        where: { platform_id: appId, instance_id: instanceId },
      });

      if (!config) {
        config = await Config.create({
          platform_id: appId,
          instance_id: instanceId,
        });
      }
    }

    // 否则查找/创建应用级配置
    if (!config && appId) {
      config = await Config.findOne({
        where: {
          platform_id: appId,
          instance_id: {
            [Op.or]: ['', null],
          },
        },
      });

      if (!config) {
        config = await Config.create({
          platform_id: appId,
          instance_id: '',
        });
      }
    }

    // 更新配置
    if (config) {
      await config.update({ active });
    }
  }

  /**
   * 取得自定义插件
   * @param
   * @returns
   */
  public async getAllCustomPlugins(): Promise<Plugin[]> {
    const plugins = await Plugin.findAll();
    return plugins;
  }

  /**
   * 取得插件配置
   * @param pluginId
   * @returns
   */
  public async getPluginConfig(pluginId: number): Promise<Plugin | null> {
    const plugin = await Plugin.findByPk(pluginId);
    return plugin;
  }

  /**
   * 新增自定义插件
   * @param
   * @returns
   */
  public async createCustomPlugin({
    source,
    author,
    description,
    icon,
    tags,
    title,
    code,
  }: {
    source?: string;
    author?: string;
    description?: string;
    icon?: string;
    tags?: string;
    title: string;
    code: string;
  }) {
    const plugin = await Plugin.create({
      source: source || 'custom',
      author,
      description,
      icon,
      tags,
      type: 'plugin',
      title,
      code,
    });

    return plugin;
  }

  /**
   * 删除自定义插件
   * @param
   * @returns
   */
  public async deleteCustomPlugin(pluginId: number) {
    const plugin = await Plugin.findByPk(pluginId);
    if (plugin) {
      await plugin.destroy();
    }
  }

  /**
   * 更新自定义插件
   * @param
   * @returns
   */
  public async updateCustomPlugin({
    pluginId,
    code,
    description,
    icon,
    tags,
    title,
  }: {
    pluginId: number;
    code: string;
    description: string;
    icon: string;
    tags: string;
    title: string;
  }) {
    const plugin = await Plugin.findByPk(pluginId);
    if (plugin) {
      await plugin.update({
        code,
        description,
        icon,
        tags,
        title,
      });
    }
  }

  /**
   * 检查配置是否激活
   * @param
   * @returns
   */
  public async checkConfigActive({
    appId,
    instanceId,
  }: {
    appId: string | undefined;
    instanceId: string | undefined;
  }): Promise<boolean> {
    const config = await this.findConfig(appId, instanceId);
    return config?.active || false;
  }

  /**
   * 取得指定类型的配置
   * @param appId
   * @param instanceId
   * @param type
   * @returns
   */
  public async getConfigByType({
    appId,
    instanceId,
    type,
  }: {
    appId: string | undefined;
    instanceId: string | undefined;
    type: 'generic' | 'llm' | 'plugin' | 'driver' | 'account';
  }): Promise<
    | GenericConfig
    | LLMConfig
    | AccountConfig
    | PluginConfig
    | DriverConfig
    | undefined
  > {
    const config = await this.findConfig(appId, instanceId);
    // 关键：LLM 字段（key/system_prompt 等）允许全局兜底，
    // 因此设置页里看到空配置时仍显示全局配置的值。
    const merged = await this.mergeWithGlobalConfig(config);

    if (type === 'generic') {
      return {
        appId: merged.platform_id || '',
        instanceId: merged.instance_id || '',
        extractPhone: merged.extract_phone || false,
        extractProduct: merged.extract_product || false,
        savePath: merged.save_path || '',
        replySpeed: merged.reply_speed || 0,
        replyRandomSpeed: merged.reply_random_speed || 0,
        contextCount: merged.context_count || 0,
        waitHumansTime: merged.wait_humans_time || 0,
        defaultReply: merged.default_reply || '',
        truncateWordCount: merged.truncate_word_count || 0,
        truncateWordKey: merged.truncate_word_key || '',
        jinritemaiDefaultReplyMatch:
          merged.jinritemai_default_reply_match || '',
      };
    }

    if (type === 'llm') {
      return {
        appId: merged.platform_id || '',
        instanceId: merged.instance_id || '',
        baseUrl: merged.base_url || '',
        key: merged.key || '',
        llmType: merged.llm_type || 'chatgpt',
        model: merged.model || 'gpt-3.5-turbo',
        systemPrompt: merged.system_prompt || '',
        knowledgeBase: merged.knowledge_base || '',
        ragEnabled: merged.rag_enabled || false,
        cozeBotId: merged.coze_bot_id || '',
        cozeUserId: merged.coze_user_id || '',
        cozeToken: merged.coze_token || '',
        cozeApiBase: merged.coze_api_base || 'https://api.coze.cn',
      };
    }

    if (type === 'plugin') {
      return {
        appId: merged.platform_id || '',
        instanceId: merged.instance_id || '',
        usePlugin: merged.use_plugin || false,
        pluginId: merged.plugin_id || 0,
      };
    }

    if (type === 'driver') {
      return {
        hasPaused: merged.has_paused || false,
        hasKeywordMatch: merged.has_keyword_match || false,
        hasUseGpt: merged.has_use_gpt || false,
        hasMouseClose: merged.has_mouse_close || false,
        hasEscClose: merged.has_esc_close || false,
        hasTransfer: merged.has_transfer || false,
        hasReplace: merged.has_replace || false,
      };
    }

    return {
      activationCode: merged.activation_code || '',
    };
  }

  /**
   * 更新配置
   * @param
   */
  public async updateConfigByType({
    appId,
    instanceId,
    type,
    cfg,
  }: {
    appId: string | undefined;
    instanceId: string | undefined;
    type: string;
    cfg:
      | GenericConfig
      | LLMConfig
      | AccountConfig
      | PluginConfig
      | DriverConfig;
  }) {
    let dbConfig = await this.findConfig(appId, instanceId);
    if (!dbConfig) {
      return;
    }

    if (type === 'generic') {
      const config = cfg as GenericConfig;
      await dbConfig.update({
        extract_phone: config.extractPhone,
        extract_product: config.extractProduct,
        save_path: config.savePath,
        reply_speed: config.replySpeed,
        reply_random_speed: config.replyRandomSpeed,
        context_count: config.contextCount,
        wait_humans_time: config.waitHumansTime,
        default_reply: config.defaultReply,
        truncate_word_count: config.truncateWordCount,
        truncate_word_key: config.truncateWordKey,
        jinritemai_default_reply_match: config.jinritemaiDefaultReplyMatch,
      });
    } else if (type === 'llm') {
      const config = cfg as LLMConfig;
      await dbConfig.update({
        base_url: config.baseUrl,
        key: config.key,
        llm_type: config.llmType,
        model: config.model,
        system_prompt: config.systemPrompt.trim().slice(0, 8000),
        knowledge_base: config.knowledgeBase.trim().slice(0, 30000),
        rag_enabled: config.ragEnabled || false,
        coze_bot_id: config.cozeBotId.trim().slice(0, 255),
        coze_user_id: config.cozeUserId.trim().slice(0, 255),
        coze_token: config.cozeToken.trim().slice(0, 1024),
        coze_api_base:
          config.cozeApiBase === 'https://api.coze.com'
            ? 'https://api.coze.com'
            : 'https://api.coze.cn',
      });
    } else if (type === 'plugin') {
      const config = cfg as PluginConfig;
      // 使用新传入的 usePlugin 值（而非数据库旧值）来决定是否保存 pluginId
      const pluginId = config.usePlugin ? config.pluginId : null;

      await dbConfig.update({
        use_plugin: config.usePlugin,
        plugin_id: pluginId,
      });
    } else if (type === 'driver') {
      // TODO: 目前只有全局配置，后续再实现实例配置
      const config = cfg as DriverConfig;
      dbConfig = await Config.findOne({
        where: { global: true },
      });
      if (!dbConfig) {
        throw new Error('Driver config not found');
      }
      await dbConfig.update({
        has_paused: config.hasPaused,
        has_keyword_match: config.hasKeywordMatch,
        has_use_gpt: config.hasUseGpt,
        has_mouse_close: config.hasMouseClose,
        has_esc_close: config.hasEscClose,
        has_transfer: config.hasTransfer,
        has_replace: config.hasReplace,
      });
    } else {
      const config = cfg as AccountConfig;
      await dbConfig.update({
        activation_code: config.activationCode,
      });
    }
  }

  /**
   * 更新配置
   * @param
   */
  public async moveMouseHandler(): Promise<boolean> {
    const dbConfig = await Config.findOne({
      where: { global: true },
    });

    if (!dbConfig) {
      return false;
    }

    // 检查是否开启了鼠标移动自动暂停功能
    if (dbConfig.has_mouse_close) {
      if (!dbConfig.has_paused) {
        await dbConfig.update({
          has_paused: true,
        });

        return true;
      }
    }

    return false;
  }

  public async escKeyDowHandler(): Promise<boolean> {
    const dbConfig = await Config.findOne({
      where: { global: true },
    });

    if (!dbConfig) {
      return false;
    }

    // 检查是否开启了 ESC 键自动暂停功能
    if (dbConfig.has_esc_close) {
      if (!dbConfig.has_paused) {
        await dbConfig.update({
          has_paused: true,
        });

        return true;
      }
    }

    return false;
  }

  /**
   * 查找配置
   * @param appId
   * @param instanceId
   * @returns
   */
  private async findConfig(
    appId: string | undefined,
    instanceId: string | undefined,
  ): Promise<Config | null> {
    let config = null;
    if (instanceId && appId) {
      config = await Config.findOne({
        where: { platform_id: appId, instance_id: instanceId },
      });

      if (config && config.active) {
        return config;
      }
    }

    if (appId) {
      config = await Config.findOne({
        where: {
          platform_id: appId,
          instance_id: {
            [Op.or]: ['', null],
          },
        },
      });

      if (config && config.active) {
        return config;
      }
    }

    if (!config) {
      config = await Config.findOne({
        where: { global: true },
      });
    }

    return config;
  }
}
