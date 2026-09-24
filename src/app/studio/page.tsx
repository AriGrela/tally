import type { Metadata } from "next";
import { StudioClient } from "@/components/studio/StudioClient";

export const metadata: Metadata = {
  title: "Studio",
  description: "Compose an agent from skills and tools, run it with your own key and inspect every step.",
};

export default function StudioPage() {
  return <StudioClient />;
}
