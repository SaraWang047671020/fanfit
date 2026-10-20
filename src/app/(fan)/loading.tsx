// The fan shell (top bar, bottom tabs) stays; only the page area shows a placeholder.
import Skeleton from "../Skeleton";

export default function Loading() {
  return <Skeleton bar={false} />;
}
