import { DataTypes, Model, Sequelize } from 'sequelize';

export class StoreKnowledge extends Model {
  declare id: string;
  declare question: string;
  declare answer: string;
  declare related_questions: string[];
  declare tags: string[];
  declare trigger_count: number;
  declare stage: 'presale' | 'mid' | 'aftersale';
  declare match_type: 'exact' | 'fuzzy';
  declare shop_id: string;
  declare enabled: boolean;
  declare sync_status: 'pending' | 'synced' | 'failed';
  declare sync_error: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

export function initStoreKnowledge(sequelize: Sequelize) {
  StoreKnowledge.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      question: { type: DataTypes.STRING(1000), allowNull: false },
      answer: { type: DataTypes.TEXT, allowNull: false },
      related_questions: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
      tags: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
      trigger_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      stage: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'presale' },
      match_type: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'fuzzy' },
      shop_id: { type: DataTypes.STRING(100), allowNull: false },
      enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      sync_status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending' },
      sync_error: { type: DataTypes.STRING(500), allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      tableName: 'n_store_knowledge',
      modelName: 'StoreKnowledge',
      timestamps: false,
      indexes: [
        { fields: ['shop_id', 'stage'] },
        { fields: ['enabled', 'sync_status'] },
        { fields: ['updated_at'] },
      ],
    },
  );
}
