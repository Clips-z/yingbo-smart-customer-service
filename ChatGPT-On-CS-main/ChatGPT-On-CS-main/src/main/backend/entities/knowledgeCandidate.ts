import { DataTypes, Model, Sequelize } from 'sequelize';

export type KnowledgeCandidateStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'merged';

export class KnowledgeCandidate extends Model {
  declare id: string;
  declare fingerprint: string;
  declare question: string;
  declare answer: string;
  declare related_questions: string[];
  declare tags: string[];
  declare stage: 'presale' | 'mid' | 'aftersale';
  declare shop_id: string;
  declare source_count: number;
  declare confidence: number;
  declare evidence_reply_ids: number[];
  declare status: KnowledgeCandidateStatus;
  declare rejection_reason: string | null;
  declare approved_knowledge_id: string | null;
  declare reviewed_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

export function initKnowledgeCandidate(sequelize: Sequelize) {
  KnowledgeCandidate.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      fingerprint: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      question: { type: DataTypes.STRING(1000), allowNull: false },
      answer: { type: DataTypes.TEXT, allowNull: false },
      related_questions: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
      tags: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
      stage: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'presale' },
      shop_id: { type: DataTypes.STRING(100), allowNull: false },
      source_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      confidence: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
      evidence_reply_ids: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending' },
      rejection_reason: { type: DataTypes.STRING(500), allowNull: true },
      approved_knowledge_id: { type: DataTypes.UUID, allowNull: true },
      reviewed_at: { type: DataTypes.DATE, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      tableName: 'n_knowledge_candidates',
      modelName: 'KnowledgeCandidate',
      timestamps: false,
      indexes: [
        { fields: ['status', 'updated_at'] },
        { fields: ['shop_id', 'stage'] },
      ],
    },
  );
}
