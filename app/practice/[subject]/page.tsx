import { PracticeClient } from "@/components/practice-client";
import type { Subject } from "@/lib/questions";

export function generateStaticParams() {
  return [{ subject: "1" }, { subject: "4" }];
}

export default async function PracticePage({ params }: { params: Promise<{ subject: string }> }) {
  const { subject } = await params;
  const parsed = Number(subject) === 4 ? 4 : 1;
  return <PracticeClient subject={parsed as Subject} />;
}
