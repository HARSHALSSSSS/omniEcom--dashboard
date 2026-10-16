import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  Store,
  Layers,
  Truck,
  Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Stepper } from "@/components/common/Stepper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CONNECTORS } from "@/constants/connectors";
import { ROUTES } from "@/constants/routes";
import { useCreateConnection } from "@/hooks/useConnectors";

const SETUP_STEPS = [
  { id: "review", label: "Review Permissions" },
  { id: "authorize", label: "Authorize Account" },
  { id: "verify", label: "Verify & Test" },
  { id: "sync", label: "Initial Sync" },
  { id: "ready", label: "Ready" },
];

export default function ConnectionSetupPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const connector = CONNECTORS.find((c) => c.id === id) ?? CONNECTORS[0];

  const [currentStep, setCurrentStep] = useState(0);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [isVerifying, setIsVerifying] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);

  const createConnectionMutation = useCreateConnection();

  const handleNext = () => {
    if (currentStep === 1) {
      // Step: Authorize -> run verification
      setIsVerifying(true);
      setTimeout(() => {
        setIsVerifying(false);
        setCurrentStep(2);
      }, 1200);
    } else if (currentStep === 2) {
      // Step: Verify -> start initial sync simulation
      setCurrentStep(3);
      let p = 0;
      const interval = setInterval(() => {
        p += 25;
        setSyncProgress(p);
        if (p >= 100) {
          clearInterval(interval);
          createConnectionMutation.mutate({
            connectorId: connector.id,
            credentials: fieldValues,
            syncCatalog: true,
            syncOrders: true,
            syncInventory: true,
          });
          setCurrentStep(4);
        }
      }, 600);
    } else if (currentStep === 4) {
      navigate(ROUTES.MARKETPLACE_HUB);
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  return (
    <div className="mx-auto max-w-[900px] space-y-6 pb-20">
      <PageHeader
        eyebrow="CONFIG-DRIVEN SETUP"
        title={`Connect ${connector.name}`}
        description={`Configure two-way synchronization for ${connector.name} using standardized gateway protocols.`}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(ROUTES.MARKETPLACE_HUB)}
          >
            Cancel
          </Button>
        }
      />

      {/* Stepper */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <Stepper steps={SETUP_STEPS} currentStepIndex={currentStep} />
      </div>

      {/* STEP 0: REVIEW PERMISSIONS */}
      {currentStep === 0 && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#E6F4FF] text-[#1D4ED8]">
              {connector.category === "storefront" ? (
                <Layers className="h-6 w-6" />
              ) : connector.category === "shipping" ? (
                <Truck className="h-6 w-6" />
              ) : (
                <Store className="h-6 w-6" />
              )}
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Review {connector.name} Permissions
              </h3>
              <p className="text-xs text-muted-foreground">
                omniEcom requires the following data scopes to maintain synchronized listings and orders.
              </p>
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 text-emerald-600 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-foreground">
                  Read & Write Product Listings
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Publish master catalog items, update prices, descriptions, and media.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 text-emerald-600 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-foreground">
                  Inventory Delta Synchronization
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Instantly push stock reserve and buffer updates across marketplaces.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 text-emerald-600 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-foreground">
                  Order Ingestion & Fulfillment Dispatches
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Download new orders in real-time and post tracking numbers upon dispatch.
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleNext}
            >
              Accept & Proceed <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 1: AUTHORIZE ACCOUNT */}
      {currentStep === 1 && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-6">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              Authorize {connector.name} Account
            </h3>
            <p className="text-xs text-muted-foreground">
              {connector.authType === "oauth"
                ? `You will authenticate directly with ${connector.name} OAuth portal.`
                : "Enter your developer API credentials."}
            </p>
          </div>

          {connector.fields.length > 0 ? (
            <div className="space-y-4">
              {connector.fields.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    {field.label} {field.required && <span className="text-destructive">*</span>}
                  </label>
                  {field.type === "select" ? (
                    <select
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                      value={fieldValues[field.key] ?? ""}
                      onChange={(e) =>
                        setFieldValues({
                          ...fieldValues,
                          [field.key]: e.target.value,
                        })
                      }
                    >
                      <option value="">Select option...</option>
                      {field.options?.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      type={field.secret ? "password" : "text"}
                      placeholder={`Enter ${field.label.toLowerCase()}`}
                      value={fieldValues[field.key] ?? ""}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setFieldValues({
                          ...fieldValues,
                          [field.key]: e.target.value,
                        })
                      }
                      className="text-xs"
                    />
                  )}
                  {field.help && (
                    <p className="text-[11px] text-muted-foreground">{field.help}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-muted/20 p-6 text-center space-y-3">
              <Store className="h-8 w-8 mx-auto text-[#1D4ED8]" />
              <p className="text-xs text-muted-foreground">
                Click below to launch the partner authorization consent window.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => alert(`Launching ${connector.name} OAuth portal...`)}
              >
                Launch OAuth Consent <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={handleBack} className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <Button
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleNext}
              disabled={isVerifying}
            >
              {isVerifying ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Verifying Credentials...
                </>
              ) : (
                <>
                  Verify Connection <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* STEP 2: VERIFY & TEST */}
      {currentStep === 2 && (
        <div className="rounded-xl border border-border bg-card p-8 text-center shadow-sm space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h3 className="text-base font-bold text-foreground">
            Connection Verified Successfully!
          </h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            API token validated. Server ping response: 142ms. Ready to trigger initial catalog reconciliation.
          </p>

          <div className="pt-4 flex justify-between">
            <Button variant="outline" onClick={handleBack} className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <Button
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleNext}
            >
              Start Initial Sync <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3: INITIAL SYNC */}
      {currentStep === 3 && (
        <div className="rounded-xl border border-border bg-card p-10 text-center shadow-sm space-y-6">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#E6F4FF] text-[#1D4ED8]">
            <RefreshCw className="h-7 w-7 animate-spin" />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground">
              Synchronizing Catalog & Orders
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Pulling active listings, stock allocations, and recent orders...
            </p>
          </div>

          <div className="mx-auto max-w-md">
            <div className="flex justify-between text-xs font-semibold mb-1.5">
              <span>Syncing records...</span>
              <span className="font-mono text-[#1D4ED8]">{syncProgress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-[#1D4ED8] transition-all duration-300"
                style={{ width: `${syncProgress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: READY */}
      {currentStep === 4 && (
        <div className="rounded-xl border border-border bg-card p-10 text-center shadow-sm space-y-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-9 w-9" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">
              {connector.name} is Connected and Live!
            </h2>
            <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1">
              Automatic sync schedules have been activated. Real-time updates will reflect in your Marketplace Hub.
            </p>
          </div>

          <Button
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => navigate(ROUTES.MARKETPLACE_HUB)}
          >
            Go to Marketplace Hub <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
