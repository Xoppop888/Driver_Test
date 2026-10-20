import { ExamClient } from "@/components/exam-client";
import type { Subject } from "@/lib/questions";

export function generateStaticParams() {
  return [{ subject: "1" }, { subject: "4" }];
}

export default async function ExamPage({ params }: { params: Promise<{ subject: string }> }) {
  const { subject } = await params;
  const parsed = Number(subject) === 4 ? 4 : 1;
  return <ExamClient subject={parsed as Subject} />;
}
