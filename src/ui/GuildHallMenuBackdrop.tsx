import { useEffect, useRef, useState } from 'react';
import { DecorationArt } from './GuildHallCustomizeScene';
import { GuildHallThemeDef } from '../game/data/guildHallSlots';
import { GuildHallDecorationDef, GuildHallSlotDef } from '../game/types';

/**
 * The general Guild Menu backdrop (patch 0208 gave every non-Raids/
 * Hatchery/Peddler tab this same Guild Hall art instead of a separate
 * fixed painting), now with a player's own placed decorations actually
 * rendered on top of it (patch 0209) -- the rest of "every time you
 * upgrade something, you see it in the background" from the original
 * brainstorm. Reuses `DecorationArt` (GuildHallCustomizeScene.tsx) for
 * the art itself so a placed item looks identical here and in the
 * dedicated Customize scene.
 *
 * The one real wrinkle this component exists to solve: `MenuWindow`'s
 * backdrop has always used `background-size: cover` (crop-to-fill,
 * matching the Raids/Hatchery/Peddler backdrops it sits alongside), but
 * a slot's `top`/`left`/`width`/`height` are percentages of the
 * background art's own *native* bounding box (see `slotsForTheme` in
 * guildHallSlots.ts and `.guildhall-customize-scene`'s own CSS comment)
 * -- valid ONLY when the box displaying the image is locked to that same
 * aspect ratio, which the Customize scene's own container deliberately
 * is (`aspect-ratio: 1774 / 887`) and `menu-root` is not (it's whatever
 * shape the app window happens to be). Naively reusing the same percent
 * coordinates against a `cover`-cropped, arbitrary-aspect box would
 * misplace every decoration by whatever the crop happens to be at that
 * window size. Rather than switch this backdrop to a letterboxed
 * `contain` layout (a real visual change to what patch 0208 already
 * shipped, and inconsistent with the other three tabs' own cover-fit
 * backdrops), this component does the same math the browser does for
 * `background-size: cover` by hand -- reading the image's own actual
 * pixel dimensions once it loads (not hardcoded, unlike the Customize
 * scene's own CSS -- this stays correct even if a future theme's art
 * isn't 1774x887) and the container's current rendered size (via
 * `ResizeObserver`, so it stays correct across window resizes) -- then
 * converts each equipped slot's percent rect into real pixels within
 * that same crop/scale, so a decoration lands in exactly the same spot
 * on the room it would in the Customize scene, however the window
 * happens to be shaped.
 */
export function GuildHallMenuBackdrop({
  theme, equipped,
}: {
  theme: GuildHallThemeDef;
  equipped: { slot: GuildHallSlotDef; decoration: GuildHallDecorationDef }[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState<{ w: number; h: number } | null>(null);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Reset the measured image size whenever the theme (and so the image
  // src) changes -- otherwise a stale size from the previous theme's art
  // could briefly be used to position this theme's slots for one frame
  // before the new image's onLoad fires.
  useEffect(() => setImgSize(null), [theme.background]);

  const rects = containerSize && imgSize
    ? equipped.map(({ slot, decoration }) => {
        // Same formula as CSS `background-size: cover`: scale up
        // uniformly until both dimensions at least cover the container,
        // then center the (now-overflowing) image within it.
        const scale = Math.max(containerSize.w / imgSize.w, containerSize.h / imgSize.h);
        const displayW = imgSize.w * scale;
        const displayH = imgSize.h * scale;
        const offsetX = (containerSize.w - displayW) / 2;
        const offsetY = (containerSize.h - displayH) / 2;
        return {
          slot, decoration,
          rect: {
            left: offsetX + (slot.left / 100) * displayW,
            top: offsetY + (slot.top / 100) * displayH,
            width: (slot.width / 100) * displayW,
            height: (slot.height / 100) * displayH,
          },
        };
      })
    : [];

  return (
    <div ref={containerRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <img
        src={`./guildhall-customize/${theme.background}`}
        alt=""
        aria-hidden="true"
        onLoad={(e) => setImgSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
      />
      {rects.map(({ slot, decoration, rect }) => (
        <div
          key={slot.id}
          style={{ position: 'absolute', left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
        >
          <DecorationArt decoration={decoration} />
        </div>
      ))}
    </div>
  );
}
