import type { Question } from '../types'
import rawQuestions from '../data/questions.json'

const allQuestions = rawQuestions as unknown as Question[]

/**
 * Selects 10 questions for a practice session:
 * - Prefers questions near the student's grade
 * - Mixes concepts evenly (2 questions per concept across all 5 concepts)
 * - Guarantees no repeats within the session
 */
export function selectSessionQuestions(studentGrade: number): Question[] {
  // Group all questions by conceptId
  const byConcept = new Map<string, Question[]>()
  for (const q of allQuestions) {
    const list = byConcept.get(q.conceptId) || []
    list.push(q)
    byConcept.set(q.conceptId, list)
  }

  const selected: Question[] = []

  // For each concept, pick 2 best matching questions
  for (const [, questions] of byConcept.entries()) {
    // Sort by proximity to student's grade
    const sorted = [...questions].sort((a, b) => {
      const distA = Math.abs(a.grade - studentGrade)
      const distB = Math.abs(b.grade - studentGrade)
      if (distA !== distB) return distA - distB
      // Secondary sort: randomize slightly to avoid identical question picks across sessions
      return Math.random() - 0.5
    })

    // Take top 2
    selected.push(...sorted.slice(0, 2))
  }

  // Shuffle the 10 questions so the 5 concepts are interweaved
  return selected.sort(() => Math.random() - 0.5)
}

export function getQuestionById(id: string): Question | undefined {
  return allQuestions.find((q) => q.id === id)
}
