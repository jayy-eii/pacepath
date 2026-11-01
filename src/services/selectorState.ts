import type { SelectionResult } from '../types'

let currentLastDecision: SelectionResult | null = null

export function setLastSelectorDecision(decision: SelectionResult | null) {
  currentLastDecision = decision
}

export function getLastSelectorDecision(): SelectionResult | null {
  return currentLastDecision
}
