import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load existing questions (q01 to q20) and add suspectConceptId to wrong options where appropriate
const existingPath = path.resolve(__dirname, '../src/data/questions.json')
let existingQuestions = []
if (fs.existsSync(existingPath)) {
  existingQuestions = JSON.parse(fs.readFileSync(existingPath, 'utf-8')).slice(0, 20)
}

// Enhance existing q01 to q20 with suspectConceptIds
const suspectMapping: Record<string, Record<number, string>> = {
  q01: { 0: 'fractions-basics' },
  q02: { 0: 'fractions-basics', 1: 'integers' },
  q03: { 1: 'fractions-basics', 2: 'integers' },
  q04: { 0: 'fractions-basics', 1: 'factors-multiples' },
  q05: { 0: 'fractions-basics', 1: 'whole-numbers' },
  q06: { 0: 'whole-numbers', 2: 'integers' },
  q07: { 0: 'whole-numbers', 2: 'whole-numbers' },
  q08: { 0: 'whole-numbers', 1: 'decimals' },
  q09: { 0: 'fractions-basics', 1: 'factors-multiples' },
  q10: { 1: 'ratios', 2: 'whole-numbers' },
  q11: { 0: 'whole-numbers', 1: 'ratios' },
  q12: { 0: 'ratios', 1: 'whole-numbers' },
  q13: { 0: 'integers', 2: 'whole-numbers', 3: 'integers' },
  q14: { 0: 'integers', 1: 'whole-numbers', 3: 'algebraic-expressions' },
  q15: { 0: 'integers', 2: 'whole-numbers', 3: 'basic-equations' },
  q16: { 0: 'basic-equations', 1: 'integers', 2: 'whole-numbers' },
  q17: { 0: 'basic-equations', 1: 'integers', 3: 'integers' },
  q18: { 0: 'basic-equations', 1: 'integers', 3: 'algebraic-expressions' },
  q19: { 0: 'basic-equations', 2: 'integers', 3: 'integers' },
  q20: { 0: 'basic-equations', 2: 'integers', 3: 'algebraic-expressions' },
}

for (const q of existingQuestions) {
  const suspects = suspectMapping[q.id]
  if (suspects) {
    q.options.forEach((opt: any, idx: number) => {
      if (idx !== q.correctIndex && suspects[idx]) {
        opt.suspectConceptId = suspects[idx]
      }
    })
  }
}

// 68 new questions (q21 to q88) covering the other 17 concepts
const newQuestions = [
  // 1. whole-numbers (q21-q24)
  {
    id: 'q21',
    conceptId: 'whole-numbers',
    grade: 6,
    difficulty: 1,
    text: {
      en: 'Priya ordered 145 samosas for a school party and 280 more samosas for the teachers. How many samosas did she order in total?',
      hi: 'प्रिया ने स्कूल पार्टी के लिए 145 समोसे और शिक्षकों के लिए 280 और समोसे मंगवाए। उसने कुल कितने समोसे मंगवाए?'
    },
    options: [
      { en: '415 samosas', hi: '415 समोसे' },
      { en: '425 samosas', hi: '425 समोसे' },
      { en: '435 samosas', hi: '435 समोसे' },
      { en: '325 samosas', hi: '325 समोसे' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'calculation_slip', '2': 'calculation_slip', '3': 'concept_gap' },
    hints: [
      'Line up the numbers by place values: units, tens, hundreds.',
      'Add 145 + 280: 5 + 0 = 5, 4 + 8 = 12 (carry 1).',
      '1 + 1 + 2 = 4, so total is 425.'
    ],
    solution: {
      en: '145 + 280 = 425 samosas.',
      hi: '145 + 280 = 425 समोसे।'
    }
  },
  {
    id: 'q22',
    conceptId: 'whole-numbers',
    grade: 6,
    difficulty: 2,
    text: {
      en: 'An auto-rickshaw driver in Pune earned ₹850 today. He spent ₹320 on CNG fuel. How much money does he have left?',
      hi: 'पुणे में एक ऑटो-रिक्शा चालक ने आज ₹850 कमाए। उसने ₹320 सीएनजी ईंधन पर खर्च किए। उसके पास कितने रुपये बचे?'
    },
    options: [
      { en: '₹530', hi: '₹530' },
      { en: '₹570', hi: '₹570' },
      { en: '₹430', hi: '₹430' },
      { en: '₹1170', hi: '₹1170' }
    ],
    correctIndex: 0,
    wrongTags: { '1': 'calculation_slip', '2': 'calculation_slip', '3': 'concept_gap' },
    hints: [
      'To find money remaining, subtract expenses from earnings.',
      'Compute 850 - 320.',
      '800 - 300 = 500, and 50 - 20 = 30, so result is 530.'
    ],
    solution: {
      en: 'Earnings - Expenses = ₹850 - ₹320 = ₹530.',
      hi: 'कमाई - खर्च = ₹850 - ₹320 = ₹530।'
    }
  },
  {
    id: 'q23',
    conceptId: 'whole-numbers',
    grade: 6,
    difficulty: 2,
    text: {
      en: 'In a school cricket match, a team bowled 14 complete overs. Each over has 6 legal balls. How many legal balls were bowled in total?',
      hi: 'एक स्कूल क्रिकेट मैच में, एक टीम ने 14 ओवर फेंके। प्रत्येक ओवर में 6 गेंदें होती हैं। कुल कितनी गेंदें फेंकी गईं?'
    },
    options: [
      { en: '74 balls', hi: '74 गेंदें' },
      { en: '84 balls', hi: '84 गेंदें' },
      { en: '80 balls', hi: '80 गेंदें' },
      { en: '20 balls', hi: '20 गेंदें' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'calculation_slip', '2': 'calculation_slip', '3': 'formula_misuse' },
    hints: [
      'Total balls = number of overs × balls per over.',
      'Multiply 14 by 6.',
      '10 × 6 = 60, 4 × 6 = 24. 60 + 24 = 84.'
    ],
    solution: {
      en: '14 × 6 = 84 legal balls bowled.',
      hi: '14 × 6 = 84 गेंदें फेंकी गईं।'
    }
  },
  {
    id: 'q24',
    conceptId: 'whole-numbers',
    grade: 6,
    difficulty: 3,
    text: {
      en: 'For Diwali, a sweet shop made 750 motichoor laddus and packed them equally into 15 boxes. How many laddus are in each box?',
      hi: 'दिवाली पर, एक मिठाई की दुकान ने 750 मोतीचूर के लड्डू बनाए और उन्हें 15 डिब्बों में बराबर पैक किया। प्रत्येक डिब्बे में कितने लड्डू हैं?'
    },
    options: [
      { en: '45 laddus', hi: '45 लड्डू' },
      { en: '50 laddus', hi: '50 लड्डू' },
      { en: '55 laddus', hi: '55 लड्डू' },
      { en: '735 laddus', hi: '735 लड्डू' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'calculation_slip', '2': 'calculation_slip', '3': 'concept_gap' },
    hints: [
      'To distribute equally, divide total laddus by number of boxes.',
      'Divide 750 by 15.',
      '75 divided by 15 is 5, so 750 divided by 15 is 50.'
    ],
    solution: {
      en: '750 ÷ 15 = 50 laddus in each box.',
      hi: '750 ÷ 15 = 50 लड्डू प्रत्येक डिब्बे में।'
    }
  },

  // 2. factors-multiples (q25-q28)
  {
    id: 'q25',
    conceptId: 'factors-multiples',
    grade: 6,
    difficulty: 1,
    text: {
      en: 'Which of the following numbers is a prime number (has exactly two factors: 1 and itself)?',
      hi: 'निम्नलिखित में से कौन सी संख्या एक अभाज्य संख्या (prime number) है जिसके केवल दो गुणनखंड होते हैं?'
    },
    options: [
      { en: '15', hi: '15', suspectConceptId: 'whole-numbers' },
      { en: '19', hi: '19' },
      { en: '21', hi: '21', suspectConceptId: 'whole-numbers' },
      { en: '27', hi: '27', suspectConceptId: 'whole-numbers' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'concept_gap', '2': 'concept_gap', '3': 'concept_gap' },
    hints: [
      'Check if any number can be divided by numbers other than 1 and itself.',
      '15 = 3 × 5, 21 = 3 × 7, 27 = 3 × 9.',
      '19 has no divisors other than 1 and 19.'
    ],
    solution: {
      en: '19 is a prime number because its only factors are 1 and 19.',
      hi: '19 एक अभाज्य संख्या है क्योंकि इसके केवल दो गुणनखंड 1 और 19 हैं।'
    }
  },
  {
    id: 'q26',
    conceptId: 'factors-multiples',
    grade: 6,
    difficulty: 2,
    text: {
      en: 'What is the Highest Common Factor (HCF) of 24 and 36?',
      hi: '24 और 36 का महत्तम समापवर्तक (HCF / म.स.प.) क्या है?'
    },
    options: [
      { en: '6', hi: '6', suspectConceptId: 'whole-numbers' },
      { en: '12', hi: '12' },
      { en: '18', hi: '18', suspectConceptId: 'whole-numbers' },
      { en: '72', hi: '72', suspectConceptId: 'whole-numbers' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'concept_gap', '2': 'concept_gap', '3': 'formula_misuse' },
    hints: [
      'Factors of 24 are 1, 2, 3, 4, 6, 8, 12, 24.',
      'Factors of 36 are 1, 2, 3, 4, 6, 9, 12, 18, 36.',
      'The largest common factor is 12.'
    ],
    solution: {
      en: 'Prime factors: 24 = 2³ × 3, 36 = 2² × 3². HCF = 2² × 3 = 12.',
      hi: '24 और 36 का HCF = 12 है।'
    }
  },
  {
    id: 'q27',
    conceptId: 'factors-multiples',
    grade: 6,
    difficulty: 2,
    text: {
      en: 'What is the Lowest Common Multiple (LCM) of 12 and 18?',
      hi: '12 और 18 का लघुत्तम समापवर्त्य (LCM / ल.स.प.) क्या है?'
    },
    options: [
      { en: '6', hi: '6', suspectConceptId: 'whole-numbers' },
      { en: '24', hi: '24', suspectConceptId: 'whole-numbers' },
      { en: '36', hi: '36' },
      { en: '72', hi: '72', suspectConceptId: 'whole-numbers' }
    ],
    correctIndex: 2,
    wrongTags: { '0': 'formula_misuse', '1': 'concept_gap', '3': 'calculation_slip' },
    hints: [
      'Multiples of 12: 12, 24, 36, 48...',
      'Multiples of 18: 18, 36, 54...',
      'The smallest common multiple is 36.'
    ],
    solution: {
      en: 'LCM(12, 18) = 36.',
      hi: '12 और 18 का LCM = 36 है।'
    }
  },
  {
    id: 'q28',
    conceptId: 'factors-multiples',
    grade: 6,
    difficulty: 3,
    text: {
      en: 'Two bells in a temple toll at intervals of 15 minutes and 20 minutes respectively. If they toll together at 8:00 AM, after how many minutes will they next toll together?',
      hi: 'एक मंदिर की दो घंटियाँ क्रमशः 15 मिनट और 20 मिनट के अंतराल पर बजती हैं। यदि वे सुबह 8:00 बजे एक साथ बजती हैं, तो कितने मिनट बाद वे फिर एक साथ बजेंगी?'
    },
    options: [
      { en: '35 minutes', hi: '35 मिनट', suspectConceptId: 'whole-numbers' },
      { en: '60 minutes', hi: '60 मिनट' },
      { en: '5 minutes', hi: '5 मिनट', suspectConceptId: 'whole-numbers' },
      { en: '120 minutes', hi: '120 मिनट', suspectConceptId: 'whole-numbers' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'formula_misuse', '2': 'formula_misuse', '3': 'calculation_slip' },
    hints: [
      'The bells will toll together at a common multiple of 15 and 20.',
      'We need to find the LCM of 15 and 20.',
      '15 = 3 × 5, 20 = 2² × 5. LCM = 4 × 3 × 5 = 60 minutes.'
    ],
    solution: {
      en: 'LCM of 15 and 20 is 60. So they toll together after 60 minutes (at 9:00 AM).',
      hi: '15 और 20 का LCM 60 है। अतः वे 60 मिनट बाद पुनः एक साथ बजेंगी।'
    }
  },

  // 3. fractions-basics (q29-q32)
  {
    id: 'q29',
    conceptId: 'fractions-basics',
    grade: 6,
    difficulty: 1,
    text: {
      en: 'A round paratha is cut into 8 equal slices. Kabir ate 3 slices. What fraction of the paratha did he eat?',
      hi: 'एक गोल पराठे को 8 बराबर टुकड़ों में काटा गया। कबीर ने 3 टुकड़े खाए। उसने पराठे का कौन सा भिन्न खाया?'
    },
    options: [
      { en: '3/8', hi: '3/8' },
      { en: '5/8', hi: '5/8', suspectConceptId: 'whole-numbers' },
      { en: '8/3', hi: '8/3', suspectConceptId: 'whole-numbers' },
      { en: '3/5', hi: '3/5', suspectConceptId: 'whole-numbers' }
    ],
    correctIndex: 0,
    wrongTags: { '1': 'concept_gap', '2': 'concept_gap', '3': 'concept_gap' },
    hints: [
      'Fraction = (parts taken) / (total equal parts).',
      'The total number of slices is 8 (denominator).',
      'The number of slices eaten is 3 (numerator). Fraction is 3/8.'
    ],
    solution: {
      en: 'Fraction eaten = 3 / 8.',
      hi: 'खाया गया भाग = 3/8।'
    }
  },
  {
    id: 'q30',
    conceptId: 'fractions-basics',
    grade: 6,
    difficulty: 2,
    text: {
      en: 'Which of the following fractions is equivalent to 2/3?',
      hi: 'निम्नलिखित में से कौन सा भिन्न 2/3 के तुल्य (equivalent) है?'
    },
    options: [
      { en: '4/9', hi: '4/9', suspectConceptId: 'factors-multiples' },
      { en: '6/9', hi: '6/9' },
      { en: '5/6', hi: '5/6', suspectConceptId: 'factors-multiples' },
      { en: '4/5', hi: '4/5', suspectConceptId: 'factors-multiples' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'concept_gap', '2': 'added_denominators', '3': 'calculation_slip' },
    hints: [
      'An equivalent fraction is formed by multiplying numerator and denominator by the same number.',
      'Multiply both numerator (2) and denominator (3) by 3.',
      '(2 × 3) / (3 × 3) = 6/9.'
    ],
    solution: {
      en: '2/3 = (2 × 3) / (3 × 3) = 6/9.',
      hi: '2/3 = (2 × 3)/(3 × 3) = 6/9।'
    }
  },
  {
    id: 'q31',
    conceptId: 'fractions-basics',
    grade: 6,
    difficulty: 2,
    text: {
      en: 'Simplify the fraction 15/25 to its simplest form by dividing numerator and denominator by their HCF.',
      hi: 'भिन्न 15/25 को अंश और हर को उनके HCF से भाग देकर सरलतम रूप में लिखें।'
    },
    options: [
      { en: '3/5', hi: '3/5' },
      { en: '5/3', hi: '5/3', suspectConceptId: 'factors-multiples' },
      { en: '1/2', hi: '1/2', suspectConceptId: 'factors-multiples' },
      { en: '3/10', hi: '3/10', suspectConceptId: 'factors-multiples' }
    ],
    correctIndex: 0,
    wrongTags: { '1': 'concept_gap', '2': 'calculation_slip', '3': 'concept_gap' },
    hints: [
      'Find the common factor of 15 and 25.',
      'Both 15 and 25 are divisible by 5.',
      '15 ÷ 5 = 3 and 25 ÷ 5 = 5, giving 3/5.'
    ],
    solution: {
      en: '15/25 = (15 ÷ 5) / (25 ÷ 5) = 3/5.',
      hi: '15/25 = 3/5।'
    }
  },
  {
    id: 'q32',
    conceptId: 'fractions-basics',
    grade: 6,
    difficulty: 3,
    text: {
      en: 'Which of the following comparisons between 3/4 and 5/6 is correct?',
      hi: '3/4 और 5/6 के बीच निम्नलिखित में से कौन सी तुलना सही है?'
    },
    options: [
      { en: '3/4 > 5/6', hi: '3/4 > 5/6', suspectConceptId: 'factors-multiples' },
      { en: '5/6 > 3/4', hi: '5/6 > 3/4' },
      { en: '3/4 = 5/6', hi: '3/4 = 5/6', suspectConceptId: 'factors-multiples' },
      { en: 'Cannot be compared', hi: 'तुलना नहीं की जा सकती', suspectConceptId: 'factors-multiples' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'concept_gap', '2': 'concept_gap', '3': 'concept_gap' },
    hints: [
      'Convert both fractions to have common denominator 12.',
      '3/4 = 9/12 and 5/6 = 10/12.',
      'Since 10/12 > 9/12, 5/6 > 3/4.'
    ],
    solution: {
      en: '3/4 = 9/12 and 5/6 = 10/12. Since 10 > 9, 5/6 > 3/4.',
      hi: '3/4 = 9/12 और 5/6 = 10/12। अतः 5/6 > 3/4।'
    }
  },

  // 7. integers (q33-q36)
  {
    id: 'q33',
    conceptId: 'integers',
    grade: 7,
    difficulty: 1,
    text: {
      en: 'In Dras (Kashmir), the temperature at night was -4°C. By morning it dropped by 3°C more. What was the morning temperature?',
      hi: 'द्रास (कश्मीर) में रात का तापमान -4°C था। सुबह तक यह 3°C और गिर गया। सुबह का तापमान क्या था?'
    },
    options: [
      { en: '-1°C', hi: '-1°C', suspectConceptId: 'whole-numbers' },
      { en: '-7°C', hi: '-7°C' },
      { en: '7°C', hi: '7°C', suspectConceptId: 'whole-numbers' },
      { en: '-12°C', hi: '-12°C', suspectConceptId: 'whole-numbers' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'sign_error', '2': 'sign_error', '3': 'calculation_slip' },
    hints: [
      'A drop in temperature means subtracting: (-4) - 3.',
      'When you move 3 units to the left of -4 on the number line, you get -7.',
      '(-4) + (-3) = -7.'
    ],
    solution: {
      en: '-4°C - 3°C = -7°C.',
      hi: '-4°C - 3°C = -7°C।'
    }
  },
  {
    id: 'q34',
    conceptId: 'integers',
    grade: 7,
    difficulty: 2,
    text: {
      en: 'Evaluate the sum: (-15) + (+8).',
      hi: 'मान ज्ञात कीजिए: (-15) + (+8)।'
    },
    options: [
      { en: '-23', hi: '-23', suspectConceptId: 'whole-numbers' },
      { en: '-7', hi: '-7' },
      { en: '+7', hi: '+7', suspectConceptId: 'whole-numbers' },
      { en: '+23', hi: '+23', suspectConceptId: 'whole-numbers' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'calculation_slip', '2': 'sign_error', '3': 'sign_error' },
    hints: [
      'When adding two integers with opposite signs, subtract the smaller absolute value from the larger.',
      '15 - 8 = 7.',
      'Take the sign of the number with greater absolute value (-15), so the result is -7.'
    ],
    solution: {
      en: '(-15) + 8 = -7.',
      hi: '(-15) + 8 = -7।'
    }
  },
  {
    id: 'q35',
    conceptId: 'integers',
    grade: 7,
    difficulty: 2,
    text: {
      en: 'Evaluate the product of two negative integers: (-6) × (-4).',
      hi: 'दो ऋणात्मक पूर्णांकों का गुणनफल ज्ञात कीजिए: (-6) × (-4)।'
    },
    options: [
      { en: '-24', hi: '-24', suspectConceptId: 'whole-numbers' },
      { en: '+24', hi: '+24' },
      { en: '-10', hi: '-10', suspectConceptId: 'whole-numbers' },
      { en: '+10', hi: '+10', suspectConceptId: 'whole-numbers' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'sign_error', '2': 'formula_misuse', '3': 'formula_misuse' },
    hints: [
      'Remember the integer sign rule for multiplication: negative × negative = positive.',
      'Multiply the values: 6 × 4 = 24.',
      'Since both signs are negative, the final product is +24.'
    ],
    solution: {
      en: '(-) × (-) = (+), so (-6) × (-4) = +24.',
      hi: '(-) × (-) = (+), अतः (-6) × (-4) = +24।'
    }
  },
  {
    id: 'q36',
    conceptId: 'integers',
    grade: 7,
    difficulty: 3,
    text: {
      en: 'Evaluate: (-20) - (-35).',
      hi: 'मान ज्ञात कीजिए: (-20) - (-35)।'
    },
    options: [
      { en: '-55', hi: '-55', suspectConceptId: 'whole-numbers' },
      { en: '+15', hi: '+15' },
      { en: '-15', hi: '-15', suspectConceptId: 'whole-numbers' },
      { en: '+55', hi: '+55', suspectConceptId: 'whole-numbers' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'sign_error', '2': 'sign_error', '3': 'calculation_slip' },
    hints: [
      'Subtracting a negative number is the same as adding a positive number: -(-a) = +a.',
      'Rewrite the expression: (-20) + 35.',
      '35 - 20 = 15.'
    ],
    solution: {
      en: '(-20) - (-35) = -20 + 35 = +15.',
      hi: '(-20) - (-35) = -20 + 35 = +15।'
    }
  },

  // 8. fractions-mult-div (q37-q40)
  {
    id: 'q37',
    conceptId: 'fractions-mult-div',
    grade: 7,
    difficulty: 1,
    text: {
      en: 'Evaluate the multiplication of fractions: 2/3 × 3/5.',
      hi: 'भिन्नों का गुणनफल ज्ञात कीजिए: 2/3 × 3/5।'
    },
    options: [
      { en: '5/8', hi: '5/8', suspectConceptId: 'fractions-add' },
      { en: '2/5', hi: '2/5' },
      { en: '6/15', hi: '6/15', suspectConceptId: 'fractions-basics' },
      { en: '1/3', hi: '1/3', suspectConceptId: 'fractions-add' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'added_denominators', '2': 'calculation_slip', '3': 'concept_gap' },
    hints: [
      'Multiply numerator with numerator and denominator with denominator: (2 × 3) / (3 × 5).',
      'Notice that the 3 in numerator and 3 in denominator cancel out.',
      'You are left with 2/5.'
    ],
    solution: {
      en: '2/3 × 3/5 = (2 × 3) / (3 × 5) = 6/15 = 2/5.',
      hi: '2/3 × 3/5 = 2/5।'
    }
  },
  {
    id: 'q38',
    conceptId: 'fractions-mult-div',
    grade: 7,
    difficulty: 2,
    text: {
      en: 'A 24 km village road is under construction. 3/4 of the total road is completed. How many km of road are completed?',
      hi: '24 किमी लंबी एक ग्रामीण सड़क निर्माणाधीन है। कुल सड़क का 3/4 भाग पूरा हो चुका है। कितने किमी सड़क पूरी हो चुकी है?'
    },
    options: [
      { en: '16 km', hi: '16 किमी', suspectConceptId: 'fractions-add' },
      { en: '18 km', hi: '18 किमी' },
      { en: '20 km', hi: '20 किमी', suspectConceptId: 'whole-numbers' },
      { en: '12 km', hi: '12 किमी', suspectConceptId: 'fractions-basics' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'calculation_slip', '2': 'calculation_slip', '3': 'concept_gap' },
    hints: [
      'Find 3/4 of 24 by multiplying: (3/4) × 24.',
      'Divide 24 by 4 first: 24 ÷ 4 = 6.',
      'Then multiply by 3: 3 × 6 = 18 km.'
    ],
    solution: {
      en: '3/4 of 24 = (3 × 24) / 4 = 3 × 6 = 18 km.',
      hi: '24 का 3/4 = 18 किमी।'
    }
  },
  {
    id: 'q39',
    conceptId: 'fractions-mult-div',
    grade: 7,
    difficulty: 2,
    text: {
      en: 'What is the reciprocal (multiplicative inverse) of the fraction 7/9?',
      hi: 'भिन्न 7/9 का व्युत्क्रम (reciprocal) क्या है?'
    },
    options: [
      { en: '-7/9', hi: '-7/9', suspectConceptId: 'integers' },
      { en: '9/7', hi: '9/7' },
      { en: '2/9', hi: '2/9', suspectConceptId: 'fractions-basics' },
      { en: '1', hi: '1', suspectConceptId: 'fractions-basics' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'sign_error', '2': 'concept_gap', '3': 'formula_misuse' },
    hints: [
      'The reciprocal of a fraction a/b is b/a.',
      'Flip the numerator and denominator.',
      '7/9 flipped becomes 9/7.'
    ],
    solution: {
      en: 'The reciprocal of 7/9 is 9/7 because (7/9) × (9/7) = 1.',
      hi: '7/9 का व्युत्क्रम 9/7 है।'
    }
  },
  {
    id: 'q40',
    conceptId: 'fractions-mult-div',
    grade: 7,
    difficulty: 3,
    text: {
      en: 'Evaluate the division of fractions: (4/5) ÷ (2/15).',
      hi: 'भिन्नों का भाग ज्ञात कीजिए: (4/5) ÷ (2/15)।'
    },
    options: [
      { en: '8/75', hi: '8/75', suspectConceptId: 'fractions-add' },
      { en: '6', hi: '6' },
      { en: '2/3', hi: '2/3', suspectConceptId: 'fractions-basics' },
      { en: '10', hi: '10', suspectConceptId: 'whole-numbers' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'formula_misuse', '2': 'calculation_slip', '3': 'calculation_slip' },
    hints: [
      'To divide by a fraction, multiply by its reciprocal.',
      'The reciprocal of 2/15 is 15/2.',
      '(4/5) × (15/2) = (4 × 15) / (5 × 2) = 60 / 10 = 6.'
    ],
    solution: {
      en: '(4/5) ÷ (2/15) = (4/5) × (15/2) = (2 × 3) / 1 = 6.',
      hi: '(4/5) ÷ (2/15) = (4/5) × (15/2) = 6।'
    }
  },

  // 9. proportions (q41-q44)
  {
    id: 'q41',
    conceptId: 'proportions',
    grade: 7,
    difficulty: 1,
    text: {
      en: 'If 5 local metro tickets cost ₹60, what is the cost of 1 ticket?',
      hi: 'यदि 5 लोकल मेट्रो टिकटों की कीमत ₹60 है, तो 1 टिकट की कीमत क्या है?'
    },
    options: [
      { en: '₹10', hi: '₹10', suspectConceptId: 'whole-numbers' },
      { en: '₹12', hi: '₹12' },
      { en: '₹15', hi: '₹15', suspectConceptId: 'whole-numbers' },
      { en: '₹55', hi: '₹55', suspectConceptId: 'whole-numbers' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'calculation_slip', '2': 'calculation_slip', '3': 'concept_gap' },
    hints: [
      'Use the unitary method: divide total cost by number of items.',
      'Compute 60 ÷ 5.',
      '60 ÷ 5 = 12.'
    ],
    solution: {
      en: 'Cost of 1 ticket = ₹60 ÷ 5 = ₹12.',
      hi: '1 टिकट की कीमत = ₹60 ÷ 5 = ₹12।'
    }
  },
  {
    id: 'q42',
    conceptId: 'proportions',
    grade: 7,
    difficulty: 2,
    text: {
      en: 'If 4 notebooks cost ₹48 at a stationery store, how much will 7 notebooks cost at the same rate?',
      hi: 'यदि एक स्टेशनरी दुकान पर 4 कॉपियों की कीमत ₹48 है, तो उसी दर पर 7 कॉपियों की कीमत कितनी होगी?'
    },
    options: [
      { en: '₹72', hi: '₹72', suspectConceptId: 'whole-numbers' },
      { en: '₹84', hi: '₹84' },
      { en: '₹96', hi: '₹96', suspectConceptId: 'whole-numbers' },
      { en: '₹56', hi: '₹56', suspectConceptId: 'ratios' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'calculation_slip', '2': 'calculation_slip', '3': 'concept_gap' },
    hints: [
      'First find the cost of 1 notebook: 48 ÷ 4.',
      'Cost of 1 notebook is ₹12.',
      'Multiply cost of 1 notebook by 7: 12 × 7 = ₹84.'
    ],
    solution: {
      en: '1 notebook = ₹48 ÷ 4 = ₹12. 7 notebooks = 7 × ₹12 = ₹84.',
      hi: '1 कॉपी = ₹12। 7 कॉपियां = 7 × ₹12 = ₹84।'
    }
  },
  {
    id: 'q43',
    conceptId: 'proportions',
    grade: 7,
    difficulty: 2,
    text: {
      en: 'Find the unknown value x in the proportion: 3 : 5 = 12 : x.',
      hi: 'समानुपात में अज्ञात मान x ज्ञात कीजिए: 3 : 5 = 12 : x।'
    },
    options: [
      { en: '15', hi: '15', suspectConceptId: 'ratios' },
      { en: '20', hi: '20' },
      { en: '25', hi: '25', suspectConceptId: 'whole-numbers' },
      { en: '18', hi: '18', suspectConceptId: 'ratios' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'calculation_slip', '2': 'calculation_slip', '3': 'concept_gap' },
    hints: [
      'In a proportion a/b = c/d, the cross product is equal: a × d = b × c.',
      '3 × x = 5 × 12 = 60.',
      'Divide both sides by 3: x = 60 ÷ 3 = 20.'
    ],
    solution: {
      en: '3/5 = 12/x => 3x = 60 => x = 20.',
      hi: '3/5 = 12/x => 3x = 60 => x = 20।'
    }
  },
  {
    id: 'q44',
    conceptId: 'proportions',
    grade: 7,
    difficulty: 3,
    text: {
      en: 'A Vande Bharat train covers 150 km in 2 hours at constant speed. How far will it travel in 5 hours at the same speed?',
      hi: 'एक वंदे भारत ट्रेन 2 घंटे में 150 किमी की दूरी तय करती है। समान गति से 5 घंटे में यह कितनी दूरी तय करेगी?'
    },
    options: [
      { en: '300 km', hi: '300 किमी', suspectConceptId: 'whole-numbers' },
      { en: '375 km', hi: '375 किमी' },
      { en: '350 km', hi: '350 किमी', suspectConceptId: 'ratios' },
      { en: '450 km', hi: '450 किमी', suspectConceptId: 'whole-numbers' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'calculation_slip', '2': 'calculation_slip', '3': 'formula_misuse' },
    hints: [
      'Find the speed in km per hour: 150 km ÷ 2 hours = 75 km/h.',
      'Multiply speed by 5 hours: 75 × 5.',
      '70 × 5 = 350, 5 × 5 = 25. Total = 375 km.'
    ],
    solution: {
      en: 'Speed = 150 ÷ 2 = 75 km/h. Distance in 5 h = 75 × 5 = 375 km.',
      hi: 'गति = 75 किमी/घंटा। 5 घंटे में दूरी = 75 × 5 = 375 किमी।'
    }
  },

  // 10. percentages (q45-q48)
  {
    id: 'q45',
    conceptId: 'percentages',
    grade: 7,
    difficulty: 1,
    text: {
      en: 'Convert the fraction 3/4 into a percentage.',
      hi: 'भिन्न 3/4 को प्रतिशत में बदलिए।'
    },
    options: [
      { en: '34%', hi: '34%', suspectConceptId: 'decimals' },
      { en: '75%', hi: '75%' },
      { en: '60%', hi: '60%', suspectConceptId: 'proportions' },
      { en: '25%', hi: '25%', suspectConceptId: 'fractions-basics' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'concept_gap', '2': 'calculation_slip', '3': 'concept_gap' },
    hints: [
      'To convert a fraction to percentage, multiply it by 100%.',
      '(3/4) × 100%.',
      '100 ÷ 4 = 25, and 3 × 25 = 75%.'
    ],
    solution: {
      en: '(3/4) × 100% = 75%.',
      hi: '(3/4) × 100% = 75%।'
    }
  },
  {
    id: 'q46',
    conceptId: 'percentages',
    grade: 7,
    difficulty: 2,
    text: {
      en: 'In a class maths test of 80 marks, Neha scored 60 marks. What percentage of marks did she score?',
      hi: '80 अंकों की एक कक्षा गणित परीक्षा में, नेहा ने 60 अंक प्राप्त किए। उसने कितने प्रतिशत अंक प्राप्त किए?'
    },
    options: [
      { en: '60%', hi: '60%', suspectConceptId: 'proportions' },
      { en: '75%', hi: '75%' },
      { en: '70%', hi: '70%', suspectConceptId: 'decimals' },
      { en: '80%', hi: '80%', suspectConceptId: 'proportions' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'concept_gap', '2': 'calculation_slip', '3': 'concept_gap' },
    hints: [
      'Percentage = (Marks obtained / Total marks) × 100.',
      '(60 / 80) × 100.',
      '60/80 simplifies to 3/4. 3/4 × 100 = 75%.'
    ],
    solution: {
      en: '(60/80) × 100% = (3/4) × 100% = 75%.',
      hi: '(60/80) × 100% = 75%।'
    }
  },
  {
    id: 'q47',
    conceptId: 'percentages',
    grade: 7,
    difficulty: 2,
    text: {
      en: 'Calculate 25% of ₹400.',
      hi: '₹400 का 25% ज्ञात कीजिए।'
    },
    options: [
      { en: '₹80', hi: '₹80', suspectConceptId: 'decimals' },
      { en: '₹100', hi: '₹100' },
      { en: '₹120', hi: '₹120', suspectConceptId: 'proportions' },
      { en: '₹25', hi: '₹25', suspectConceptId: 'whole-numbers' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'calculation_slip', '2': 'calculation_slip', '3': 'concept_gap' },
    hints: [
      '25% means 25 / 100, which is equal to 1/4.',
      'Multiply (1/4) × 400.',
      '400 ÷ 4 = 100.'
    ],
    solution: {
      en: '25% of 400 = (25/100) × 400 = 100.',
      hi: '400 का 25% = ₹100।'
    }
  },
  {
    id: 'q48',
    conceptId: 'percentages',
    grade: 7,
    difficulty: 3,
    text: {
      en: 'A cricket bat originally priced at ₹1200 is offered with a 15% discount. What is the discount amount in rupees?',
      hi: '₹1200 के मूल मूल्य वाले एक क्रिकेट बल्ले पर 15% की छूट दी जाती है। छूट की राशि कितने रुपये है?'
    },
    options: [
      { en: '₹150', hi: '₹150', suspectConceptId: 'whole-numbers' },
      { en: '₹180', hi: '₹180' },
      { en: '₹200', hi: '₹200', suspectConceptId: 'decimals' },
      { en: '₹1020', hi: '₹1020', suspectConceptId: 'proportions' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'calculation_slip', '2': 'calculation_slip', '3': 'concept_gap' },
    hints: [
      'Discount amount = 15% of 1200.',
      '(15 / 100) × 1200.',
      '15 × 12 = 180.'
    ],
    solution: {
      en: '(15/100) × 1200 = 15 × 12 = ₹180.',
      hi: '(15/100) × 1200 = ₹180 छूट।'
    }
  },

  // 11. algebraic-expressions (q49-q52)
  {
    id: 'q49',
    conceptId: 'algebraic-expressions',
    grade: 7,
    difficulty: 1,
    text: {
      en: 'In the algebraic term -7x, what is the numerical coefficient of x?',
      hi: 'बीजीय पद -7x में x का संख्यात्मक गुणांक (numerical coefficient) क्या है?'
    },
    options: [
      { en: '7', hi: '7', suspectConceptId: 'integers' },
      { en: '-7', hi: '-7' },
      { en: 'x', hi: 'x', suspectConceptId: 'integers' },
      { en: '-1', hi: '-1', suspectConceptId: 'integers' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'sign_error', '2': 'concept_gap', '3': 'concept_gap' },
    hints: [
      'The coefficient is the constant multiplying the variable.',
      'Do not forget the negative sign.',
      'The coefficient is -7.'
    ],
    solution: {
      en: 'In -7x, the numerical coefficient multiplying x is -7.',
      hi: '-7x में x का गुणांक -7 है।'
    }
  },
  {
    id: 'q50',
    conceptId: 'algebraic-expressions',
    grade: 7,
    difficulty: 2,
    text: {
      en: 'Simplify the algebraic expression by combining like terms: 4x + 3y + 2x - y.',
      hi: 'समान पदों को मिलाकर बीजीय व्यंजक को सरल कीजिए: 4x + 3y + 2x - y।'
    },
    options: [
      { en: '6x + 4y', hi: '6x + 4y', suspectConceptId: 'integers' },
      { en: '6x + 2y', hi: '6x + 2y' },
      { en: '8xy', hi: '8xy', suspectConceptId: 'integers' },
      { en: '2x + 2y', hi: '2x + 2y', suspectConceptId: 'integers' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'sign_error', '2': 'concept_gap', '3': 'calculation_slip' },
    hints: [
      'Group like terms together: (4x + 2x) and (3y - y).',
      '4x + 2x = 6x.',
      '3y - 1y = 2y. Result is 6x + 2y.'
    ],
    solution: {
      en: '(4x + 2x) + (3y - y) = 6x + 2y.',
      hi: '(4x + 2x) + (3y - y) = 6x + 2y।'
    }
  },
  {
    id: 'q51',
    conceptId: 'algebraic-expressions',
    grade: 7,
    difficulty: 2,
    text: {
      en: 'Find the numerical value of the expression 3x - 5 when x = 4.',
      hi: 'x = 4 होने पर व्यंजक 3x - 5 का संख्यात्मक मान ज्ञात कीजिए।'
    },
    options: [
      { en: '12', hi: '12', suspectConceptId: 'integers' },
      { en: '7', hi: '7' },
      { en: '-1', hi: '-1', suspectConceptId: 'integers' },
      { en: '17', hi: '17', suspectConceptId: 'integers' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'calculation_slip', '2': 'sign_error', '3': 'sign_error' },
    hints: [
      'Substitute x = 4 into 3x - 5.',
      'Multiply 3 by 4 first: 3 × 4 = 12.',
      'Subtract 5: 12 - 5 = 7.'
    ],
    solution: {
      en: '3(4) - 5 = 12 - 5 = 7.',
      hi: '3(4) - 5 = 12 - 5 = 7।'
    }
  },
  {
    id: 'q52',
    conceptId: 'algebraic-expressions',
    grade: 7,
    difficulty: 3,
    text: {
      en: 'Subtract (2x - 3) from (5x + 4).',
      hi: '(5x + 4) में से (2x - 3) को घटाइए।'
    },
    options: [
      { en: '3x + 1', hi: '3x + 1', suspectConceptId: 'integers' },
      { en: '3x + 7', hi: '3x + 7' },
      { en: '7x + 1', hi: '7x + 1', suspectConceptId: 'integers' },
      { en: '3x - 7', hi: '3x - 7', suspectConceptId: 'integers' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'sign_error', '2': 'concept_gap', '3': 'sign_error' },
    hints: [
      'Write the subtraction: (5x + 4) - (2x - 3).',
      'Distribute the minus sign: 5x + 4 - 2x + 3.',
      'Combine like terms: (5x - 2x) + (4 + 3) = 3x + 7.'
    ],
    solution: {
      en: '(5x + 4) - (2x - 3) = 5x + 4 - 2x + 3 = 3x + 7.',
      hi: '(5x + 4) - (2x - 3) = 5x + 4 - 2x + 3 = 3x + 7।'
    }
  },

  // 14. exponents (q53-q56)
  {
    id: 'q53',
    conceptId: 'exponents',
    grade: 8,
    difficulty: 1,
    text: {
      en: 'Write the repeated product 3 × 3 × 3 × 3 in exponential form.',
      hi: 'बार-बार गुणा 3 × 3 × 3 × 3 को घातांकीय रूप में लिखिए।'
    },
    options: [
      { en: '3 × 4', hi: '3 × 4', suspectConceptId: 'whole-numbers' },
      { en: '3⁴', hi: '3⁴' },
      { en: '4³', hi: '4³', suspectConceptId: 'whole-numbers' },
      { en: '12', hi: '12', suspectConceptId: 'whole-numbers' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'concept_gap', '2': 'concept_gap', '3': 'concept_gap' },
    hints: [
      'The base is the number being multiplied (3).',
      'The exponent is the number of times it is multiplied (4 times).',
      'Exponential form is 3⁴.'
    ],
    solution: {
      en: '3 multiplied by itself 4 times is written as 3⁴.',
      hi: '3 का स्वयं से 4 बार गुणन 3⁴ लिखा जाता है।'
    }
  },
  {
    id: 'q54',
    conceptId: 'exponents',
    grade: 8,
    difficulty: 2,
    text: {
      en: 'Using the laws of exponents (aᵐ × aⁿ = aᵐ⁺ⁿ), simplify: 2³ × 2⁴.',
      hi: 'घातांक के नियम (aᵐ × aⁿ = aᵐ⁺ⁿ) का उपयोग करके सरल कीजिए: 2³ × 2⁴।'
    },
    options: [
      { en: '2¹²', hi: '2¹²', suspectConceptId: 'whole-numbers' },
      { en: '2⁷', hi: '2⁷' },
      { en: '4⁷', hi: '4⁷', suspectConceptId: 'whole-numbers' },
      { en: '2¹', hi: '2¹', suspectConceptId: 'whole-numbers' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'formula_misuse', '2': 'concept_gap', '3': 'calculation_slip' },
    hints: [
      'When multiplying powers with the same base, add their exponents.',
      'Base is 2. Exponents are 3 and 4.',
      '3 + 4 = 7, so result is 2⁷.'
    ],
    solution: {
      en: '2³ × 2⁴ = 2^(3+4) = 2⁷.',
      hi: '2³ × 2⁴ = 2^(3+4) = 2⁷।'
    }
  },
  {
    id: 'q55',
    conceptId: 'exponents',
    grade: 8,
    difficulty: 2,
    text: {
      en: 'Using the quotient law of exponents (aᵐ ÷ aⁿ = aᵐ⁻ⁿ), evaluate: 5⁶ ÷ 5².',
      hi: 'घातांक के भाग नियम (aᵐ ÷ aⁿ = aᵐ⁻ⁿ) का उपयोग करके मान ज्ञात कीजिए: 5⁶ ÷ 5²।'
    },
    options: [
      { en: '5³', hi: '5³', suspectConceptId: 'whole-numbers' },
      { en: '5⁴', hi: '5⁴' },
      { en: '5⁸', hi: '5⁸', suspectConceptId: 'exponents' },
      { en: '1⁴', hi: '1⁴', suspectConceptId: 'whole-numbers' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'formula_misuse', '2': 'formula_misuse', '3': 'concept_gap' },
    hints: [
      'When dividing powers with the same base, subtract exponents.',
      '6 - 2 = 4.',
      'The base stays 5, so result is 5⁴.'
    ],
    solution: {
      en: '5⁶ ÷ 5² = 5^(6-2) = 5⁴.',
      hi: '5⁶ ÷ 5² = 5^(6-2) = 5⁴।'
    }
  },
  {
    id: 'q56',
    conceptId: 'exponents',
    grade: 8,
    difficulty: 3,
    text: {
      en: 'Evaluate the negative exponent: 2⁻³ as a fraction in simplest form.',
      hi: 'ऋणात्मक घातांक 2⁻³ का सरलतम भिन्न के रूप में मान ज्ञात कीजिए।'
    },
    options: [
      { en: '-8', hi: '-8', suspectConceptId: 'integers' },
      { en: '1/8', hi: '1/8' },
      { en: '-6', hi: '-6', suspectConceptId: 'integers' },
      { en: '1/6', hi: '1/6', suspectConceptId: 'whole-numbers' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'sign_error', '2': 'concept_gap', '3': 'concept_gap' },
    hints: [
      'Recall the rule for negative exponents: a⁻ⁿ = 1 / aⁿ.',
      '2⁻³ = 1 / (2³).',
      '2³ = 8, so 1 / 2³ = 1/8.'
    ],
    solution: {
      en: '2⁻³ = 1 / 2³ = 1/8.',
      hi: '2⁻³ = 1 / 2³ = 1/8।'
    }
  },

  // 15. linear-equations-distributive (q57-q60)
  {
    id: 'q57',
    conceptId: 'linear-equations-distributive',
    grade: 8,
    difficulty: 1,
    text: {
      en: 'Solve the equation with brackets: 2(x + 3) = 14.',
      hi: 'कोष्ठक वाले समीकरण को हल कीजिए: 2(x + 3) = 14।'
    },
    options: [
      { en: 'x = 11', hi: 'x = 11', suspectConceptId: 'basic-equations' },
      { en: 'x = 4', hi: 'x = 4' },
      { en: 'x = 5', hi: 'x = 5', suspectConceptId: 'balancing-equations' },
      { en: 'x = 7', hi: 'x = 7', suspectConceptId: 'basic-equations' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'formula_misuse', '2': 'calculation_slip', '3': 'concept_gap' },
    hints: [
      'Either expand the bracket: 2x + 6 = 14, or divide both sides by 2 first: x + 3 = 7.',
      'Subtract 3 from 7.',
      'x = 4.'
    ],
    solution: {
      en: 'Divide by 2: x + 3 = 7 => x = 7 - 3 = 4.',
      hi: '2 से भाग दें: x + 3 = 7 => x = 4।'
    }
  },
  {
    id: 'q58',
    conceptId: 'linear-equations-distributive',
    grade: 8,
    difficulty: 2,
    text: {
      en: 'Solve the linear equation: 3(y - 4) = 15.',
      hi: 'रैखिक समीकरण हल कीजिए: 3(y - 4) = 15।'
    },
    options: [
      { en: 'y = 1', hi: 'y = 1', suspectConceptId: 'integers' },
      { en: 'y = 9', hi: 'y = 9' },
      { en: 'y = 7', hi: 'y = 7', suspectConceptId: 'balancing-equations' },
      { en: 'y = -1', hi: 'y = -1', suspectConceptId: 'integers' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'sign_error', '2': 'calculation_slip', '3': 'sign_error' },
    hints: [
      'Divide both sides by 3: y - 4 = 15 ÷ 3.',
      'y - 4 = 5.',
      'Add 4 to both sides: y = 5 + 4 = 9.'
    ],
    solution: {
      en: 'y - 4 = 5 => y = 5 + 4 = 9.',
      hi: 'y - 4 = 5 => y = 9।'
    }
  },
  {
    id: 'q59',
    conceptId: 'linear-equations-distributive',
    grade: 8,
    difficulty: 2,
    text: {
      en: 'Solve the equation: 4(2x + 1) = 36.',
      hi: 'समीकरण हल कीजिए: 4(2x + 1) = 36।'
    },
    options: [
      { en: 'x = 5', hi: 'x = 5', suspectConceptId: 'balancing-equations' },
      { en: 'x = 4', hi: 'x = 4' },
      { en: 'x = 8', hi: 'x = 8', suspectConceptId: 'algebraic-expressions' },
      { en: 'x = 3', hi: 'x = 3', suspectConceptId: 'basic-equations' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'calculation_slip', '2': 'formula_misuse', '3': 'calculation_slip' },
    hints: [
      'Divide both sides by 4: 2x + 1 = 9.',
      'Subtract 1: 2x = 8.',
      'Divide by 2: x = 4.'
    ],
    solution: {
      en: '2x + 1 = 9 => 2x = 8 => x = 4.',
      hi: '2x + 1 = 9 => 2x = 8 => x = 4।'
    }
  },
  {
    id: 'q60',
    conceptId: 'linear-equations-distributive',
    grade: 8,
    difficulty: 3,
    text: {
      en: 'Solve the equation involving negative integers: 5(p - 2) = -25.',
      hi: 'ऋणात्मक पूर्णांक वाला समीकरण हल कीजिए: 5(p - 2) = -25।'
    },
    options: [
      { en: 'p = 3', hi: 'p = 3', suspectConceptId: 'integers' },
      { en: 'p = -3', hi: 'p = -3' },
      { en: 'p = -7', hi: 'p = -7', suspectConceptId: 'integers' },
      { en: 'p = -5', hi: 'p = -5', suspectConceptId: 'balancing-equations' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'sign_error', '2': 'sign_error', '3': 'calculation_slip' },
    hints: [
      'Divide both sides by 5: p - 2 = -25 ÷ 5.',
      'p - 2 = -5.',
      'Add 2 to both sides: p = -5 + 2 = -3.'
    ],
    solution: {
      en: 'p - 2 = -5 => p = -5 + 2 = -3.',
      hi: 'p - 2 = -5 => p = -5 + 2 = -3।'
    }
  },

  // 16. equations-both-sides (q61-q64)
  {
    id: 'q61',
    conceptId: 'equations-both-sides',
    grade: 9,
    difficulty: 1,
    text: {
      en: 'Solve the equation with variables on both sides: 5x + 3 = 2x + 15.',
      hi: 'दोनों पक्षों में चर वाले समीकरण को हल कीजिए: 5x + 3 = 2x + 15।'
    },
    options: [
      { en: 'x = 6', hi: 'x = 6', suspectConceptId: 'balancing-equations' },
      { en: 'x = 4', hi: 'x = 4' },
      { en: 'x = 3', hi: 'x = 3', suspectConceptId: 'linear-equations-distributive' },
      { en: 'x = -4', hi: 'x = -4', suspectConceptId: 'integers' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'calculation_slip', '2': 'calculation_slip', '3': 'sign_error' },
    hints: [
      'Transpose 2x to the LHS: 5x - 2x = 3x.',
      'Transpose 3 to the RHS: 15 - 3 = 12.',
      '3x = 12 => x = 4.'
    ],
    solution: {
      en: '5x - 2x = 15 - 3 => 3x = 12 => x = 4.',
      hi: '5x - 2x = 15 - 3 => 3x = 12 => x = 4।'
    }
  },
  {
    id: 'q62',
    conceptId: 'equations-both-sides',
    grade: 9,
    difficulty: 2,
    text: {
      en: 'Solve the equation: 7y - 4 = 3y + 16.',
      hi: 'समीकरण हल कीजिए: 7y - 4 = 3y + 16।'
    },
    options: [
      { en: 'y = 3', hi: 'y = 3', suspectConceptId: 'balancing-equations' },
      { en: 'y = 5', hi: 'y = 5' },
      { en: 'y = 4', hi: 'y = 4', suspectConceptId: 'integers' },
      { en: 'y = -5', hi: 'y = -5', suspectConceptId: 'integers' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'calculation_slip', '2': 'calculation_slip', '3': 'sign_error' },
    hints: [
      'Transpose 3y to the left: 7y - 3y = 4y.',
      'Transpose -4 to the right: 16 + 4 = 20.',
      '4y = 20 => y = 5.'
    ],
    solution: {
      en: '7y - 3y = 16 + 4 => 4y = 20 => y = 5.',
      hi: '7y - 3y = 16 + 4 => 4y = 20 => y = 5।'
    }
  },
  {
    id: 'q63',
    conceptId: 'equations-both-sides',
    grade: 9,
    difficulty: 2,
    text: {
      en: 'Solve the linear equation: 4x + 9 = 6x - 1.',
      hi: 'रैखिक समीकरण हल कीजिए: 4x + 9 = 6x - 1।'
    },
    options: [
      { en: 'x = -5', hi: 'x = -5', suspectConceptId: 'integers' },
      { en: 'x = 5', hi: 'x = 5' },
      { en: 'x = 4', hi: 'x = 4', suspectConceptId: 'balancing-equations' },
      { en: 'x = 8', hi: 'x = 8', suspectConceptId: 'balancing-equations' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'sign_error', '2': 'calculation_slip', '3': 'concept_gap' },
    hints: [
      'Transpose 4x to RHS: 6x - 4x = 2x.',
      'Transpose -1 to LHS: 9 + 1 = 10.',
      '2x = 10 => x = 5.'
    ],
    solution: {
      en: '9 + 1 = 6x - 4x => 10 = 2x => x = 5.',
      hi: '9 + 1 = 6x - 4x => 10 = 2x => x = 5।'
    }
  },
  {
    id: 'q64',
    conceptId: 'equations-both-sides',
    grade: 9,
    difficulty: 3,
    text: {
      en: 'Solve the equation with brackets and variable on both sides: 3(x + 2) = 2x + 11.',
      hi: 'कोष्ठक और दोनों तरफ चर वाले समीकरण को हल कीजिए: 3(x + 2) = 2x + 11।'
    },
    options: [
      { en: 'x = 9', hi: 'x = 9', suspectConceptId: 'linear-equations-distributive' },
      { en: 'x = 5', hi: 'x = 5' },
      { en: 'x = 7', hi: 'x = 7', suspectConceptId: 'balancing-equations' },
      { en: 'x = -5', hi: 'x = -5', suspectConceptId: 'integers' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'calculation_slip', '2': 'calculation_slip', '3': 'sign_error' },
    hints: [
      'Expand the bracket on LHS: 3x + 6 = 2x + 11.',
      'Subtract 2x from both sides: 3x - 2x = x.',
      'Subtract 6 from 11: x = 11 - 6 = 5.'
    ],
    solution: {
      en: '3x + 6 = 2x + 11 => 3x - 2x = 11 - 6 => x = 5.',
      hi: '3x + 6 = 2x + 11 => x = 5।'
    }
  },

  // 17. linear-equations-two-vars (q65-q68)
  {
    id: 'q65',
    conceptId: 'linear-equations-two-vars',
    grade: 9,
    difficulty: 1,
    text: {
      en: 'Express the linear equation x + 2y = 7 in the standard form ax + by + c = 0.',
      hi: 'रैखिक समीकरण x + 2y = 7 को मानक रूप ax + by + c = 0 में व्यक्त कीजिए।'
    },
    options: [
      { en: 'x + 2y + 7 = 0', hi: 'x + 2y + 7 = 0', suspectConceptId: 'equations-both-sides' },
      { en: 'x + 2y - 7 = 0', hi: 'x + 2y - 7 = 0' },
      { en: '2x + y - 7 = 0', hi: '2x + y - 7 = 0', suspectConceptId: 'basic-equations' },
      { en: 'x - 2y - 7 = 0', hi: 'x - 2y - 7 = 0', suspectConceptId: 'integers' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'sign_error', '2': 'concept_gap', '3': 'sign_error' },
    hints: [
      'Standard form requires all terms on the LHS and 0 on the RHS.',
      'Transpose 7 to the left side: +7 becomes -7.',
      'x + 2y - 7 = 0.'
    ],
    solution: {
      en: 'x + 2y = 7 => x + 2y - 7 = 0.',
      hi: 'x + 2y = 7 => x + 2y - 7 = 0।'
    }
  },
  {
    id: 'q66',
    conceptId: 'linear-equations-two-vars',
    grade: 9,
    difficulty: 2,
    text: {
      en: 'Which of the following ordered pairs (x, y) is a solution to the equation 2x + y = 10?',
      hi: 'निम्नलिखित में से कौन सा क्रमित युग्म (x, y) समीकरण 2x + y = 10 का एक हल है?'
    },
    options: [
      { en: '(2, 4)', hi: '(2, 4)', suspectConceptId: 'basic-equations' },
      { en: '(3, 4)', hi: '(3, 4)' },
      { en: '(4, 3)', hi: '(4, 3)', suspectConceptId: 'basic-equations' },
      { en: '(5, 2)', hi: '(5, 2)', suspectConceptId: 'equations-both-sides' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'calculation_slip', '2': 'concept_gap', '3': 'calculation_slip' },
    hints: [
      'Substitute x and y into 2x + y and check if it equals 10.',
      'For (3, 4): 2(3) + 4 = 6 + 4.',
      '6 + 4 = 10, so (3, 4) satisfies the equation.'
    ],
    solution: {
      en: '2(3) + 4 = 6 + 4 = 10. Thus (3, 4) is a solution.',
      hi: '2(3) + 4 = 10। अतः (3, 4) सही हल है।'
    }
  },
  {
    id: 'q67',
    conceptId: 'linear-equations-two-vars',
    grade: 9,
    difficulty: 2,
    text: {
      en: 'If x = 2, y = 1 is a solution of the linear equation 2x + 3y = k, find the value of k.',
      hi: 'यदि x = 2, y = 1 रैखिक समीकरण 2x + 3y = k का एक हल है, तो k का मान ज्ञात कीजिए।'
    },
    options: [
      { en: 'k = 5', hi: 'k = 5', suspectConceptId: 'basic-equations' },
      { en: 'k = 7', hi: 'k = 7' },
      { en: 'k = 8', hi: 'k = 8', suspectConceptId: 'algebraic-expressions' },
      { en: 'k = 10', hi: 'k = 10', suspectConceptId: 'basic-equations' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'calculation_slip', '2': 'calculation_slip', '3': 'concept_gap' },
    hints: [
      'Substitute x = 2 and y = 1 into 2x + 3y.',
      '2(2) + 3(1) = 4 + 3.',
      'k = 7.'
    ],
    solution: {
      en: 'k = 2(2) + 3(1) = 4 + 3 = 7.',
      hi: 'k = 2(2) + 3(1) = 4 + 3 = 7।'
    }
  },
  {
    id: 'q68',
    conceptId: 'linear-equations-two-vars',
    grade: 9,
    difficulty: 3,
    text: {
      en: 'Find the value of y when x = 0 in the linear equation 3x + 4y = 12.',
      hi: 'रैखिक समीकरण 3x + 4y = 12 में x = 0 होने पर y का मान ज्ञात कीजिए।'
    },
    options: [
      { en: 'y = 4', hi: 'y = 4', suspectConceptId: 'basic-equations' },
      { en: 'y = 3', hi: 'y = 3' },
      { en: 'y = 0', hi: 'y = 0', suspectConceptId: 'equations-both-sides' },
      { en: 'y = -3', hi: 'y = -3', suspectConceptId: 'integers' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'calculation_slip', '2': 'concept_gap', '3': 'sign_error' },
    hints: [
      'Substitute x = 0: 3(0) + 4y = 12.',
      '0 + 4y = 12 => 4y = 12.',
      'Divide by 4: y = 3.'
    ],
    solution: {
      en: '3(0) + 4y = 12 => 4y = 12 => y = 3.',
      hi: '3(0) + 4y = 12 => 4y = 12 => y = 3।'
    }
  },

  // 18. coordinate-geometry (q69-q72)
  {
    id: 'q69',
    conceptId: 'coordinate-geometry',
    grade: 9,
    difficulty: 1,
    text: {
      en: 'In which quadrant of the Cartesian coordinate plane does the point (-3, 4) lie?',
      hi: 'कार्तीय निर्देशांक तल के किस चतुर्थांश में बिंदु (-3, 4) स्थित है?'
    },
    options: [
      { en: 'Quadrant I', hi: 'चतुर्थांश I', suspectConceptId: 'integers' },
      { en: 'Quadrant II', hi: 'चतुर्थांश II' },
      { en: 'Quadrant III', hi: 'चतुर्थांश III', suspectConceptId: 'integers' },
      { en: 'Quadrant IV', hi: 'चतुर्थांश IV', suspectConceptId: 'integers' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'sign_error', '2': 'sign_error', '3': 'concept_gap' },
    hints: [
      'Check the signs of coordinates (x, y). Here x is negative (-3) and y is positive (4).',
      'Quadrant signs: I (+, +), II (-, +), III (-, -), IV (+, -).',
      '(-, +) is in Quadrant II.'
    ],
    solution: {
      en: 'Since x < 0 and y > 0, the point (-3, 4) lies in Quadrant II.',
      hi: 'चूँकि x < 0 और y > 0 है, बिंदु (-3, 4) द्वितीय चतुर्थांश (Quadrant II) में है।'
    }
  },
  {
    id: 'q70',
    conceptId: 'coordinate-geometry',
    grade: 9,
    difficulty: 2,
    text: {
      en: 'What are the coordinates of the origin where the x-axis and y-axis intersect?',
      hi: 'मूल बिंदु (origin) के निर्देशांक क्या हैं जहाँ x-अक्ष और y-अक्ष प्रतिच्छेद करते हैं?'
    },
    options: [
      { en: '(1, 1)', hi: '(1, 1)', suspectConceptId: 'integers' },
      { en: '(0, 0)', hi: '(0, 0)' },
      { en: '(0, 1)', hi: '(0, 1)', suspectConceptId: 'integers' },
      { en: '(1, 0)', hi: '(1, 0)', suspectConceptId: 'integers' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'concept_gap', '2': 'concept_gap', '3': 'concept_gap' },
    hints: [
      'At the intersection of both axes, both x and y values are zero.',
      'The origin is represented as (0, 0).',
      'Choose (0, 0).'
    ],
    solution: {
      en: 'The origin is represented by the ordered pair (0, 0).',
      hi: 'मूल बिंदु के निर्देशांक (0, 0) होते हैं।'
    }
  },
  {
    id: 'q71',
    conceptId: 'coordinate-geometry',
    grade: 9,
    difficulty: 2,
    text: {
      en: 'A point lies on the x-axis at a distance of 5 units to the positive side of the origin. What are its coordinates?',
      hi: 'एक बिंदु x-अक्ष पर मूल बिंदु से दाईं ओर 5 इकाई की दूरी पर स्थित है। इसके निर्देशांक क्या हैं?'
    },
    options: [
      { en: '(0, 5)', hi: '(0, 5)', suspectConceptId: 'coordinate-geometry' },
      { en: '(5, 0)', hi: '(5, 0)' },
      { en: '(5, 5)', hi: '(5, 5)', suspectConceptId: 'coordinate-geometry' },
      { en: '(-5, 0)', hi: '(-5, 0)', suspectConceptId: 'integers' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'concept_gap', '2': 'concept_gap', '3': 'sign_error' },
    hints: [
      'Any point lying on the x-axis has y-coordinate equal to 0.',
      'The x-coordinate is 5.',
      'The point is (5, 0).'
    ],
    solution: {
      en: 'Points on x-axis have y = 0. Therefore the point is (5, 0).',
      hi: 'x-अक्ष पर स्थित बिंदु के लिए y = 0 होता है। अतः बिंदु (5, 0) है।'
    }
  },
  {
    id: 'q72',
    conceptId: 'coordinate-geometry',
    grade: 9,
    difficulty: 3,
    text: {
      en: 'In which quadrant does the point (-4, -6) lie?',
      hi: 'बिंदु (-4, -6) किस चतुर्थांश में स्थित है?'
    },
    options: [
      { en: 'Quadrant I', hi: 'चतुर्थांश I', suspectConceptId: 'integers' },
      { en: 'Quadrant II', hi: 'चतुर्थांश II', suspectConceptId: 'integers' },
      { en: 'Quadrant III', hi: 'चतुर्थांश III' },
      { en: 'Quadrant IV', hi: 'चतुर्थांश IV', suspectConceptId: 'integers' }
    ],
    correctIndex: 2,
    wrongTags: { '0': 'sign_error', '1': 'sign_error', '3': 'sign_error' },
    hints: [
      'Both coordinates are negative: x = -4 and y = -6.',
      'The quadrant where both x < 0 and y < 0 is Quadrant III.',
      'Choose Quadrant III.'
    ],
    solution: {
      en: 'Since both x and y are negative (-, -), the point lies in Quadrant III.',
      hi: 'चूँकि x और y दोनों ऋणात्मक हैं, बिंदु तृतीय चतुर्थांश (Quadrant III) में है।'
    }
  },

  // 19. graphing-linear-equations (q73-q76)
  {
    id: 'q73',
    conceptId: 'graphing-linear-equations',
    grade: 9,
    difficulty: 1,
    text: {
      en: 'The graph of the equation x = 3 on the Cartesian coordinate plane is a straight line that is:',
      hi: 'कार्तीय तल पर समीकरण x = 3 का आलेख एक सरल रेखा है जो:'
    },
    options: [
      { en: 'Parallel to x-axis', hi: 'x-अक्ष के समांतर है', suspectConceptId: 'coordinate-geometry' },
      { en: 'Parallel to y-axis', hi: 'y-अक्ष के समांतर है' },
      { en: 'Passing through origin', hi: 'मूल बिंदु से गुजरती है', suspectConceptId: 'linear-equations-two-vars' },
      { en: 'Coinciding with x-axis', hi: 'x-अक्ष के संपाती है', suspectConceptId: 'coordinate-geometry' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'concept_gap', '2': 'concept_gap', '3': 'concept_gap' },
    hints: [
      'For all points on x = 3, the x-value is always 3 regardless of y (e.g. (3, 0), (3, 1), (3, -2)).',
      'This forms a vertical line.',
      'A vertical line is parallel to the y-axis.'
    ],
    solution: {
      en: 'x = c is always a vertical line parallel to the y-axis.',
      hi: 'x = c हमेशा y-अक्ष के समांतर एक ऊर्ध्वाधर रेखा होती है।'
    }
  },
  {
    id: 'q74',
    conceptId: 'graphing-linear-equations',
    grade: 9,
    difficulty: 2,
    text: {
      en: 'At what coordinates does the line 2x + 3y = 6 intersect the x-axis (find x-intercept by setting y = 0)?',
      hi: 'रेखा 2x + 3y = 6 x-अक्ष को किस निर्देशांक पर प्रतिच्छेद करती है (y = 0 रखकर x-अंतःखंड ज्ञात करें)?'
    },
    options: [
      { en: '(0, 2)', hi: '(0, 2)', suspectConceptId: 'coordinate-geometry' },
      { en: '(3, 0)', hi: '(3, 0)' },
      { en: '(2, 0)', hi: '(2, 0)', suspectConceptId: 'linear-equations-two-vars' },
      { en: '(6, 0)', hi: '(6, 0)', suspectConceptId: 'basic-equations' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'concept_gap', '2': 'calculation_slip', '3': 'concept_gap' },
    hints: [
      'On the x-axis, y = 0.',
      'Substitute y = 0 into 2x + 3(0) = 6 => 2x = 6.',
      'x = 3. So the coordinate is (3, 0).'
    ],
    solution: {
      en: 'Put y = 0: 2x = 6 => x = 3. The point is (3, 0).',
      hi: 'y = 0 रखने पर: 2x = 6 => x = 3। बिंदु (3, 0) है।'
    }
  },
  {
    id: 'q75',
    conceptId: 'graphing-linear-equations',
    grade: 9,
    difficulty: 2,
    text: {
      en: 'Does the point (1, 2) lie on the line represented by the linear equation y = 2x?',
      hi: 'क्या बिंदु (1, 2) रैखिक समीकरण y = 2x द्वारा निरूपित रेखा पर स्थित है?'
    },
    options: [
      { en: 'No, because 2 ≠ 2(1)', hi: 'नहीं, क्योंकि 2 ≠ 2(1)', suspectConceptId: 'linear-equations-two-vars' },
      { en: 'Yes, because 2 = 2(1)', hi: 'हाँ, क्योंकि 2 = 2(1)' },
      { en: 'No, it lies on x-axis', hi: 'नहीं, यह x-अक्ष पर है', suspectConceptId: 'coordinate-geometry' },
      { en: 'Cannot be determined', hi: 'ज्ञात नहीं किया जा सकता', suspectConceptId: 'coordinate-geometry' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'calculation_slip', '2': 'concept_gap', '3': 'concept_gap' },
    hints: [
      'Substitute x = 1 into RHS: 2 × 1 = 2.',
      'LHS is y = 2.',
      'LHS = RHS, so the point lies on the line.'
    ],
    solution: {
      en: 'When x = 1, y = 2(1) = 2. Since LHS = RHS, (1, 2) lies on the line.',
      hi: 'x = 1 पर y = 2(1) = 2। अतः बिंदु (1, 2) रेखा पर स्थित है।'
    }
  },
  {
    id: 'q76',
    conceptId: 'graphing-linear-equations',
    grade: 9,
    difficulty: 3,
    text: {
      en: 'At which point does the straight line graph of x + y = 5 cross the y-axis?',
      hi: 'x + y = 5 का सरल रेखा आलेख y-अक्ष को किस बिंदु पर काटता है?'
    },
    options: [
      { en: '(5, 0)', hi: '(5, 0)', suspectConceptId: 'coordinate-geometry' },
      { en: '(0, 5)', hi: '(0, 5)' },
      { en: '(0, -5)', hi: '(0, -5)', suspectConceptId: 'integers' },
      { en: '(5, 5)', hi: '(5, 5)', suspectConceptId: 'linear-equations-two-vars' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'concept_gap', '2': 'sign_error', '3': 'calculation_slip' },
    hints: [
      'The line crosses the y-axis where x = 0.',
      'Substitute x = 0: 0 + y = 5 => y = 5.',
      'The point is (0, 5).'
    ],
    solution: {
      en: 'Put x = 0: y = 5. So the y-intercept is (0, 5).',
      hi: 'x = 0 रखने पर: y = 5। अतः प्रतिच्छेद बिंदु (0, 5) है।'
    }
  },

  // 20. polynomials-intro (q77-q80)
  {
    id: 'q77',
    conceptId: 'polynomials-intro',
    grade: 9,
    difficulty: 1,
    text: {
      en: 'What is the degree of the polynomial 4x³ + 2x² - 5x + 7?',
      hi: 'बहुपद 4x³ + 2x² - 5x + 7 की घात (degree) क्या है?'
    },
    options: [
      { en: '1', hi: '1', suspectConceptId: 'algebraic-expressions' },
      { en: '3', hi: '3' },
      { en: '2', hi: '2', suspectConceptId: 'algebraic-expressions' },
      { en: '4', hi: '4', suspectConceptId: 'algebraic-expressions' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'concept_gap', '2': 'concept_gap', '3': 'calculation_slip' },
    hints: [
      'The degree of a polynomial is the highest power of the variable.',
      'Powers present in the terms are 3, 2, 1, and 0.',
      'The highest power is 3.'
    ],
    solution: {
      en: 'The highest exponent of x is 3, so the degree of the polynomial is 3.',
      hi: 'चर x की अधिकतम घात 3 है, अतः बहुपद की घात 3 है।'
    }
  },
  {
    id: 'q78',
    conceptId: 'polynomials-intro',
    grade: 9,
    difficulty: 2,
    text: {
      en: 'Find the zero of the linear polynomial p(x) = 2x - 6 (set p(x) = 0).',
      hi: 'रैखिक बहुपद p(x) = 2x - 6 का शून्यक (zero) ज्ञात कीजिए (p(x) = 0 मानकर)।'
    },
    options: [
      { en: 'x = -3', hi: 'x = -3', suspectConceptId: 'integers' },
      { en: 'x = 3', hi: 'x = 3' },
      { en: 'x = 6', hi: 'x = 6', suspectConceptId: 'basic-equations' },
      { en: 'x = 2', hi: 'x = 2', suspectConceptId: 'basic-equations' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'sign_error', '2': 'calculation_slip', '3': 'concept_gap' },
    hints: [
      'To find the zero, solve 2x - 6 = 0.',
      'Add 6 to both sides: 2x = 6.',
      'Divide by 2: x = 3.'
    ],
    solution: {
      en: '2x - 6 = 0 => 2x = 6 => x = 3.',
      hi: '2x - 6 = 0 => 2x = 6 => x = 3।'
    }
  },
  {
    id: 'q79',
    conceptId: 'polynomials-intro',
    grade: 9,
    difficulty: 2,
    text: {
      en: 'Evaluate the polynomial p(x) = x² - 3x + 2 at x = 2.',
      hi: 'x = 2 पर बहुपद p(x) = x² - 3x + 2 का मान ज्ञात कीजिए।'
    },
    options: [
      { en: '2', hi: '2', suspectConceptId: 'algebraic-expressions' },
      { en: '0', hi: '0' },
      { en: '4', hi: '4', suspectConceptId: 'integers' },
      { en: '-2', hi: '-2', suspectConceptId: 'integers' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'calculation_slip', '2': 'sign_error', '3': 'sign_error' },
    hints: [
      'Substitute x = 2: (2)² - 3(2) + 2.',
      '4 - 6 + 2.',
      '(4 + 2) - 6 = 6 - 6 = 0.'
    ],
    solution: {
      en: 'p(2) = 2² - 3(2) + 2 = 4 - 6 + 2 = 0.',
      hi: 'p(2) = 4 - 6 + 2 = 0।'
    }
  },
  {
    id: 'q80',
    conceptId: 'polynomials-intro',
    grade: 9,
    difficulty: 3,
    text: {
      en: 'If x = 2 is a zero of the linear polynomial p(x) = 3x - k, what is the value of k?',
      hi: 'यदि x = 2 रैखिक बहुपद p(x) = 3x - k का एक शून्यक है, तो k का मान क्या है?'
    },
    options: [
      { en: 'k = -6', hi: 'k = -6', suspectConceptId: 'integers' },
      { en: 'k = 6', hi: 'k = 6' },
      { en: 'k = 5', hi: 'k = 5', suspectConceptId: 'basic-equations' },
      { en: 'k = 1', hi: 'k = 1', suspectConceptId: 'basic-equations' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'sign_error', '2': 'calculation_slip', '3': 'calculation_slip' },
    hints: [
      'Since x = 2 is a zero, p(2) must equal 0.',
      '3(2) - k = 0.',
      '6 - k = 0 => k = 6.'
    ],
    solution: {
      en: 'p(2) = 0 => 3(2) - k = 0 => 6 - k = 0 => k = 6.',
      hi: 'p(2) = 0 => 3(2) - k = 0 => k = 6।'
    }
  },

  // 21. quadratic-equations-intro (Class 10, q81-q84)
  {
    id: 'q81',
    conceptId: 'quadratic-equations-intro',
    grade: 10,
    difficulty: 1,
    text: {
      en: 'Which of the following equations is a quadratic equation (degree 2 in one variable, ax² + bx + c = 0)?',
      hi: 'निम्नलिखित में से कौन सा समीकरण एक द्विघात समीकरण (घात 2, ax² + bx + c = 0) है?'
    },
    options: [
      { en: '2x + 5 = 0', hi: '2x + 5 = 0', suspectConceptId: 'polynomials-intro' },
      { en: 'x² - 5x + 6 = 0', hi: 'x² - 5x + 6 = 0' },
      { en: 'x³ + x² = 8', hi: 'x³ + x² = 8', suspectConceptId: 'exponents' },
      { en: '1/x + x = 2', hi: '1/x + x = 2', suspectConceptId: 'equations-both-sides' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'concept_gap', '2': 'concept_gap', '3': 'concept_gap' },
    hints: [
      'A quadratic equation has degree 2 (highest power of x is 2).',
      '2x + 5 is linear (degree 1). x³ + x² is cubic (degree 3).',
      'x² - 5x + 6 = 0 is a standard quadratic equation.'
    ],
    solution: {
      en: 'x² - 5x + 6 = 0 has highest power 2 and is of standard form ax² + bx + c = 0 (a ≠ 0).',
      hi: 'x² - 5x + 6 = 0 में x की अधिकतम घात 2 है, अतः यह द्विघात समीकरण है।'
    }
  },
  {
    id: 'q82',
    conceptId: 'quadratic-equations-intro',
    grade: 10,
    difficulty: 2,
    text: {
      en: 'Expand (x - 2)(x + 3) = 0 into the standard quadratic form ax² + bx + c = 0.',
      hi: '(x - 2)(x + 3) = 0 को मानक द्विघात रूप ax² + bx + c = 0 में बदलिए।'
    },
    options: [
      { en: 'x² - x - 6 = 0', hi: 'x² - x - 6 = 0', suspectConceptId: 'integers' },
      { en: 'x² + x - 6 = 0', hi: 'x² + x - 6 = 0' },
      { en: 'x² + 5x - 6 = 0', hi: 'x² + 5x - 6 = 0', suspectConceptId: 'polynomials-intro' },
      { en: 'x² - 6 = 0', hi: 'x² - 6 = 0', suspectConceptId: 'exponents' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'sign_error', '2': 'calculation_slip', '3': 'concept_gap' },
    hints: [
      'Use FOIL method: x(x) + x(3) - 2(x) - 2(3).',
      'x² + 3x - 2x - 6.',
      'Combine like terms: 3x - 2x = +1x. The result is x² + x - 6 = 0.'
    ],
    solution: {
      en: '(x - 2)(x + 3) = x² + 3x - 2x - 6 = x² + x - 6 = 0.',
      hi: '(x - 2)(x + 3) = x² + x - 6 = 0।'
    }
  },
  {
    id: 'q83',
    conceptId: 'quadratic-equations-intro',
    grade: 10,
    difficulty: 2,
    text: {
      en: 'Find the real roots of the quadratic equation: x² - 9 = 0.',
      hi: 'द्विघात समीकरण के वास्तविक मूल ज्ञात कीजिए: x² - 9 = 0।'
    },
    options: [
      { en: 'x = 3 only', hi: 'केवल x = 3', suspectConceptId: 'integers' },
      { en: 'x = 3 and x = -3', hi: 'x = 3 और x = -3' },
      { en: 'x = 9 and x = -9', hi: 'x = 9 और x = -9', suspectConceptId: 'exponents' },
      { en: 'x = 0', hi: 'x = 0', suspectConceptId: 'equations-both-sides' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'concept_gap', '2': 'calculation_slip', '3': 'concept_gap' },
    hints: [
      'Factorise using difference of two squares: a² - b² = (a - b)(a + b).',
      'x² - 9 = (x - 3)(x + 3) = 0.',
      'Either x - 3 = 0 => x = 3, or x + 3 = 0 => x = -3.'
    ],
    solution: {
      en: 'x² = 9 => x = ±√9 = ±3. So roots are +3 and -3.',
      hi: 'x² = 9 => x = ±3। अतः मूल 3 और -3 हैं।'
    }
  },
  {
    id: 'q84',
    conceptId: 'quadratic-equations-intro',
    grade: 10,
    difficulty: 3,
    text: {
      en: 'Solve the quadratic equation by factorisation: x² - 5x + 6 = 0.',
      hi: 'गुणनखंडन विधि द्वारा द्विघात समीकरण को हल कीजिए: x² - 5x + 6 = 0।'
    },
    options: [
      { en: 'x = -2 and x = -3', hi: 'x = -2 और x = -3', suspectConceptId: 'integers' },
      { en: 'x = 2 and x = 3', hi: 'x = 2 और x = 3' },
      { en: 'x = 1 and x = 6', hi: 'x = 1 और x = 6', suspectConceptId: 'polynomials-intro' },
      { en: 'x = -1 and x = -6', hi: 'x = -1 और x = -6', suspectConceptId: 'integers' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'sign_error', '2': 'calculation_slip', '3': 'sign_error' },
    hints: [
      'Find two numbers whose product is +6 and sum is -5.',
      'The numbers are -2 and -3 (since (-2) × (-3) = 6 and (-2) + (-3) = -5).',
      '(x - 2)(x - 3) = 0 => x = 2 or x = 3.'
    ],
    solution: {
      en: '(x - 2)(x - 3) = 0 => x = 2, 3.',
      hi: '(x - 2)(x - 3) = 0 => x = 2, 3।'
    }
  },

  // 22. pair-linear-equations (Class 10, q85-q88)
  {
    id: 'q85',
    conceptId: 'pair-linear-equations',
    grade: 10,
    difficulty: 1,
    text: {
      en: 'In the system of linear equations x + y = 10 and x - y = 4, what is the value of x obtained by adding both equations?',
      hi: 'रैखिक समीकरण युग्म x + y = 10 और x - y = 4 में दोनों समीकरणों को जोड़ने पर x का मान क्या प्राप्त होता है?'
    },
    options: [
      { en: 'x = 6', hi: 'x = 6', suspectConceptId: 'linear-equations-two-vars' },
      { en: 'x = 7', hi: 'x = 7' },
      { en: 'x = 8', hi: 'x = 8', suspectConceptId: 'linear-equations-two-vars' },
      { en: 'x = 14', hi: 'x = 14', suspectConceptId: 'basic-equations' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'calculation_slip', '2': 'calculation_slip', '3': 'concept_gap' },
    hints: [
      'Add equation (1) and equation (2): (x + y) + (x - y) = 10 + 4.',
      'The +y and -y cancel: 2x = 14.',
      'Divide by 2: x = 7.'
    ],
    solution: {
      en: '(x + y) + (x - y) = 10 + 4 => 2x = 14 => x = 7.',
      hi: '2x = 14 => x = 7।'
    }
  },
  {
    id: 'q86',
    conceptId: 'pair-linear-equations',
    grade: 10,
    difficulty: 2,
    text: {
      en: 'Using the system x + y = 10 and x - y = 4 with x = 7, find the corresponding value of y.',
      hi: 'समीकरण प्रणाली x + y = 10 और x - y = 4 में x = 7 का उपयोग करके y का संगत मान ज्ञात कीजिए।'
    },
    options: [
      { en: 'y = 4', hi: 'y = 4', suspectConceptId: 'linear-equations-two-vars' },
      { en: 'y = 3', hi: 'y = 3' },
      { en: 'y = 2', hi: 'y = 2', suspectConceptId: 'linear-equations-two-vars' },
      { en: 'y = -3', hi: 'y = -3', suspectConceptId: 'integers' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'calculation_slip', '2': 'calculation_slip', '3': 'sign_error' },
    hints: [
      'Substitute x = 7 into x + y = 10.',
      '7 + y = 10.',
      'y = 10 - 7 = 3.'
    ],
    solution: {
      en: '7 + y = 10 => y = 10 - 7 = 3.',
      hi: '7 + y = 10 => y = 3।'
    }
  },
  {
    id: 'q87',
    conceptId: 'pair-linear-equations',
    grade: 10,
    difficulty: 2,
    text: {
      en: 'Solve the system by substitution: 2x + y = 7 and y = 3. What is x?',
      hi: 'प्रतिस्थापन विधि से हल कीजिए: 2x + y = 7 और y = 3। x का मान क्या है?'
    },
    options: [
      { en: 'x = 1', hi: 'x = 1', suspectConceptId: 'basic-equations' },
      { en: 'x = 2', hi: 'x = 2' },
      { en: 'x = 4', hi: 'x = 4', suspectConceptId: 'linear-equations-two-vars' },
      { en: 'x = 5', hi: 'x = 5', suspectConceptId: 'basic-equations' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'calculation_slip', '2': 'calculation_slip', '3': 'concept_gap' },
    hints: [
      'Substitute y = 3 into the first equation: 2x + 3 = 7.',
      'Subtract 3: 2x = 4.',
      'Divide by 2: x = 2.'
    ],
    solution: {
      en: '2x + 3 = 7 => 2x = 4 => x = 2.',
      hi: '2x + 3 = 7 => 2x = 4 => x = 2।'
    }
  },
  {
    id: 'q88',
    conceptId: 'pair-linear-equations',
    grade: 10,
    difficulty: 3,
    text: {
      en: 'At a school canteen, 2 tables and 3 chairs cost ₹2000. 2 tables and 1 chair cost ₹1400. What is the cost of 1 chair?',
      hi: 'एक स्कूल कैंटीन में, 2 मेज और 3 कुर्सियों की कीमत ₹2000 है। 2 मेज और 1 कुर्सी की कीमत ₹1400 है। 1 कुर्सी की कीमत क्या है?'
    },
    options: [
      { en: '₹200', hi: '₹200', suspectConceptId: 'linear-equations-two-vars' },
      { en: '₹300', hi: '₹300' },
      { en: '₹400', hi: '₹400', suspectConceptId: 'linear-equations-two-vars' },
      { en: '₹600', hi: '₹600', suspectConceptId: 'pair-linear-equations' }
    ],
    correctIndex: 1,
    wrongTags: { '0': 'calculation_slip', '2': 'calculation_slip', '3': 'concept_gap' },
    hints: [
      'Let T = price of 1 table, C = price of 1 chair.',
      'Equation 1: 2T + 3C = 2000. Equation 2: 2T + 1C = 1400.',
      'Subtract equation 2 from equation 1: 2C = 600 => C = 300.'
    ],
    solution: {
      en: '(2T + 3C) - (2T + C) = 2000 - 1400 => 2C = 600 => C = ₹300.',
      hi: '2C = 600 => 1 कुर्सी = ₹300।'
    }
  }
]

// Combine all 88 questions
const allQuestions = [...existingQuestions, ...newQuestions]

// Write to src/data/questions.json
fs.writeFileSync(existingPath, JSON.stringify(allQuestions, null, 2), 'utf-8')
console.log(`Successfully generated ${allQuestions.length} questions in ${existingPath}`)
