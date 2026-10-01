-- DropIndex
DROP INDEX "chat_messages_chat_id_idx";

-- AlterTable
ALTER TABLE "app_settings" DROP CONSTRAINT "app_settings_pkey",
ADD COLUMN     "user_id" TEXT NOT NULL DEFAULT '',
ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY ("user_id", "key");

-- AlterTable
ALTER TABLE "campaigns" DROP CONSTRAINT "campaigns_pkey",
ADD COLUMN     "user_id" TEXT NOT NULL DEFAULT '',
ADD CONSTRAINT "campaigns_pkey" PRIMARY KEY ("user_id", "id");

-- AlterTable
ALTER TABLE "chat_messages" DROP CONSTRAINT "chat_messages_pkey",
ADD COLUMN     "user_id" TEXT NOT NULL DEFAULT '',
ADD CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("user_id", "id");

-- AlterTable
ALTER TABLE "chats" DROP CONSTRAINT "chats_pkey",
ADD COLUMN     "user_id" TEXT NOT NULL DEFAULT '',
ADD CONSTRAINT "chats_pkey" PRIMARY KEY ("user_id", "id");

-- AlterTable
ALTER TABLE "contact_profiles" DROP CONSTRAINT "contact_profiles_pkey",
ADD COLUMN     "user_id" TEXT NOT NULL DEFAULT '',
ADD CONSTRAINT "contact_profiles_pkey" PRIMARY KEY ("user_id", "id");

-- AlterTable
ALTER TABLE "contacts" DROP CONSTRAINT "contacts_pkey",
ADD COLUMN     "user_id" TEXT NOT NULL DEFAULT '',
ADD CONSTRAINT "contacts_pkey" PRIMARY KEY ("user_id", "id");

-- AlterTable
ALTER TABLE "message_templates" DROP CONSTRAINT "message_templates_pkey",
ADD COLUMN     "user_id" TEXT NOT NULL DEFAULT '',
ADD CONSTRAINT "message_templates_pkey" PRIMARY KEY ("user_id", "id");

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "evo_instance_name" TEXT,
ADD COLUMN     "evo_instance_token" TEXT;

-- CreateIndex
CREATE INDEX "chat_messages_user_id_chat_id_idx" ON "chat_messages"("user_id", "chat_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_evo_instance_name_key" ON "users"("evo_instance_name");

