import JobProgress from "@/components/jobs/JobProgress";

export default async function JobPage({ params }) {
  const { id } = await params;
  return <JobProgress jobId={id} />;
}
