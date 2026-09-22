import Hero from "@/components/home/Hero";
import KitsRow from "@/components/home/KitsRow";
import HowItWorks from "@/components/home/HowItWorks";
import Outro from "@/components/home/Outro";

// One home page for both states rather than a marketing page and a dashboard. The
// only signed-in-aware piece is KitsRow; everything else is static and server-rendered.

export default function HomePage() {
  return (
    <>
      <Hero />
      <KitsRow />
      <HowItWorks />
      <Outro />
    </>
  );
}
