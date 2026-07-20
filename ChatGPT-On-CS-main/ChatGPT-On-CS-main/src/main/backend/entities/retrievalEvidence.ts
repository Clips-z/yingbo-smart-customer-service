import { DataTypes, Model, Sequelize } from 'sequelize';

export class RetrievalEvidence extends Model {
  declare id: string;
  declare suggestion_id: number;
  declare knowledge_id: string | null;
  declare source: string;
  declare content_excerpt: string;
  declare vector_score: number | null;
  declare rerank_score: number | null;
  declare rank: number;
  declare relevance_feedback: 'relevant' | 'irrelevant' | null;
  declare created_at: Date;
}

export function initRetrievalEvidence(sequelize: Sequelize) {
  RetrievalEvidence.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      suggestion_id: { type: DataTypes.INTEGER, allowNull: false },
      knowledge_id: { type: DataTypes.STRING(100), allowNull: true },
      source: { type: DataTypes.STRING(500), allowNull: false },
      content_excerpt: { type: DataTypes.TEXT, allowNull: false },
      vector_score: { type: DataTypes.FLOAT, allowNull: true },
      rerank_score: { type: DataTypes.FLOAT, allowNull: true },
      rank: { type: DataTypes.INTEGER, allowNull: false },
      relevance_feedback: { type: DataTypes.STRING(20), allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      tableName: 'n_retrieval_evidence',
      modelName: 'RetrievalEvidence',
      timestamps: false,
      indexes: [
        { fields: ['suggestion_id', 'rank'] },
        { fields: ['knowledge_id'] },
      ],
    },
  );
}
