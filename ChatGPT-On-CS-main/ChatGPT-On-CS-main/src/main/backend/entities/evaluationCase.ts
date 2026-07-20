import { DataTypes, Model, Sequelize } from 'sequelize';

export class EvaluationCase extends Model {
  declare id: string;
  declare question: string;
  declare expected_knowledge_ids: string[];
  declare expected_action: 'answer' | 'assist' | 'transfer' | 'no_answer';
  declare notes: string | null;
  declare tags: string[];
  declare enabled: boolean;
  declare created_at: Date;
  declare updated_at: Date;
}

export function initEvaluationCase(sequelize: Sequelize) {
  EvaluationCase.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      question: { type: DataTypes.STRING(1000), allowNull: false },
      expected_knowledge_ids: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
      expected_action: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'answer' },
      notes: { type: DataTypes.TEXT, allowNull: true },
      tags: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
      enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      tableName: 'n_evaluation_cases',
      modelName: 'EvaluationCase',
      timestamps: false,
      indexes: [{ fields: ['enabled', 'updated_at'] }],
    },
  );
}
