import { DataTypes, Model, Sequelize } from 'sequelize';

export type NotificationType = 'system' | 'platform' | 'reply' | 'alert';
export type NotificationLevel = 'info' | 'warning' | 'error' | 'success';

export class Notification extends Model {
  declare id: number;

  /** 通知类型 */
  declare type: NotificationType;

  /** 严重级别 */
  declare level: NotificationLevel;

  /** 标题 */
  declare title: string;

  /** 正文内容 */
  declare body: string;

  /** 关联的平台 ID（如 win_qianniu，可为空表示系统通知） */
  declare platform_id: string | null;

  /** 是否已读 */
  declare is_read: boolean;

  /** 创建时间 */
  declare created_at: Date;
}

export function initNotification(sequelize: Sequelize) {
  Notification.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      type: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'system',
      },
      level: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: 'info',
      },
      title: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      body: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      platform_id: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      is_read: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      modelName: 'Notification',
      tableName: 'n_notifications',
      timestamps: false,
      indexes: [
        { fields: ['is_read', 'created_at'] },
        { fields: ['type'] },
        { fields: ['platform_id'] },
      ],
    },
  );
}
