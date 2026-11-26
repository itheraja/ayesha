import { splitLiveContent } from './live-content';
import type { CallState, Fragment, Proposal, TaskResult } from './types';
import { GREETING } from './prompts';
export async function api<T = Record<string, unknown>>(
  path: string,
  data?: unknown,
  timeoutMs = 12000,
): Promise<T> {
  const res = await fetch(path, {
    method: data === undefined ? 'GET' : 'POST',
    signal: AbortSignal.timeout(timeoutMs),
    headers: data === undefined ? {} : { 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const value = await res.json();
  if (!res.ok) throw Error(value.error || `Request failed (${res.status})`);
  return value as T;
}
type Callbacks = {
  state: (s: CallState) => void;
  transcript: (f: Fragment[]) => void;
  levels: (input: number, output: number) => void;
  elapsed: (seconds: number) => void;
  result: (r: TaskResult | null) => void;
  error: (message: string) => void;
  playback: (blocked: boolean) => void;
  connected: (ms: number) => void;
  finalized: (ok: boolean) => void;
};
export class LiveClient {
  private pc?: RTCPeerConnection;
  private dc?: RTCDataChannel;
  private mic?: MediaStream;
  private audio?: HTMLAudioElement;
  private context?: AudioContext;
  private input?: AnalyserNode;
  private output?: AnalyserNode;
  private started = false;
  private ending = false;
  private disposed = false;
  private epoch = 0;
  private startedAt = 0;
  private requestedAt = 0;
  private lastInput = 0;
  private revision = 0;
  private fragments: Fragment[] = [];
  private seen = new Set<string>();
  private jobs = new Set<string>();
  private pendingJob?: string;
  private proposal?: Proposal;
  private proposalDelegationId: string | null = null;
  private approvalRevision = -1;
  private reconciling = false;
  private uncertainProposal?: string;
  private pollTimer?: ReturnType<typeof setTimeout>;
  private busy = false;
  private seconds = 0;
  private usage = 0;
  private maxSeconds = 600;
  private finalized = false;
  private clock?: ReturnType<typeof setInterval>;
  private meter?: ReturnType<typeof setInterval>;
  private jobTimer?: ReturnType<typeof setTimeout>;
  private contextTimer?: ReturnType<typeof setTimeout>;
  private startTimeout?: ReturnType<typeof setTimeout>;
  private recoveryTimer?: ReturnType<typeof setTimeout>;
  private closeResolve?: () => void;
  constructor(private cb: Callbacks) {}
  private send(type: string, content?: string, delegation_id: string | null = null) {
    if (!this.started || this.dc?.readyState !== 'open') return;
    const chunks = content === undefined ? [undefined] : splitLiveContent(content);
    for (const chunk of chunks)
      this.dc.send(
        JSON.stringify({
          type,
          event_id: crypto.randomUUID(),
          ...(chunk !== undefined ? { content: chunk, delegation_id } : {}),
        }),
      );
  }

  async start() {
    this.cb.state('connecting');
    this.requestedAt = performance.now();
    const epoch = ++this.epoch;
    try {
      const config = await api<{ configured: boolean; maxSeconds: number }>('/api/bootstrap');
      if (!config.configured)
        throw Error(
          'Voice setup is needed. Add your OpenAI API key in .env.local, then restart. The booking workspace is available without paid calls.',
        );
      if (this.disposed || epoch !== this.epoch) return;
      this.maxSeconds = config.maxSeconds;
      if (!navigator.mediaDevices?.getUserMedia)
        throw Error('Microphone access requires localhost or HTTPS and a supported browser.');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (this.disposed || epoch !== this.epoch) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.mic = stream;
      this.context = new AudioContext();
      await this.context.resume();
      this.input = this.analyser(stream);
      await api('/api/bootstrap', {});
      if (this.disposed) return;
      const pc = (this.pc = new RTCPeerConnection());
      this.audio = new Audio();
      this.audio.autoplay = true;
      this.audio.setAttribute('playsinline', '');
      pc.ontrack = (e) => {
        if (this.disposed) return;
        const stream = e.streams[0] ?? new MediaStream([e.track]);
        this.audio!.srcObject = stream;
        this.output = this.analyser(stream);
        void this.resumeAudio();
      };
      for (const t of stream.getTracks()) {
        pc.addTrack(t, stream);
        t.onended = () => {
          if (!this.ending)
            void this.fail('Microphone disconnected. Start a new call after reconnecting it.');
        };
      }
      const dc = (this.dc = pc.createDataChannel('oai-events'));
      dc.onmessage = (e) => {
        try {
          this.event(JSON.parse(e.data));
        } catch {
          this.cb.error('A voice event could not be read.');
        }
      };
      dc.onclose = () => {
        if (!this.ending && !this.disposed)
          void this.fail('Voice connection closed unexpectedly. Final usage is unconfirmed.');
      };
      pc.onconnectionstatechange = () => {
        if (this.ending || this.disposed) return;
        if (pc.connectionState === 'failed')
          void this.fail(
            'The audio connection failed. Please start a new call; any committed booking remains saved.',
          );
        if (pc.connectionState === 'disconnected') {
          this.cb.state('recovering');
          this.recoveryTimer = setTimeout(
            () =>
              void this.fail(
                'The connection could not recover. Your confirmed bookings are preserved.',
              ),
            8000,
          );
        }
        if (pc.connectionState === 'connected') {
          clearTimeout(this.recoveryTimer);
          if (this.started) this.cb.state('listening');
        }
      };
      this.startTimeout = setTimeout(
        () =>
          void this.fail(
            'The voice session did not become ready. Check your connection and GPT-Live access.',
          ),
        40000,
      );
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (pc.iceGatheringState !== 'complete')
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            pc.removeEventListener('icegatheringstatechange', listener);
            reject(Error('ICE gathering timed out. Try a different network.'));
          }, 8000);
          const listener = () => {
            if (pc.iceGatheringState === 'complete') {
              clearTimeout(timeout);
              pc.removeEventListener('icegatheringstatechange', listener);
              resolve();
            }
          };
          pc.addEventListener('icegatheringstatechange', listener);
        });
      if (this.disposed) return;
      const answer = await api<{ sdp: string; maxSeconds: number }>(
        '/api/session',
        {
          sdp: pc.localDescription?.sdp,
        },
        35000,
      );
      if (this.disposed) return;
      await pc.setRemoteDescription({ type: 'answer', sdp: answer.sdp });
    } catch (e) {
      if (!this.disposed) await this.fail(e instanceof Error ? e.message : 'Call could not start.');
    }
  }
  private analyser(stream: MediaStream) {
    const a = this.context!.createAnalyser();
    a.fftSize = 256;
    this.context!.createMediaStreamSource(stream).connect(a);
    return a;
  }
  private level(a?: AnalyserNode) {
    if (!a) return 0;
    const values = new Uint8Array(a.fftSize);
    a.getByteTimeDomainData(values);
    return Math.min(
      1,
      Math.sqrt(values.reduce((sum, v) => sum + ((v - 128) / 128) ** 2, 0) / values.length) * 5,
    );
  }
  // Incoming event names and fields are the documented GPT-Live protocol, not Realtime events.
  private event(e: Record<string, unknown>) {
    if (typeof e.event_id === 'string') {
      if (this.seen.has(e.event_id)) return;
      this.seen.add(e.event_id);
    }
    if (e.type === 'session.started' && !this.started) {
      this.started = true;
      this.startedAt = Date.now();
      clearTimeout(this.startTimeout);
      this.cb.connected(performance.now() - this.requestedAt);
      this.cb.state('connected');
      this.send('session.commentary.append', GREETING);
      this.clock = setInterval(() => {
        this.seconds = Math.floor((Date.now() - this.startedAt) / 1000);
        this.cb.elapsed(this.seconds);
        if (this.seconds >= this.maxSeconds) void this.end();
      }, 1000);
      this.meter = setInterval(() => {
        const input = this.level(this.input),
          output = this.level(this.output);
        this.cb.levels(input, output);
        if (!this.ending && this.pc?.connectionState === 'connected')
          this.cb.state(this.busy ? 'processing' : output > 0.035 ? 'speaking' : 'listening');
      }, 100);
    }
    if (
      e.type === 'session.input_transcript.delta' ||
      e.type === 'session.output_transcript.delta'
    ) {
      if (
        typeof e.delta !== 'string' ||
        typeof e.start_ms !== 'number' ||
        typeof e.end_ms !== 'number'
      )
        return;
      const role = e.type === 'session.input_transcript.delta' ? 'user' : 'assistant';
      this.fragments.push({
        id: String(e.event_id ?? crypto.randomUUID()),
        role,
        delta: e.delta,
        start_ms: e.start_ms,
        end_ms: e.end_ms,
      });
      this.fragments = this.fragments.slice(-500);
      this.cb.transcript([...this.fragments]);
      if (role === 'user') {
        this.revision++;
        this.lastInput = Date.now();
        if (!this.proposal) this.cb.result(null);
      }
      clearTimeout(this.contextTimer);
      this.contextTimer = setTimeout(
        () =>
          void this.flush().catch(() =>
            this.cb.error(
              'Conversation sync failed. Appointment changes are paused until sync recovers.',
            ),
          ),
        250,
      );
      if (this.pendingJob || (role === 'user' && (this.proposal || this.uncertainProposal)))
        this.schedule();
    }
    if (e.type === 'session.delegation.created') {
      const d = e.delegation as { id?: string; target?: string };
      if (d?.target === 'client' && d.id) {
        this.pendingJob = d.id;
        this.schedule();
      }
    }
    if (e.type === 'session.usage.updated') {
      const usage = e.usage as { seconds?: number };
      if (typeof usage?.seconds === 'number') this.usage = Math.max(this.usage, usage.seconds);
    }
    if (e.type === 'session.closed') {
      this.finalized = true;
      this.cb.finalized(true);
      const usage = e.usage as { seconds?: number };
      if (typeof usage?.seconds === 'number') this.usage = Math.max(this.usage, usage.seconds);
      this.closeResolve?.();
      if (!this.ending) void this.end();
    }
    if (e.type === 'error') {
      this.cb.error(
        'OpenAI reported a voice-session error. If audio stops, end the call and check the server configuration.',
      );
    }
  }
  private flush() {
    return api('/api/context', { revision: this.revision, fragments: this.fragments });
  }
  private schedule() {
    clearTimeout(this.jobTimer);
    this.jobTimer = setTimeout(
      () =>
        void (this.proposal || this.uncertainProposal ? this.approveByVoice() : this.delegate()),
      Math.max(1200 - (Date.now() - this.lastInput), 50),
    );
  }
  private async delegate() {
    if (this.busy || !this.pendingJob || this.ending || !this.started) return;
    const id = this.pendingJob,
      revision = this.revision,
      key = `${id}:${revision}`;
    if (this.jobs.has(key)) return;
    this.jobs.add(key);
    this.pendingJob = undefined;
    this.busy = true;
    this.cb.state('processing');
    try {
      await this.flush();
      const result = await api<TaskResult>(
        '/api/delegate',
        { delegation_id: key, revision },
        55000,
      );
      this.validateResult(result);
      if (this.disposed) return;
      if (result.status === 'success' || revision === this.revision) {
        if (result.proposal) this.proposalDelegationId = id.startsWith('correction-') ? null : id;
        this.acceptResult(result);
        if (!this.ending)
          this.send(
            'session.commentary.append',
            result.message,
            id.startsWith('correction-') ? null : id,
          );
      } else {
        this.pendingJob = id;
        this.send(
          'session.thinking.append',
          'The caller changed their request while a lookup ran. Discard the earlier proposed result; no new action is confirmed. The latest request will be checked.',
          id.startsWith('correction-') ? null : id,
        );
      }
      if (this.pendingJob === id && revision === this.revision) this.pendingJob = undefined;
    } catch (e) {
      this.cb.error(e instanceof Error ? e.message : 'Backend request failed.');
      await this.reconcile(undefined, id.startsWith('correction-') ? null : id);
      if (this.pendingJob === id) this.pendingJob = undefined;
    } finally {
      this.busy = false;
      if (!this.ending && (this.pendingJob || (this.proposal && this.revision > revision)))
        this.schedule();
    }
  }
  private validateResult(r: TaskResult) {
    if (
      !r ||
      ![
        'success',
        'needs_confirmation',
        'needs_information',
        'error',
        'stale',
        'unknown',
        'cancelled',
      ].includes(r.status) ||
      typeof r.message !== 'string'
    )
      throw Error('Invalid backend response. Booking status must be checked.');
    if (r.status === 'success' && (!r.appointment?.reference || !r.appointment?.id))
      throw Error('Backend success lacked a verified appointment.');
  }
  private acceptResult(r: TaskResult) {
    this.validateResult(r);
    this.proposal = r.proposal;
    if (r.status === 'unknown') this.uncertainProposal = r.operation_id ?? this.uncertainProposal;
    else if (['success', 'error', 'cancelled'].includes(r.status))
      this.uncertainProposal = undefined;
    this.cb.result(r);
  }
  private async approveByVoice() {
    if (this.busy || this.ending || !this.started || this.approvalRevision === this.revision)
      return;
    const revision = this.revision,
      p = this.proposal,
      delegationId =
        this.pendingJob && !this.pendingJob.startsWith('correction-')
          ? this.pendingJob
          : this.proposalDelegationId;
    this.approvalRevision = revision;
    this.busy = true;
    this.cb.state('processing');
    this.pendingJob = undefined;
    try {
      if (this.uncertainProposal) {
        await this.reconcile(this.uncertainProposal, delegationId);
        return;
      }
      if (!p || revision <= p.revision) return;
      await this.flush();
      const r = await api<TaskResult>('/api/confirm', { proposal_id: p.id, revision }, 20000);
      this.validateResult(r);
      if (this.disposed) return;
      if (r.status === 'success' || revision === this.revision) {
        this.acceptResult(r);
        this.send('session.commentary.append', r.message, delegationId);
        if (r.status === 'unknown') await this.reconcile(p.id, delegationId);
        if (r.booking_state === 'COLLECTING_DETAILS') {
          // A correction must run through retrieval and a fresh proposal.
          this.pendingJob = `correction-${crypto.randomUUID()}`;
        }
      }
    } catch {
      if (!this.disposed) await this.reconcile(p?.id, delegationId);
    } finally {
      this.busy = false;
      if (!this.ending && (this.pendingJob || (this.proposal && revision !== this.revision)))
        this.schedule();
    }
  }
  private async reconcile(proposalId?: string, delegationId: string | null = null, attempt = 0) {
    if (this.reconciling || this.disposed || this.ending) return;
    this.reconciling = true;
    try {
      const r = await api<TaskResult>(
        '/api/booking-status',
        { ...(proposalId ? { proposal_id: proposalId } : {}) },
        8000,
      );
      this.validateResult(r);
      if (this.disposed) return;
      this.acceptResult(r);
      if (attempt === 0 || r.status !== 'unknown')
        this.send('session.commentary.append', r.message, delegationId);
      if (r.status === 'unknown' && attempt < 2)
        this.pollTimer = setTimeout(
          () => void this.reconcile(r.operation_id ?? proposalId, delegationId, attempt + 1),
          (attempt + 1) * 2500,
        );
    } catch {
      this.uncertainProposal = proposalId ?? this.uncertainProposal;
      this.cb.error(
        'Booking status is unverified. The original operation will be checked; do not create a duplicate.',
      );
      if (attempt === 0)
        this.send(
          'session.commentary.append',
          'The final booking status cannot be verified right now. Clearly tell the caller it is uncertain, not confirmed or failed. Do not request a desktop click or start a duplicate booking.',
          delegationId,
        );
      if (attempt < 2)
        this.pollTimer = setTimeout(
          () => void this.reconcile(proposalId, delegationId, attempt + 1),
          (attempt + 1) * 2500,
        );
    } finally {
      this.reconciling = false;
    }
  }
  mute(muted: boolean) {
    this.mic?.getAudioTracks().forEach((t) => (t.enabled = !muted));
  }
  speaker(muted: boolean) {
    if (this.audio) this.audio.muted = muted;
  }
  async resumeAudio() {
    try {
      await this.context?.resume();
      await this.audio?.play();
      this.cb.playback(false);
    } catch {
      this.cb.playback(true);
    }
  }
  private async fail(message: string) {
    this.cb.error(message);
    await this.end(true);
  }
  async end(failed = false) {
    if (this.ending || this.disposed) return;
    this.ending = true;
    this.epoch++;
    this.cb.state('ending');
    clearInterval(this.clock);
    clearTimeout(this.jobTimer);
    clearTimeout(this.contextTimer);
    clearTimeout(this.startTimeout);
    clearTimeout(this.recoveryTimer);
    clearTimeout(this.pollTimer);
    this.mic?.getTracks().forEach((t) => t.stop());
    if (this.started && !this.finalized && this.dc?.readyState === 'open')
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 5000);
        this.closeResolve = () => {
          clearTimeout(timeout);
          resolve();
        };
        this.send('session.close');
      });
    this.cb.finalized(this.finalized);
    this.cleanup();
    try {
      const ended = await api<{ last_result: TaskResult | null }>('/api/end', {
        seconds: Math.max(this.usage, this.seconds, this.started ? 15 : 0),
        finalized: this.finalized,
      });
      if (ended.last_result?.status === 'success') this.cb.result(ended.last_result);
    } catch {
      if (this.started)
        this.cb.error(
          'Call audio stopped, but the final usage record could not be saved. Check the dashboard before repeating a booking.',
        );
    }
    this.cb.state(failed ? 'error' : 'ended');
  }
  private cleanup() {
    this.disposed = true;
    clearInterval(this.meter);
    this.pc?.close();
    this.dc?.close();
    this.mic?.getTracks().forEach((t) => t.stop());
    if (this.audio) {
      this.audio.pause();
      this.audio.srcObject = null;
    }
    void this.context?.close();
    this.cb.levels(0, 0);
  }
  dispose() {
    void this.end();
  }
}
