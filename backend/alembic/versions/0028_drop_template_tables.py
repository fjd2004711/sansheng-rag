"""drop tables and columns left over from the removed template features

Revision ID: 0028_drop_template_tables
Revises: 0027_user_magic_link_epoch
Create Date: 2026-10-08

Removes message ratings, conversation sharing, user slash commands, sync
sources / logs and the ``conversations.is_demo`` flag. Their models, services
and routes no longer exist. Upgrade drops them; downgrade recreates the empty
structures (data is not restored) so the chain can still be walked back to base.
"""

from alembic import op

revision = "0028_drop_template_tables"
down_revision = "0027_user_magic_link_epoch"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DROP TABLE IF EXISTS sync_logs")
    op.execute("DROP TABLE IF EXISTS sync_sources")
    op.execute("DROP TABLE IF EXISTS user_slash_commands")
    op.execute("DROP TABLE IF EXISTS message_ratings")
    op.execute("DROP TABLE IF EXISTS conversation_shares")
    op.execute("DROP INDEX IF EXISTS ix_conversations_is_demo")
    op.execute("ALTER TABLE conversations DROP COLUMN IF EXISTS is_demo")


_DOWNGRADE_DDL = [
    """CREATE TABLE IF NOT EXISTS conversation_shares (
        id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
        conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        shared_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        shared_with uuid REFERENCES users(id) ON DELETE CASCADE,
        share_token varchar(64) UNIQUE,
        permission varchar(10) NOT NULL,
        created_at timestamptz DEFAULT now() NOT NULL,
        CONSTRAINT uq_share_conv_user UNIQUE (conversation_id, shared_with)
    )""",
    "CREATE INDEX IF NOT EXISTS ix_conversation_shares_conversation_id"
    " ON conversation_shares (conversation_id)",
    "CREATE INDEX IF NOT EXISTS ix_conversation_shares_shared_with ON conversation_shares (shared_with)",
    """CREATE TABLE IF NOT EXISTS message_ratings (
        id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
        message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        rating integer NOT NULL,
        comment text,
        created_at timestamptz DEFAULT now() NOT NULL,
        updated_at timestamptz,
        CONSTRAINT message_ratings_ck_rating_value_check CHECK (rating IN (1, -1)),
        CONSTRAINT uq_message_user_rating UNIQUE (message_id, user_id)
    )""",
    "CREATE INDEX IF NOT EXISTS ix_message_ratings_message_id ON message_ratings (message_id)",
    "CREATE INDEX IF NOT EXISTS ix_message_ratings_user_id ON message_ratings (user_id)",
    """CREATE TABLE IF NOT EXISTS user_slash_commands (
        id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name varchar(64) NOT NULL,
        prompt text,
        is_enabled boolean DEFAULT true NOT NULL,
        created_at timestamptz DEFAULT now() NOT NULL,
        updated_at timestamptz,
        CONSTRAINT uq_user_slash_commands_user_name UNIQUE (user_id, name)
    )""",
    "CREATE INDEX IF NOT EXISTS ix_user_slash_commands_user_id ON user_slash_commands (user_id)",
    """CREATE TABLE IF NOT EXISTS sync_sources (
        id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
        name varchar(255) NOT NULL,
        connector_type varchar(20) NOT NULL,
        collection_name varchar(255),
        config jsonb DEFAULT '{}'::jsonb NOT NULL,
        sync_mode varchar(20) NOT NULL,
        schedule_minutes integer,
        is_active boolean DEFAULT true NOT NULL,
        last_sync_at timestamptz,
        last_sync_status varchar(20),
        last_error text,
        created_at timestamptz DEFAULT now() NOT NULL,
        updated_at timestamptz,
        organization_id uuid
    )""",
    "CREATE INDEX IF NOT EXISTS ix_sync_sources_collection_name ON sync_sources (collection_name)",
    "CREATE INDEX IF NOT EXISTS ix_sync_sources_organization_id ON sync_sources (organization_id)",
    """CREATE TABLE IF NOT EXISTS sync_logs (
        id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
        source varchar(20) NOT NULL,
        collection_name varchar(255) NOT NULL,
        sync_source_id uuid REFERENCES sync_sources(id) ON DELETE SET NULL,
        status varchar(20) NOT NULL,
        mode varchar(20) NOT NULL,
        total_files integer DEFAULT 0 NOT NULL,
        ingested integer DEFAULT 0 NOT NULL,
        updated integer DEFAULT 0 NOT NULL,
        skipped integer DEFAULT 0 NOT NULL,
        failed integer DEFAULT 0 NOT NULL,
        error_message text,
        started_at timestamptz DEFAULT now() NOT NULL,
        completed_at timestamptz,
        created_at timestamptz DEFAULT now() NOT NULL,
        updated_at timestamptz
    )""",
    "CREATE INDEX IF NOT EXISTS ix_sync_logs_collection_name ON sync_logs (collection_name)",
    "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_demo boolean DEFAULT false NOT NULL",
    "CREATE INDEX IF NOT EXISTS ix_conversations_is_demo ON conversations (is_demo)",
]


def downgrade() -> None:
    for statement in _DOWNGRADE_DDL:
        op.execute(statement)
