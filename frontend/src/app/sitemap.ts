import type { MetadataRoute } from "next";

import { SITE } from "@/lib/seo";

/** Only the sign-in pages are public; the product itself is behind the auth guard. */
const PUBLIC_PATHS = ["/login", "/register"];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return PUBLIC_PATHS.map((path) => ({
    url: `${SITE.url}/${SITE.defaultLocale}${path}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.3,
  }));
}
