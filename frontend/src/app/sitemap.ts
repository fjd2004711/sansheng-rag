import type { MetadataRoute } from "next";

import { SITE } from "@/lib/seo";

/** Only the public pages are indexable; the product shell (chat / rag / evaluation) is authenticated. */
const PUBLIC_PATHS = ["/", "/login", "/register"];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return PUBLIC_PATHS.map((path) => ({
    url: `${SITE.url}/${SITE.defaultLocale}${path === "/" ? "" : path}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: path === "/" ? 1 : 0.3,
  }));
}
