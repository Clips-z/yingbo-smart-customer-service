import { DataTypes, Model, Sequelize } from 'sequelize';

export class AuditEvent extends Model {
  declare id: string;
  declare action: string;
  declare entity_type: string;
  declare entity_id: string;
  declare actor: string;
  declare payload: Record<string, unknown>;
  declare previous_hash: string;
  declare event_hash: string;
  declare created_at: Date;
}

export function initAuditEvent(sequelize: Sequelize) {
  AuditEvent.init({
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    action: { type: DataTypes.STRING(80), allowNull: false },
    entity_type: { type: DataTypes.STRING(80), allowNull: false },
    entity_id: { type: DataTypes.STRING(100), allowNull: false },
    actor: { type: DataTypes.STRING(100), allowNull: false },
    payload: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
    previous_hash: { type: DataTypes.STRING(64), allowNull: false, defaultValue: '' },
    event_hash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    sequelize, tableName: 'n_audit_events', modelName: 'AuditEvent', timestamps: false,
    indexes: [{ fields: ['entity_type', 'entity_id', 'created_at'] }],
  });
}
