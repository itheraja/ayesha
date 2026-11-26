import type { DB } from './db';
import { knowledge } from '../knowledge';
import { specialties } from '../specialties';
export async function seed(db: DB, reset = false) {
  await db.transaction(async (tx) => {
    if (reset)
      await tx.query(
        'TRUNCATE appointment_audit_events, appointment_operations, appointments, patients, doctor_slots CASCADE',
      );
    const campuses = [
      ['clifton', 'Clifton', 'ST-4/B, Shahrah-e-Ghalib, Block-6, Clifton, Karachi'],
      ['north', 'North Nazimabad', 'Block-B, North Nazimabad, Karachi'],
      ['keamari', 'Keamari', 'Plot 33, behind KPT Hospital, Keamari, Karachi'],
      ['boat', 'Boat Basin', 'F 6, Block 5, Clifton, Karachi'],
    ];
    for (const [id, name, address] of campuses)
      await tx.query(
        'insert into campuses(id,name,address,official_contact) values($1,$2,$3,$4) on conflict(id) do nothing',
        [id, name, address, '021-111-942-942'],
      );
    const departments = specialties.map(([name]) => name);
    for (let i = 0; i < departments.length; i++)
      await tx.query('insert into departments values($1,$2,$3) on conflict(id) do nothing', [
        `dept-${i}`,
        departments[i],
        `Fictional ${departments[i]} clinic for academic demonstration`,
      ]);
    const names = [
      'Maha Noor',
      'Sameer Danish',
      'Hina Faraz',
      'Rameez Ali',
      'Sana Arif',
      'Adeel Hamid',
      'Nadia Kamal',
      'Zain Haroon',
      'Mariam Faisal',
      'Omar Raza',
      'Sara Nadeem',
      'Fahad Aamir',
    ];
    // Preserve every original ID, name, specialty and campus so existing bookings
    // retain their meaning. Add stable IDs to bring each specialty to three doctors.
    const doctors = names.map((name, i) => ({
      id: `demo-doctor-${i + 1}`,
      name,
      department: i % 10,
      campus: i === 9 ? 'boat' : ['clifton', 'north', 'keamari'][i % 3],
    }));
    const given = [
      'Amina',
      'Bilal',
      'Hira',
      'Daniyal',
      'Mehwish',
      'Saad',
      'Alina',
      'Usman',
      'Iqra',
      'Hamza',
      'Zoya',
      'Talha',
    ];
    const family = [
      'Siddiqui',
      'Qureshi',
      'Khan',
      'Ahmed',
      'Malik',
      'Hussain',
      'Sheikh',
      'Mirza',
      'Abbasi',
      'Ansari',
      'Baig',
      'Rashid',
      'Saeed',
    ];
    let added = 0;
    for (let department = 0; department < departments.length; department++) {
      const existing = doctors.filter((d) => d.department === department);
      const campusesNeeded = ['clifton', 'north', 'keamari'].filter(
        (c) => !existing.some((d) => d.campus === c),
      );
      for (let n = existing.length; n < 3; n++) {
        const index = added++;
        doctors.push({
          id: `demo-specialist-${department}-${n + 1}`,
          name: `${given[index % given.length]} ${family[Math.floor(index / given.length)]}`,
          department,
          campus: campusesNeeded.shift()!,
        });
      }
    }
    for (const [i, doctor] of doctors.entries()) {
      await tx.query(
        'insert into doctors(id,name,department_id,campus_id,consultation_fee) values($1,$2,$3,$4,$5) on conflict(id) do nothing',
        [
          doctor.id,
          `Dr. ${doctor.name} (Demo)`,
          `dept-${doctor.department}`,
          doctor.campus,
          2000 + (i % 4) * 500,
        ],
      );
      // Relative seed dates stay useful; existing bookings are never overwritten.
      await tx.query(
        `insert into doctor_slots(doctor_id,start_time,end_time)
 select $1, ((now() at time zone 'Asia/Karachi')::date + day + time '16:00' + n*interval '30 minutes') at time zone 'Asia/Karachi', ((now() at time zone 'Asia/Karachi')::date + day + time '16:30' + n*interval '30 minutes') at time zone 'Asia/Karachi'
 from generate_series(1,14) day cross join generate_series(0,5) n where not exists(select 1 from doctor_slots existing where existing.doctor_id=$1 and existing.start_time<(((now() at time zone 'Asia/Karachi')::date + day + time '16:30' + n*interval '30 minutes') at time zone 'Asia/Karachi') and existing.end_time>(((now() at time zone 'Asia/Karachi')::date + day + time '16:00' + n*interval '30 minutes') at time zone 'Asia/Karachi')) on conflict(doctor_id,start_time) do nothing`,
        [doctor.id],
      );
    }
    for (let i = 0; i < knowledge.length; i++) {
      const f = knowledge[i];
      await tx.query(
        'insert into hospital_knowledge_sources values($1,$2,$3,$4,$5,$6) on conflict(id) do update set topic=excluded.topic,content=excluded.content,source_url=excluded.source_url,verified_at=excluded.verified_at,campus=excluded.campus',
        [`fact-${i}`, f.topic, f.text, f.source_url, f.verified_at, f.campus],
      );
    }
    const existing = await tx.query('select id from patients limit 1');
    if (!existing.rows.length)
      await tx.query(
        "insert into patients(name,contact_number) values('Demo Patient One','+920000000001'),('Demo Patient Two','+920000000002')",
      );
  });
}
