import KitBuilder from "@/components/kit/KitBuilder";

export const metadata = { title: "Kit — primer." };

export default async function KitPage({ params }) {
  const { id } = await params;
  return <KitBuilder kitId={id} />;
}
