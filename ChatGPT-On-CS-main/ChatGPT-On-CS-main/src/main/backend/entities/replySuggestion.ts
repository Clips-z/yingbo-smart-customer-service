import { DataTypes, Model, Sequelize } from 'sequelize';

export type ReplySuggestionStatus =
  | 'pending'
  | 'prepared'
  | 'sent'
  | 'failed'
  | 'dismissed';

export class ReplySuggestion extends Model {
  declare id: number;

  declare platform_id: string;

  declare store: string;

  declare sender: string;

  declare incoming_content: string;

  declare reply_content: string;

  declare status: ReplySuggestionStatus;

  declare created_at: Date;

  declare updated_at: Date;
}

export function initReplySuggestion(sequelize: Sequelize) {
  ReplySuggestion.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      platform_id: {
        type: DataTypes.STRING(100),
        allowNull: false,
        defaultValue: 'win_qianniu',
      },
      store: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      sender: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      incoming_content: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      reply_content: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      status: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'pending',
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      modelName: 'ReplySuggestion',
      tableName: 'n_reply_suggestions',
      timestamps: false,
      indexes: [{ fields: ['status', 'created_at'] }, { fields: ['sender'] }],
    },
  );
}
