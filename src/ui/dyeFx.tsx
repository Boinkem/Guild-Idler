/** Patch 0421 -- the dye wash, brush stroke, glint and OWNED ribbon laid
 *  over a skin (or tombstone style) card for the moment it's bought.
 *  Colours come from the card's own --dye-a / --dye-b. Moved out of
 *  HeroesPanel in patch 0429 so the Wardrobe stage can play it too. */
export function DyeFx() {
  return (
    <span className="fx-dye" aria-hidden="true">
      <span className="fx-dye-wash" />
      <span className="fx-dye-brush" />
      <span className="fx-dye-glint" />
      <span className="fx-dye-ribbon">OWNED</span>
    </span>
  );
}
