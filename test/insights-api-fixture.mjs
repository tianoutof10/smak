// Local, read-only HTTP fixture following Decaid's saved-shot response contract.
// Never included in the skin ZIP. Ctrl-C stops it; restart preserves deterministic IDs.
import { createServer } from 'node:http'
const midnight = new Date(); midnight.setHours(0, 0, 0, 0)
const recordCount = Number(process.env.INSIGHTS_FIXTURE_RECORDS ?? 1200)
const port = Number(process.env.INSIGHTS_FIXTURE_PORT ?? 5391)
const detailFailures = Number(process.env.INSIGHTS_FIXTURE_DETAIL_FAILURES ?? 0)
const detailDelay = Number(process.env.INSIGHTS_FIXTURE_DETAIL_DELAY ?? 0)
const detailAttempts = new Map()
const records = Array.from({ length: recordCount }, (_, i) => {
  const date = new Date(midnight); date.setDate(date.getDate() - Math.floor(i / 2)); date.setHours(i % 2 ? 7 : 14, i % 60)
  const beverage = i % 17 === 0 ? 'pourover' : i % 23 === 0 ? 'cleaning' : 'espresso'
  return { id: `contract-${i}`, timestamp: date.toISOString(), workflow: { profile: { title: beverage === 'pourover' ? 'Tea concentrate' : beverage === 'cleaning' ? 'Cleaning' : i % 3 ? 'Adaptive V2' : 'Gentle & sweet', beverage_type: beverage, steps: [{ name: 'Fill', seconds: 8, pump: { target: 'flow', flow: 4 } }, { name: 'Extraction', seconds: 40, pump: { target: 'pressure', pressure: 9 } }] }, context: { targetDoseWeight: i === 0 || i % 11 ? 20 : null, targetYield: 40 } }, annotations: i === 0 || i % 13 ? { actualYield: 36 + (i % 6) * .6, actualDoseWeight: 20 } : null, stopReason: i % 3 ? 'targetWeight' : 'apiStop' }
})
// Routine shot-time overrides must not split one named profile into many groups.
records.forEach((record, i) => {
  record.workflow.profile.target_weight = 34 + i % 7
  record.workflow.profile.tank_temperature = 88 + i % 6
  record.workflow.profile.steps.forEach(step => { step.temperature = 90 + i % 5 })
})
const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Content-Type', 'application/json')
  if (req.method !== 'GET') { res.writeHead(405); res.end('{}'); return }
  const url = new URL(req.url, 'http://localhost')
  const send = value => res.end(JSON.stringify(value))
  if (url.pathname === '/api/v1/shots') {
    const limit = Math.min(100, Number(url.searchParams.get('limit') ?? 20)); const offset = Number(url.searchParams.get('offset') ?? 0)
    console.log(`GET history limit=${limit} offset=${offset}`)
    return send({ items: records.slice(offset, offset + limit), total: records.length, offset, limit })
  }
  if (url.pathname === '/api/v1/shots/latest') return send(records[0])
  const record = records.find(r => `/api/v1/shots/${r.id}` === url.pathname)
  if (record) {
    const attempt = (detailAttempts.get(record.id) ?? 0) + 1
    detailAttempts.set(record.id, attempt)
    console.log(`GET detail ${record.id} attempt=${attempt}`)
    if (detailDelay) await new Promise(resolve => setTimeout(resolve, detailDelay))
    if (attempt <= detailFailures) { res.writeHead(503); return send({ error: 'Temporary graph failure for retry verification.' }) }
    const start = Date.parse(record.timestamp)
    return send({ ...record, measurements: Array.from({ length: 61 }, (_, i) => ({ machine: { timestamp: new Date(start + i * 500).toISOString(), state: { substate: 'pouring' }, profileFrame: i < 16 ? 0 : 1, pressure: i < 16 ? i / 4 : 9 - (i - 16) / 20, flow: i < 16 ? 4 : 2.2, mixTemperature: 92, targetPressure: i < 16 ? 0 : 9, targetFlow: i < 16 ? 4 : 0 }, scale: { weight: (record.annotations?.actualYield ?? 38) * i / 60 } })) })
  }
  res.writeHead(503); send({ error: 'Fixture only serves saved-shot reads; no machine connected.' })
})
server.listen(port, '127.0.0.1', () => console.log(`Read-only Decaid shot fixture on 127.0.0.1:${port} (${recordCount} records)`))
