"use client";

/**
 * Ambient backdrop: layered radial glows, drifting aurora blobs, a faded
 * technical grid and a faint film-grain layer. Purely decorative, fixed
 * behind all content, and cheap (no JS animation loop).
 */
export function AmbientBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* base wash */}
      <div className="absolute inset-0 bg-[#09090b]" />

      {/* top radial glow */}
      <div className="absolute -top-[28rem] left-1/2 h-[52rem] w-[72rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(99,102,241,0.22),rgba(139,92,246,0.10)_45%,transparent_72%)] blur-2xl" />

      {/* drifting aurora blobs */}
      <div className="animate-drift absolute -left-40 top-24 h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(closest-side,rgba(6,182,212,0.16),transparent)] blur-3xl" />
      <div
        className="animate-drift absolute -right-32 top-1/3 h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(closest-side,rgba(139,92,246,0.16),transparent)] blur-3xl"
        style={{ animationDelay: "-7s" }}
      />
      <div
        className="animate-drift absolute bottom-0 left-1/3 h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(closest-side,rgba(99,102,241,0.14),transparent)] blur-3xl"
        style={{ animationDelay: "-14s" }}
      />

      {/* grid */}
      <div className="bg-grid absolute inset-0 opacity-70" />

      {/* bottom fade to obsidian */}
      <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-[#09090b] via-[#09090b]/85 to-transparent" />

      {/* grain */}
      <div className="bg-noise absolute inset-0" />
    </div>
  );
}
