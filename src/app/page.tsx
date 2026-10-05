import { redirect } from "next/navigation";

/** The backoffice has no public home: everything starts at the operations panel. */
export default function Home() {
  redirect("/panel");
}
