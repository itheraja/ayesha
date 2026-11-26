/** Fictional clinic catalogue, not a claim about the hospital's real services.
 * Keep this order stable: dept-N IDs already appear in persisted appointments.
 * Append new specialties; never reorder or remove existing entries.
 */
export const specialties = [
  ['Dermatology', 'dermatologist|skin doctor|skin specialist|jild|جلد'],
  ['Cardiology', 'cardiologist|heart doctor|heart specialist|dil ka doctor|دل کے ڈاکٹر'],
  ['Neurology', 'neurologist|brain specialist|nerve specialist|اعصاب'],
  [
    'Gastroenterology',
    'gastroenterologist|gastro specialist|stomach doctor|stomach specialist|maiday ka doctor|معدہ',
  ],
  [
    'Gynaecology & Obstetrics',
    'gynecologist|gynaecologist|gynecology|gynaecology|obstetrician|pregnancy doctor|women specialist|گائناکالوجسٹ',
  ],
  [
    'Paediatrics',
    'pediatrician|paediatrician|pediatrics|child specialist|children doctor|bachon ka doctor|بچوں کے ڈاکٹر',
  ],
  [
    'Orthopedics',
    'orthopedist|orthopaedist|orthopaedics|orthopedic surgeon|orthopaedic surgeon|bone doctor|bone specialist|haddi ka doctor|ہڈیوں کے ڈاکٹر',
  ],
  [
    'Dentistry',
    'dentist|dental doctor|tooth doctor|teeth specialist|daanton ka doctor|دانتوں کے ڈاکٹر',
  ],
  ['Internal Medicine', 'internist|medical specialist|internal medicine specialist'],
  ['Oncology', 'oncologist|cancer doctor|cancer specialist|کینسر'],
  [
    'ENT (Ear, Nose & Throat)',
    'ent|ent specialist|ent doctor|otolaryngologist|otorhinolaryngologist|ear nose and throat|ear nose throat|ear specialist|nose specialist|throat specialist|kaan naak gala|ناک کان گلا',
  ],
  ['Ophthalmology', 'ophthalmologist|eye doctor|eye specialist|aankhon ka doctor|آنکھوں کے ڈاکٹر'],
  [
    'Pulmonology',
    'pulmonologist|chest specialist|lung specialist|respiratory specialist|chest physician',
  ],
  [
    'Nephrology',
    'nephrologist|kidney doctor|kidney specialist|renal specialist|gurday ka doctor|گردوں کے ڈاکٹر',
  ],
  ['Urology', 'urologist|urinary specialist|bladder specialist'],
  ['Endocrinology', 'endocrinologist|hormone specialist|thyroid specialist'],
  ['Diabetology', 'diabetologist|diabetes doctor|diabetes specialist|sugar specialist|شوگر'],
  ['Rheumatology', 'rheumatologist|arthritis specialist|autoimmune specialist'],
  ['Psychiatry', 'psychiatrist|mental health doctor'],
  ['Clinical Psychology', 'psychologist|clinical psychologist|psychology'],
  ['Family Medicine', 'family physician|family doctor|general practitioner|gp'],
  ['General Surgery', 'general surgeon'],
  ['Neurosurgery', 'neurosurgeon|brain surgeon|spine surgeon'],
  ['Cardiac Surgery', 'cardiac surgeon|heart surgeon|cardiothoracic surgeon'],
  ['Vascular Surgery', 'vascular surgeon|blood vessel surgeon'],
  ['Thoracic Surgery', 'thoracic surgeon|chest surgeon'],
  ['Paediatric Surgery', 'pediatric surgery|pediatric surgeon|paediatric surgeon|children surgeon'],
  ['Plastic & Reconstructive Surgery', 'plastic surgeon|cosmetic surgeon|reconstructive surgeon'],
  ['Colorectal Surgery', 'colorectal surgeon|proctologist|colon surgeon'],
  ['Bariatric Surgery', 'bariatric surgeon|weight loss surgeon|obesity surgeon'],
  ['Breast Surgery', 'breast surgeon|breast specialist'],
  ['Hepatology', 'hepatologist|liver doctor|liver specialist|jigar ka doctor|جگر'],
  [
    'Infectious Diseases',
    'infectious disease specialist|infectious diseases specialist|infection specialist',
  ],
  [
    'Haematology',
    'hematology|hematologist|haematologist|blood specialist|blood disorders specialist',
  ],
  ['Radiation Oncology', 'radiation oncologist|radiotherapy specialist'],
  ['Surgical Oncology', 'surgical oncologist|cancer surgeon'],
  ['Radiology', 'radiologist|imaging specialist'],
  ['Interventional Radiology', 'interventional radiologist'],
  [
    'Physical Medicine & Rehabilitation',
    'physiatrist|rehabilitation specialist|rehab doctor|physical medicine',
  ],
  ['Pain Medicine', 'pain specialist|pain management|pain doctor'],
  ['Anaesthesiology', 'anesthesiology|anesthesiologist|anaesthesiologist|anaesthetist|anesthetist'],
  ['Geriatric Medicine', 'geriatrician|geriatrics|elderly care specialist'],
  ['Neonatology', 'neonatologist|newborn specialist|newborn doctor'],
  [
    'Reproductive Medicine & Fertility',
    'fertility specialist|infertility specialist|ivf specialist|reproductive medicine',
  ],
  ['Allergy & Immunology', 'allergist|immunologist|allergy specialist|allergy doctor'],
  ['Sleep Medicine', 'sleep specialist|sleep doctor'],
  ['Oral & Maxillofacial Surgery', 'oral surgeon|maxillofacial surgeon|jaw surgeon'],
  ['Sports Medicine', 'sports physician|sports doctor|sports injury specialist'],
  [
    'Paediatric Cardiology',
    'pediatric cardiology|pediatric cardiologist|paediatric cardiologist|child heart specialist',
  ],
  [
    'Paediatric Neurology',
    'pediatric neurology|pediatric neurologist|paediatric neurologist|child neurologist',
  ],
  [
    'Paediatric Gastroenterology',
    'pediatric gastroenterology|pediatric gastroenterologist|paediatric gastroenterologist',
  ],
  ['Paediatric Nephrology', 'pediatric nephrology|pediatric nephrologist|paediatric nephrologist'],
  ['Critical Care Medicine', 'intensivist|critical care specialist|icu specialist'],
  ['Emergency Medicine', 'emergency physician|emergency medicine specialist'],
] as const;

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
/** Match complete terms (ENT must not match "dentist" or a patient's name).
 * Prefer precise subspecialties over their shorter parent-specialty aliases.
 */
export function specialtySearchTerm(query: string) {
  const input = normalize(query);
  const terms = specialties
    .flatMap(([name, aliases]) =>
      [name, ...aliases.split('|')].map((alias) => ({ name, term: normalize(alias) })),
    )
    .sort((a, b) => b.term.length - a.term.length);
  const exact = terms.find(({ term }) => term === input);
  if (exact) return exact.name;
  const match = terms.find(({ term }) => ` ${input} `.includes(` ${term} `));
  return match?.name ?? query.trim();
}
