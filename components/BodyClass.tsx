"use client";

import { useEffect } from "react";

/**
 * Applies GAS's body-level layout classes to <body> for the current route.
 *
 * GAS set these directly in each panel's HTML:
 *   Admin.html / Client.html / Growth.html / Operations.html -> class="full-page"
 *   Recruiter.html / Agent.html                              -> (compact side panel)
 *
 * The webapp renders every panel in a browser tab, so Recruiter/Agent use
 * "full-page narrow-page" -- full-page sizing, side-panel column width.
 */
export default function BodyClass({ names }: { names: string }) {
  useEffect(() => {
    const list = names.split(/\s+/).filter(Boolean);
    if (!list.length) return;
    document.body.classList.add(...list);
    return () => document.body.classList.remove(...list);
  }, [names]);

  return null;
}
