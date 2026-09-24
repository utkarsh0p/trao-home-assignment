import KitBuilder from "@/components/kit/KitBuilder";

export default async function KitPage({ params }) {
  const { id } = await params;
  return <KitBuilder kitId={id} />;
}
