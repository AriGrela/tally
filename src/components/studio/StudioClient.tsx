"use client";

import dynamic from "next/dynamic";
import { Logo } from "../Logo";

// The studio reads browser storage and the URL hash on first render, so it only renders on the client.
export const StudioClient = dynamic(() => import("./Studio").then((m) => m.Studio), {
  ssr: false,
  loading: () => (
    <div className="h-dvh grid place-items-center">
      <Logo state="wait" />
    </div>
  ),
});
