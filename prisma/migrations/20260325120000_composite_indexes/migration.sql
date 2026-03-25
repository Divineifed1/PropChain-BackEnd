-- Composite and supporting indexes for critical read paths.
-- Generated manually to match prisma/schema.prisma changes.

-- user_activities: common access patterns
CREATE INDEX "user_activities_user_id_action_created_at_idx"
ON "user_activities" ("user_id", "action", "created_at" DESC);

-- user_relationships: followers/following lists filtered by status and sorted by recency
CREATE INDEX "user_relationships_following_id_status_created_at_idx"
ON "user_relationships" ("following_id", "status", "created_at" DESC);

CREATE INDEX "user_relationships_follower_id_status_created_at_idx"
ON "user_relationships" ("follower_id", "status", "created_at" DESC);

-- properties: listing pages (status) ordered by recency; owner dashboards; status + price range filters
CREATE INDEX "properties_status_created_at_idx"
ON "properties" ("status", "created_at" DESC);

CREATE INDEX "properties_owner_id_created_at_idx"
ON "properties" ("owner_id", "created_at" DESC);

CREATE INDEX "properties_status_price_idx"
ON "properties" ("status", "price");

-- property_valuations: history pages (property) ordered by valuationDate desc
CREATE INDEX "property_valuations_property_id_valuation_date_idx"
ON "property_valuations" ("property_id", "valuation_date" DESC);

-- audit_logs: common filters + ordered by timestamp
CREATE INDEX "audit_logs_timestamp_idx"
ON "audit_logs" ("timestamp" DESC);

CREATE INDEX "audit_logs_user_id_timestamp_idx"
ON "audit_logs" ("user_id", "timestamp" DESC);

CREATE INDEX "audit_logs_table_name_timestamp_idx"
ON "audit_logs" ("table_name", "timestamp" DESC);

CREATE INDEX "audit_logs_operation_timestamp_idx"
ON "audit_logs" ("operation", "timestamp" DESC);

-- system_logs: operational queries (by level/context) ordered by timestamp
CREATE INDEX "system_logs_timestamp_idx"
ON "system_logs" ("timestamp" DESC);

CREATE INDEX "system_logs_log_level_timestamp_idx"
ON "system_logs" ("log_level", "timestamp" DESC);

CREATE INDEX "system_logs_context_timestamp_idx"
ON "system_logs" ("context", "timestamp" DESC);

