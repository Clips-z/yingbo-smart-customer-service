import { DataTypes, Model, Sequelize } from 'sequelize';

export type ReplySuggestionStatus =
  | 'pending'
  | 'preparing'
  | 'sending'
  | 'prepared'
  | 'sent'
  | 'failed'
  | 'cancelled'
  | 'dismissed';

export class ReplySuggestion extends Model {
  declare id: number;

  declare platform_id: string;

  declare store: string;

  declare sender: string;

  declare incoming_content: string;

  declare reply_content: string;

  declare original_reply_content: string | null;

  declare draft_content: string | null;

  declare conversation_key: string | null;

  declare draft_key: string | null;

  declare store_id: string | null;

  declare account_id: string | null;

  declare contact_id: string | null;

  declare chat_fingerprint: string | null;

  declare product_id: string | null;

  declare product_title: string | null;

  declare incoming_message_fingerprint: string | null;

  declare context_revision: number | null;

  declare draft_state: string | null;

  declare draft_updated_at: Date | null;

  declare message_key: string | null;

  declare delivery_request_id: string | null;

  declare delivery_error: string | null;

  declare final_reply_content: string | null;

  declare model_provider: string | null;

  declare model_name: string | null;

  declare prompt_version: string | null;

  declare generation_latency_ms: number | null;

  declare retrieval_status: string | null;

  declare risk_level: string | null;

  declare ocr_confidence: number | null;

  declare ocr_reason_codes: string[] | null;

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
      original_reply_content: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      draft_content: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      conversation_key: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      draft_key: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      store_id: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      account_id: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      contact_id: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      chat_fingerprint: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      product_id: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      product_title: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      incoming_message_fingerprint: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      context_revision: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      draft_state: {
        type: DataTypes.STRING(32),
        allowNull: true,
      },
      draft_updated_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      message_key: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      delivery_request_id: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      delivery_error: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      final_reply_content: { type: DataTypes.TEXT, allowNull: true },
      model_provider: { type: DataTypes.STRING(100), allowNull: true },
      model_name: { type: DataTypes.STRING(160), allowNull: true },
      prompt_version: { type: DataTypes.STRING(100), allowNull: true },
      generation_latency_ms: { type: DataTypes.INTEGER, allowNull: true },
      retrieval_status: { type: DataTypes.STRING(32), allowNull: true },
      risk_level: { type: DataTypes.STRING(20), allowNull: true },
      ocr_confidence: { type: DataTypes.FLOAT, allowNull: true },
      ocr_reason_codes: { type: DataTypes.JSON, allowNull: true },
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
      indexes: [
        { fields: ['status', 'created_at'] },
        { fields: ['sender'] },
      ],
    },
  );
}

export async function checkAndAddFields(sequelize: Sequelize) {
  const tableDescription = await ReplySuggestion.describe();
  const nullableColumns: Record<string, object> = {
    original_reply_content: { type: DataTypes.TEXT, allowNull: true },
    draft_content: { type: DataTypes.TEXT, allowNull: true },
    conversation_key: { type: DataTypes.STRING(64), allowNull: true },
    draft_key: { type: DataTypes.STRING(64), allowNull: true },
    store_id: { type: DataTypes.STRING(255), allowNull: true },
    account_id: { type: DataTypes.STRING(255), allowNull: true },
    contact_id: { type: DataTypes.STRING(255), allowNull: true },
    chat_fingerprint: { type: DataTypes.STRING(255), allowNull: true },
    product_id: { type: DataTypes.STRING(255), allowNull: true },
    product_title: { type: DataTypes.STRING(500), allowNull: true },
    incoming_message_fingerprint: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    context_revision: { type: DataTypes.INTEGER, allowNull: true },
    draft_state: { type: DataTypes.STRING(32), allowNull: true },
    draft_updated_at: { type: DataTypes.DATE, allowNull: true },
    final_reply_content: { type: DataTypes.TEXT, allowNull: true },
    model_provider: { type: DataTypes.STRING(100), allowNull: true },
    model_name: { type: DataTypes.STRING(160), allowNull: true },
    prompt_version: { type: DataTypes.STRING(100), allowNull: true },
    generation_latency_ms: { type: DataTypes.INTEGER, allowNull: true },
    retrieval_status: { type: DataTypes.STRING(32), allowNull: true },
    risk_level: { type: DataTypes.STRING(20), allowNull: true },
    ocr_confidence: { type: DataTypes.FLOAT, allowNull: true },
    ocr_reason_codes: { type: DataTypes.JSON, allowNull: true },
  };

  for (const [name, definition] of Object.entries(nullableColumns)) {
    if (!tableDescription[name]) {
      await sequelize
        .getQueryInterface()
        .addColumn('n_reply_suggestions', name, definition);
    }
  }
  // @ts-ignore
  if (!tableDescription.message_key) {
    await sequelize
      .getQueryInterface()
      .addColumn('n_reply_suggestions', 'message_key', {
        type: DataTypes.STRING(64),
        allowNull: true,
      });
  }
  // @ts-ignore
  if (!tableDescription.delivery_request_id) {
    await sequelize
      .getQueryInterface()
      .addColumn('n_reply_suggestions', 'delivery_request_id', {
        type: DataTypes.STRING(64),
        allowNull: true,
      });
  }
  // @ts-ignore
  if (!tableDescription.delivery_error) {
    await sequelize
      .getQueryInterface()
      .addColumn('n_reply_suggestions', 'delivery_error', {
        type: DataTypes.STRING(500),
        allowNull: true,
      });
  }
  await sequelize.query(
    'CREATE UNIQUE INDEX IF NOT EXISTS n_reply_suggestions_message_key_unique ON n_reply_suggestions (message_key) WHERE message_key IS NOT NULL',
  );
  await sequelize.query(
    'CREATE INDEX IF NOT EXISTS n_reply_suggestions_conversation_created ON n_reply_suggestions (conversation_key, created_at)',
  );
  await sequelize.query(
    'CREATE INDEX IF NOT EXISTS n_reply_suggestions_draft_key ON n_reply_suggestions (draft_key)',
  );
}
