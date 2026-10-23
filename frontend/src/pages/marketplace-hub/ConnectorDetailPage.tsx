import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ROUTES } from "@/constants/routes";
import { errorMessage, isApiError } from "@/api/errors";
import { useCan } from "@/hooks/useCan";
import { useConnector, useHubAccount, useHubAccounts } from "@/hooks/useHub";
import { AccountDetailView } from "@/components/marketplace-hub/detail/AccountDetailView";
import { ModernConnectorDetailView } from "@/components/marketplace-hub/detail/ModernConnectorDetailView";
import { LoadError, StateBox } from "@/components/marketplace-hub/accounts/hubUi";

/** account ids are UUIDs, connector codes are words (amazon_in, flipkart): the id tells which page this is */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isNotFound = (e: unknown) => isApiError(e) && e.status === 404;

function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-28 rounded-xl" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
    </div>
  );
}

function NotFound({ what }: { what: string }) {
  return (
    <StateBox title={`${what} not found`} description="It may have been deleted, or the link is wrong.">
      <Link to={ROUTES.MARKETPLACE_HUB} className={buttonVariants({ variant: "outline", size: "sm", className: "text-xs" })}>
        Back to the hub
      </Link>
    </StateBox>
  );
}

function AccountPage({ id }: { id: string }) {
  const navigate = useNavigate();
  const account = useHubAccount(id);
  return (
    <>
      <PageHeader
        eyebrow="CONNECTION"
        title={account.data?.name ?? "Connection"}
        description="Health, sync runs, capabilities and settings of this connected account."
        actions={
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate(ROUTES.MARKETPLACE_HUB)}>
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back to Hub
          </Button>
        }
      />
      {account.isPending && <Loading />}
      {account.isError && (isNotFound(account.error) ? <NotFound what="Connection" /> : <LoadError title="The connection could not be loaded." message={errorMessage(account.error)} onRetry={() => void account.refetch()} />)}
      {account.data && <AccountDetailView account={account.data} />}
    </>
  );
}

function ConnectorPage({ code }: { code: string }) {
  const connector = useConnector(code);
  const accounts = useHubAccounts();
  const canWrite = useCan("marketplace_accounts:write");
  const mine = accounts.data ? accounts.data.items.filter((a) => a.marketplace === code) : null;
  const others = accounts.data ? accounts.data.items.filter((a) => a.marketplace !== code) : null;
  const primaryAccount = mine && mine.length > 0 ? mine[0] : null;
  // the detail adds the lanes and the recent sync jobs that tell what each stream is doing
  const detail = useHubAccount(primaryAccount?.id ?? null);

  return (
    <>
      {!canWrite && (
        <p role="status" className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          You have read-only access. You can review this connector, but connecting or changing accounts needs the marketplace_accounts:write permission.
        </p>
      )}
      {connector.isPending && <Loading />}
      {connector.isError && (isNotFound(connector.error) ? <NotFound what="Connector" /> : <LoadError title="The connector could not be loaded." message={errorMessage(connector.error)} onRetry={() => void connector.refetch()} />)}
      {accounts.isError && <LoadError title="Your accounts could not be loaded." message={errorMessage(accounts.error)} onRetry={() => void accounts.refetch()} />}
      {connector.data && !accounts.isError && (
        <ModernConnectorDetailView connector={connector.data} account={detail.data ?? primaryAccount} accounts={mine} otherAccounts={others} />
      )}
    </>
  );
}

export default function ConnectorDetailPage() {
  const { id = "" } = useParams();
  return <div className="w-full space-y-6 pb-16">{UUID.test(id) ? <AccountPage id={id} /> : <ConnectorPage code={id} />}</div>;
}
