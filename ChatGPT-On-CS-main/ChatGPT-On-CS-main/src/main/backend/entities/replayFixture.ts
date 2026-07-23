import { DataTypes, Model, Sequelize } from 'sequelize';

export class ReplayFixture extends Model {
  declare id: string;
  declare name: string;
  declare fixtures: unknown[];
  declare created_at: Date;
  declare updated_at: Date;
}

export function initReplayFixture(sequelize: Sequelize) {
  ReplayFixture.init({
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(120), allowNull: false },
    fixtures: { type: DataTypes.JSON, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, { sequelize, tableName: 'n_replay_fixtures', modelName: 'ReplayFixture', timestamps: false, indexes: [{ fields: ['updated_at'] }] });
}
