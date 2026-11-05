import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { workflowValuesForProfile } from '../src/api/decaid/profileWorkflow.ts'
import { profileRecordsToDomain } from '../src/api/decaid/adapters.ts'
import type { DecaidProfile, DecaidProfileRecord } from '../src/api/decaid/types.ts'

const recipe = (temperatures: number[], targetWeight: number | null = 0): DecaidProfile => ({
  title: 'Test recipe', beverage_type: 'cleaning', target_weight: targetWeight,
  target_volume: 0, target_volume_count_start: 2, tank_temperature: 0,
  steps: temperatures.map((temperature, i) => ({
    name: `Stage ${i}`, temperature, sensor: 'coffee', pump: 'pressure', pressure: i ? 0 : 10,
    transition: 'fast', seconds: 15, volume: 500, weight: 0,
    exit: { type: 'pressure', condition: 'under', value: 1 }, limiter: { value: 0, range: 0.6 },
  })),
})

function select(profile: DecaidProfile, temperature = String(profile.steps![0].temperature)) {
  const record = { id: 'recipe', profile }
  const [domain] = profileRecordsToDomain([record], {}, [])
  return workflowValuesForProfile(record, { ...domain, temperature })
}

test('no-yield profiles send an explicit numeric zero accepted by Decaid', () => {
  for (const target of [0, null, undefined]) {
    const profile = { ...recipe([85, 85, 85]), target_weight: target }
    const { patch } = select(profile)
    assert.equal(patch.context?.targetYield, 0)
    assert.equal(patch.profile?.target_weight, 0)
    assert.equal(patch.profile?.target_volume, 0)
    assert.equal(patch.profile?.target_volume_count_start, 2)
  }
})

test('selection preserves stage temperatures and every other execution field', () => {
  for (const temperatures of [[85, 85, 85], [105, 105, 20, 20], [82, 82, 80, 72], [83.5, 83.5, 67.5, 74.5]]) {
    const profile = recipe(temperatures)
    const before = JSON.stringify(profile)
    assert.deepEqual(select(profile).patch.profile?.steps, profile.steps)
    assert.equal(JSON.stringify(profile), before)
  }
})

test('explicit temperature adjustment offsets the recipe rather than flattening it', () => {
  const profile = recipe([82, 82, 80, 72])
  const { patch } = select(profile, '84')
  assert.deepEqual(patch.profile?.steps?.map(s => s.temperature), [84, 84, 82, 74])
  assert.deepEqual(patch.profile?.steps?.map(({ temperature: _temperature, ...step }) => step),
    profile.steps?.map(({ temperature: _temperature, ...step }) => step))
})

test('numeric-string temperatures retain their relative differences', () => {
  const profile = recipe([82, 80, 72])
  profile.steps = profile.steps!.map(step => ({ ...step, temperature: String(step.temperature) as unknown as number }))
  assert.deepEqual(select(profile, '83').patch.profile?.steps?.map(s => s.temperature), [83, 81, 73])
})

test('active workflow yield wins over saved metadata, including zero', () => {
  const record: DecaidProfileRecord = { id: 'recipe', profile: recipe([92], 40), metadata: { targetYield: 42, smakTargetYield: 0 } }
  for (const [target, display] of [[38, '38'], [0, '—']] as const) {
    const [domain] = profileRecordsToDomain([record], { profile: record.profile, context: { targetYield: target } }, [])
    assert.equal(domain.targetYield, display)
  }
})

test('startup and reselecting the active profile do not write a saved recipe over Decaid', () => {
  const source = readFileSync(new URL('../src/features/brew/useBrewingData.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /const shouldRestoreProfile|const rememberedProfileRequest/)
  const sameProfile = source.slice(source.indexOf('if (latestModel.current.activeProfileId === profileId)'), source.indexOf("if (connection === 'fixture')", source.indexOf('const selectProfile =')))
  assert.doesNotMatch(sameProfile, /updateWorkflow\(/)
  assert.match(sameProfile, /getWorkflow\(/)
})
