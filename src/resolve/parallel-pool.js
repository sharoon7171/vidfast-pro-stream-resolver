export async function* runParallel(items, worker, concurrency) {
  const queue = items.map((item, index) => ({ item, index }))
  const inFlight = new Map()

  const spawn = ({ item, index }) => {
    const taskId = Symbol()
    const promise = worker(item, index)
      .then((value) => ({ taskId, index, item, value }))
      .catch((error) => ({ taskId, index, item, error }))
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
