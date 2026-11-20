import { MigrationInterface, QueryRunner } from 'typeorm';

export class Initial1795200018678 implements MigrationInterface {
  name = 'Initial1795200018678';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "outbox" (
                "id" uuid NOT NULL,
                "exchange" text NOT NULL,
                "routing_key" text NOT NULL,
                "message" jsonb NOT NULL,
                "headers" jsonb NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "published_at" TIMESTAMP WITH TIME ZONE,
                "attempts" integer NOT NULL,
                "last_error" text,
                CONSTRAINT "PK_340ab539f309f03bdaa14aa7649" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_outbox_unpublished_created_at" ON "outbox" ("created_at", "id")
            WHERE published_at IS NULL
        `);
    await queryRunner.query(`
            CREATE TABLE "inbox" (
                "event_id" uuid NOT NULL,
                "source" text NOT NULL,
                "event_type" text NOT NULL,
                "received_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "PK_9b85eb4cab41c7c6023b1e579d0" PRIMARY KEY ("event_id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "agents" (
                "id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "status" text NOT NULL,
                "version" integer NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "ck_agents_status" CHECK (status IN ('active', 'archived')),
                CONSTRAINT "PK_9c653f28ae19c5884d5baf6a1d9" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "model_prices" (
                "id" uuid NOT NULL,
                "model_id" uuid NOT NULL,
                "effective_from" TIMESTAMP WITH TIME ZONE NOT NULL,
                "input_per_m_tok" numeric(12, 6) NOT NULL,
                "output_per_m_tok" numeric(12, 6) NOT NULL,
                "cache_read_per_m_tok" numeric(12, 6),
                "cache_write_per_m_tok" numeric(12, 6),
                "long_context" jsonb,
                "created_by" text NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "PK_1409a57d11faf4496339c681f6e" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_model_prices_model_id_effective_from" ON "model_prices" ("model_id", "effective_from")
        `);
    await queryRunner.query(`
            CREATE TABLE "models" (
                "id" uuid NOT NULL,
                "provider" text NOT NULL,
                "model" text NOT NULL,
                "kind" text NOT NULL DEFAULT 'chat',
                "name" text NOT NULL,
                "status" text NOT NULL,
                "context_window" integer,
                "max_output_tokens" integer,
                "version" integer NOT NULL,
                "created_by" text NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "ck_models_kind" CHECK (kind IN ('chat', 'embedding')),
                CONSTRAINT "ck_models_status" CHECK (status IN ('active', 'deprecated', 'retired')),
                CONSTRAINT "PK_ef9ed7160ea69013636466bf2d5" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_models_name_id" ON "models" ("name", "id")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_models_provider_model" ON "models" ("provider", "model")
        `);
    await queryRunner.query(`
            CREATE TABLE "model_keys" (
                "id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "scope" text NOT NULL,
                "scope_id" uuid NOT NULL,
                "provider" text NOT NULL,
                "hint" text,
                "base_url" text,
                "updated_by" text NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "ck_model_keys_scope" CHECK (scope IN ('organization', 'agent')),
                CONSTRAINT "PK_7bed3818534fd14655ee1101228" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_model_keys_scope_scope_id_provider" ON "model_keys" ("scope", "scope_id", "provider")
        `);
    await queryRunner.query(`
            CREATE TABLE "budgets" (
                "id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "project_id" uuid,
                "scope" text NOT NULL,
                "scope_id" uuid NOT NULL,
                "limit_usd" numeric(18, 6),
                "threshold_window" text,
                "exhausted_window" text,
                "version" integer NOT NULL,
                "updated_by" text NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "ck_budgets_scope" CHECK (
                    scope IN ('organization', 'project', 'agent', 'task_tree')
                ),
                CONSTRAINT "PK_9c8a51748f82387644b773da482" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_budgets_scope_scope_id" ON "budgets" ("scope", "scope_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "model_calls" (
                "id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "project_id" uuid NOT NULL,
                "task_id" uuid,
                "task_tree_id" uuid,
                "agent_id" uuid,
                "agent_version_id" uuid,
                "execution_id" uuid,
                "caller" text NOT NULL,
                "purpose" text NOT NULL,
                "kind" text NOT NULL,
                "provider" text NOT NULL,
                "model" text NOT NULL,
                "key_source" text NOT NULL,
                "input_tokens" integer,
                "output_tokens" integer,
                "cache_read_tokens" integer,
                "cache_write_tokens" integer,
                "cost_usd" numeric(14, 6),
                "price_id" uuid,
                "finish_reason" text,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "ck_model_calls_kind" CHECK (kind IN ('chat', 'embedding')),
                CONSTRAINT "ck_model_calls_key_source" CHECK (
                    key_source IN ('agent', 'organization', 'platform')
                ),
                CONSTRAINT "PK_e2538384974b0960151a53380c1" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_model_calls_task_tree_id" ON "model_calls" ("task_tree_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_model_calls_agent_id_created_at" ON "model_calls" ("agent_id", "created_at")
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_model_calls_project_id_created_at" ON "model_calls" ("project_id", "created_at")
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_model_calls_organization_id_created_at" ON "model_calls" ("organization_id", "created_at")
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_model_calls_execution_id" ON "model_calls" ("execution_id")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "public"."ix_model_calls_execution_id"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_model_calls_organization_id_created_at"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_model_calls_project_id_created_at"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_model_calls_agent_id_created_at"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_model_calls_task_tree_id"
        `);
    await queryRunner.query(`
            DROP TABLE "model_calls"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."uq_budgets_scope_scope_id"
        `);
    await queryRunner.query(`
            DROP TABLE "budgets"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."uq_model_keys_scope_scope_id_provider"
        `);
    await queryRunner.query(`
            DROP TABLE "model_keys"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."uq_models_provider_model"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_models_name_id"
        `);
    await queryRunner.query(`
            DROP TABLE "models"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."uq_model_prices_model_id_effective_from"
        `);
    await queryRunner.query(`
            DROP TABLE "model_prices"
        `);
    await queryRunner.query(`
            DROP TABLE "agents"
        `);
    await queryRunner.query(`
            DROP TABLE "inbox"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_outbox_unpublished_created_at"
        `);
    await queryRunner.query(`
            DROP TABLE "outbox"
        `);
  }
}
