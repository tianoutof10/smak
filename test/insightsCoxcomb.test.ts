import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { COXCOMB, coxcombRadius, coxcombSector, clockPoint } from '../review/brewing-insights/coxcomb.ts'

test('coxcomb encodes count by sector area, not radius', () => {
  const area = (count: number) => coxcombRadius(count, 20) ** 2 - COXCOMB.inner ** 2
  assert.ok(Math.abs(area(10) / area(20) - .5) < 1e-10)
  assert.equal(coxcombRadius(20, 20), COXCOMB.outer)
  assert.equal(coxcombRadius(0, 20), COXCOMB.inner)
  assert.equal(coxcombRadius(0, 0), COXCOMB.inner)
  assert.equal(coxcombSector(0, coxcombRadius(0, 20)), '')
})

test('coxcomb covers 24 hours clockwise with finite equal-angle sectors', () => {
  assert.deepEqual(clockPoint(0, 100), [136, 36])
  assert.deepEqual(clockPoint(90, 100), [236, 136])
  assert.deepEqual(clockPoint(180, 100), [136, 236])
  const paths = Array.from({ length: COXCOMB.bins }, (_, i) => coxcombSector(i, 102))
  assert.equal(paths.length, 12)
  assert.equal(new Set(paths).size, 12)
  paths.forEach(path => { assert.match(path, /^M .+ Z$/); assert.doesNotMatch(path, /NaN|Infinity/) })
})

test('light coxcomb fills retain contrast on the clock face and hover state', () => {
  const css = readFileSync(new URL('../review/brewing-insights/preview.css', import.meta.url), 'utf8')
  const rule = (selector: string) => css.slice(css.indexOf(selector)).split('}')[0]
  const color = (source: string, token: string) => {
    const match = source.match(new RegExp(`${token}:(#[a-f0-9]{6})`, 'i'))
    assert.ok(match, `Missing color token ${token}`)
    return match[1]
  }
  const luminance = (hex: string) => {
    const channels = hex.slice(1).match(/../g)!.map(value => parseInt(value, 16) / 255)
      .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722
  }
  const contrast = (a: string, b: string) => {
    const values = [luminance(a), luminance(b)].sort((x, y) => y - x)
    return (values[0] + .05) / (values[1] + .05)
  }
  const theme = rule(':root[data-theme="light"]')
  const chart = rule('[data-theme="light"] .ins-coxcomb {')
  const palette = rule('[data-theme="light"] .ins-preview')
  // A secondary comparison is quieter than the selected dataset in the coxcomb.
  const fills = [color(palette, '--ins-bar-fill'), color(chart, '--ins-coxcomb-previous')]
  assert.ok(luminance(color(palette, '--ins-bar-previous')) > luminance(fills[1]))
  assert.match(css, /fill:var\(--ins-coxcomb-previous,var\(--ins-bar-previous\)\)/)
  const backgrounds = [color(theme, '--ins-bg'), color(chart, '--ins-coxcomb-track'), color(chart, '--ins-coxcomb-hover')]
  for (const fill of fills) for (const background of backgrounds) {
    assert.ok(contrast(fill, background) >= 3, `${fill} must contrast with ${background}`)
  }
  for (const background of backgrounds) assert.ok(contrast(color(theme, '--ins-fg'), background) >= 4.5)
  assert.match(chart, /--ins-coxcomb-track-opacity:1/)
})
