import { DataTypes, Model, Sequelize } from 'sequelize';

export class ReplyFeedback extends Model {
  declare id: string;
  declare suggestion_id: number;
  declare event_key: string;
  declare action: string;
  declare original_content: string | null;
  declare final_content: string | null;
  declare edit_ratio: number | null;
  declare reason_code: string | null;
  declare metadata: Record<string, unknown>;
  declare created_at: Date;
}

export function initReplyFeedback(sequelize: Sequelize) {
  ReplyFeedback.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      suggestion_id: { type: DataTypes.INTEGER, allowNull: false },
      event_key: { type: DataTypes.STRING(160), allowNull: false, unique: true },
      action: { type: DataTypes.STRING(32), allowNull: false },
      original_content: { type: DataTypes.TEXT, allowNull: true },
      final_content: { type: DataTypes.TEXT, allowNull: true },
      edit_ratio: { type: DataTypes.FLOAT, allowNull: true },
      reason_code: { type: DataTypes.STRING(64), allowNull: true },
      metadata: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      tableName: 'n_reply_feedback',
      modelName: 'ReplyFeedback',
      timestamps: false,
      indexes: [
        { fields: ['suggestion_id', 'created_at'] },
        { fields: ['action', 'created_at'] },
      ],
    },
  );
}
