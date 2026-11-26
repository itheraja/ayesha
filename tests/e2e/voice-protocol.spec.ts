import { test, expect, type Page } from '@playwright/test';
type Harness = {
  ready?: boolean;
  emit: (e: Record<string, unknown>) => void;
  sent: Record<string, unknown>[];
  track?: MediaStreamTrack;
  fail: () => void;
};
async function mockTransport(page: Page) {
  await page.route('**/api/bootstrap', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ json: { configured: true, maxSeconds: 300, voiceRate: 0.05 } })
      : route.continue(),
  );
  await page.route('**/api/session', (route) =>
    route.fulfill({ json: { sdp: 'mock-answer', maxSeconds: 300 } }),
  );
  await page.addInitScript(() => {
    const harness: Harness = { sent: [], emit: () => {}, fail: () => {} };
    (window as unknown as { testVoice: Harness }).testVoice = harness;
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: async () => {
        const context = new AudioContext();
        const stream = context.createMediaStreamDestination().stream;
        harness.track = stream.getAudioTracks()[0];
        return stream;
      },
    });
    class FakeChannel {
      readyState = 'open';
      onmessage: ((e: { data: string }) => void) | null = null;
      onclose: (() => void) | null = null;
      send(raw: string) {
        const e = JSON.parse(raw);
        harness.sent.push(e);
        if (e.type === 'session.close')
          setTimeout(
            () =>
              harness.emit({
                type: 'session.closed',
                event_id: 'closed-1',
                usage: { seconds: 5 },
                reason: 'close_requested',
              }),
            5,
          );
      }
      close() {
        this.readyState = 'closed';
        this.onclose?.();
      }
    }
    class FakePeer {
      iceGatheringState = 'complete';
      connectionState = 'new';
      localDescription: unknown;
      ontrack = null;
      onconnectionstatechange: (() => void) | null = null;
      constructor() {
        harness.fail = () => {
          this.connectionState = 'failed';
          this.onconnectionstatechange?.();
        };
      }
      addTrack() {}
      createDataChannel() {
        const channel = new FakeChannel();
        harness.emit = (e) => channel.onmessage?.({ data: JSON.stringify(e) });
        return channel;
      }
      async createOffer() {
        return { type: 'offer', sdp: 'v=0 mock-offer' };
      }
      async setLocalDescription(d: unknown) {
        this.localDescription = d;
      }
      async setRemoteDescription() {
        harness.ready = true;
        this.connectionState = 'connected';
        this.onconnectionstatechange?.();
      }
      close() {
        this.connectionState = 'closed';
        this.onconnectionstatechange?.();
      }
      addEventListener() {}
      removeEventListener() {}
    }
    window.RTCPeerConnection = FakePeer as unknown as typeof RTCPeerConnection;
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start call', exact: true }).click();
  await page.getByRole('button', { name: 'Agree & start call' }).click();
  await expect(page.getByRole('status')).toContainText('Connecting');
  await page.waitForFunction(
    () => (window as unknown as { testVoice: Harness }).testVoice.ready === true,
  );
}
async function emit(page: Page, event: Record<string, unknown>) {
  await page.evaluate(
    (e) => (window as unknown as { testVoice: Harness }).testVoice.emit(e),
    event,
  );
}
test('mock protocol waits for readiness, greets once, preserves captions, mutes and closes tracks', async ({
  page,
}) => {
  await mockTransport(page);
  expect(
    await page.evaluate(() => (window as unknown as { testVoice: Harness }).testVoice.sent.length),
  ).toBe(0);
  await emit(page, { type: 'session.started', event_id: 'start-1' });
  await emit(page, { type: 'session.started', event_id: 'start-1' });
  await expect(page.getByRole('status')).toContainText('listening');
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { testVoice: Harness }).testVoice.sent.filter(
          (e) => e.type === 'session.commentary.append',
        ).length,
    ),
  ).toBe(1);
  await page.getByRole('button', { name: 'Mute microphone', exact: true }).click();
  expect(
    await page.evaluate(
      () => (window as unknown as { testVoice: Harness }).testVoice.track?.enabled,
    ),
  ).toBe(false);
  await expect(page.getByRole('status')).toContainText('muted');
  await page.getByRole('button', { name: 'Unmute microphone' }).click();
  await emit(page, {
    type: 'session.input_transcript.delta',
    event_id: 'u1',
    delta: 'Mujhe ',
    start_ms: 0,
    end_ms: 500,
  });
  await emit(page, {
    type: 'session.input_transcript.delta',
    event_id: 'u2',
    delta: 'جمعہ کو appointment chahiye.',
    start_ms: 510,
    end_ms: 1000,
  });
  await page.getByRole('button', { name: 'Show live transcript' }).click();
  await expect(page.getByLabel('Live transcript')).toContainText(
    'Mujhe جمعہ کو appointment chahiye.',
  );
  await page.getByRole('button', { name: 'End call', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start new call' })).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { testVoice: Harness }).testVoice.track?.readyState,
    ),
  ).toBe('ended');
  await expect(page.getByText('Session close confirmed', { exact: false })).toBeVisible();
});
test('mock network and delegation failures never display a successful appointment', async ({
  page,
}) => {
  await mockTransport(page);
  await page.route('**/api/delegate', (route) =>
    route.fulfill({ status: 503, json: { error: 'Offline test: backend unavailable' } }),
  );
  await emit(page, { type: 'session.started', event_id: 'start-1' });
  await emit(page, {
    type: 'session.input_transcript.delta',
    event_id: 'u1',
    delta: 'Book a dermatologist tomorrow.',
    start_ms: 0,
    end_ms: 500,
  });
  await emit(page, {
    type: 'session.delegation.created',
    event_id: 'd1',
    offset_ms: 600,
    delegation: { id: 'test-delegation', target: 'client' },
  });
  await expect(page.locator('.error-notice')).toContainText('backend unavailable');
  await page.evaluate(() => (window as unknown as { testVoice: Harness }).testVoice.fail());
  await expect(page.getByRole('button', { name: 'Start new call' })).toBeVisible({
    timeout: 10000,
  });
  await expect(
    page.getByText('No completed appointment action is confirmed for this call.'),
  ).toBeVisible();
});

test('natural spoken approval works without GUI confirmation or another Live delegation', async ({
  page,
}) => {
  await mockTransport(page);
  const proposal = {
    id: '00000000-0000-4000-8000-000000000001',
    action: 'create_appointment',
    args: {},
    summary: 'Synthetic demo cardiologist at Clifton',
    createdAt: Date.now(),
    revision: 1,
  };
  await page.route('**/api/delegate', (r) =>
    r.fulfill({
      json: {
        status: 'needs_confirmation',
        is_demo_booking: true,
        proposal,
        message: 'Shall I go ahead with this demo booking?',
      },
    }),
  );
  let confirmations = 0;
  await page.route('**/api/confirm', (r) => {
    confirmations++;
    return r.fulfill({
      json: {
        status: 'success',
        booking_state: 'BOOKING_CONFIRMED',
        is_demo_booking: true,
        appointment: { id: 'test-booking', reference: 'AY-ABCDEF123456' },
        message: 'The database confirms demo booking AY-ABCDEF123456.',
      },
    });
  });
  await emit(page, { type: 'session.started', event_id: 'start-new' });
  await emit(page, {
    type: 'session.input_transcript.delta',
    event_id: 'request',
    delta: 'Book a cardiologist',
    start_ms: 0,
    end_ms: 500,
  });
  await emit(page, {
    type: 'session.delegation.created',
    event_id: 'delegation',
    delegation: { id: 'task-one', target: 'client' },
  });
  await expect(page.locator('.confirmation-card')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm this action' })).toHaveCount(0);
  await emit(page, {
    type: 'session.output_transcript.delta',
    event_id: 'ask',
    delta: 'Shall I confirm this demo appointment?',
    start_ms: 800,
    end_ms: 1500,
  });
  await emit(page, {
    type: 'session.input_transcript.delta',
    event_id: 'approve',
    delta: 'Haan ji, confirm kar dein',
    start_ms: 2100,
    end_ms: 2800,
  });
  await expect.poll(() => confirmations).toBe(1);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { testVoice: Harness }).testVoice.sent.some(
          (e) => String(e.content).includes('database confirms') && e.delegation_id === 'task-one',
        ),
      ),
    )
    .toBe(true);
  await page.getByRole('button', { name: 'End call', exact: true }).click();
});

test('lost approval response reconciles before announcing success, without retrying the write', async ({
  page,
}) => {
  await mockTransport(page);
  const proposal = {
    id: '00000000-0000-4000-8000-000000000002',
    action: 'create_appointment',
    args: {},
    summary: 'Synthetic demo slot',
    createdAt: Date.now(),
    revision: 1,
  };
  await page.route('**/api/delegate', (r) =>
    r.fulfill({
      json: {
        status: 'needs_confirmation',
        is_demo_booking: true,
        proposal,
        message: 'May I confirm?',
      },
    }),
  );
  let attempts = 0,
    checks = 0;
  await page.route('**/api/confirm', (r) => {
    attempts++;
    return r.abort('failed');
  });
  await page.route('**/api/booking-status', (r) => {
    checks++;
    return r.fulfill({
      json: {
        status: 'success',
        booking_state: 'BOOKING_CONFIRMED',
        is_demo_booking: true,
        appointment: { id: 'saved-once', reference: 'AY-ABCDEF123457' },
        message: 'Verified original booking AY-ABCDEF123457.',
      },
    });
  });
  await emit(page, { type: 'session.started', event_id: 's' });
  await emit(page, {
    type: 'session.input_transcript.delta',
    event_id: 'q',
    delta: 'Book a demo slot',
    start_ms: 0,
    end_ms: 500,
  });
  await emit(page, {
    type: 'session.delegation.created',
    event_id: 'd',
    delegation: { id: 'lookup', target: 'client' },
  });
  await expect(page.locator('.confirmation-card')).toBeVisible();
  await emit(page, {
    type: 'session.input_transcript.delta',
    event_id: 'a',
    delta: 'Yes book it',
    start_ms: 2000,
    end_ms: 2500,
  });
  await expect.poll(() => checks).toBe(1);
  expect(attempts).toBe(1);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { testVoice: Harness }).testVoice.sent.some(
          (e) => String(e.content).includes('Verified original') && e.delegation_id === 'lookup',
        ),
      ),
    )
    .toBe(true);
  await page.getByRole('button', { name: 'End call', exact: true }).click();
});

test('caller correction during a lookup automatically retries the newest revision', async ({
  page,
}) => {
  await mockTransport(page);
  let requests = 0;
  await page.route('**/api/delegate', async (r) => {
    requests++;
    if (requests === 1) {
      await emit(page, {
        type: 'session.input_transcript.delta',
        event_id: 'correction-fragment',
        delta: 'Actually Friday instead',
        start_ms: 2000,
        end_ms: 2500,
      });
      return r.fulfill({
        json: { status: 'stale', is_demo_booking: true, message: 'Request changed' },
      });
    }
    return r.fulfill({
      json: {
        status: 'needs_information',
        is_demo_booking: true,
        message: 'Latest Friday request checked.',
      },
    });
  });
  await emit(page, { type: 'session.started', event_id: 's-revision' });
  await emit(page, {
    type: 'session.input_transcript.delta',
    event_id: 'first-fragment',
    delta: 'Thursday please',
    start_ms: 0,
    end_ms: 500,
  });
  await emit(page, {
    type: 'session.delegation.created',
    event_id: 'd-revision',
    delegation: { id: 'revision-task', target: 'client' },
  });
  await expect.poll(() => requests, { timeout: 10000 }).toBe(2);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { testVoice: Harness }).testVoice.sent.some((e) =>
          String(e.content).includes('Latest Friday'),
        ),
      ),
    )
    .toBe(true);
  await page.getByRole('button', { name: 'End call', exact: true }).click();
});
