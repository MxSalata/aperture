/**
 * At most `concurrency` of the functions handed to the returned limiter run at once; the rest
 * wait their turn in order. For screens that must read one object per row (the API has no batch
 * read), so a long list becomes a steady trickle rather than a burst of requests at the server.
 */
export function createLimiter(concurrency: number) {
  let running = 0;
  const queue: (() => void)[] = [];
  const next = () => {
    if (running >= concurrency) return;
    const start = queue.shift();
    if (start) start();
  };
  return function limit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        running++;
        fn()
          .then(resolve, reject)
          .finally(() => {
            running--;
            next();
          });
      });
      next();
    });
  };
}
