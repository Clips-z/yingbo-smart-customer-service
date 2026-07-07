/**
 * 重构后的 Message 实体
 *
 * 改进点：
 * 1. 添加数据库索引（解决性能问题）
 * 2. 添加复合索引（常见查询优化）
 * 3. 定义严格的字段类型
 * 4. 添加模型关联定义
 * 5. 添加实例方法类型
 */
import { DataTypes, Model, Sequelize, Optional } from 'sequelize';

// ============ 类型定义 ============

/** Message 字段 */
export interface MessageAttributes {
  id: number;
  session_id: number | null;
  role: string | null;
  sender: string | null;
  content: string | null;
  type: string | null;
  created_at: Date | null;
}

/** 创建时可选字段 */
export type MessageCreationAttributes = Optional<
  MessageAttributes,
  'id' | 'session_id' | 'role' | 'sender' | 'content' | 'type' | 'created_at'
>;

/** Message 模型实例接口 */
export interface MessageInstance
  extends Model<MessageAttributes, MessageCreationAttributes>,
    MessageAttributes {
  // 实例方法可以在这里定义
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ============ 模型定义 ============

export class Message extends Model<
  MessageAttributes,
  MessageCreationAttributes
> {
  declare id: number;
  declare session_id: number | null;
  declare role: string | null;
  declare sender: string | null;
  declare content: string | null;
  declare type: string | null;
  declare created_at: Date | null;

  // 时间戳（Sequelize 自动管理，如果开启 timestamps）
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initMessage(sequelize: Sequelize): typeof Message {
  Message.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      session_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '关联的会话 ID',
        // ✅ 单字段索引
        index: true,
      },
      role: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '消息角色：user / assistant / system',
      },
      sender: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '发送者名称',
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '消息内容',
      },
      type: {
        type: DataTypes.STRING(55),
        allowNull: true,
        comment: '消息类型：text / image / file',
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '消息创建时间',
        // ✅ 排序字段索引
        index: true,
      },
    },
    {
      sequelize,
      modelName: 'Message',
      tableName: 'n_messages',
      timestamps: false, // 项目用 created_at 不用 Sequelize 默认时间戳

      // ✅ 复合索引：最常用查询组合
      indexes: [
        {
          name: 'idx_session_created',
          fields: ['session_id', 'created_at'],  // 按会话查历史消息（最常见）
        },
        {
          name: 'idx_role_created',
          fields: ['role', 'created_at'],  // 按角色查消息
        },
      ],
    },
  );

  return Message;
}

// ============ 模型关联（在全部模型初始化后调用） ============

/**
 * 设置 Message 模型的关联关系
 * 在 initMessage 之后、应用启动前调用
 */
export function associateMessage(models: {
  Session: any;  // 实际项目中用 import 的 Session 模型类型
}): void {
  Message.belongsTo(models.Session, {
    foreignKey: 'session_id',
    as: 'session',
  });
}

// ============ 查询辅助函数 ============

/**
 * 获取会话的消息列表（分页）
 * @example
 * const messages = await getSessionMessages(123, { page: 1, pageSize: 50 });
 */
export async function getSessionMessages(
  sessionId: number,
  options: { page?: number; pageSize?: number } = {},
): Promise<MessageInstance[]> {
  const { page = 1, pageSize = 50 } = options;

  return Message.findAll({
    where: { session_id: sessionId },
    order: [['created_at', 'DESC']],  // 最新的在前
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
}

/**
 * 批量创建消息（性能更好）
 */
export async function bulkCreateMessages(
  messages: Array<Optional<MessageAttributes, 'id'>>,
): Promise<MessageInstance[]> {
  return Message.bulkCreate(messages as any, {
    ignoreDuplicates: true,  // 忽略重复
  }) as Promise<MessageInstance[]>;
}
