import type { Metadata } from "next";
import { DemoWorkspace } from "@/components/demo/demo-workspace";

export const metadata: Metadata = {
  title: "Demo workspace",
  description: "Explore the NexusAPK Studio device playground with local sample data.",
};

/**
 * Self-contained tour of the product: no auth, no database, no orchestrator.
 * Useful for previews and design review where those backends are unreachable.
 */
export default function DemoPage() {
  return <DemoWorkspace />;
}
