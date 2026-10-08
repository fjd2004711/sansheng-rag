import type { Metadata } from "next";

import { RegisterForm } from "@/components/auth";

export const metadata: Metadata = { title: "注册" };

export default function RegisterPage() {
  return <RegisterForm />;
}
