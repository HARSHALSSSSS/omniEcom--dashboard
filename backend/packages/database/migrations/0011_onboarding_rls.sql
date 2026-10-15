-- Onboarding: tenant isolation + updated_at triggers + grants (see 0010).
SELECT enable_tenant_rls('onboarding_progress');
--> statement-breakpoint
SELECT enable_tenant_rls('fulfillment_preferences');
--> statement-breakpoint
SELECT attach_updated_at('onboarding_progress');
--> statement-breakpoint
SELECT attach_updated_at('fulfillment_preferences');
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oms_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON onboarding_progress, fulfillment_preferences TO oms_app;
  END IF;
END $$;
--> statement-breakpoint
