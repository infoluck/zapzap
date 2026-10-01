-- CreateTable
CREATE TABLE "contact_profiles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT DEFAULT '',
    "color" TEXT DEFAULT '#0284c7',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "profile_ids" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT DEFAULT '',
    "custom_data" JSONB DEFAULT '{}',
    "added_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_templates" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT DEFAULT 'Geral',
    "tags" JSONB DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chats" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "push_name" TEXT,
    "about" TEXT,
    "jid" TEXT,
    "avatar_url" TEXT,
    "last_message" TEXT,
    "last_message_timestamp" TEXT,
    "unread_count" INTEGER DEFAULT 0,
    "contact_id" TEXT,
    "profile_ids" JSONB DEFAULT '[]',
    "is_group" BOOLEAN DEFAULT false,
    "is_pinned" BOOLEAN DEFAULT false,
    "pin_index" INTEGER DEFAULT 0,
    "is_disappearing" BOOLEAN DEFAULT false,
    "is_muted" BOOLEAN DEFAULT false,
    "labels" JSONB DEFAULT '[]',
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "chat_id" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT DEFAULT 'sent',
    "error" TEXT,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "target_profile_id" TEXT NOT NULL,
    "selected_template_ids" JSONB NOT NULL,
    "scheduled_for" TIMESTAMPTZ(6),
    "status" TEXT NOT NULL,
    "total_contacts" INTEGER DEFAULT 0,
    "sent_count" INTEGER DEFAULT 0,
    "failed_count" INTEGER DEFAULT 0,
    "anti_ban_settings" JSONB NOT NULL,
    "logs" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "chat_messages_chat_id_idx" ON "chat_messages"("chat_id");
