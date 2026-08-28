import { useTitleAwards } from "../../hooks/useTitleAwards";
import { AwardsNote } from "../AwardsNote";

export function TitleAwards({ titleId }: { titleId: string }) {
  const { awards } = useTitleAwards(titleId);

  return <AwardsNote awards={awards} />;
}
