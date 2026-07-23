import { DataTypes, Model, Sequelize } from 'sequelize';

export class EvaluationRun extends Model {
  declare id: string;
  declare variants: unknown[];
  declare results: unknown[];
  declare cases: unknown[];
  declare winner: string;
  declare created_at: Date;
}

export function initEvaluationRun(sequelize: Sequelize) {
  EvaluationRun.init({
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    variants: { type: DataTypes.JSON, allowNull: false },
    results: { type: DataTypes.JSON, allowNull: false },
    cases: { type: DataTypes.JSON, allowNull: false },
    winner: { type: DataTypes.STRING(200), allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    sequelize, tableName: 'n_evaluation_runs', modelName: 'EvaluationRun', timestamps: false,
    indexes: [{ fields: ['created_at'] }],
  });
}
