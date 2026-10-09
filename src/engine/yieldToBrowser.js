// A frame followed by a task allows React's pending UI to paint before CPU work.
// No randomness or game state is consumed at this scheduling boundary.
export function yieldToBrowser() {
  return new Promise(resolve => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => setTimeout(resolve, 0));
    } else {
      setTimeout(resolve, 0);
    }
  });
}
