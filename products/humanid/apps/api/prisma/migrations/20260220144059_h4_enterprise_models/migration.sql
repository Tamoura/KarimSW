-- CreateEnum
CREATE TYPE "org_role" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "org_member_status" AS ENUM ('INVITED', 'ACTIVE', 'REMOVED');

-- CreateEnum
CREATE TYPE "webhook_status" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "webhook_delivery_status" AS ENUM ('PENDING', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "issuer_tier" AS ENUM ('SELF_DECLARED', 'VERIFIED', 'QUALIFIED');

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "org_id" TEXT,
ADD COLUMN     "prev_hash" TEXT;

-- AlterTable
ALTER TABLE "credential_templates" ADD COLUMN     "fork_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "forked_from_id" TEXT,
ADD COLUMN     "is_public" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "issuers" ADD COLUMN     "domain_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tier" "issuer_tier" NOT NULL DEFAULT 'SELF_DECLARED',
ADD COLUMN     "website" TEXT;

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "domain" TEXT,
    "sso_provider" JSONB,
    "sso_enforced" BOOLEAN NOT NULL DEFAULT false,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_members" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "org_role" NOT NULL DEFAULT 'MEMBER',
    "status" "org_member_status" NOT NULL DEFAULT 'INVITED',
    "invited_by" TEXT,
    "invite_email" TEXT,
    "joined_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhooks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "org_id" TEXT,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" JSONB NOT NULL,
    "status" "webhook_status" NOT NULL DEFAULT 'ACTIVE',
    "description" TEXT,
    "last_delivered_at" TIMESTAMP(3),
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" TEXT NOT NULL,
    "webhook_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "webhook_delivery_status" NOT NULL DEFAULT 'PENDING',
    "http_status_code" INTEGER,
    "response_body" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "next_retry_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organizations_slug_idx" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organizations_domain_idx" ON "organizations"("domain");

-- CreateIndex
CREATE INDEX "organization_members_org_id_idx" ON "organization_members"("org_id");

-- CreateIndex
CREATE INDEX "organization_members_user_id_idx" ON "organization_members"("user_id");

-- CreateIndex
CREATE INDEX "organization_members_status_idx" ON "organization_members"("status");

-- CreateIndex
CREATE UNIQUE INDEX "organization_members_org_id_user_id_key" ON "organization_members"("org_id", "user_id");

-- CreateIndex
CREATE INDEX "webhooks_user_id_idx" ON "webhooks"("user_id");

-- CreateIndex
CREATE INDEX "webhooks_org_id_idx" ON "webhooks"("org_id");

-- CreateIndex
CREATE INDEX "webhooks_status_idx" ON "webhooks"("status");

-- CreateIndex
CREATE INDEX "webhook_deliveries_webhook_id_idx" ON "webhook_deliveries"("webhook_id");

-- CreateIndex
CREATE INDEX "webhook_deliveries_status_idx" ON "webhook_deliveries"("status");

-- CreateIndex
CREATE INDEX "webhook_deliveries_event_type_idx" ON "webhook_deliveries"("event_type");

-- CreateIndex
CREATE INDEX "webhook_deliveries_created_at_idx" ON "webhook_deliveries"("created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_org_id_idx" ON "audit_logs"("org_id");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
