import { redirect } from "next/navigation";

// The Daily Digest now lives under the calendar (the day view below the grid),
// so this old route just forwards there.
export default function DigestPage() {
  redirect("/calendar");
}
