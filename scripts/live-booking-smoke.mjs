/** Opt-in paid full transport test using synthetic speech; never a human mic recording. */
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const count = Number(process.argv[2] || 3),
  origin = 'http://localhost:3000';
mkdirSync('tmp/voice-tests', { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const context = await browser.newContext();
const auth = await context.request.post(origin + '/api/admin/login', {
  headers: { origin },
  data: { password: process.env.ADMIN_PASSWORD },
});
if (!auth.ok()) throw Error('Admin test authentication failed');
execFileSync('/usr/bin/say', [
  '-v',
  'Samantha',
  '--file-format=WAVE',
  '--data-format=LEI16@24000',
  '-o',
  'tmp/voice-tests/approval.wav',
  'Yes, please go ahead and book this demo appointment.',
]);
const results = [];
try {
  for (let run = 1; run <= count; run++) {
    const data = await (await context.request.get(origin + '/api/admin/data')).json();
    const slot = data.slots.find(
      (s) =>
        s.status === 'available' &&
        new Date(s.start_time).getTime() > Date.now() + 300000 &&
        !s.booked &&
        s.campus === 'Clifton' &&
        s.doctor_id === 'demo-doctor-1',
    );
    if (!slot) throw Error('No synthetic slot available');
    const when = new Date(slot.start_time).toLocaleString('en-US', {
      timeZone: 'Asia/Karachi',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    console.log(JSON.stringify({ run, stage: 'starting', when }));
    const caller = `Synthetic Voice Test ${run}`;
    const request = `Please speak English. I want to book a demonstration appointment with a dermatologist at the Clifton campus, on ${when} Pakistan time. My made up name is ${caller}. My synthetic phone number is plus nine two, zero zero zero zero, zero zero zero, zero seven seven. Please check this exact slot and ask me for final approval.`;
    execFileSync('/usr/bin/say', [
      '-v',
      'Samantha',
      '--file-format=WAVE',
      '--data-format=LEI16@24000',
      '-o',
      `tmp/voice-tests/request-${run}.wav`,
      request,
    ]);
    const page = await context.newPage();
    page.on('pageerror', (e) => console.log(JSON.stringify({ run, pageError: e.message })));
    page.on('requestfailed', (r) =>
      console.log(
        JSON.stringify({
          run,
          failedRoute: new URL(r.url()).pathname,
          error: r.failure()?.errorText,
        }),
      ),
    );
    let committed;
    let committedAudioEnergy = 0;
    let committedEventIndex = 0;
    page.on('response', async (r) => {
      if (r.url().includes('/api/') && !r.ok())
        console.log(JSON.stringify({ run, route: new URL(r.url()).pathname, http: r.status() }));
      if (
        ['/api/delegate', '/api/confirm', '/api/booking-status'].some((x) => r.url().endsWith(x))
      ) {
        const b = await r.json().catch(() => ({}));
        console.log(
          JSON.stringify({
            run,
            route: new URL(r.url()).pathname,
            http: r.status(),
            status: b.status,
            state: b.booking_state,
          }),
        );
        if (b.status === 'success' && b.appointment) {
          committedEventIndex = await page.evaluate(() => window.testEvents.length);
          committedAudioEnergy = await page.evaluate(async () => {
            const stats = await window.testPeer.getStats();
            let energy = 0;
            stats.forEach((s) => {
              if (s.type === 'inbound-rtp' && s.kind === 'audio') energy += s.totalAudioEnergy || 0;
            });
            return energy;
          });
          committed = b.appointment;
        }
      }
    });
    await page.addInitScript(() => {
      window.testEvents = [];
      const Original = window.RTCPeerConnection;
      window.RTCPeerConnection = class extends Original {
        createDataChannel(...args) {
          window.testPeer = this;
          const c = super.createDataChannel(...args);
          const send = c.send.bind(c);
          c.send = (data) => {
            try {
              window.testEvents.push({ ...JSON.parse(data), direction: 'outgoing' });
            } catch {}
            return send(data);
          };
          c.addEventListener('message', (e) => {
            try {
              const event = JSON.parse(e.data);
              window.testEvents.push(event);
              if (event.type === 'session.output_transcript.delta')
                window.lastOutputAt = Date.now();
            } catch {}
          });
          return c;
        }
      };
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        value: async () => {
          const c = new AudioContext();
          await c.resume();
          const destination = c.createMediaStreamDestination();
          // Live consumes a continuous audio clock, including silence between turns.
          // A disconnected graph can stop advancing once a synthetic utterance ends.
          const silence = c.createConstantSource();
          silence.offset.value = 0;
          silence.connect(destination);
          silence.start();
          window.syntheticSilence = silence;
          window.syntheticContext = c;
          window.syntheticDestination = destination;
          return destination.stream;
        },
      });
      window.speakSynthetic = async (base64) => {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const buffer = await window.syntheticContext.decodeAudioData(bytes.buffer);
        const source = window.syntheticContext.createBufferSource();
        source.buffer = buffer;
        source.connect(window.syntheticDestination);
        source.start();
        return buffer.duration;
      };
    });
    try {
      await page.goto(origin);
      await page.getByRole('button', { name: 'Start call', exact: true }).click();
      await page.getByRole('button', { name: 'Agree & start call' }).click();
      await page.waitForFunction(
        () => window.testEvents.some((e) => e.type === 'session.started'),
        {},
        { timeout: 45000 },
      );
      await page.waitForTimeout(22000);
      await page.evaluate(
        (b) => window.speakSynthetic(b),
        readFileSync(`tmp/voice-tests/request-${run}.wav`).toString('base64'),
      );
      try {
        await page.locator('.confirmation-card').waitFor({ timeout: 55000 });
      } catch {
        execFileSync('/usr/bin/say', [
          '-v',
          'Samantha',
          '--file-format=WAVE',
          '--data-format=LEI16@24000',
          '-o',
          `tmp/voice-tests/clarify-${run}.wav`,
          `Yes, those details are correct. A dermatologist at Clifton on ${when}. My made up name is ${caller}. Use the synthetic number plus nine two zero zero zero zero zero zero zero zero seven seven. Please look up that exact demo slot and prepare the proposal.`,
        ]);
        await page.evaluate(
          (b) => window.speakSynthetic(b),
          readFileSync(`tmp/voice-tests/clarify-${run}.wav`).toString('base64'),
        );
        await page.locator('.confirmation-card').waitFor({ timeout: 55000 });
      }
      await page.waitForTimeout(16000);
      await page.evaluate(
        (b) => window.speakSynthetic(b),
        readFileSync('tmp/voice-tests/approval.wav').toString('base64'),
      );
      const deadline = Date.now() + 60000;
      while (!committed && Date.now() < deadline) await page.waitForTimeout(1000);
      if (!committed) throw Error('No verified booking result within deadline');
      const persisted = await (await context.request.get(origin + '/api/admin/data')).json();
      const matches = persisted.appointments.filter(
        (a) => a.id === committed.id && a.status === 'confirmed',
      );
      if (matches.length !== 1 || matches[0].slot_id !== slot.id)
        throw Error('Persisted result did not match requested slot');
      const spoken = await page
        .waitForFunction(
          (index) =>
            window.testEvents
              .slice(index)
              .filter((e) => e.type === 'session.output_transcript.delta')
              .map((e) => e.delta)
              .join('')
              .match(/booked|confirmed|successfully|(?:it['’]s|you['’]re) (?:all )?set|all set/i),
          committedEventIndex,
          { timeout: 25000 },
        )
        .then(() => true)
        .catch(() => false);
      if (!spoken) throw Error('No post-commit spoken confirmation transcript observed');
      await page.waitForTimeout(20000);
      await page
        .waitForFunction(
          () => Date.now() - (window.lastOutputAt || 0) > 2000,
          {},
          { timeout: 15000 },
        )
        .catch(() => {});
      const audioEnergy = await page.evaluate(async () => {
        const stats = await window.testPeer.getStats();
        let energy = 0;
        stats.forEach((s) => {
          if (s.type === 'inbound-rtp' && s.kind === 'audio') energy += s.totalAudioEnergy || 0;
        });
        return energy;
      });
      if (audioEnergy <= committedAudioEnergy)
        throw Error('No received speech energy after booking commit');
      const spokenText = await page.evaluate(
        (index) =>
          window.testEvents
            .slice(index)
            .filter((e) => e.type === 'session.output_transcript.delta')
            .map((e) => e.delta)
            .join(''),
        committedEventIndex,
      );
      results.push({
        run,
        passed: true,
        reference: committed.reference,
        slot_id: slot.id,
        persisted: matches.length,
        output_confirmation_text: spoken,
        post_commit_audio_energy: audioEnergy - committedAudioEnergy,
        spoken_text: spokenText,
      });
      console.log(JSON.stringify(results.at(-1)));
      writeFileSync(
        `tmp/voice-tests/success-${run}.json`,
        JSON.stringify(await page.evaluate(() => window.testEvents), null, 2),
      );
    } catch (e) {
      const events = await page.evaluate(() => window.testEvents).catch(() => []);
      writeFileSync(`tmp/voice-tests/failure-${run}.json`, JSON.stringify(events, null, 2));
      console.log(JSON.stringify({ run, passed: false, error: e.message }));
      throw e;
    } finally {
      const end = page.getByRole('button', { name: 'End call', exact: true });
      if (await end.isVisible().catch(() => false)) {
        await end.click();
        await page.waitForTimeout(6000);
      }
      await page.close();
    }
  }
} finally {
  writeFileSync('tmp/voice-tests/results.json', JSON.stringify(results, null, 2));
  await browser.close();
}
