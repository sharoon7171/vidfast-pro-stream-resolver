export async function* runParallel(items, worker, concurrency) {
  const queue = [...items]
  const inFlight = new Map()

  const spawn = (item) => {
    const taskId = Symbol()
    const promise = worker(item)
      .then((value) => ({ taskId, value }))
      .catch((error) => ({ taskId, error }))
    inFlight.set(taskId, promise)
  }

  while (queue.length || inFlight.size) {
    while (queue.length && inFlight.size < concurrency) spawn(queue.shift())
    if (!inFlight.size) break
    const result = await Promise.race(inFlight.values())
    inFlight.delete(result.taskId)
    yield result
  }
}
