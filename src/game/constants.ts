/** Width of the simulated street, px. Vehicles spawn just outside it. */
export const WORLD_W = 180;
/** Logical width the camera shows (centred on the walker); height follows the screen aspect. */
export const VIEW_W = 128;
/** Fixed simulation step, seconds. */
export const DT = 1 / 60;
/** Distance covered by one tap, px. */
export const STEP = 4;
/** How long the walk animation of a single step takes, seconds. */
export const STEP_ANIM = 0.14;
/** Pedestrian hit circle radius, px. */
export const PED_R = 3;
/** Pedestrian walks straight up this column. */
export const PED_X = WORLD_W / 2;
/** Ticks of pedestrian history kept for delayed driver perception. */
export const HISTORY_TICKS = 90;
/** A pause longer than this many tempos counts as standing still. */
export const STOP_FACTOR = 1.6;
/** Interval below this many tempos is a nervous double tap. */
export const FLINCH_FACTOR = 0.35;
