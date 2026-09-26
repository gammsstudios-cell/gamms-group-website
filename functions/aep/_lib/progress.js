export function calculateProgress(purchaseCount) {
  const count = Number(purchaseCount);

  return {
    purchaseCount: count,
    cyclePosition: count > 0 ? ((count - 1) % 3) + 1 : 0,
    reward: {
      available: false
    }
  };
}

export function calculateCycleNumber(purchaseCount) {
  const count = Number(purchaseCount);

  return count > 0 ? Math.floor((count - 1) / 3) + 1 : 1;
}
