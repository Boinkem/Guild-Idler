import { useState } from 'react';
import { DiceFace } from '../../game/types';

/**
 * One selectable pixel-dice face button, built from the Snoblin Pixel
 * Dice FREE pack (public/peddler/dice/picker/dice_<face>_<state>.png,
 * 22x22 source art, normal/hover/dragging states already baked into
 * the pack -- no sprite-sheet math needed the way DiceSprite.tsx's
 * roll-animation sheet requires). Replaces the plain numbered .chip
 * buttons Call a Number and High/Low both used to pick a target with --
 * direct request off a mockup: hovering "pops" the die up and swaps to
 * its hover frame, clicking "presses" it down into its dragging frame
 * before settling on the selection, rather than an instant flat toggle.
 *
 * Deliberately its own small component rather than folding this into
 * DiceSprite -- that one renders the single big rolling/landed die from
 * a wholly different asset (one shared sprite sheet, animated), this
 * renders any number of small always-idle selection buttons from three
 * loose per-face files each. No shared geometry or state between them.
 */

const PRESS_MS = 200;

export interface DicePickerFaceProps {
  face: DiceFace;
  selected: boolean;
  disabled?: boolean;
  /** Small (used inline in a High/Low zone) vs the slightly larger
   *  standalone Call-a-Number row -- both reuse the same three sprite
   *  states, just scaled differently to fit their own layout. */
  size?: number;
  onSelect: (face: DiceFace) => void;
}

export function DicePickerFace({
  face, selected, disabled, size = 44, onSelect,
}: DicePickerFaceProps) {
  const [hovering, setHovering] = useState(false);
  const [pressing, setPressing] = useState(false);

  const state = pressing ? 'dragging' : hovering ? 'hover' : 'normal';
  const src = `./peddler/dice/picker/dice_${face}_${state}.png`;

  const handleClick = () => {
    if (disabled) return;
    setHovering(false);
    setPressing(true);
    window.setTimeout(() => {
      setPressing(false);
      onSelect(face);
    }, PRESS_MS);
  };

  return (
    <button
      type="button"
      className={`dice-picker-face ${selected ? 'selected' : ''} ${hovering && !pressing ? 'hover' : ''} ${pressing ? 'pressed' : ''}`}
      disabled={disabled}
      onMouseEnter={() => !pressing && setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={handleClick}
      aria-pressed={selected}
      aria-label={`Face ${face}`}
    >
      <img src={src} alt="" style={{ width: size, height: size, imageRendering: 'pixelated' }} />
      <span className="tiny">{face}</span>
    </button>
  );
}
