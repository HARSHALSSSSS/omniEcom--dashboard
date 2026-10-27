import { ErrorPage } from "./ErrorPage";

export default function NotFoundPage() {
  return <ErrorPage notFound status={404} />;
}
