-- CreateEnum
CREATE TYPE "federation_protocol" AS ENUM ('SAML', 'OIDC', 'DID_VC');

-- CreateEnum
CREATE TYPE "federation_direction" AS ENUM ('IMPORT', 'EXPORT', 'BIDIRECTIONAL');

-- CreateEnum
CREATE TYPE "fraud_alert_severity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "fraud_alert_status" AS ENUM ('OPEN', 'INVESTIGATING', 'CONFIRMED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "org_did_type" AS ENUM ('COMPANY', 'DEPARTMENT', 'DEVICE', 'SERVICE');

-- CreateEnum
CREATE TYPE "proposal_status" AS ENUM ('DRAFT', 'ACTIVE', 'PASSED', 'REJECTED', 'EXECUTED');

-- CreateEnum
CREATE TYPE "issuance_delegation_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "anchor_chain" ADD VALUE 'ETHEREUM';
ALTER TYPE "anchor_chain" ADD VALUE 'SOLANA';
ALTER TYPE "anchor_chain" ADD VALUE 'ARBITRUM';

-- CreateTable
CREATE TABLE "federation_links" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "did_id" TEXT NOT NULL,
    "protocol" "federation_protocol" NOT NULL,
    "direction" "federation_direction" NOT NULL DEFAULT 'BIDIRECTIONAL',
    "external_issuer" TEXT NOT NULL,
    "external_subject" TEXT NOT NULL,
    "metadata" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "federation_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fraud_alerts" (
    "id" TEXT NOT NULL,
    "credential_id" TEXT,
    "issuer_id" TEXT,
    "alert_type" TEXT NOT NULL,
    "severity" "fraud_alert_severity" NOT NULL,
    "status" "fraud_alert_status" NOT NULL DEFAULT 'OPEN',
    "description" TEXT NOT NULL,
    "risk_score" DOUBLE PRECISION NOT NULL,
    "evidence" JSONB,
    "assignee" TEXT,
    "resolution" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fraud_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_dids" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "did_id" TEXT NOT NULL,
    "type" "org_did_type" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "parent_org_did_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_dids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issuance_delegations" (
    "id" TEXT NOT NULL,
    "parent_issuer_id" TEXT NOT NULL,
    "delegate_issuer_id" TEXT NOT NULL,
    "allowed_types" JSONB NOT NULL,
    "max_depth" INTEGER NOT NULL DEFAULT 1,
    "status" "issuance_delegation_status" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "issuance_delegations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "governance_proposals" (
    "id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" "proposal_status" NOT NULL DEFAULT 'DRAFT',
    "votes_for" INTEGER NOT NULL DEFAULT 0,
    "votes_against" INTEGER NOT NULL DEFAULT 0,
    "quorum" INTEGER NOT NULL DEFAULT 100,
    "voting_starts_at" TIMESTAMP(3),
    "voting_ends_at" TIMESTAMP(3),
    "executed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "governance_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "governance_votes" (
    "id" TEXT NOT NULL,
    "proposal_id" TEXT NOT NULL,
    "voter_id" TEXT NOT NULL,
    "vote" BOOLEAN NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "governance_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locales" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "native_name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "completion_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "translations" (
    "id" TEXT NOT NULL,
    "locale_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "context" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "federation_links_user_id_idx" ON "federation_links"("user_id");

-- CreateIndex
CREATE INDEX "federation_links_did_id_idx" ON "federation_links"("did_id");

-- CreateIndex
CREATE INDEX "federation_links_protocol_idx" ON "federation_links"("protocol");

-- CreateIndex
CREATE UNIQUE INDEX "federation_links_protocol_external_issuer_external_subject_key" ON "federation_links"("protocol", "external_issuer", "external_subject");

-- CreateIndex
CREATE INDEX "fraud_alerts_status_idx" ON "fraud_alerts"("status");

-- CreateIndex
CREATE INDEX "fraud_alerts_severity_idx" ON "fraud_alerts"("severity");

-- CreateIndex
CREATE INDEX "fraud_alerts_credential_id_idx" ON "fraud_alerts"("credential_id");

-- CreateIndex
CREATE INDEX "fraud_alerts_issuer_id_idx" ON "fraud_alerts"("issuer_id");

-- CreateIndex
CREATE INDEX "fraud_alerts_alert_type_idx" ON "fraud_alerts"("alert_type");

-- CreateIndex
CREATE UNIQUE INDEX "org_dids_did_id_key" ON "org_dids"("did_id");

-- CreateIndex
CREATE INDEX "org_dids_org_id_idx" ON "org_dids"("org_id");

-- CreateIndex
CREATE INDEX "org_dids_did_id_idx" ON "org_dids"("did_id");

-- CreateIndex
CREATE INDEX "org_dids_type_idx" ON "org_dids"("type");

-- CreateIndex
CREATE INDEX "org_dids_parent_org_did_id_idx" ON "org_dids"("parent_org_did_id");

-- CreateIndex
CREATE INDEX "issuance_delegations_parent_issuer_id_idx" ON "issuance_delegations"("parent_issuer_id");

-- CreateIndex
CREATE INDEX "issuance_delegations_delegate_issuer_id_idx" ON "issuance_delegations"("delegate_issuer_id");

-- CreateIndex
CREATE INDEX "issuance_delegations_status_idx" ON "issuance_delegations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "issuance_delegations_parent_issuer_id_delegate_issuer_id_key" ON "issuance_delegations"("parent_issuer_id", "delegate_issuer_id");

-- CreateIndex
CREATE INDEX "governance_proposals_status_idx" ON "governance_proposals"("status");

-- CreateIndex
CREATE INDEX "governance_proposals_author_id_idx" ON "governance_proposals"("author_id");

-- CreateIndex
CREATE INDEX "governance_proposals_category_idx" ON "governance_proposals"("category");

-- CreateIndex
CREATE INDEX "governance_votes_proposal_id_idx" ON "governance_votes"("proposal_id");

-- CreateIndex
CREATE INDEX "governance_votes_voter_id_idx" ON "governance_votes"("voter_id");

-- CreateIndex
CREATE UNIQUE INDEX "governance_votes_proposal_id_voter_id_key" ON "governance_votes"("proposal_id", "voter_id");

-- CreateIndex
CREATE UNIQUE INDEX "locales_code_key" ON "locales"("code");

-- CreateIndex
CREATE INDEX "locales_code_idx" ON "locales"("code");

-- CreateIndex
CREATE INDEX "translations_locale_id_idx" ON "translations"("locale_id");

-- CreateIndex
CREATE INDEX "translations_key_idx" ON "translations"("key");

-- CreateIndex
CREATE UNIQUE INDEX "translations_locale_id_key_key" ON "translations"("locale_id", "key");

-- AddForeignKey
ALTER TABLE "org_dids" ADD CONSTRAINT "org_dids_parent_org_did_id_fkey" FOREIGN KEY ("parent_org_did_id") REFERENCES "org_dids"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_votes" ADD CONSTRAINT "governance_votes_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "governance_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "translations" ADD CONSTRAINT "translations_locale_id_fkey" FOREIGN KEY ("locale_id") REFERENCES "locales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
