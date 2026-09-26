export function calculateProgress(purchaseCount) {
  const count = Number(purchaseCount);

  return {
    purchaseCount: count,
    cyclePosition: count > 0 ? ((count - 1) % 3) + 1 : 0
  };
}
