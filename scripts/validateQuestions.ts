import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ALLOWED_MISTAKE_TAGS = new Set([
  'sign_error',
  'formula_misuse',
  'added_denominators',
  'calculation_slip',
  'concept_gap',
  'other',
])

interface QuestionOption {
  en: string
  hi: string
  suspectConceptId?: string
}

interface Question {
  id: string
  conceptId: string
  grade: number
  difficulty: number
  text: { en: string; hi: string }
  options: QuestionOption[]
  correctIndex: number
  wrongTags: Record<string, string>
  hints: string[]
  solution: { en: string; hi: string }
}

interface Concept {
  id: string
  name: { en: string; hi: string }
  grade: number
  prerequisites: string[]
  description?: { en: string; hi: string }
}

const questionsPath = path.resolve(__dirname, '../src/data/questions.json')
const conceptsPath = path.resolve(__dirname, '../src/data/concepts.json')

const questions: Question[] = JSON.parse(fs.readFileSync(questionsPath, 'utf-8'))
const concepts: Concept[] = JSON.parse(fs.readFileSync(conceptsPath, 'utf-8'))

console.log('================================================================')
console.log(`Starting Validation: ${questions.length} questions, ${concepts.length} concepts`)
console.log('================================================================\n')

const errors: string[] = []
const conceptMap = new Map<string, Concept>(concepts.map((c) => [c.id, c]))
const conceptIds = new Set(concepts.map((c) => c.id))
const seenIds = new Set<string>()

// -------------------------------------------------------------
// 1. CONCEPT GRAPH VALIDATION (DAG & CYCLE DETECTION)
// -------------------------------------------------------------
console.log('--- 1. Concept Graph & Prerequisite DAG Validation ---')

// Check prerequisite existence
for (const c of concepts) {
  if (!Array.isArray(c.prerequisites)) {
    errors.push(`Concept "${c.id}" must have a prerequisites array.`)
    continue
  }
  for (const prereqId of c.prerequisites) {
    if (!conceptIds.has(prereqId)) {
      errors.push(`Concept "${c.id}" references unknown prerequisite "${prereqId}".`)
    }
    if (prereqId === c.id) {
      errors.push(`Concept "${c.id}" has a self-referencing prerequisite cycle.`)
    }
  }
}

// Cycle Detection using Depth-First Search with 3 colors (0 = unvisited, 1 = visiting, 2 = visited)
const visitState = new Map<string, number>()
let hasCycle = false

function checkCycle(nodeId: string, pathTrace: string[]): boolean {
  visitState.set(nodeId, 1) // visiting
  pathTrace.push(nodeId)

  const concept = conceptMap.get(nodeId)
  if (concept) {
    for (const prereq of concept.prerequisites) {
      const state = visitState.get(prereq) || 0
      if (state === 1) {
        errors.push(`Cycle detected in concept graph! Cycle path: ${pathTrace.join(' -> ')} -> ${prereq}`)
        hasCycle = true
        return true
      }
      if (state === 0) {
        if (checkCycle(prereq, pathTrace)) return true
      }
    }
  }

  pathTrace.pop()
  visitState.set(nodeId, 2) // visited
  return false
}

for (const c of concepts) {
  if ((visitState.get(c.id) || 0) === 0) {
    checkCycle(c.id, [])
  }
}

if (!hasCycle) {
  console.log('✓ Graph is a valid Directed Acyclic Graph (DAG) with ZERO cycles.')
}

// -------------------------------------------------------------
// 2. PRINT TEXT TREE OF THE PREREQUISITE GRAPH
// -------------------------------------------------------------
console.log('\n--- 2. Prerequisite Hierarchy Tree ---')

// Build inverted map: prerequisite -> children who depend on it
const childrenMap = new Map<string, string[]>()
for (const c of concepts) {
  for (const p of c.prerequisites) {
    const list = childrenMap.get(p) || []
    list.push(c.id)
    childrenMap.set(p, list)
  }
}

// Find root concepts (no prerequisites)
const rootConcepts = concepts.filter((c) => c.prerequisites.length === 0)

function printTree(nodeId: string, prefix = '', visited = new Set<string>()) {
  const concept = conceptMap.get(nodeId)!
  console.log(`${prefix}├── [Gr ${concept.grade}] ${concept.name.en} (${concept.id})`)
  if (visited.has(nodeId)) return
  visited.add(nodeId)

  const children = childrenMap.get(nodeId) || []
  for (let i = 0; i < children.length; i++) {
    const isLast = i === children.length - 1
    const childPrefix = prefix + (isLast ? '    ' : '│   ')
    printTree(children[i], childPrefix, new Set(visited))
  }
}

for (const root of rootConcepts) {
  printTree(root.id)
}

// -------------------------------------------------------------
// 3. QUESTIONS SCHEMA & ARITHMETIC VALIDATION
// -------------------------------------------------------------
console.log('\n--- 3. Questions Schema & Content Validation ---')

// Verification of arithmetic questions
const ARITHMETIC_CHECKS: Record<string, () => { expected: string; actual: string }> = {
  q01: () => ({ expected: '3/5 litre', actual: questions.find((q) => q.id === 'q01')!.options[questions.find((q) => q.id === 'q01')!.correctIndex].en }),
  q02: () => ({ expected: '5/4 km', actual: questions.find((q) => q.id === 'q02')!.options[questions.find((q) => q.id === 'q02')!.correctIndex].en }),
  q03: () => ({ expected: '1/2', actual: questions.find((q) => q.id === 'q03')!.options[questions.find((q) => q.id === 'q03')!.correctIndex].en }),
  q04: () => ({ expected: '19/15 km', actual: questions.find((q) => q.id === 'q04')!.options[questions.find((q) => q.id === 'q04')!.correctIndex].en }),
  q05: () => ({ expected: '₹57.75', actual: questions.find((q) => q.id === 'q05')!.options[questions.find((q) => q.id === 'q05')!.correctIndex].en }),
  q06: () => ({ expected: '₹16.00', actual: questions.find((q) => q.id === 'q06')!.options[questions.find((q) => q.id === 'q06')!.correctIndex].en }),
  q07: () => ({ expected: '₹45.00', actual: questions.find((q) => q.id === 'q07')!.options[questions.find((q) => q.id === 'q07')!.correctIndex].en }),
  q08: () => ({ expected: '24 km/h', actual: questions.find((q) => q.id === 'q08')!.options[questions.find((q) => q.id === 'q08')!.correctIndex].en }),
  q09: () => ({ expected: '3 : 2', actual: questions.find((q) => q.id === 'q09')!.options[questions.find((q) => q.id === 'q09')!.correctIndex].en }),
  q10: () => ({ expected: '8 litres', actual: questions.find((q) => q.id === 'q10')!.options[questions.find((q) => q.id === 'q10')!.correctIndex].en }),
  q11: () => ({ expected: '₹250', actual: questions.find((q) => q.id === 'q11')!.options[questions.find((q) => q.id === 'q11')!.correctIndex].en }),
  q12: () => ({ expected: '45 km', actual: questions.find((q) => q.id === 'q12')!.options[questions.find((q) => q.id === 'q12')!.correctIndex].en }),
  q13: () => ({ expected: 'x = 42', actual: questions.find((q) => q.id === 'q13')!.options[questions.find((q) => q.id === 'q13')!.correctIndex].en }),
  q14: () => ({ expected: 'y = 100', actual: questions.find((q) => q.id === 'q14')!.options[questions.find((q) => q.id === 'q14')!.correctIndex].en }),
  q15: () => ({ expected: 'm = 12', actual: questions.find((q) => q.id === 'q15')!.options[questions.find((q) => q.id === 'q15')!.correctIndex].en }),
  q16: () => ({ expected: 'p = 27', actual: questions.find((q) => q.id === 'q16')!.options[questions.find((q) => q.id === 'q16')!.correctIndex].en }),
  q17: () => ({ expected: 'k = 3', actual: questions.find((q) => q.id === 'q17')!.options[questions.find((q) => q.id === 'q17')!.correctIndex].en }),
  q18: () => ({ expected: 'r = 50', actual: questions.find((q) => q.id === 'q18')!.options[questions.find((q) => q.id === 'q18')!.correctIndex].en }),
  q19: () => ({ expected: 'c = 20', actual: questions.find((q) => q.id === 'q19')!.options[questions.find((q) => q.id === 'q19')!.correctIndex].en }),
  q20: () => ({ expected: 'd = 15 km', actual: questions.find((q) => q.id === 'q20')!.options[questions.find((q) => q.id === 'q20')!.correctIndex].en }),
  // Additional new question checks
  q21: () => ({ expected: '425 samosas', actual: questions.find((q) => q.id === 'q21')!.options[questions.find((q) => q.id === 'q21')!.correctIndex].en }),
  q22: () => ({ expected: '₹530', actual: questions.find((q) => q.id === 'q22')!.options[questions.find((q) => q.id === 'q22')!.correctIndex].en }),
  q23: () => ({ expected: '84 balls', actual: questions.find((q) => q.id === 'q23')!.options[questions.find((q) => q.id === 'q23')!.correctIndex].en }),
  q24: () => ({ expected: '50 laddus', actual: questions.find((q) => q.id === 'q24')!.options[questions.find((q) => q.id === 'q24')!.correctIndex].en }),
  q33: () => ({ expected: '-7°C', actual: questions.find((q) => q.id === 'q33')!.options[questions.find((q) => q.id === 'q33')!.correctIndex].en }),
  q34: () => ({ expected: '-7', actual: questions.find((q) => q.id === 'q34')!.options[questions.find((q) => q.id === 'q34')!.correctIndex].en }),
  q35: () => ({ expected: '+24', actual: questions.find((q) => q.id === 'q35')!.options[questions.find((q) => q.id === 'q35')!.correctIndex].en }),
  q36: () => ({ expected: '+15', actual: questions.find((q) => q.id === 'q36')!.options[questions.find((q) => q.id === 'q36')!.correctIndex].en }),
  q41: () => ({ expected: '₹12', actual: questions.find((q) => q.id === 'q41')!.options[questions.find((q) => q.id === 'q41')!.correctIndex].en }),
  q42: () => ({ expected: '₹84', actual: questions.find((q) => q.id === 'q42')!.options[questions.find((q) => q.id === 'q42')!.correctIndex].en }),
  q43: () => ({ expected: '20', actual: questions.find((q) => q.id === 'q43')!.options[questions.find((q) => q.id === 'q43')!.correctIndex].en }),
  q44: () => ({ expected: '375 km', actual: questions.find((q) => q.id === 'q44')!.options[questions.find((q) => q.id === 'q44')!.correctIndex].en }),
  q47: () => ({ expected: '₹100', actual: questions.find((q) => q.id === 'q47')!.options[questions.find((q) => q.id === 'q47')!.correctIndex].en }),
  q48: () => ({ expected: '₹180', actual: questions.find((q) => q.id === 'q48')!.options[questions.find((q) => q.id === 'q48')!.correctIndex].en }),
  q57: () => ({ expected: 'x = 4', actual: questions.find((q) => q.id === 'q57')!.options[questions.find((q) => q.id === 'q57')!.correctIndex].en }),
  q58: () => ({ expected: 'y = 9', actual: questions.find((q) => q.id === 'q58')!.options[questions.find((q) => q.id === 'q58')!.correctIndex].en }),
  q61: () => ({ expected: 'x = 4', actual: questions.find((q) => q.id === 'q61')!.options[questions.find((q) => q.id === 'q61')!.correctIndex].en }),
  q62: () => ({ expected: 'y = 5', actual: questions.find((q) => q.id === 'q62')!.options[questions.find((q) => q.id === 'q62')!.correctIndex].en }),
  q85: () => ({ expected: 'x = 7', actual: questions.find((q) => q.id === 'q85')!.options[questions.find((q) => q.id === 'q85')!.correctIndex].en }),
  q86: () => ({ expected: 'y = 3', actual: questions.find((q) => q.id === 'q86')!.options[questions.find((q) => q.id === 'q86')!.correctIndex].en }),
  q88: () => ({ expected: '₹300', actual: questions.find((q) => q.id === 'q88')!.options[questions.find((q) => q.id === 'q88')!.correctIndex].en }),
}

const conceptQuestionCounts: Record<string, number> = {}

questions.forEach((q, idx) => {
  const prefix = `[Question ${q.id || `#${idx + 1}`}]`

  // 1. Check ID uniqueness
  if (!q.id) {
    errors.push(`${prefix} Missing id`)
  } else if (seenIds.has(q.id)) {
    errors.push(`${prefix} Duplicate id "${q.id}"`)
  } else {
    seenIds.add(q.id)
  }

  // 2. Check conceptId validity
  if (!conceptIds.has(q.conceptId)) {
    errors.push(`${prefix} Invalid conceptId "${q.conceptId}". Must be one of: ${[...conceptIds].join(', ')}`)
  } else {
    conceptQuestionCounts[q.conceptId] = (conceptQuestionCounts[q.conceptId] || 0) + 1
  }

  // 3. Check grade & difficulty
  if (typeof q.grade !== 'number' || q.grade < 6 || q.grade > 10) {
    errors.push(`${prefix} Invalid grade ${q.grade}`)
  }
  if (![1, 2, 3].includes(q.difficulty)) {
    errors.push(`${prefix} Invalid difficulty ${q.difficulty}`)
  }

  // 4. Check text in en and hi
  if (!q.text?.en?.trim() || !q.text?.hi?.trim()) {
    errors.push(`${prefix} Missing text.en or text.hi`)
  }

  // 5. Options & Answer Validation based on Question Type
  const isInputQuestion = q.type === 'numeric_input' || q.type === 'equation_input'

  if (isInputQuestion) {
    if (q.correctAnswer === undefined || q.correctAnswer === null) {
      errors.push(`${prefix} Input question missing correctAnswer`)
    }
    if (!q.procedure || !q.procedure.type) {
      errors.push(`${prefix} Input question missing procedure definition`)
    }
  } else {
    // Standard MCQ checks
    if (!Array.isArray(q.options) || q.options.length !== 4) {
      errors.push(`${prefix} Must have exactly 4 options, found ${q.options?.length ?? 0}`)
    } else {
      q.options.forEach((opt, optIdx) => {
        if (!opt?.en?.trim() || !opt?.hi?.trim()) {
          errors.push(`${prefix} Option ${optIdx} missing English or Hindi text`)
        }
        if (opt.suspectConceptId && !conceptIds.has(opt.suspectConceptId)) {
          errors.push(`${prefix} Option ${optIdx} has unknown suspectConceptId "${opt.suspectConceptId}"`)
        }
      })
    }

    // 6. Check correctIndex
    if (typeof q.correctIndex !== 'number' || q.correctIndex < 0 || q.correctIndex > 3) {
      errors.push(`${prefix} Invalid correctIndex ${q.correctIndex}`)
    }

    // 7. Check wrongTags
    if (!q.wrongTags || typeof q.wrongTags !== 'object') {
      errors.push(`${prefix} Missing wrongTags object`)
    } else {
      const wrongIndices = [0, 1, 2, 3].filter((i) => i !== q.correctIndex)
      for (const wi of wrongIndices) {
        const tag = q.wrongTags[String(wi)]
        if (!tag) {
          errors.push(`${prefix} Missing wrongTag for wrong option index ${wi}`)
        } else if (!ALLOWED_MISTAKE_TAGS.has(tag)) {
          errors.push(`${prefix} Invalid wrongTag "${tag}" for option index ${wi}. Allowed: ${[...ALLOWED_MISTAKE_TAGS].join(', ')}`)
        }
      }
      // Check no tag exists for correct index
      if (q.wrongTags[String(q.correctIndex)] !== undefined) {
        errors.push(`${prefix} correctIndex ${q.correctIndex} must not have an entry in wrongTags`)
      }
    }
  }

  // 8. Check hints count
  if (!Array.isArray(q.hints) || q.hints.length !== 3) {
    errors.push(`${prefix} Hints must have exactly 3 items, found ${q.hints?.length ?? 0}`)
  } else {
    q.hints.forEach((h, hIdx) => {
      if (!h || typeof h !== 'string' || !h.trim()) {
        errors.push(`${prefix} Hint ${hIdx + 1} is empty`)
      }
    })
  }

  // 9. Check solution
  if (!q.solution?.en?.trim() || !q.solution?.hi?.trim()) {
    errors.push(`${prefix} Missing solution.en or solution.hi`)
  }

  // 10. Arithmetic validation
  const checker = ARITHMETIC_CHECKS[q.id]
  if (checker) {
    const { expected, actual } = checker()
    if (expected !== actual) {
      errors.push(`${prefix} Arithmetic mismatch! Expected "${expected}", but option[correctIndex=${q.correctIndex}] is "${actual}"`)
    }
  }
})

// Check minimum 4 questions per concept
for (const cid of conceptIds) {
  const count = conceptQuestionCounts[cid] || 0
  if (count < 4) {
    errors.push(`Concept "${cid}" has only ${count} questions. Minimum required is 4.`)
  }
}

console.log('\nConcept Question Distribution Summary:')
for (const c of concepts) {
  const count = conceptQuestionCounts[c.id] || 0
  console.log(`  - [Gr ${c.grade}] ${c.id}: ${count} questions`)
}

// -------------------------------------------------------------
// 4. MISCONCEPTIONS LIBRARY VALIDATION
// -------------------------------------------------------------
const misconceptionsPath = path.resolve(__dirname, '../src/data/misconceptions.json')
if (fs.existsSync(misconceptionsPath)) {
  const misconceptions = JSON.parse(fs.readFileSync(misconceptionsPath, 'utf-8'))
  console.log(`\n--- 4. Misconceptions Library Validation (${misconceptions.length} entries) ---`)
  if (!Array.isArray(misconceptions) || misconceptions.length < 14) {
    errors.push(`Misconceptions library must have at least 14 entries, found ${misconceptions?.length ?? 0}`)
  }

  const seenMiscIds = new Set<string>()
  misconceptions.forEach((m: any, idx: number) => {
    const pfx = `[Misconception ${m.id || `#${idx + 1}`}]`
    if (!m.id) errors.push(`${pfx} Missing id`)
    else if (seenMiscIds.has(m.id)) errors.push(`${pfx} Duplicate id "${m.id}"`)
    else seenMiscIds.add(m.id)

    if (!conceptIds.has(m.conceptId)) {
      errors.push(`${pfx} Invalid conceptId "${m.conceptId}"`)
    }
    if (m.prerequisiteConceptId && !conceptIds.has(m.prerequisiteConceptId)) {
      errors.push(`${pfx} Invalid prerequisiteConceptId "${m.prerequisiteConceptId}"`)
    }
    if (!m.name?.en?.trim() || !m.name?.hi?.trim()) {
      errors.push(`${pfx} Missing name.en or name.hi`)
    }
    if (!m.description?.en?.trim() || !m.description?.hi?.trim()) {
      errors.push(`${pfx} Missing description.en or description.hi`)
    }
    if (!m.kidFriendlyExplanation?.en?.trim() || !m.kidFriendlyExplanation?.hi?.trim()) {
      errors.push(`${pfx} Missing kidFriendlyExplanation.en or kidFriendlyExplanation.hi`)
    }
    if (!m.whyItHappens?.en?.trim() || !m.whyItHappens?.hi?.trim()) {
      errors.push(`${pfx} Missing whyItHappens.en or whyItHappens.hi`)
    }
    if (!Array.isArray(m.miniLesson) || m.miniLesson.length !== 3) {
      errors.push(`${pfx} miniLesson must contain exactly 3 steps, found ${m.miniLesson?.length ?? 0}`)
    }
    if (!m.exampleWrong?.en?.trim() || !m.exampleWrong?.hi?.trim()) {
      errors.push(`${pfx} Missing exampleWrong.en or exampleWrong.hi`)
    }
    if (!m.exampleRight?.en?.trim() || !m.exampleRight?.hi?.trim()) {
      errors.push(`${pfx} Missing exampleRight.en or exampleRight.hi`)
    }
  })
  console.log(`✓ All ${misconceptions.length} misconceptions passed schema and concept link validation.`)
}

console.log('\n----------------------------------------------------------------')
if (errors.length > 0) {
  console.error(`❌ Validation FAILED with ${errors.length} errors:`)
  errors.forEach((err, i) => console.error(`  ${i + 1}. ${err}`))
  process.exit(1)
} else {
  console.log(`✅ All ${questions.length} questions across all ${concepts.length} concepts passed all validation checks!`)
  console.log('================================================================')
}
