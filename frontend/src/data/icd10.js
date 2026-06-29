export const ICD10_CODES = [

  { code: 'A09', description: 'Infectious gastroenteritis and colitis' },
  { code: 'B34.9', description: 'Viral infection, unspecified' },
  { code: 'U07.1', description: 'COVID-19, virus identified' },

  { code: 'C50.9', description: 'Malignant neoplasm of breast, unspecified' },
  { code: 'D12.6', description: 'Benign neoplasm of colon, unspecified' },

  { code: 'D50.9', description: 'Iron deficiency anaemia, unspecified' },
  { code: 'D64.9', description: 'Anaemia, unspecified' },

  { code: 'E03.9', description: 'Hypothyroidism, unspecified' },
  { code: 'E05.9', description: 'Thyrotoxicosis (hyperthyroidism), unspecified' },
  { code: 'E10.9', description: 'Type 1 diabetes mellitus, without complications' },
  { code: 'E11.9', description: 'Type 2 diabetes mellitus, without complications' },
  { code: 'E66.9', description: 'Obesity, unspecified' },
  { code: 'E78.5', description: 'Hyperlipidaemia, unspecified' },

  { code: 'F32.9', description: 'Depressive episode, unspecified' },
  { code: 'F41.1', description: 'Generalized anxiety disorder' },
  { code: 'F41.9', description: 'Anxiety disorder, unspecified' },
  { code: 'G43.9', description: 'Migraine, unspecified' },
  { code: 'G47.0', description: 'Insomnia' },

  { code: 'H10.9', description: 'Conjunctivitis, unspecified' },
  { code: 'H66.9', description: 'Otitis media, unspecified' },

  { code: 'I10', description: 'Essential (primary) hypertension' },
  { code: 'I20.9', description: 'Angina pectoris, unspecified' },
  { code: 'I21.9', description: 'Acute myocardial infarction, unspecified' },
  { code: 'I25.1', description: 'Atherosclerotic heart disease' },
  { code: 'I48.9', description: 'Atrial fibrillation and flutter, unspecified' },
  { code: 'I50.9', description: 'Heart failure, unspecified' },
  { code: 'I63.9', description: 'Cerebral infarction (stroke), unspecified' },
  { code: 'I83.9', description: 'Varicose veins of lower extremities' },

  { code: 'J02.9', description: 'Acute pharyngitis, unspecified' },
  { code: 'J03.9', description: 'Acute tonsillitis, unspecified' },
  { code: 'J06.9', description: 'Acute upper respiratory infection, unspecified' },
  { code: 'J18.9', description: 'Pneumonia, unspecified organism' },
  { code: 'J20.9', description: 'Acute bronchitis, unspecified' },
  { code: 'J44.9', description: 'Chronic obstructive pulmonary disease (COPD)' },
  { code: 'J45.909', description: 'Asthma, unspecified, uncomplicated' },

  { code: 'K21.9', description: 'Gastro-oesophageal reflux disease (GERD)' },
  { code: 'K29.7', description: 'Gastritis, unspecified' },
  { code: 'K35.80', description: 'Acute appendicitis, unspecified' },
  { code: 'K52.9', description: 'Noninfective gastroenteritis and colitis' },
  { code: 'K57.9', description: 'Diverticular disease of intestine' },
  { code: 'K80.20', description: 'Calculus of gallbladder (gallstones)' },

  { code: 'L20.9', description: 'Atopic dermatitis, unspecified' },
  { code: 'L30.9', description: 'Dermatitis, unspecified' },
  { code: 'L40.9', description: 'Psoriasis, unspecified' },

  { code: 'M10.9', description: 'Gout, unspecified' },
  { code: 'M17.9', description: 'Osteoarthritis of knee, unspecified' },
  { code: 'M54.5', description: 'Low back pain' },
  { code: 'M79.7', description: 'Fibromyalgia' },
  { code: 'M81.0', description: 'Postmenopausal osteoporosis' },

  { code: 'N18.9', description: 'Chronic kidney disease, unspecified' },
  { code: 'N39.0', description: 'Urinary tract infection, site not specified' },

  { code: 'O80', description: 'Single spontaneous delivery' },
  { code: 'O82', description: 'Single delivery by caesarean section' },

  { code: 'R05', description: 'Cough' },
  { code: 'R07.9', description: 'Chest pain, unspecified' },
  { code: 'R10.9', description: 'Abdominal pain, unspecified' },
  { code: 'R42', description: 'Dizziness and giddiness' },
  { code: 'R50.9', description: 'Fever, unspecified' },
  { code: 'R51', description: 'Headache' },

  { code: 'S06.0', description: 'Concussion' },
  { code: 'S52.5', description: 'Fracture of lower end of radius' },
  { code: 'S93.4', description: 'Sprain of ankle' },
  { code: 'T78.4', description: 'Allergy, unspecified' },

  { code: 'Z00.0', description: 'General medical examination' },
  { code: 'Z23', description: 'Encounter for immunization' },
];

const BY_CODE = new Map(ICD10_CODES.map((c) => [c.code, c.description]));

export function icdLabel(code) {
  if (!code) return '';
  const desc = BY_CODE.get(code);
  return desc ? `${code} — ${desc}` : code;
}
