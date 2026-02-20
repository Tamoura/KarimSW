-- CreateEnum
CREATE TYPE "agent_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "delegation_status" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "compliance_framework" AS ENUM ('SOC2', 'ISO27001', 'GDPR', 'HIPAA');

-- CreateEnum
CREATE TYPE "control_status" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'IMPLEMENTED', 'VERIFIED', 'FAILED');

-- CreateEnum
CREATE TYPE "vulnerability_status" AS ENUM ('SUBMITTED', 'TRIAGED', 'CONFIRMED', 'FIXED', 'CLOSED', 'INVALID');

-- CreateEnum
CREATE TYPE "vulnerability_severity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO');

-- CreateEnum
CREATE TYPE "region_code" AS ENUM ('EU_FRANKFURT', 'US_VIRGINIA', 'APAC_SINGAPORE');

-- CreateTable
CREATE TABLE "agent_identities" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "did_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "capabilities" JSONB NOT NULL,
    "status" "agent_status" NOT NULL DEFAULT 'ACTIVE',
    "parent_agent_id" TEXT,
    "max_delegation_depth" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_delegations" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "granter_user_id" TEXT NOT NULL,
    "granter_did_id" TEXT NOT NULL,
    "delegated_permissions" JSONB NOT NULL,
    "proof_of_authorization" JSONB NOT NULL,
    "status" "delegation_status" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_delegations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_controls" (
    "id" TEXT NOT NULL,
    "framework" "compliance_framework" NOT NULL,
    "control_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "control_status" NOT NULL DEFAULT 'NOT_STARTED',
    "evidence" JSONB,
    "assignee" TEXT,
    "notes" TEXT,
    "last_audited_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compliance_controls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regions" (
    "id" TEXT NOT NULL,
    "code" "region_code" NOT NULL,
    "name" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "health_status" TEXT NOT NULL DEFAULT 'unknown',
    "data_residency_enabled" BOOLEAN NOT NULL DEFAULT true,
    "latency_ms" INTEGER,
    "last_health_check" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vulnerability_reports" (
    "id" TEXT NOT NULL,
    "reporter_email" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "vulnerability_severity" NOT NULL,
    "cvss_score" DOUBLE PRECISION,
    "affected_component" TEXT NOT NULL,
    "steps_to_reproduce" TEXT NOT NULL,
    "status" "vulnerability_status" NOT NULL DEFAULT 'SUBMITTED',
    "assignee" TEXT,
    "bounty_amount" DOUBLE PRECISION,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vulnerability_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_advisories" (
    "id" TEXT NOT NULL,
    "vulnerability_report_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "vulnerability_severity" NOT NULL,
    "affected_versions" JSONB NOT NULL,
    "patched_versions" JSONB NOT NULL,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "security_advisories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offline_tokens" (
    "id" TEXT NOT NULL,
    "credential_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "signature" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offline_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_identities_did_id_key" ON "agent_identities"("did_id");

-- CreateIndex
CREATE INDEX "agent_identities_user_id_idx" ON "agent_identities"("user_id");

-- CreateIndex
CREATE INDEX "agent_identities_did_id_idx" ON "agent_identities"("did_id");

-- CreateIndex
CREATE INDEX "agent_identities_status_idx" ON "agent_identities"("status");

-- CreateIndex
CREATE INDEX "agent_delegations_agent_id_idx" ON "agent_delegations"("agent_id");

-- CreateIndex
CREATE INDEX "agent_delegations_granter_user_id_idx" ON "agent_delegations"("granter_user_id");

-- CreateIndex
CREATE INDEX "agent_delegations_status_idx" ON "agent_delegations"("status");

-- CreateIndex
CREATE INDEX "agent_delegations_expires_at_idx" ON "agent_delegations"("expires_at");

-- CreateIndex
CREATE INDEX "compliance_controls_framework_idx" ON "compliance_controls"("framework");

-- CreateIndex
CREATE INDEX "compliance_controls_status_idx" ON "compliance_controls"("status");

-- CreateIndex
CREATE UNIQUE INDEX "compliance_controls_framework_control_id_key" ON "compliance_controls"("framework", "control_id");

-- CreateIndex
CREATE UNIQUE INDEX "regions_code_key" ON "regions"("code");

-- CreateIndex
CREATE INDEX "regions_code_idx" ON "regions"("code");

-- CreateIndex
CREATE INDEX "regions_health_status_idx" ON "regions"("health_status");

-- CreateIndex
CREATE INDEX "vulnerability_reports_status_idx" ON "vulnerability_reports"("status");

-- CreateIndex
CREATE INDEX "vulnerability_reports_severity_idx" ON "vulnerability_reports"("severity");

-- CreateIndex
CREATE INDEX "vulnerability_reports_reporter_email_idx" ON "vulnerability_reports"("reporter_email");

-- CreateIndex
CREATE INDEX "security_advisories_severity_idx" ON "security_advisories"("severity");

-- CreateIndex
CREATE INDEX "security_advisories_published_at_idx" ON "security_advisories"("published_at");

-- CreateIndex
CREATE INDEX "offline_tokens_credential_id_idx" ON "offline_tokens"("credential_id");

-- CreateIndex
CREATE INDEX "offline_tokens_user_id_idx" ON "offline_tokens"("user_id");

-- CreateIndex
CREATE INDEX "offline_tokens_expires_at_idx" ON "offline_tokens"("expires_at");

-- AddForeignKey
ALTER TABLE "agent_identities" ADD CONSTRAINT "agent_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_identities" ADD CONSTRAINT "agent_identities_did_id_fkey" FOREIGN KEY ("did_id") REFERENCES "dids"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_identities" ADD CONSTRAINT "agent_identities_parent_agent_id_fkey" FOREIGN KEY ("parent_agent_id") REFERENCES "agent_identities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_delegations" ADD CONSTRAINT "agent_delegations_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agent_identities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_delegations" ADD CONSTRAINT "agent_delegations_granter_user_id_fkey" FOREIGN KEY ("granter_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_advisories" ADD CONSTRAINT "security_advisories_vulnerability_report_id_fkey" FOREIGN KEY ("vulnerability_report_id") REFERENCES "vulnerability_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
