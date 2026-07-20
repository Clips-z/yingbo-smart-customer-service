import { DataTypes, Model, Sequelize } from 'sequelize';

export class KnowledgeVersion extends Model {
  declare id: string;
  declare knowledge_type: 'store' | 'product';
  declare knowledge_id: string;
  declare version: number;
  declare action: string;
  declare snapshot: Record<string, unknown>;
  declare actor: string;
  declare created_at: Date;
}

export function initKnowledgeVersion(sequelize: Sequelize) {
  KnowledgeVersion.init({
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    knowledge_type: { type: DataTypes.STRING(20), allowNull: false },
    knowledge_id: { type: DataTypes.STRING(100), allowNull: false },
    version: { type: DataTypes.INTEGER, allowNull: false },
    action: { type: DataTypes.STRING(40), allowNull: false },
    snapshot: { type: DataTypes.JSON, allowNull: false },
    actor: { type: DataTypes.STRING(100), allowNull: false, defaultValue: 'local-admin' },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    sequelize, tableName: 'n_knowledge_versions', modelName: 'KnowledgeVersion', timestamps: false,
    indexes: [{ unique: true, fields: ['knowledge_type', 'knowledge_id', 'version'] }],
  });
}
