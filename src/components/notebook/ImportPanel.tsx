import { useImports } from "../../hooks/useImports";
import { useTraktImport } from "../../hooks/useTraktImport";
import { Callout } from "../../ui";
import { ImportHistory } from "./imports/ImportHistory";
import { ImportReview } from "./imports/ImportReview";
import { ImportWizard } from "./imports/ImportWizard";

export function ImportPanel({
  isSignedIn,
  onImported,
}: {
  isSignedIn: boolean;
  onImported: () => void;
}) {
  if (!isSignedIn) {
    return <Callout tone="info">Sign in to import viewing history.</Callout>;
  }

  return <SignedInImportPanel onImported={onImported} />;
}

function SignedInImportPanel({ onImported }: { onImported: () => void }) {
  const imports = useImports(onImported);
  const trakt = useTraktImport(true, imports.refresh);

  return (
    <>
      {imports.active ? (
        <ImportReview
          detail={imports.active}
          busy={imports.busy}
          onResolve={imports.resolve}
          onCommit={imports.commit}
          onPage={imports.page}
          onClose={imports.close}
        />
      ) : (
        <ImportWizard
          busy={imports.busy}
          progress={imports.progress}
          trakt={trakt}
          onSubmit={imports.submit}
        />
      )}
      {(imports.error || trakt.error) && <Callout>{imports.error || trakt.error}</Callout>}
      <ImportHistory
        runs={imports.runs}
        busy={imports.busy}
        onOpen={imports.open}
        onRemove={imports.remove}
      />
    </>
  );
}
