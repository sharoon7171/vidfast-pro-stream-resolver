import { createServer } from 'node:http'
import { port } from './env.js'
import { route } from './http/router.js'

const server = createServer(route)

server.on('connection', (socket) => socket.setNoDelay(true))

function boot() {
  console.log(`http://localhost:${port}/`)
}

if (process.env.HOST) server.listen(port, process.env.HOST, boot)
else server.listen(port, boot)
