import type { MetadataRoute } from "next";

import { SITE } from "@/lib/seo";

/** Robots policy:
 *   - Public marketing pages are indexable.
 *   - Anything authenticated (dashboard / chat / admin / billing / API) is blocked.
 *   - The /api proxy and /_next assets are blocked from indexing too. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow: ["/api/", "/_next/", "/chat", "/rag", "/evaluation"],
      },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
