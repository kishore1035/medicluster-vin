import SculptureHero from "@/components/ui/liquid-sculpture-hero";

/** Standalone example; homepage uses backgroundOnly to retain its navigation. */
export default function Demo() {
  return <SculptureHero
    src="/images/liquid-sculpture.webp"
    mobileSrc="/images/liquid-sculpture.webp"
    darkSrc="/images/liquid-sculpture.webp"
    mobileDarkSrc="/images/liquid-sculpture.webp"
    brand="MediCluster"
    navLinks={[{ label: "Apps", href: "/download#apps" }, { label: "How to install", href: "/download#install" }]}
    navCta={{ label: "Get the apps", href: "/download#apps" }}
    eyebrow=""
    headline={"Better care.\nEverywhere you are."}
    headlineAccent=""
    body="One connected platform. The right app for every role."
    primaryCta={{ label: "Explore apps", href: "/download#apps" }}
    secondaryCta={{ label: "Patient portal", href: "/app" }}
    background="#ffffff"
    textColor="#111215"
    accentColor="#e0703f"
    backdropText=""
    themeToggle={false}
    loadFonts={false}
    headingFont="Arial, Helvetica, sans-serif"
    bodyFont="Arial, Helvetica, sans-serif"
    showCredit={false}
  />;
}
