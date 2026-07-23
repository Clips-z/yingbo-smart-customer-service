import { DataTypes, Model, Sequelize } from 'sequelize';

export class ProductKnowledge extends Model {
  declare id: string;
  declare name: string;
  declare platform_product_id: string;
  declare barcode: string | null;
  declare shop_id: string;
  declare platform_id: string;
  declare shop_name: string;
  declare tags: string[];
  declare on_sale: boolean;
  declare qa_count: number;
  declare hue: number;
  declare sync_status: 'pending' | 'synced' | 'failed';
  declare sync_error: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

export function initProductKnowledge(sequelize: Sequelize) {
  ProductKnowledge.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: { type: DataTypes.STRING(300), allowNull: false },
      platform_product_id: { type: DataTypes.STRING(100), allowNull: false },
      barcode: { type: DataTypes.STRING(64), allowNull: true },
      shop_id: { type: DataTypes.STRING(100), allowNull: false },
      platform_id: { type: DataTypes.STRING(100), allowNull: false, defaultValue: 'unassigned' },
      shop_name: { type: DataTypes.STRING(200), allowNull: false },
      tags: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
      on_sale: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      qa_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      hue: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 210 },
      sync_status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending' },
      sync_error: { type: DataTypes.STRING(500), allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      tableName: 'n_product_knowledge',
      modelName: 'ProductKnowledge',
      timestamps: false,
      indexes: [
        { unique: true, fields: ['shop_id', 'platform_product_id'] },
        { fields: ['platform_id', 'shop_id'] },
        { fields: ['shop_id', 'on_sale'] },
        { fields: ['sync_status'] },
      ],
    },
  );
}

export async function checkAndAddFields(sequelize: Sequelize) {
  const table = (await ProductKnowledge.describe()) as Record<string, unknown>;
  if (!table.platform_id) {
    await sequelize.getQueryInterface().addColumn('n_product_knowledge', 'platform_id', {
      type: DataTypes.STRING(100), allowNull: false, defaultValue: 'unassigned',
    });
  }
}
