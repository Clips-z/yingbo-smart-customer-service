import { PlatformTypeEnum } from './constant';

export interface App {
  id: string;
  name: string;
  env: string;
  type?: PlatformTypeEnum;
  avatar?: string;
  desc?: string;
  running?: boolean;
}

export interface Instance {
  task_id: string;
  app_id: string;
  env_id: string;
}

export interface PlatformSettings {
  platform_id: string;
  openai_url: string;
  api_key: string;
  prompt: string;
  active: boolean;
}

export type RoleType = 'SELF' | 'OTHER' | 'SYSTEM';
export type MessageType = 'TEXT' | 'IMAGE' | 'VIDEO' | 'FILE' | 'NO_REPLY';

export interface Reply {
  content: string;
  type: MessageType;
}

export interface Message {
  sender: string;
  content: string;
  role: RoleType; // assistant, user
  type: MessageType;
}

export interface LogBody {
  level: string;
  time: string;
  message: string;
}

export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'success';

export interface LogObj {
  time: string;
  content: string;
  level?: LogLevel;
}

export interface Plugin {
  id?: number;
  code?: string;
  type?: string;
  title?: string;
  author?: string;
  description?: string;
  tags?: string[];
  icon?: string;
  source?: string; // custom, third-party
}

export interface GenericConfig {
  appId: string;
  instanceId: string;
  extractPhone: boolean;
  extractProduct: boolean;
  savePath: string;
  replySpeed: number;
  replyRandomSpeed: number;
  contextCount: number;
  waitHumansTime: number;
  defaultReply: string;
  truncateWordCount: number;
  truncateWordKey: string;
  jinritemaiDefaultReplyMatch: string;
}

export interface LLMConfig {
  appId: string;
  instanceId: string;
  baseUrl: string;
  key: string;
  llmType: string;
  model: string;
  systemPrompt: string;
  knowledgeBase: string;
  ragEnabled: boolean;
  cozeBotId: string;
  cozeUserId: string;
  cozeToken: string;
  cozeApiBase: string;
}

export interface AccountConfig {
  activationCode: string;
}

export interface PluginConfig {
  appId: string;
  instanceId: string;
  usePlugin: boolean;
  pluginId: number;
}

export interface DriverConfig {
  hasPaused: boolean;
  hasKeywordMatch: boolean;
  hasUseGpt: boolean;
  hasMouseClose: boolean;
  hasEscClose: boolean;
  hasTransfer: boolean;
  hasReplace: boolean;
}

export type QianniuReplyMode = 'hint' | 'assist' | 'unattended';

export type ReplySuggestionStatus =
  | 'pending'
  | 'preparing'
  | 'sending'
  | 'prepared'
  | 'sent'
  | 'failed'
  | 'cancelled'
  | 'dismissed';

export interface QianniuCollectorHealth {
  state: 'stopped' | 'running' | 'degraded';
  processRunning: boolean;
  lastSuccessAt?: string;
  lastError?: string;
  reasonCode?: string;
  recoveryAction?: string;
  nextRetryAt?: string;
}

export interface QianniuCompanionContext {
  platformId: string;
  storeId: string;
  accountId: string;
  contactId: string;
  chatFingerprint: string;
  productId?: string | null;
  incomingMessageFingerprint?: string | null;
  contextRevision: number;
  capturedAt: string;
  confidence: number;
  state: 'switching' | 'stable' | 'degraded' | 'disconnected';
  conversationKey?: string;
  draftKey?: string;
}

export interface WechatCollectorHealth {
  state: 'stopped' | 'starting' | 'running' | 'degraded';
  processRunning: boolean;
  lastHeartbeatAt?: string;
  lastError?: string;
  restartAttempts: number;
}

export interface WecomCollectorHealth {
  state: 'stopped' | 'starting' | 'running' | 'degraded';
  processRunning: boolean;
  lastHeartbeatAt?: string;
  lastError?: string;
  restartAttempts: number;
}

export interface JinmaiCollectorHealth {
  state: 'stopped' | 'starting' | 'running' | 'degraded';
  processRunning: boolean;
  lastHeartbeatAt?: string;
  lastError?: string;
  restartAttempts: number;
}

export interface ReplySuggestion {
  id: number;
  platform_id: string;
  store: string;
  sender: string;
  incoming_content: string;
  reply_content: string;
  original_reply_content?: string | null;
  draft_content?: string | null;
  conversation_key?: string | null;
  draft_key?: string | null;
  store_id?: string | null;
  account_id?: string | null;
  contact_id?: string | null;
  chat_fingerprint?: string | null;
  product_id?: string | null;
  incoming_message_fingerprint?: string | null;
  context_revision?: number | null;
  draft_state?: string | null;
  draft_updated_at?: string | null;
  status: ReplySuggestionStatus;
  delivery_error?: string | null;
  delivery_request_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Session {
  id: number;
  platform: string;
  platform_id: string;
  instance_id: string;
  context: string;
  created_at: Date;
}

export interface MessageModel {
  id: number;
  session_id: number;
  role: RoleType;
  content: string;
  sender: string;
  type: MessageType;
  created_at: Date;
}

export interface Keyword {
  id?: number;
  mode?: string;
  app_name?: string;
  platform_id?: string;
  keyword: string;
  reply: string;
  fuzzy?: boolean;
  has_regular?: boolean;
}

export interface TransferKeyword {
  id?: number;
  keyword: string;
  app_id?: string;
  fuzzy?: boolean;
  has_regular?: boolean;
  app_name?: string;
}

export interface ReplaceKeyword {
  id?: number;
  keyword: string;
  replace: string;
  app_id?: string;
  fuzzy?: boolean;
  has_regular?: boolean;
  app_name?: string;
}
