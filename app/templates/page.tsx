import { redirect } from "next/navigation";

// Templates (order-form filling) are built but not exposed to users yet.
// Keep the backend (routes + components) and send anyone who lands here home.
export default function TemplatesPage() {
  redirect("/");
}
