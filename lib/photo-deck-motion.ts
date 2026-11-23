/** Shared, linear photo-deck motion: faithfully follows the approved interactive prototype. */
export const PHOTO_DECK_THRESHOLD = 62;

export function photoDeckLayer(index: number, active: number, count: number, drag: number) {
    const relative = index - active;
    const distance = Math.abs(relative);
    const direction = drag < 0 && active < count - 1 ? 1 : drag > 0 && active > 0 ? -1 : 0;
    const amount = Math.min(1, Math.abs(drag) / 110);
    const tucked = direction !== 0 && Math.abs(drag) >= PHOTO_DECK_THRESHOLD;
    // The first card is biased toward the left; the last toward the right.
    // Middle cards have symmetric neighbors. The front is always at 0 degrees at rest.
    const center = active === 0 ? -3 : active === count - 1 ? 3 : 0;
    let x = center;
    let rotation = 0;
    let scale = 1;
    let zIndex = 32;
    if (relative === 0) {
        x += drag * .58;
        rotation = drag * .13;
        scale -= Math.min(.03, Math.abs(drag) / 3200);
        if (tucked) zIndex = 10; // The turning corner goes behind its successor.
    } else {
        const side = Math.sign(relative);
        x += side * (distance === 1 ? 7 : 12);
        rotation = side * (distance === 1 ? 1.15 : 1.85);
        scale -= Math.min(distance, 2) * .015;
        zIndex = 18 - distance;
        if (relative === direction) {
            x = x * (1 - amount) + center * amount;
            rotation *= (1 - amount);
            scale += (1 - scale) * amount;
            zIndex = tucked ? 35 : 19;
        }
    }
    return {
        opacity: distance <= 2 ? 1 : 0,
        zIndex,
        transform: `translate3d(${x.toFixed(2)}px,0,0) rotate(${rotation.toFixed(2)}deg) scale(${scale.toFixed(4)})`,
        pointerEvents: (relative === 0 ? 'auto' : 'none') as 'auto' | 'none',
    };
}
