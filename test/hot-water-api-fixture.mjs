// In-memory REST + receive-only WebSocket fixture. Never contacts hardware.
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
let workflow = { hotWaterData: { targetTemperature: 60, volume: 20, duration: 30, flow: 7 }, steamSettings: { targetTemperature: 160, duration: 50, flow: 0.7 } }
let settings = { weightFlowMultiplier: 1, hotWaterFlowMultiplier: 0.3, stopHotWaterAtWeight: true }
let physical = { targetHotWaterVolume: 20, targetHotWaterTemp: 60, targetHotWaterDuration: 30 }
let state = 'idle'
let failStore = false
let failWorkflow = false
let steamTemperature = 45
const store = { 'last-hot-water-volume': 20, 'last-hot-water-temp': 60 }
const writes = []
const sockets = new Map()
function send(socket, value) {
  const body = Buffer.from(JSON.stringify(value))
  const header = body.length < 126 ? Buffer.from([0x81, body.length]) : Buffer.from([0x81, 126, body.length >> 8, body.length & 255])
  socket.write(Buffer.concat([header, body]))
}
function broadcast(path, value) {
  for (const [socket, channel] of sockets) if (channel === path) send(socket, value)
}
const snapshot = () => ({ state: { state, substate: state === 'idle' ? 'ready' : 'pouring' }, pressure: 0, flow: 0, mixTemperature: 60, steamTemperature })
const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS')
  res.setHeader('Content-Type', 'application/json')
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }
  const path = new URL(req.url, 'http://localhost').pathname
  let raw = ''; for await (const chunk of req) raw += chunk
  const body = raw ? JSON.parse(raw) : {}
  if (path === '/test-state') return res.end(JSON.stringify({ workflow, physical, settings, store, writes }))
  if (path === '/test-control' && req.method === 'POST') {
    if (body.state) state = body.state
    if ('failStore' in body) failStore = body.failStore
    if ('failWorkflow' in body) failWorkflow = body.failWorkflow
    if (typeof body.steamTemperature === 'number') steamTemperature = body.steamTemperature
    broadcast('/ws/v1/machine/snapshot', snapshot())
    if (body.physical) {
      physical = { ...physical, ...body.physical }
      broadcast('/ws/v1/machine/shotSettings', physical)
    }
    return res.end('{}')
  }
  if (path === '/api/v1/settings') {
    if (req.method === 'POST') { writes.push([path, body]); settings = { ...settings, ...body } }
    return res.end(JSON.stringify(settings))
  }
  if (path.startsWith('/api/v1/store/streamline-app/')) {
    const key = decodeURIComponent(path.split('/').at(-1))
    if (req.method === 'POST') {
      if (failStore) { res.writeHead(503); return res.end('{}') }
      writes.push([path, body]); store[key] = body
    }
    if (!(key in store)) { res.writeHead(404); return res.end('{}') }
    return res.end(JSON.stringify(store[key]))
  }
  if (path === '/api/v1/workflow') {
    if (req.method === 'PUT') {
      if (failWorkflow) { res.writeHead(503); return res.end('{}') }
      writes.push([path, body])
      workflow = { ...workflow, ...body, hotWaterData: { ...workflow.hotWaterData, ...body.hotWaterData }, steamSettings: { ...workflow.steamSettings, ...body.steamSettings } }
      physical = { targetHotWaterVolume: workflow.hotWaterData.volume, targetHotWaterTemp: workflow.hotWaterData.targetTemperature, targetHotWaterDuration: workflow.hotWaterData.duration }
      broadcast('/ws/v1/machine/shotSettings', physical)
    }
    return res.end(JSON.stringify(workflow))
  }
  if (path === '/api/v1/devices') return res.end(JSON.stringify([{ id: 'fixture-de1', type: 'machine', state: 'connected', name: 'Fixture DE1' }]))
  if (path === '/api/v1/shots') return res.end('{"items":[],"total":0}')
  if (['/api/v1/profiles', '/api/v1/plugins'].includes(path)) return res.end('[]')
  res.end('{}')
})
server.on('upgrade', (req, socket) => {
  const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n')
  sockets.set(socket, req.url)
  socket.on('error', () => sockets.delete(socket))
  socket.on('close', () => sockets.delete(socket))
  socket.on('data', (data) => { if ((data[0] & 15) === 8) socket.end(Buffer.from([0x88, 0])) })
  if (req.url === '/ws/v1/machine/shotSettings') send(socket, physical)
})
setInterval(() => broadcast('/ws/v1/machine/snapshot', snapshot()), 1000)
server.listen(5395, '127.0.0.1', () => console.log('Hot water fixture: 5395'))
