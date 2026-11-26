const root = 'https://www.ziauddinhospital.com';
const verified_at = '2026-10-21';
const fact = (topic: string, text: string, path: string, campus?: string) => ({
  topic,
  text,
  source_url: root + path,
  verified_at,
  campus: campus ?? null,
});
export const knowledge = [
  fact(
    'introduction',
    'Dr. Ziauddin Hospital operates multiple campuses providing medical and surgical care.',
    '/campuses/',
  ),
  fact(
    'contact',
    'The published UAN / WhatsApp contact is 021-111-942-942. Contact the hospital for real bookings, current fees and clinician schedules.',
    '/contact-dr-ziauddin-hospital/',
  ),
  fact('background', 'Clifton campus was established in 1999.', '/campuses/clifton/', 'Clifton'),
  fact(
    'background',
    'North Nazimabad campus was established in 1968.',
    '/campuses/north-nazimabad/',
    'North Nazimabad',
  ),
  fact('background', 'Keamari campus was established in 1996.', '/campuses/keamari/', 'Keamari'),
  fact(
    'address',
    'Clifton: ST-4/B, Shahrah-e-Ghalib, Block-6, Scheme 5, Clifton, Karachi 75600.',
    '/campuses/clifton/',
    'Clifton',
  ),
  fact(
    'hours',
    'Clifton lists general operations and emergency care as 24/7. Individual doctors have separate consultation timings; no universal OPD hours are verified here.',
    '/campuses/clifton/',
    'Clifton',
  ),
  fact(
    'departments',
    'Clifton lists cardiology, dentistry, dermatology, gastroenterology, gynaecology and obstetrics, internal medicine, neurology, oncology, orthopedics and paediatrics.',
    '/campuses/clifton/',
    'Clifton',
  ),
  fact(
    'facilities',
    'Clifton lists liver and kidney transplant services, laboratory, radiology, pharmacy, mosque, cafeteria and parking.',
    '/campuses/clifton/',
    'Clifton',
  ),
  fact(
    'appointments',
    'Clifton offers an appointment enquiry form; a hospital representative calls back to confirm. Submitting an enquiry is not itself a confirmed booking.',
    '/campuses/clifton/',
    'Clifton',
  ),
  fact(
    'address',
    'North Nazimabad: Block-B, North Nazimabad, Karachi 74700.',
    '/campuses/north-nazimabad/',
    'North Nazimabad',
  ),
  fact(
    'hours',
    'North Nazimabad publishes OPD hours Monday–Saturday, 9 AM–10 PM. General operations are listed as 24/7; individual doctor availability still requires confirmation.',
    '/campuses/north-nazimabad/',
    'North Nazimabad',
  ),
  fact(
    'departments',
    'North Nazimabad lists cardiology, dermatology, dentistry, gastroenterology, gynaecology and obstetrics, internal medicine, neurology, oncology, orthopedics and paediatrics.',
    '/campuses/north-nazimabad/',
    'North Nazimabad',
  ),
  fact(
    'facilities',
    'North Nazimabad lists robotic surgery, interventional radiology, nuclear medicine, pain management and emergency services.',
    '/campuses/north-nazimabad/',
    'North Nazimabad',
  ),
  fact(
    'appointments',
    'North Nazimabad asks patients to submit its appointment form; a representative contacts them for confirmation. Fees vary; verify with the UAN.',
    '/campuses/north-nazimabad/',
    'North Nazimabad',
  ),
  fact(
    'address',
    'Keamari: Plot No. 33, behind KPT Hospital, Keamari, Karachi 75620.',
    '/campuses/keamari/',
    'Keamari',
  ),
  fact(
    'hours',
    'Keamari lists general operational hours as 24/7. Its page does not establish universal OPD hours or live doctor availability.',
    '/campuses/keamari/',
    'Keamari',
  ),
  fact(
    'departments',
    'Keamari lists cardiology, dentistry, dermatology, gastroenterology, gynaecology and obstetrics, internal medicine, neurology, oncology, orthopedics and paediatrics.',
    '/campuses/keamari/',
    'Keamari',
  ),
  fact(
    'facilities',
    'Keamari lists laboratory, pharmacy, radiology, emergency care and an in-house vaccination centre.',
    '/campuses/keamari/',
    'Keamari',
  ),
  fact(
    'appointments',
    'Keamari offers an appointment form followed by a representative callback. Some FAQs incorrectly refer to Sukkur; those answers are excluded.',
    '/campuses/keamari/',
    'Keamari',
  ),
  fact(
    'address',
    'Boat Basin Exclusive Clinics: F 6, Block 5, Clifton, Karachi 75600.',
    '/campuses/boat-basin/',
    'Boat Basin',
  ),
  fact(
    'departments',
    'Boat Basin lists executive consult clinic, oncology, laboratory, pharmacy, physiotherapy and Ziauddin Medico. Chemotherapy and a lab collection unit are documented.',
    '/campuses/boat-basin/',
    'Boat Basin',
  ),
  fact(
    'hours',
    'Boat Basin lists general operational hours as 24/7. This does not establish 24/7 doctor or OPD availability.',
    '/campuses/boat-basin/',
    'Boat Basin',
  ),
  fact(
    'doctors',
    'The official find-a-doctor page is the source for real hospital doctors. This application instead uses clearly fictional demo doctors and slots.',
    '/for-patients/find-a-doctor/',
  ),
];
export function get_hospital_information(query = '') {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);
  const ranked = knowledge
    .map((f) => ({
      f,
      score: terms.reduce((n, t) => n + (JSON.stringify(f).toLowerCase().includes(t) ? 1 : 0), 0),
    }))
    .sort((a, b) => b.score - a.score);
  return {
    facts: ranked.slice(0, 8).map((x) => x.f),
    unverified:
      'Real consultation fees, insurance coverage and live clinician availability are not verified. Call 021-111-942-942. General 24/7 hours are not doctor schedules.',
  };
}
