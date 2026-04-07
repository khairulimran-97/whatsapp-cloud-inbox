import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const replyTemplates = sqliteTable('reply_templates', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  category: text('category').notNull().default('General'),
  body: text('body').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const unreadCounts = sqliteTable('unread_counts', {
  phone: text('phone').primaryKey(),
  count: integer('count').notNull().default(0),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const pushSubscriptions = sqliteTable('push_subscriptions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  endpoint: text('endpoint').notNull().unique(),
  keysJson: text('keys_json').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// --- Conversation & message cache tables ---

export const contacts = sqliteTable('contacts', {
  phone: text('phone').primaryKey(),
  name: text('name'),
  firstSeen: integer('first_seen', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  lastSeen: integer('last_seen', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  phone: text('phone').notNull(),
  status: text('status').notNull().default('active'),
  phoneNumberId: text('phone_number_id'),
  lastMessageText: text('last_message_text'),
  lastMessageType: text('last_message_type'),
  lastMessageDirection: text('last_message_direction'),
  messagesCount: integer('messages_count').default(0),
  source: text('source').default('api'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull(),
  phone: text('phone').notNull(),
  direction: text('direction').notNull(),
  content: text('content').default(''),
  messageType: text('message_type').notNull().default('text'),
  status: text('status'),
  hasMedia: integer('has_media', { mode: 'boolean' }).default(false),
  mediaDataJson: text('media_data_json'),
  caption: text('caption'),
  errorJson: text('error_json'),
  metadataJson: text('metadata_json'),
  source: text('source').default('api'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const webhookLogs = sqliteTable('webhook_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  eventType: text('event_type').notNull(),
  phoneNumber: text('phone_number'),
  conversationId: text('conversation_id'),
  messageId: text('message_id'),
  headerEvent: text('header_event'),
  payload: text('payload').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});
