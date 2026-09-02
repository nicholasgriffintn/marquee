import type { MediaTitle } from "../../../domain/catalog";
import type { FacadeId } from "../../../domain/facades";
import { BudapestFacade } from "./BudapestFacade";
import { DollhouseFacade } from "./DollhouseFacade";
import { LastShowingFacade } from "./LastShowingFacade";
import { StanfordFacade } from "./StanfordFacade";

export function CinemaFacade({ id, showing }: { id: FacadeId; showing: MediaTitle[] }) {
  switch (id) {
    case "budapest":
      return <BudapestFacade showing={showing} />;
    case "stanford":
      return <StanfordFacade showing={showing} />;
    case "dollhouse":
      return <DollhouseFacade showing={showing} />;
    case "last-showing":
      return <LastShowingFacade showing={showing} />;
    default:
      return null;
  }
}
