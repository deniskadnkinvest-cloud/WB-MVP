export const MAX_CONCURRENT_USER_GENERATIONS = 10;

export class UserGenerationConcurrencyLimiter {
  constructor(maxConcurrent = MAX_CONCURRENT_USER_GENERATIONS) {
    this.maxConcurrent = maxConcurrent;
    this.activeByUser = new Map();
  }

  getActive(userKey) {
    return this.activeByUser.get(String(userKey || '')) || 0;
  }

  tryAcquire(userKey) {
    const key = String(userKey || '');
    const active = this.getActive(key);
    if (!key || active >= this.maxConcurrent) {
      return {
        acquired: false,
        active,
        available: Math.max(0, this.maxConcurrent - active),
        maxConcurrent: this.maxConcurrent,
        release: () => {},
      };
    }

    this.activeByUser.set(key, active + 1);
    let released = false;
    return {
      acquired: true,
      active: active + 1,
      available: Math.max(0, this.maxConcurrent - active - 1),
      maxConcurrent: this.maxConcurrent,
      release: () => {
        if (released) return;
        released = true;
        const nextActive = Math.max(0, this.getActive(key) - 1);
        if (nextActive === 0) this.activeByUser.delete(key);
        else this.activeByUser.set(key, nextActive);
      },
    };
  }
}

export const userGenerationConcurrencyLimiter = new UserGenerationConcurrencyLimiter();
