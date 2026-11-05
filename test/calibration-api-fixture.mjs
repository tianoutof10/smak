// In-memory settings fixture only. No hardware or persistent user data.
import { createServer } from 'node:http'
let settings = { weightFlowMultiplier: 1, hotWaterFlowMultiplier: 1, volumeFlowMultiplier: 0.3, stopHotWaterAtWeight: true }
const writes = []
createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Content-Type', 'application/json')
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }
  const path = new URL(req.url, 'http://localhost').pathname
  let raw = ''; for await (const chunk of req) raw += chunk
  if (path === '/api/v1/settings') {
    if (req.method === 'POST') { const patch = JSON.parse(raw); writes.push(patch); settings = { ...settings, ...patch } }
    return res.end(JSON.stringify(settings))
  }
  if (path === '/test-state') return res.end(JSON.stringify({ settings, writes }))
  if (path === '/api/v1/workflow') return res.end(JSON.stringify({ hotWaterData: { temperature: 60, volume: 20, duration: 30, flow: 7 } }))
  if (['/api/v1/devices', '/api/v1/profiles', '/api/v1/plugins'].includes(path)) return res.end('[]')
  res.end('{}')
}).listen(5394, '127.0.0.1', () => console.log('Calibration fixture: 5394'))
