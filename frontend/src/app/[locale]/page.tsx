import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/constants";

// No landing page: the product opens straight into the chat (the auth guard sends
// signed-out visitors on to the login page).
export default function HomePage() {
  redirect(ROUTES.CHAT);
}
