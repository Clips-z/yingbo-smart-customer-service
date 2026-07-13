import { DataTypes, Model, Sequelize } from 'sequelize';
import {
  encryptString,
  decryptString,
  isEncrypted,
  isEncryptionAvailable,
  SENSITIVE_FIELDS,
} from '../../utils/secureStorage';

// Extend the Model class with the attributes interface
export class Config extends Model {
  declare qianniu_reply_mode: string;

  declare wechat_reply_mode: string;

  declare wecom_reply_mode: string;

  declare wechat_unattended_enabled: boolean;

  declare wecom_unattended_enabled: boolean;

  declare qianniu_unattended_enabled: boolean;

  declare id: number;

  declare global: boolean;

  declare active: boolean;

  declare platform: string;

  declare platform_id: string;

  declare instance_id: string;

  declare use_plugin: boolean;

  declare plugin_id: number;

  declare extract_phone: boolean;

  declare extract_product: boolean;

  declare save_path: string;

  declare reply_speed: number;

  declare reply_random_speed: number;

  declare context_count: number;

  declare wait_humans_time: number;

  declare default_reply: string;

  declare base_url: string;

  declare key: string;

  declare llm_type: string;

  declare model: string;

  declare system_prompt: string;

  declare knowledge_base: string;

  declare coze_bot_id: string;

  declare coze_user_id: string;

  declare coze_token: string;

  declare coze_api_base: string;

  declare activation_code: string;

  declare version: string;

  declare has_paused: boolean;

  declare has_keyword_match: boolean;

  declare has_use_gpt: boolean;

  declare has_mouse_close: boolean; // 鼠标移动时是否自动关闭

  declare has_esc_close: boolean; // 按ESC键是否自动关闭

  declare truncate_word_count: number; // 截断词数

  declare truncate_word_key: string; // 截断词

  declare has_transfer: boolean; // 是否开启关键词转接给其它客服

  declare has_replace: boolean; // 是否开启关键词替换

  declare jinritemai_default_reply_match: string; // 抖店默认回复

  declare rag_enabled: boolean; // RAG 向量检索知识库开关
}

export async function checkAndAddFields(sequelize: Sequelize) {
  const tableDescription = await Config.describe();

  // @ts-ignore
  if (!tableDescription.qianniu_reply_mode) {
    await sequelize
      .getQueryInterface()
      .addColumn('n_config', 'qianniu_reply_mode', {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'hint',
      });
  }

  // @ts-ignore
  if (!tableDescription.wechat_reply_mode) {
    await sequelize
      .getQueryInterface()
      .addColumn('n_config', 'wechat_reply_mode', {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'hint',
      });
  }

  // @ts-ignore
  if (!tableDescription.wecom_reply_mode) {
    await sequelize
      .getQueryInterface()
      .addColumn('n_config', 'wecom_reply_mode', {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'hint',
      });
  }

  // @ts-ignore
  if (!tableDescription.wechat_unattended_enabled) {
    await sequelize
      .getQueryInterface()
      .addColumn('n_config', 'wechat_unattended_enabled', {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
  }

  // @ts-ignore
  if (!tableDescription.wecom_unattended_enabled) {
    await sequelize
      .getQueryInterface()
      .addColumn('n_config', 'wecom_unattended_enabled', {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
  }

  // @ts-ignore
  if (!tableDescription.qianniu_unattended_enabled) {
    await sequelize
      .getQueryInterface()
      .addColumn('n_config', 'qianniu_unattended_enabled', {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
  }

  const llmTextFields = [
    ['system_prompt', DataTypes.TEXT],
    ['knowledge_base', DataTypes.TEXT],
    ['coze_bot_id', DataTypes.STRING(255)],
    ['coze_user_id', DataTypes.STRING(255)],
    ['coze_token', DataTypes.STRING(1024)],
    ['coze_api_base', DataTypes.STRING(255)],
  ] as const;
  for (const [field, type] of llmTextFields) {
    // @ts-ignore
    if (!tableDescription[field]) {
      // eslint-disable-next-line no-await-in-loop
      await sequelize.getQueryInterface().addColumn('n_config', field, {
        type,
        allowNull: true,
        defaultValue: '',
      });
    }
  }

  // @ts-ignore
  if (!tableDescription.has_esc_close) {
    await sequelize.getQueryInterface().addColumn('n_config', 'has_esc_close', {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: true,
    });
  }

  // @ts-ignore
  if (!tableDescription.truncate_word_count) {
    await sequelize
      .getQueryInterface()
      .addColumn('n_config', 'truncate_word_count', {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 4000,
      });
  }

  // @ts-ignore
  if (!tableDescription.truncate_word_key) {
    await sequelize
      .getQueryInterface()
      .addColumn('n_config', 'truncate_word_key', {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: '',
      });
  }

  // @ts-ignore
  if (!tableDescription.has_transfer) {
    await sequelize.getQueryInterface().addColumn('n_config', 'has_transfer', {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: true,
    });
  }

  // @ts-ignore
  if (!tableDescription.has_replace) {
    await sequelize.getQueryInterface().addColumn('n_config', 'has_replace', {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: true,
    });
  }

  // @ts-ignore
  if (!tableDescription.jinritemai_default_reply_match) {
    await sequelize
      .getQueryInterface()
      .addColumn('n_config', 'jinritemai_default_reply_match', {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: '很高兴为您服务，请问有什么可以帮您？',
      });
  }

  // @ts-ignore
  if (!tableDescription.rag_enabled) {
    await sequelize.getQueryInterface().addColumn('n_config', 'rag_enabled', {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
    });
  }
}

export function initConfig(sequelize: Sequelize) {
  Config.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      global: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: true,
      },
      active: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: true,
      },
      platform: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      platform_id: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      instance_id: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      use_plugin: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: true,
      },
      plugin_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      extract_phone: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: true,
      },
      extract_product: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: true,
      },
      save_path: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      reply_speed: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
      reply_random_speed: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
      default_reply: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: '当前消息有点多，我稍后再回复你',
      },
      context_count: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
      wait_humans_time: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
      base_url: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      key: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      llm_type: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: 'chatgpt',
      },
      model: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: 'gpt-3.5-turbo',
      },
      system_prompt: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: '',
      },
      knowledge_base: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: '',
      },
      coze_bot_id: {
        type: DataTypes.STRING(255),
        allowNull: true,
        defaultValue: '',
      },
      coze_user_id: {
        type: DataTypes.STRING(255),
        allowNull: true,
        defaultValue: '',
      },
      coze_token: {
        type: DataTypes.STRING(1024),
        allowNull: true,
        defaultValue: '',
      },
      coze_api_base: {
        type: DataTypes.STRING(255),
        allowNull: true,
        defaultValue: 'https://api.coze.cn',
      },
      activation_code: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      version: {
        type: DataTypes.STRING(255),
        defaultValue: '1.0.0',
        allowNull: true,
      },
      has_paused: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        allowNull: true,
      },
      has_keyword_match: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        allowNull: true,
      },
      has_use_gpt: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        allowNull: true,
      },
      has_mouse_close: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        allowNull: true,
      },
      has_esc_close: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        allowNull: true,
      },
      truncate_word_count: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 4000,
      },
      truncate_word_key: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: '',
      },
      has_transfer: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        allowNull: true,
      },
      has_replace: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        allowNull: true,
      },
      jinritemai_default_reply_match: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: '很高兴为您服务，请问有什么可以帮您？',
      },
      rag_enabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: true,
      },
      qianniu_reply_mode: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'assist',
      },
      wechat_reply_mode: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'assist',
      },
      wecom_reply_mode: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'hint',
      },
      wechat_unattended_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      wecom_unattended_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      qianniu_unattended_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    },
    {
      sequelize,
      modelName: 'Config',
      tableName: 'n_config',
      timestamps: false,
      hooks: {},
    },
  );

  // checkAndAddFields 必须在 sequelize.sync() 之后调用，由 ormconfig.ts 负责调用
}

/**
 * 一次性迁移：解密之前被 safeStorage 加密的敏感字段，恢复为明文。
 * 仅对 enc:: 前缀的记录执行，明文记录跳过。
 */
export async function migrateEncryptedFields(sequelize: Sequelize) {
  if (!isEncryptionAvailable()) {
    console.warn('[Config] safeStorage 不可用，跳过解密迁移');
    return;
  }
  try {
    const [results] = await sequelize.query(
      `SELECT id, \`key\`, coze_token FROM n_config WHERE \`key\` LIKE 'enc::%' OR coze_token LIKE 'enc::%'`,
    );
    const rows = results as Array<{ id: number; key: string | null; coze_token: string | null }>;
    let migrated = 0;
    for (const row of rows) {
      const updates: string[] = [];
      const params: (string | number)[] = [];
      if (row.key && row.key.startsWith('enc::')) {
        const plain = decryptString(row.key);
        if (plain) {
          updates.push('`key` = ?');
          params.push(plain);
        }
      }
      if (row.coze_token && row.coze_token.startsWith('enc::')) {
        const plain = decryptString(row.coze_token);
        if (plain) {
          updates.push('coze_token = ?');
          params.push(plain);
        }
      }
      if (updates.length > 0) {
        params.push(row.id);
        await sequelize.query(
          `UPDATE n_config SET ${updates.join(', ')} WHERE id = ?`,
          { replacements: params },
        );
        migrated += 1;
      }
    }
    if (migrated > 0) {
      console.log(`[Config] 已解密 ${migrated} 条记录的敏感字段，恢复为明文`);
    }
  } catch (e) {
    console.error('[Config] 敏感字段解密失败:', e);
  }
}
