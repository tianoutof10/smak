export const COXCOMB = { center: 136, inner: 32, outer: 102, bins: 12 } as const

// Equal-angle sectors encode count by area, accounting for the empty center.
export function coxcombRadius(count: number, maximum: number) {
  const fraction = maximum > 0 ? Math.min(1, Math.max(0, count) / maximum) : 0
  return Math.sqrt(COXCOMB.inner ** 2 + fraction * (COXCOMB.outer ** 2 - COXCOMB.inner ** 2))
}

export function clockPoint(degrees: number, radius: number) {
  const angle = (degrees - 90) * Math.PI / 180
  return [COXCOMB.center + radius * Math.cos(angle), COXCOMB.center + radius * Math.sin(angle)]
}

export function coxcombSector(index: number, radius: number, gap = 2) {
  if (radius <= COXCOMB.inner) return ''
  const start = index * 360 / COXCOMB.bins + gap / 2
  const end = (index + 1) * 360 / COXCOMB.bins - gap / 2
  const point = (angle: number, r: number) => clockPoint(angle, r).map(n => n.toFixed(3)).join(' ')
  return `M ${point(start, COXCOMB.inner)} L ${point(start, radius)} A ${radius} ${radius} 0 0 1 ${point(end, radius)} L ${point(end, COXCOMB.inner)} A ${COXCOMB.inner} ${COXCOMB.inner} 0 0 0 ${point(start, COXCOMB.inner)} Z`
}
