/**
 * Splits an array into chunks of at most `size` elements.
 * Used to cap large IN-query batches sent to the database.
 */
export function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
