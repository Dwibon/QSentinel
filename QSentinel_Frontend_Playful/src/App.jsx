import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, API_BASE } from './api';

const ATTACKS = [
  { id: 'none', name: 'Clean channel', short: 'HONEST', color: 'blue', quantum: true },
  { id: 'x', name: 'X-Pauli', short: 'X-PAULI', color: 'pink', quantum: true },
  { id: 'y', name: 'Y-Pauli', short: 'Y-PAULI', color: 'yellow', quantum: true },
  { id: 'z', name: 'Z-Pauli', short: 'Z-PAULI', color: 'coral', quantum: true },
  { id: 'intercept_resend', name: 'Intercept-resend', short: 'INTERCEPT', color: 'blue', quantum: true },
  { id: 'z_measure_resend', name: 'Z-measure / resend', short: 'Z-MEASURE', color: 'pink', quantum: true },
  { id: 'forgery', name: 'Forgery / wrong secret', short: 'FORGERY', color: 'coral', quantum: false },
  { id: 'signer_impersonation', name: 'Signer impersonation', short: 'IMPERSONATION', color: 'yellow', quantum: false },
];

const PROTOCOL_IDS = new Set(['forgery', 'signer_impersonation']);

const initialResult = {
  decision: 'READY',
  attack: 'none',
  eX: 0.02,
  eY: 0.02,
  eZ: 0.02,
  pX: null,
  pY: null,
  pZ: null,
};

function Icon({ name, size = 20 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const paths = {
    shield: <><path d="M12 3 20 6v5c0 5-3.2 8.6-8 10-4.8-1.4-8-5-8-10V6l8-3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></>,
    pulse: <><path d="M3 12h4l2-7 4 14 2-7h6"/></>,
    play: <path d="m8 5 11 7-11 7V5Z" fill="currentColor" stroke="none"/>,
    rotate: <><path d="M20 11a8 8 0 0 0-14.8-4L3 10"/><path d="M3 5v5h5"/><path d="M4 13a8 8 0 0 0 14.8 4L21 14"/><path d="M21 19v-5h-5"/></>,
    clock: <><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/></>,
    lock: <><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    activity: <><circle cx="12" cy="12" r="8.5"/><path d="M7 12h3l1.5-4 2.5 8 1.5-4H18"/></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>,
    arrow: <path d="M5 12h13m-5-5 5 5-5 5"/>,
  };
  return <svg {...common}>{paths[name] || paths.activity}</svg>;
}

function formatPct(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function getField(obj, keys, fallback = null) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return fallback;
}

function normalizeResult(data, attack) {
  const source = data?.result || data?.simulation || data || {};
  const fp = source.fingerprint || source.axis_errors || {};
  const p = source.p_values || source.pvalues || {};
  return {
    raw: data,
    decision: String(getField(source, ['decision', 'verdict', 'status'], 'INCONCLUSIVE')).toUpperCase(),
    attack: getField(source, ['attack', 'scenario'], attack),
    eX: Number(getField(source, ['eX', 'ex', 'e_x'], getField(fp, ['X', 'x', 'eX'], 0))),
    eY: Number(getField(source, ['eY', 'ey', 'e_y'], getField(fp, ['Y', 'y', 'eY'], 0))),
    eZ: Number(getField(source, ['eZ', 'ez', 'e_z'], getField(fp, ['Z', 'z', 'eZ'], 0))),
    pX: getField(source, ['pX', 'px', 'p_x'], getField(p, ['X', 'x'], null)),
    pY: getField(source, ['pY', 'py', 'p_y'], getField(p, ['Y', 'y'], null)),
    pZ: getField(source, ['pZ', 'pz', 'p_z'], getField(p, ['Z', 'z'], null)),
  };
}

function normalizeEvents(data) {
  const list = Array.isArray(data) ? data : data?.events || data?.items || [];
  return [...list].reverse().slice(0, 12);
}

function decisionClass(decision) {
  const d = String(decision || '').toUpperCase();
  if (d === 'ACCEPT') return 'accept';
  if (d === 'REJECT' || d === 'THREAT DETECTED') return 'reject';
  if (d === 'INCONCLUSIVE') return 'inconclusive';
  return 'ready';
}

function App() {
  const [attack, setAttack] = useState('none');
  const [strength, setStrength] = useState(1);
  const [noise, setNoise] = useState(0.03);
  const [sentinelFraction, setSentinelFraction] = useState(0.2);
  const [result, setResult] = useState(initialResult);
  const [events, setEvents] = useState([]);
  const [online, setOnline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('System ready. Run a scenario to inspect the sentinel fingerprint.');
  const [activeSection, setActiveSection] = useState('console');

  const selected = useMemo(() => ATTACKS.find((item) => item.id === attack) || ATTACKS[0], [attack]);
  const protocolOnly = PROTOCOL_IDS.has(attack);

  const loadEvents = useCallback(async () => {
    try {
      const data = await api.events();
      setEvents(normalizeEvents(data));
    } catch {
      // Keep the UI usable when the audit endpoint is temporarily unavailable.
    }
  }, []);

  const checkHealth = useCallback(async () => {
    try {
      await api.health();
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
    loadEvents();
    const timer = setInterval(() => { checkHealth(); loadEvents(); }, 5000);
    return () => clearInterval(timer);
  }, [checkHealth, loadEvents]);

  const chooseAttack = (id) => {
    setAttack(id);
    setResult((current) => ({ ...current, decision: 'READY', attack: id }));
    if (PROTOCOL_IDS.has(id)) setStrength(1);
    setMessage(`Scenario selected: ${ATTACKS.find((a) => a.id === id)?.name || id}`);
  };

  const runScenario = async () => {
    setBusy(true);
    setMessage('Running quantum simulation…');
    try {
      let data;
      if (attack === 'forgery') {
        data = await api.simulate({ attack: 'forgery', strength: 1, noise_p: noise, sentinel_fraction: sentinelFraction });
      } else if (attack === 'signer_impersonation') {
        data = await api.simulate({ attack: 'signer_impersonation', strength: 1, noise_p: noise, sentinel_fraction: sentinelFraction });
      } else {
        data = await api.simulate({ attack, strength, noise_p: noise, sentinel_fraction: sentinelFraction });
      }
      const normalized = normalizeResult(data, attack);
      setResult(normalized);
      setMessage(`${selected.name} completed. Detector returned ${normalized.decision}.`);
      await loadEvents();
    } catch (error) {
      setMessage(`Simulation error: ${error.message}`);
      setOnline(false);
    } finally {
      setBusy(false);
    }
  };

  const runProtocol = async (kind) => {
    setBusy(true);
    setMessage(kind === 'replay' ? 'Testing nonce/session freshness…' : 'Testing verifier authorization…');
    try {
      const data = kind === 'replay' ? await api.replay() : await api.unauthorized();
      setResult(normalizeResult(data, kind === 'replay' ? 'replay' : 'unauthorized'));
      await loadEvents();
    } catch (error) {
      setMessage(`Protocol test error: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  const axes = [
    { key: 'X', value: result.eX, p: result.pX, color: 'pink' },
    { key: 'Y', value: result.eY, p: result.pY, color: 'yellow' },
    { key: 'Z', value: result.eZ, p: result.pZ, color: 'blue' },
  ];

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" onClick={() => setActiveSection('console')}>
          <span className="brand-mark"><Icon name="shield" size={25} /></span>
          <span>QSENTINEL</span>
        </a>
        <nav className="nav-links" aria-label="Main navigation">
          <a className={activeSection === 'console' ? 'active' : ''} href="#console" onClick={() => setActiveSection('console')}>CONTROL ROOM</a>
          <a className={activeSection === 'fingerprint' ? 'active' : ''} href="#fingerprint" onClick={() => setActiveSection('fingerprint')}>FINGERPRINT</a>
          <a className={activeSection === 'audit' ? 'active' : ''} href="#audit" onClick={() => setActiveSection('audit')}>AUDIT LOG</a>
        </nav>
        <div className={`status-pill ${online ? 'online' : 'offline'}`}>
          <span className="status-dot" /> {online ? 'BACKEND ONLINE' : 'BACKEND OFFLINE'}
        </div>
      </header>

      <main id="top">
        <section className="hero coral-section" id="console">
          <div className="hero-copy">
            <div className="eyebrow">NON-ML QUANTUM SECURITY</div>
            <h1>SEE THE<br /><span>THREAT.</span></h1>
            <p className="hero-lede">A playful control room for serious quantum-signature experiments.</p>
            <div className="hero-actions">
              <button className="button dark" onClick={runScenario} disabled={busy}>
                <Icon name="play" size={15} /> {busy ? 'RUNNING…' : 'RUN SCENARIO'}
              </button>
              <a className="text-link" href="#fingerprint">Explore fingerprint <Icon name="arrow" size={17} /></a>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="orb orb-one" />
            <div className="orb orb-two" />
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="qubit-card">
              <span className="qubit-label">SENTINEL</span>
              <strong>|ψ⟩</strong>
              <span>SESSION-BOUND</span>
            </div>
            <div className="star star-a">✦</div>
            <div className="star star-b">✦</div>
            <div className="scribble">X&nbsp;&nbsp;Y&nbsp;&nbsp;Z</div>
          </div>
        </section>

        <section className="blue-section intro-strip">
          <div className="section-inner intro-grid">
            <div>
              <div className="section-kicker">01 / CONTROL ROOM</div>
              <h2>Choose a<br />scenario.</h2>
            </div>
            <div className="intro-note">
              <p>Select an attack, tune its strength, then let the detector inspect the hidden Pauli sentinels.</p>
              <div className="mini-equation">e<sub>X</sub>, e<sub>Y</sub>, e<sub>Z</sub> → statistical decision</div>
            </div>
          </div>
        </section>

        <section className="cream-section scenario-section">
          <div className="section-inner">
            <div className="section-heading-row">
              <div>
                <div className="section-kicker dark-text">SCENARIO BOARD</div>
                <h2 className="dark-text">Pick your<br /><span>experiment.</span></h2>
              </div>
              <div className="selection-sticker">
                <span>NOW TESTING</span>
                <strong>{selected.short}</strong>
              </div>
            </div>

            <div className="scenario-grid">
              {ATTACKS.map((item, index) => (
                <button
                  key={item.id}
                  className={`scenario-card ${item.color} ${attack === item.id ? 'selected' : ''}`}
                  onClick={() => chooseAttack(item.id)}
                >
                  <span className="card-number">0{index + 1}</span>
                  <span className="card-icon"><Icon name={item.quantum ? 'pulse' : 'lock'} size={25} /></span>
                  <strong>{item.name}</strong>
                  <small>{item.quantum ? 'QUANTUM CHANNEL' : 'PROTOCOL CHECK'}</small>
                  {attack === item.id && <span className="check-mark">✓</span>}
                </button>
              ))}
            </div>

            <div className="controls-layout">
              <div className="control-card">
                <div className="control-title"><span>01</span><strong>ATTACK STRENGTH</strong></div>
                <div className={`range-wrap ${protocolOnly ? 'disabled' : ''}`}>
                  <input type="range" min="0" max="1" step="0.01" value={strength} onChange={(e) => setStrength(Number(e.target.value))} disabled={protocolOnly} />
                  <div className="range-labels"><span>0%</span><b>{Math.round(strength * 100)}%</b><span>100%</span></div>
                </div>
                <p>{protocolOnly ? 'Protocol scenarios do not use quantum attack strength.' : 'Scale the injected channel manipulation from gentle to full-strength.'}</p>
              </div>
              <div className="control-card yellow-card">
                <div className="control-title"><span>02</span><strong>CHANNEL NOISE</strong></div>
                <label className="number-control">
                  <span>Depolarizing p</span>
                  <input type="number" min="0" max="1" step="0.01" value={noise} onChange={(e) => setNoise(Number(e.target.value))} />
                </label>
                <p>Prototype calibration uses p = 0.03, corresponding to θ₀ = 0.02.</p>
              </div>
              <div className="control-card pink-card">
                <div className="control-title"><span>03</span><strong>SENTINEL SHARE</strong></div>
                <label className="number-control">
                  <span>Sentinel fraction</span>
                  <input type="number" min="0.05" max="0.5" step="0.05" value={sentinelFraction} onChange={(e) => setSentinelFraction(Number(e.target.value))} />
                </label>
                <p>Only a fraction of the sequence is reserved for hidden sentinel measurements.</p>
              </div>
            </div>

            <div className="protocol-row">
              <button className="outline-button" onClick={() => runProtocol('replay')} disabled={busy}><Icon name="rotate" size={18} /> Test replay</button>
              <button className="outline-button" onClick={() => runProtocol('unauthorized')} disabled={busy}><Icon name="lock" size={18} /> Test unauthorized verifier</button>
              <span className="api-note"><span className="tiny-dot" /> {API_BASE}</span>
            </div>
          </div>
        </section>

        <section className="yellow-section fingerprint-section" id="fingerprint">
          <div className="section-inner">
            <div className="section-heading-row fingerprint-heading">
              <div>
                <div className="section-kicker">02 / EVIDENCE</div>
                <h2>Read the<br /><span>fingerprint.</span></h2>
              </div>
              <div className={`verdict-card ${decisionClass(result.decision)}`}>
                <span>DETECTOR VERDICT</span>
                <strong>{result.decision}</strong>
                <small>{message}</small>
              </div>
            </div>

            <div className="evidence-grid">
              <div className="fingerprint-card">
                <div className="card-topline"><strong>AXIS ERROR PROFILE</strong><span>LIVE RESULT</span></div>
                <div className="bars">
                  {axes.map((axis) => (
                    <div className="axis-row" key={axis.key}>
                      <div className={`axis-letter ${axis.color}`}>{axis.key}</div>
                      <div className="axis-track"><div className={`axis-fill ${axis.color}`} style={{ width: `${Math.min(100, Math.max(0, axis.value * 100))}%` }} /></div>
                      <strong className="axis-value">{formatPct(axis.value)}</strong>
                    </div>
                  ))}
                </div>
                <div className="fingerprint-foot">
                  <span>Expected honest baseline ≈ 2%</span>
                  <span>2+ rejected axes → REJECT</span>
                </div>
              </div>

              <div className="pvalue-card">
                <div className="card-topline"><strong>EXACT TEST</strong><span>α = 0.01</span></div>
                <div className="pvalue-list">
                  {axes.map((axis) => (
                    <div className="p-row" key={axis.key}>
                      <span>{axis.key}-AXIS</span>
                      <b>{axis.p === null ? '—' : Number(axis.p).toExponential(2)}</b>
                      <span className={axis.p !== null && Number(axis.p) < 0.01 ? 'flag' : ''}>{axis.p !== null && Number(axis.p) < 0.01 ? 'SIGNAL' : 'CLEAR'}</span>
                    </div>
                  ))}
                </div>
                <div className="cutoff">REJECT CUTOFF<br /><strong>14 / 333 ≈ 4.20%</strong></div>
              </div>
            </div>

            <div className="process-line">
              <span>SECRET SCHEDULE</span><i />
              <span>MEASURE X / Y / Z</span><i />
              <span>CALIBRATE</span><i />
              <span>TEST</span><i />
              <span>DECIDE</span>
            </div>
          </div>
        </section>

        <section className="blue-section audit-section" id="audit">
          <div className="section-inner">
            <div className="audit-heading">
              <div>
                <div className="section-kicker">03 / SECURITY TRAIL</div>
                <h2>Keep<br /><span>receipts.</span></h2>
              </div>
              <div className="audit-summary">
                <div><strong>{events.length}</strong><span>recent events</span></div>
                <div><strong>78</strong><span>tests passed</span></div>
              </div>
            </div>

            <div className="audit-board">
              <div className="audit-head"><span>TIME</span><span>EVENT</span><span>DECISION</span><span>DETAIL</span></div>
              {events.length === 0 ? (
                <div className="empty-log"><Icon name="clock" size={24} /><strong>No events yet.</strong><span>Run a scenario to populate the audit trail.</span></div>
              ) : events.map((event, index) => {
                const decision = String(event.decision || event.verdict || event.status || 'LOGGED').toUpperCase();
                const label = event.event_type || event.type || event.event || event.scenario || 'Security event';
                const time = event.timestamp || event.time || event.created_at || `EVENT ${index + 1}`;
                const detail = event.message || event.reason || event.attack || event.description || 'Recorded by QSentinel';
                return (
                  <div className="audit-row" key={`${time}-${index}`}>
                    <span className="time-cell">{String(time).replace('T', ' ').slice(0, 19)}</span>
                    <strong>{label}</strong>
                    <span className={`log-badge ${decisionClass(decision)}`}>{decision}</span>
                    <span>{detail}</span>
                  </div>
                );
              })}
            </div>

            <div className="footer-callout">
              <div className="starburst">✦</div>
              <div><span>QSENTINEL</span><strong>Security should<br />leave evidence.</strong></div>
              <button className="button dark" onClick={() => { loadEvents(); checkHealth(); }}><Icon name="rotate" size={17} /> Refresh</button>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer coral-section">
        <div className="section-inner footer-inner">
          <div><span className="footer-kicker">QSENTINEL / 2026</span><strong>QUANTUM THREAT<br />DETECTION</strong></div>
          <div className="footer-meta"><span>Non-ML statistical detection</span><span>Teleportation-based QDS</span><span>Prototype dashboard</span></div>
          <div className="footer-question">READY TO<br /><strong>RUN?</strong></div>
        </div>
      </footer>
    </div>
  );
}

export default App;
