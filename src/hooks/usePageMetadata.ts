import { useEffect } from "react";

import { applyPageMetadata, type PageMetadata } from "../lib/head-tags";
import { useResource } from "./useResource";

export function usePageMetadata(path: string, fallbackTitle: string) {
  const { data } = useResource<PageMetadata>(`/api/page-metadata?path=${encodeURIComponent(path)}`);

  useEffect(() => {
    if (data) {
      applyPageMetadata(data);

      return;
    }

    if (fallbackTitle) {
      document.title = fallbackTitle;
    }
  }, [data, fallbackTitle]);
}
