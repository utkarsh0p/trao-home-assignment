import JobProgress from "@/components/jobs/JobProgress";

export const metadata = { title: "Building your kit — primer." };

export default async function JobPage({ params }) {
  const { id } = await params;
  return <JobProgress jobId={id} />;
}
