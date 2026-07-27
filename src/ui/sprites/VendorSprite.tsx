import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { VendorId } from '../../game/types';

/**
 * Renders the vendor NPC sprites (Blacksmith, Alchemist, Enchanter). Much
 * simpler than HeroSprite: one working-animation strip per vendor, no
 * skins, no multiple animations. Loads public/vendors/manifest.json once.
 *
 * Generate the art with:
 *   python3 tools/import_vendors.py --src <folder with BLACKSMITH.png etc> --out public/vendors
 */

interface VendorManifestEntry {
  name: string;
  frameW: number;
  frameH: number;
  frames: number;
}

type VendorManifest = Partial<Record<VendorId, VendorManifestEntry>>;

const FPS = 6;

let cachedManifest: VendorManifest | null = null;
let manifestPromise: Promise<VendorManifest> | null = null;

function loadManifest(): Promise<VendorManifest> {
  if (cachedManifest) return Promise.resolve(cachedManifest);
  if (!manifestPromise) {
    manifestPromise = fetch('./vendors/manifest.json')
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: VendorManifest) => {
        cachedManifest = data;
        return data;
      })
      .catch(() => ({}));
  }
  return manifestPromise;
}

export function VendorSprite({
  vendor, height, title, animate = true,
}: {
  vendor: VendorId;
  height: number;
  title?: string;
  /** Pauses on frame 0 when false — used when the vendor's tab isn't focused, to avoid animating off-screen. */
  animate?: boolean;
}) {
  const [manifest, setManifest] = useState<VendorManifest | null>(cachedManifest);
  const [frame, setFrame] = useState(0);
  const frameRef = useRef(0);

  useEffect(() => {
    if (manifest) return;
    let live = true;
    void loadManifest().then((m) => { if (live) setManifest(m); });
    return () => { live = false; };
  }, [manifest]);

  const entry = manifest?.[vendor];

  useEffect(() => {
    if (!entry || !animate) return undefined;
    const id = window.setInterval(() => {
      frameRef.current = (frameRef.current + 1) % entry.frames;
      setFrame(frameRef.current);
    }, 1000 / FPS);
    return () => window.clearInterval(id);
  }, [entry, animate]);

  if (!entry) {
    // Art absent (gitignored, licensed) or not loaded yet — render nothing
    // rather than a broken image; the panel around this still works.
    return <div style={{ height, width: height }} title={title} />;
  }

  const scale = height / entry.frameH;
  const style: CSSProperties = {
    width: entry.frameW * scale,
    height: entry.frameH * scale,
    backgroundImage: `url(./vendors/${vendor}.png)`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: `-${frame * entry.frameW * scale}px 0`,
    backgroundSize: `${entry.frameW * entry.frames * scale}px ${entry.frameH * scale}px`,
    imageRendering: 'pixelated',
  };

  return <div style={style} title={title ?? entry.name} />;
}
