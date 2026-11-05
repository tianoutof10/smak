// Local in-memory Decaid contract fixture. No hardware, files or real profiles.
// Test-only: run with node test/profile-library-api-fixture.mjs (port 5396).
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
const recipe = title => ({ version: '2.1', title, beverage_type: 'espresso', target_weight: 36, target_volume_count_start: 0, tank_temperature: 0, steps: [{ name: 'Extraction', pump: 'pressure', pressure: 9, flow: 0, temperature: 92, seconds: 30, volume: 0, sensor: 'coffee', transition: 'fast' }] })
const records = [
  { id: 'builtin', isDefault: true, visibility: 'visible', profile: recipe('Classic 9 bar') },
  { id: 'user-active', isDefault: false, visibility: 'visible', profile: recipe('Saved current recipe') },
  { id: 'user-created', isDefault: false, visibility: 'visible', profile: recipe('Created profile') },
  { id: 'user/imported', isDefault: false, visibility: 'visible', profile: recipe('Imported tea concentrate') },
  { id: 'user-fail', isDefault: false, visibility: 'visible', profile: recipe('Unavailable profile') },
]
let workflow = { profile: records[1].profile, context: { targetYield: 36, targetDoseWeight: 18 } }
const store = { 'favorite-profiles': { 0: 'builtin', 1: 'user-created', 2: 'user/imported', 3: 'user-active', 4: null }, 'smak-last-selected-profile': 'user-active' }
const shot = { id: 'saved-shot', timestamp: '2026-09-12T06:00:00Z', workflow: { profile: records[3].profile, context: { targetDoseWeight: 18, targetYield: 36 } }, annotations: { actualYield: 36 }, measurements: [] }
for (const record of records) { record.metadata = record.id === 'user-created' ? {smakSource:'created', smakCreatedAt:'2026-09-14',targetDoseWeight:18} : record.id === 'user/imported' ? {smakSource:'imported',targetDoseWeight:20,description:'Imported recipe description. '.repeat(40)} : null }
const writes = []
let brightness = 100
const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
  res.setHeader('Content-Type', 'application/json')
  const send = (value, status = 200) => { res.writeHead(status); res.end(JSON.stringify(value)) }
  if (req.method === 'OPTIONS') return send(null, 204)
  const url = new URL(req.url, 'http://localhost')
  const path = decodeURIComponent(url.pathname)
  let raw = ''; for await (const chunk of req) raw += chunk
  const body = raw ? JSON.parse(raw) : null
  if (req.method !== 'GET') writes.push({ method: req.method, path, body })
  if (path === '/test-state' && req.method === 'GET') return send({ records, store, writes, shot, workflow })
  if (path === '/api/v1/profiles' && req.method === 'GET') return send(records.filter(r => r.visibility === 'visible'))
  if (path === '/api/v1/profiles' && req.method === 'POST') {
    const record = {id: 'new-' + records.length, profile:body.profile, metadata:body.metadata, parentId:body.parentId, isDefault:false, visibility:'visible'}
    records.push(record); return send(record,201)
  }
  if (path.startsWith('/api/v1/profiles/')) {
    const record = records.find(r => path === `/api/v1/profiles/${r.id}`)
    if (!record) return send({ message: 'Profile not found' }, 404)
    if (req.method === 'GET') return send(record)
    if (req.method === 'PUT' && !record.isDefault) { Object.assign(record,body); return send(record) }
    if (req.method === 'DELETE' && record.id === 'user-fail') return send({ message: 'Deletion temporarily unavailable. Try again.' }, 503)
    if (req.method === 'DELETE' && !record.isDefault) { record.visibility = 'deleted'; return send({ success: true, message: 'Profile deleted', id: record.id }) }
    return send({ message: 'Fixture protects built-in profiles' }, 405)
  }
  if (path === '/api/v1/workflow') {
    if (req.method === 'GET') return send(workflow)
    if (req.method === 'PUT') { workflow = { ...workflow, ...body }; return send(workflow) }
  }
  if (path.startsWith('/api/v1/store/streamline-app/')) {
    const key = path.split('/').at(-1)
    if (req.method === 'GET') return key in store ? send(store[key]) : send({ message: 'Key not found' }, 404)
    if (req.method === 'POST') { store[key] = body; return send(null, 204) }
  }
  if (path === '/api/v1/account/decent') return send({})
  if (path === '/api/v1/devices') return send([{ id: 'mock-machine', name: 'MockDe1', type: 'machine', state: 'connected' }])
  if (path === '/api/v1/settings') return send({ screenBrightness: brightness, scalePowerMode: 'off' })
  if (path === '/api/v1/machine/settings') return send({})
  if (path === '/api/v1/display') return send({ brightness })
  if (path === '/api/v1/display/brightness' && req.method === 'PUT') { brightness = body.brightness; return send({ brightness }) }
  if (['/api/v1/machine/state/sleeping', '/api/v1/machine/state/idle'].includes(path) && req.method === 'PUT') return send({ success: true })
  if (path === '/api/v1/shots/latest' || path === '/api/v1/shots/saved-shot') return send(shot)
  if (path === '/api/v1/shots') { const offset = Number(url.searchParams.get('offset') ?? 0); const limit = Number(url.searchParams.get('limit') ?? 30); return send({ items: offset === 0 ? [shot] : [], total: 1, offset, limit }) }
  return send({ message: 'Endpoint not provided by test fixture' }, 404)
})
// Keep the existing subscription's connection indicator online without sending
// simulated shot telemetry. This fixture only exercises library and UI actions.
server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key']
  if (!key || !req.url.startsWith('/ws/v1/')) return socket.destroy()
  const accept = createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`)
  socket.on('data', data => { if ((data[0] & 15) === 8) socket.end(Buffer.from([0x88, 0])) })
  socket.on('error', () => socket.destroy())
})
server.listen(5396, '127.0.0.1', () => console.log('In-memory profile library fixture on 127.0.0.1:5396'))
