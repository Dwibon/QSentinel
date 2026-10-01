import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  createSignature,
  defaults,
  getEvents,
  health,
  replay,
  replaySignature,
  forgery,
  impersonation,
  simulate,
  unauthorized,
  verifySignature,
} from "./api";

const BASE_PATH = "/QSentinel";

const routes = [
  ["/", "Home"],
  ["/verify", "Verify"],
  ["/simulate", "Threat Lab"],
  ["/log", "Security Log"],
  ["/how-it-works", "How it works"],
];

const attacks = [
  ["none", "Honest transmission"],
  ["X", "X-Pauli attack"],
  ["Y", "Y-Pauli attack"],
  ["Z", "Z-Pauli attack"],
  ["intercept_resend", "Intercept-resend"],
  ["z_measure_resend", "Z-measure / resend"],
];

const attackNames = Object.fromEntries(attacks);
const axisOrder = ["X", "Y", "Z"];
const DEMO_RESULTS = {
  none: { X: 0.020, Y: 0.028, Z: 0.021 },
  X: { X: 0.020, Y: 0.981, Z: 0.988 },
  Y: { X: 0.976, Y: 0.021, Z: 0.962 },
  Z: { X: 0.979, Y: 0.968, Z: 0.006 },
  intercept_resend: { X: 0.344, Y: 0.301, Z: 0.366 },
  z_measure_resend: { X: 0.522, Y: 0.500, Z: 0.022 },
};

function path() {
  let current = window.location.pathname;
  if (current.startsWith(BASE_PATH)) current = current.slice(BASE_PATH.length);
  return current.replace(/\/$/, "") || "/";
}

function navigatePath(to) {
  return `${BASE_PATH}${to === "/" ? "/" : to}`;
}

function fmt(value, digits = 3) {
  return value == null || Number.isNaN(Number(value)) ? "—" : Number(value).toFixed(digits);
}

function pFmt(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  if (value === 0) return "0";
  if (value < 0.001) return Number(value).toExponential(2);
  return Number(value).toFixed(3);
}

function decisionText(d) {
  return ({
    VALID: "ACCEPT",
    ACCEPT: "ACCEPT",
    REJECT: "REJECT",
    INCONCLUSIVE: "INCONCLUSIVE",
    REPLAY: "REPLAY DETECTED",
    UNAUTHORIZED: "UNAUTHORIZED",
    PROTOCOL_ANOMALY: "PROTOCOL ANOMALY",
    MESSAGE_MISMATCH: "MESSAGE MISMATCH",
    FORGED_SIGNATURE: "FORGED SIGNATURE",
    SIGNER_ID_MISMATCH: "SIGNER MISMATCH",
  }[d] || d || "WAITING");
}

function decisionTone(d) {
  if (d === "VALID" || d === "ACCEPT") return "good";
  if (d === "REJECT" || d === "FORGED_SIGNATURE" || d === "SIGNER_ID_MISMATCH") return "bad";
  if (d === "REPLAY" || d === "UNAUTHORIZED" || d === "INCONCLUSIVE") return "warn";
  return "neutral";
}

function resultDecision(result) {
  return result?.final_decision || result?.decision || null;
}

function fingerprintOf(result) {
  return result?.fingerprint || { X: 0, Y: 0, Z: 0 };
}

function reasonFor(result) {
  const d = resultDecision(result);
  if (d === "REPLAY") return "The session nonce was already used, so the verifier stopped before quantum evaluation.";
  if (d === "UNAUTHORIZED") return "The verifier identity did not match the registered verifier, so the request was stopped before quantum evaluation.";
  if (d === "MESSAGE_MISMATCH") return "The received message digest did not match the signed message.";
  if (d === "PROTOCOL_ANOMALY") return "The protocol-level Bell-outcome validation failed.";
  if (d === "INCONCLUSIVE") return "The observed evidence did not cross the rejection threshold with enough statistical evidence.";
  if (d === "REJECT") return "At least one sentinel axis crossed the calibrated one-sided rejection test.";
  if (d === "VALID") return "No sentinel axis rejected the calibrated honest-channel hypothesis.";
  return "Run a verification or simulation to see the detector evidence.";
}

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportJSON(data, filename) {
  downloadBlob(JSON.stringify(data, null, 2), filename, "application/json");
}

function exportCSV(rows, filename) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const csv = [headers.join(","), ...rows.map((row) => headers.map((h) => escape(row[h])).join(","))].join("\n");
  downloadBlob(csv, filename, "text/csv;charset=utf-8");
}

function MiniFingerprint({ data, showThreshold = false }) {
  return (
    <div style={{ width: "100%", height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 20, right: 20, left: 0, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="axis" />
          <YAxis
            domain={[0, 1]}
            tickFormatter={(v) => Number(v).toFixed(1)}
            label={{
              value: "Sentinel error rate",
              angle: -90,
              position: "insideLeft",
            }}
          />
          <Tooltip formatter={(v) => Number(v).toFixed(3)} />
          {showThreshold && (
            <ReferenceLine
              y={0.042}
              stroke="#a31515"
              strokeDasharray="6 4"
            />
          )}
          <Bar dataKey="value">
            {data.map((entry) => (
              <Cell key={entry.axis} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function App() {
  const [route, setRoute] = useState(path());
  const [online, setOnline] = useState(false);
  const [events, setEvents] = useState([]);
  const [result, setResult] = useState(null);
  const [signature, setSignature] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [attack, setAttack] = useState("none");
  const [noise, setNoise] = useState(0.03);
  const [sentinelFraction, setSentinelFraction] = useState(0.2);
  const [strength, setStrength] = useState(1);
  const [message, setMessage] = useState(defaults.message);
  const [secretKey, setSecretKey] = useState(String(defaults.key));
  const [verifierId, setVerifierId] = useState("verifier");
  const [lastAction, setLastAction] = useState("No run yet");
  const resultRef = useRef(null);

  const navigate = (to) => {
    const target = navigatePath(to);
    window.history.pushState({}, "", target);
    setRoute(to);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    const onPop = () => setRoute(path());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const refreshEvents = async () => {
    try {
      setEvents((await getEvents(1000)).events || []);
    } catch {
      // Keep the current log visible if the API is temporarily unavailable.
    }
  };

  useEffect(() => {
    const checkHealth = () => health().then(() => setOnline(true)).catch(() => setOnline(false));
    checkHealth();
    refreshEvents();
    const t = setInterval(() => { checkHealth(); refreshEvents(); }, 5000);
    return () => clearInterval(t);
  }, []);

  const showResult = (data, label) => {
    const normalized = data?.result || data;
    setResult(normalized);
    setLastAction(label);
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    return normalized;
  };

  const execute = async (fn, label) => {
    setLoading(true);
    setError("");
    try {
      const data = await fn();
      const normalized = showResult(data, label);
      await refreshEvents();
      return normalized;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const runSimulation = (selected = attack) => execute(
    () => simulate(selected, {
      noise_p: Number(noise),
      sentinel_fraction: Number(sentinelFraction),
      attack_strength: Number(strength),
      message,
    }),
    `${attackNames[selected] || selected} simulation`
  );

  const runReplay = () => execute(async () => {
    if (signature) {
      const data = await replaySignature({ signature, message, key: secretKey, noise_p: noise, attack_strength: strength, verifier_id: verifierId });
      return data.replay_verification || data;
    }
    const data = await replay();
    return data.replay_verification || data;
  }, "Replay test");

  const runForgery = () => execute(() => forgery(), "Forgery test");
  const runImpersonation = () => execute(() => impersonation(), "Signer impersonation test");

  const runUnauthorized = () => execute(() => unauthorized(), "Unauthorized verifier test");

  const makeSignature = async () => {
    setLoading(true);
    setError("");
    setLastAction("Creating signature");
    try {
      const data = await createSignature({ message, key: secretKey, sentinel_fraction: sentinelFraction });
      setSignature(data.signature);
      setResult(null);
      await refreshEvents();
      setTimeout(() => document.getElementById("verification-tools")?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const runVerification = async (verificationAttack = "none") => {
    if (!signature) {
      setError("Create a signature first. The verification controls are disabled until a signature exists.");
      return;
    }
    setLoading(true);
    setError("");
    setLastAction(`${attackNames[verificationAttack] || verificationAttack} verification`);
    try {
      const data = await verifySignature({
        signature,
        message,
        key: secretKey,
        attack: verificationAttack,
        attack_strength: strength,
        noise,
        verifier_id: verifierId,
      });
      showResult(data, `${attackNames[verificationAttack] || verificationAttack} verification`);
      await refreshEvents();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const fingerprint = fingerprintOf(result);
  const chartData = axisOrder.map((axis) => ({ axis, value: Number(fingerprint[axis] || 0) }));

  return (
    <div className="site">
      <div className="noise-overlay" />
      <Header route={route} navigate={navigate} online={online} />
      <div className="page-transition" key={route}>
        {route === "/" && <Home navigate={navigate} online={online} events={events} lastAction={lastAction} />}
        {route === "/verify" && (
          <VerifyPage
            message={message}
            setMessage={setMessage}
            secretKey={secretKey}
            setSecretKey={setSecretKey}
            verifierId={verifierId}
            setVerifierId={setVerifierId}
            signature={signature}
            loading={loading}
            makeSignature={makeSignature}
            runVerification={runVerification}
            runReplay={runReplay}
            runForgery={runForgery}
            runImpersonation={runImpersonation}
            result={result}
            error={error}
            navigate={navigate}
            strength={strength}
            setStrength={setStrength}
            noise={noise}
            setNoise={setNoise}
            sentinelFraction={sentinelFraction}
            setSentinelFraction={setSentinelFraction}
          />
        )}
        {route === "/simulate" && (
          <ThreatLab
            attack={attack}
            setAttack={setAttack}
            noise={noise}
            setNoise={setNoise}
            sentinelFraction={sentinelFraction}
            setSentinelFraction={setSentinelFraction}
            strength={strength}
            setStrength={setStrength}
            loading={loading}
            runSimulation={runSimulation}
            runReplay={runReplay}
            runUnauthorized={runUnauthorized}
            runForgery={runForgery}
            runImpersonation={runImpersonation}
            result={result}
            error={error}
            online={online}
            navigate={navigate}
          />
        )}
        {route === "/log" && <SecurityLog events={events} refreshEvents={refreshEvents} />}
        {route === "/how-it-works" && <HowItWorks navigate={navigate} />}
      </div>
      <footer className="footer">
        <span>QSENTINEL / 01</span>
        <span>NON-ML QUANTUM THREAT DETECTION</span>
        <span>{online ? "SYSTEM ONLINE" : "SYSTEM OFFLINE"}</span>
      </footer>
    </div>
  );
}

function Header({ route, navigate, online }) {
  return (
    <header className="nav">
      <button className="wordmark" onClick={() => navigate("/")} aria-label="QSentinel home">
        <span className="mark">Q</span><span>QSENTINEL</span>
      </button>
      <nav>
        {routes.map(([p, label]) => (
          <button key={p} className={route === p ? "active" : ""} onClick={() => navigate(p)}>{label}</button>
        ))}
      </nav>
      <div className="online"><i className={online ? "on" : ""} />{online ? "ONLINE" : "OFFLINE"}</div>
    </header>
  );
}

function Geom({ variant = "grid" }) {
  return <div className={`geom ${variant}`} aria-hidden="true"><span /><span /><span /><span /><span /><span /></div>;
}

function SectionTitle({ eyebrow, title, dark = false, children }) {
  return <div className={`section-title ${dark ? "dark" : ""}`}><div><small>{eyebrow}</small><h2>{title}</h2></div>{children}</div>;
}

function VerdictBanner({ result, compact = false }) {
  const d = resultDecision(result);
  return (
    <div className={`verdict-banner ${decisionTone(d)} ${compact ? "compact" : ""}`}>
      <div className="verdict-main">{decisionText(d)}</div>
      <div className="verdict-reason">{reasonFor(result)}</div>
    </div>
  );
}

function Home({ navigate, online, events, lastAction }) {
  const sample = DEMO_RESULTS.intercept_resend;
  return (
    <main>
      <section className="hero-home black">
        <Geom variant="hero-geom" />
        <div className="hero-copy">
          <p className="kicker">NON-ML / TELEPORTATION-BASED QDS</p>
          <h1><span>WATCH THE</span><br /><em>QUANTUM.</em></h1>
          <p className="hero-lede">A statistical detector for forgery, replay and channel tampering in teleportation-based quantum digital signatures, with no ML.</p>
          <div className="hero-actions"><button className="lime-btn" onClick={() => navigate("/simulate")}>RUN A THREAT TEST</button><button className="text-btn" onClick={() => navigate("/verify")}>VERIFY A SIGNATURE →</button></div>
        </div>
        <div className="hero-badge"><span>Q</span><b>AXIS<br />SENTINEL</b></div>
      </section>

      <section className="lime intro">
        <SectionTitle eyebrow="01 / THE IDEA" title="A SIGNAL YOU CAN READ." />
        <div className="intro-grid">
          <div className="huge-number">01</div>
          <div>
            <p>Secret X, Y and Z eigenstate sentinels travel through the same teleportation path as the payload. Their error rates form a three-axis fingerprint: <b>eX / eY / eZ.</b></p>
            <p>QSentinel calibrates the honest-channel noise floor and applies a one-sided statistical test. It keeps an explicit <b>INCONCLUSIVE</b> state when the evidence does not support rejection.</p>
          </div>
        </div>
        <div className="idea-chart-card">
          <div><small>STORED SAMPLE / INTERCEPT-RESEND</small><strong>Axis-resolved fingerprint</strong></div>
          <MiniFingerprint data={axisOrder.map((axis) => ({ axis, value: sample[axis] }))} showThreshold />
        </div>
      </section>

      <section className="white sample-section">
        <SectionTitle eyebrow="02 / OBSERVED ATTACK FINGERPRINTS" title="WHAT EACH ATTACK LOOKS LIKE." />
        <div className="attack-table">
          <div className="attack-row attack-head"><span>SCENARIO</span><span>eX</span><span>eY</span><span>eZ</span><span>READ</span></div>
          {attacks.map(([id, name]) => {
            const d = DEMO_RESULTS[id];
            return <div className="attack-row" key={id}><span>{name}</span><span>{fmt(d.X)}</span><span>{fmt(d.Y)}</span><span>{fmt(d.Z)}</span><strong className={id === "none" ? "good" : "bad"}>{id === "none" ? "ACCEPT" : "REJECT"}</strong></div>;
          })}
        </div>
        <p className="caption">Values are representative stored simulation outputs from the project evaluation; exact results vary because the prototype samples quantum measurements stochastically.</p>
      </section>

      <section className="black inconclusive-section">
        <div className="inconclusive-copy"><small>WHY THREE STATES?</small><h2>INCONCLUSIVE IS NOT A FAILURE.</h2><p>It means the measured evidence is not strong enough to reject the calibrated honest-channel hypothesis at the configured significance level. The system deliberately avoids forcing a binary verdict.</p></div>
        <div className="three-state"><div><b>ACCEPT</b><span>Evidence remains compatible with baseline.</span></div><div><b>INCONCLUSIVE</b><span>Evidence is insufficient for rejection.</span></div><div><b>REJECT</b><span>At least one axis crosses the statistical test.</span></div></div>
      </section>

      <section className="white overview">
        <SectionTitle eyebrow="03 / CONTROL ROOM" title="FOUR MOVES. ONE CLEAR READ." />
        <div className="move-grid">
          {[["01", "VERIFY", "Create a session-bound QDS signature, then test it with clean, attack, or replay scenarios.", "/verify"],["02", "SIMULATE", "Inject a quantum-channel attack and inspect its axis fingerprint.", "/simulate"],["03", "READ", "Compare baseline, observed rate, p-value and decision for every axis.", "/simulate"],["04", "LOG", "Review every simulation and protocol event in the audit trail.", "/log"]].map(([n,t,d,p]) => <button className="move-card" key={n} onClick={() => navigate(p)}><span>{n}</span><h3>{t}</h3><p>{d}</p><b>OPEN →</b></button>)}
        </div>
      </section>

      <section className="lime reviewer">
        <SectionTitle eyebrow="04 / REVIEWER QUICK START" title="SEE THE PROTOTYPE IN THREE STEPS." />
        <div className="quick-start"><div><b>01</b><strong>RUN</strong><p>Open Threat Lab and run Honest, X-Pauli, Replay or Unauthorized.</p></div><div><b>02</b><strong>READ</strong><p>Inspect the verdict, fingerprint and exact statistical evidence.</p></div><div><b>03</b><strong>TRACE</strong><p>Open Security Log to see the event recorded automatically.</p></div></div>
        <div className="review-links"><button onClick={() => window.open("https://github.com/Dwibon/QSentinel", "_blank", "noopener,noreferrer")}>GITHUB ↗</button><button onClick={() => navigate("/how-it-works")}>HOW IT WORKS →</button></div>
      </section>

      <section className="scope-note"><b>SCOPE NOTE</b><span>Simulation only. Detection is statistical under stated assumptions, not a formal security proof.</span></section>
      <section className="black status-band"><div><small>LAST ACTION</small><strong>{lastAction}</strong></div><div><small>SYSTEM</small><strong>{online ? "ONLINE" : "OFFLINE"}</strong></div><div><small>EVENTS</small><strong>{String(events.length).padStart(2,"0")}</strong></div></section>
    </main>
  );
}

function PageHero({ number, eyebrow, title, subtitle, dark = false }) {
  return <section className={`page-head ${dark ? "black" : "lime"}`}><Geom variant={dark ? "hero-geom" : "page-geom"}/><div><small>{number} / {eyebrow}</small><h1>{title}</h1><p>{subtitle}</p></div></section>;
}

function VerifyPage(p) {
  return (
    <main>
      <PageHero number="01" eyebrow="SIGNATURE VERIFICATION" dark title={<>CHECK THE<br /><em>QUANTUM.</em></>} subtitle="Create a session-bound research-prototype signature, then verify it through the same detector used by the threat simulator." />
      <section className="white two-col verify-layout">
        <div className="form-block">
          <SectionTitle eyebrow="01 / SIGNATURE" title="Build the payload." />
          <label>MESSAGE<input value={p.message} onChange={(e) => p.setMessage(e.target.value)} /></label>
          <label>SECRET KEY<input type="text" inputMode="numeric" autoComplete="off" value={p.secretKey} onChange={(e) => p.setSecretKey(e.target.value.replace(/\D/g, ""))} /><small className="helper">Demo key is prefilled for review. In a real deployment, use the shared secret out of band.</small></label>
          <Slider label="SENTINEL FRACTION" value={p.sentinelFraction} min=".05" max=".4" step=".05" set={p.setSentinelFraction} helper="Fraction of transmitted positions reserved for secret sentinel measurements." />
          <button className="black-btn" onClick={p.makeSignature} disabled={p.loading}>{p.loading ? "CREATING…" : "CREATE SIGNATURE →"}</button>
          {p.signature && <div className="signature-chip"><b>SESSION CREATED ✓</b><span>{p.signature.session_id}</span></div>}
        </div>

        <div className="form-block dark-card" id="verification-tools">
          <SectionTitle eyebrow="02 / VERIFICATION" title="Put it to the test." dark />
          <label>VERIFIER ID<input value={p.verifierId} onChange={(e) => p.setVerifierId(e.target.value)} /><small className="helper dark-helper">The prototype compares this identifier with the registered verifier ID.</small></label>
          <Slider label="CHANNEL NOISE" value={p.noise} min="0" max=".2" step=".01" set={p.setNoise} helper="Depolarizing noise parameter applied before sentinel measurement." dark />
          <Slider label="ATTACK STRENGTH" value={p.strength} min="0" max="1" step=".01" set={p.setStrength} helper="For quantum attack tests: 0% is no injected attack; 100% is full strength." dark />
          <div className="verify-buttons">
            <button className="lime-btn" onClick={() => p.runVerification("none")} disabled={p.loading || !p.signature} title={!p.signature ? "Create a signature first" : "Verify with no injected quantum attack"}>VERIFY CLEAN</button>
            <button className="outline-btn" onClick={() => p.runVerification("X")} disabled={p.loading || !p.signature} title="Apply an X-Pauli channel attack during verification">TEST X ATTACK</button>
            <button className="outline-btn" onClick={() => p.runVerification("intercept_resend")} disabled={p.loading || !p.signature} title="Apply intercept-resend during verification">TEST INTERCEPT</button>
            <button className="outline-btn" onClick={p.runReplay} disabled={p.loading || !p.signature} title="Use the same signature session twice">TEST REPLAY</button>
            <button className="outline-btn" onClick={p.runForgery} disabled={p.loading} title="Verify a signature created with a wrong key">TEST FORGERY</button>
            <button className="outline-btn" onClick={p.runImpersonation} disabled={p.loading} title="Simulate signer identity mismatch">TEST IMPERSONATION</button>
          </div>
          {!p.signature && <div className="disabled-hint">Create a signature above to enable verification.</div>}
          <div className="tool-link" onClick={() => p.navigate("/simulate")}>Need more scenarios? Open Threat Lab →</div>
          {p.error && <div className="error">{p.error}</div>}
        </div>
      </section>
      <section className="white result-anchor" id="verify-results">
        {!p.result ? <EmptyState text="Create a signature, then click a verify button." /> : <VerificationResults result={p.result} />}
      </section>
    </main>
  );
}

function VerificationResults({ result }) {
  const fp = fingerprintOf(result);
  return <div className="result-section"><VerdictBanner result={result}/><Evidence result={result}/><HowToRead result={result}/></div>;
}

function ThreatLab(p) {
  const r = p.result;
  const d = resultDecision(r);
  const attackIsProtocol = p.attack === "none" || !["X","Y","Z","intercept_resend","z_measure_resend"].includes(p.attack);
  return (
    <main>
      <PageHero number="02" eyebrow="THREAT SIMULATOR" dark title={<>FIND THE<br /><em>FINGERPRINT.</em></>} subtitle="Inject a controlled quantum disturbance or run a protocol scenario, then let the calibrated statistical detector classify the result." />
      <section className="lime lab">
        <div className="lab-controls">
          <SectionTitle eyebrow="01 / SCENARIO" title="Inject the threat." />
          <label>ATTACK TYPE<select value={p.attack} onChange={(e) => p.setAttack(e.target.value)}>{attacks.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <Slider label="ATTACK STRENGTH" value={p.strength} min="0" max="1" step=".01" set={p.setStrength} disabled={p.attack === "none"} helper={p.attack === "none" ? "Disabled for Honest transmission." : "0% means no injected attack; 100% means full attack strength."} />
          <Slider label="CHANNEL NOISE" value={p.noise} min="0" max=".2" step=".01" set={p.setNoise} helper="Depolarizing channel noise parameter." />
          <Slider label="SENTINEL FRACTION" value={p.sentinelFraction} min=".05" max=".4" step=".05" set={p.setSentinelFraction} helper="Fraction of positions reserved for secret sentinel measurements." />
          <button className="black-btn wide" onClick={() => p.runSimulation()} disabled={p.loading || !p.online}>{p.loading ? "RUNNING…" : "RUN SIMULATION →"}</button>
          <div className="quick-label">QUICK RUN</div>
          <div className="quick-grid">
            <QuickButton label="HONEST" onClick={() => { p.setAttack("none"); p.setStrength(0); p.runSimulation("none"); }} disabled={p.loading}/>
            <QuickButton label="X-PAULI" onClick={() => { p.setAttack("X"); p.setStrength(1); p.runSimulation("X"); }} disabled={p.loading}/>
            <QuickButton label="REPLAY" onClick={p.runReplay} disabled={p.loading}/>
            <QuickButton label="UNAUTHORIZED" onClick={p.runUnauthorized} disabled={p.loading}/>
            <QuickButton label="FORGERY" onClick={p.runForgery} disabled={p.loading}/>
            <QuickButton label="IMPERSONATION" onClick={p.runImpersonation} disabled={p.loading}/>
          </div>
          {p.error && <div className="error">{p.error}</div>}
        </div>
        <div className="lab-result">
          <div className={`result-orbit ${decisionTone(d)}`}><span/><span/><span/><b>{r ? decisionText(d) : "READY"}</b></div>
          <p className="result-caption">{r ? reasonFor(r) : "Run a scenario to reveal the channel fingerprint."}</p>
          {r ? <div className="three-readings">{axisOrder.map((a) => <div key={a}><small>e{a}</small><strong>{fmt(fingerprintOf(r)[a])}</strong><i><em style={{width:`${Math.min(100, Number(fingerprintOf(r)[a] || 0)*100)}%`}}/></i></div>)}</div> : <EmptyState text="No run yet. Results will appear here." compact/>}
        </div>
      </section>
      {r && <section className="white result-detail"><Evidence result={r}/><HowToRead result={r}/><div className="result-actions"><button className="black-btn" onClick={() => exportJSON(r, "qsentinel-result.json")}>DOWNLOAD JSON</button><button className="outline-btn dark-outline" onClick={() => exportCSV(axisOrder.map((axis) => ({axis, baseline:r.axis_results?.[axis]?.baseline_rate ?? "", observed:r.axis_results?.[axis]?.observed_rate ?? "", p_value:r.axis_results?.[axis]?.p_value ?? "", reject:r.axis_results?.[axis]?.reject ?? ""})), "qsentinel-result.csv")}>DOWNLOAD CSV</button><span>Logged ✓</span></div></section>}
    </main>
  );
}

function QuickButton({ label, onClick, disabled }) { return <button className="quick-button" onClick={onClick} disabled={disabled}>{label} <span>→</span></button>; }

function Slider({ label, value, min, max, step, set, helper, disabled = false, dark = false }) {
  const pct = ((Number(value) - Number(min)) / (Number(max) - Number(min))) * 100;
  return <label className={`slider ${dark ? "slider-dark" : ""} ${disabled ? "disabled" : ""}`}><span><b>{label}</b><strong>{Math.round(Number(value) * 100)}%</strong></span><input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => set(Number(e.target.value))} style={{"--range-pct": `${pct}%`}}/><small className="helper">{helper}</small></label>;
}

function Evidence({ result }) {
  const r = result;
  const fp = fingerprintOf(r);
  const data = axisOrder.map((axis) => ({axis, value:Number(fp[axis] || 0)}));
  const threshold = r?.axis_results ? Math.max(...axisOrder.map((a) => Number(r.axis_results[a]?.baseline_rate ?? defaults.baseline[a]) + 0.02)) : 0.04;
  return <section className="evidence"><SectionTitle eyebrow="03 / QUANTUM EVIDENCE" title="READ THE FINGERPRINT."><span className={`decision-pill ${decisionTone(resultDecision(r))}`}>{decisionText(resultDecision(r))}</span></SectionTitle><div className="evidence-grid"><div className="chart-card"><ResponsiveContainer width="100%" height={330}><BarChart data={data} margin={{top:28,right:20,left:4,bottom:8}}><CartesianGrid stroke="#dedede" vertical={false}/><XAxis dataKey="axis" tick={{fill:"#000",fontSize:14,fontWeight:800}} axisLine={false} tickLine={false}/><YAxis domain={[0,1]} label={{value:"Sentinel error rate",angle:-90,position:"insideLeft",fill:"#000",fontSize:12}} tick={{fill:"#555",fontSize:12}} axisLine={false} tickLine={false}/><ReferenceLine y={0.02} stroke="#888" strokeDasharray="5 5" label={{value:"baseline",position:"insideTopRight",fill:"#666",fontSize:11}}/><ReferenceLine y={threshold} stroke="#000" strokeDasharray="2 4" label={{value:"decision threshold",position:"insideTopRight",fill:"#000",fontSize:11}}/><Tooltip formatter={(v)=>[Number(v).toFixed(3),"error rate"]} contentStyle={{border:"2px solid #000",borderRadius:0}}/><Bar dataKey="value" radius={0} maxBarSize={90}>{data.map((d)=><Cell key={d.axis} fill={d.value > threshold ? "#111" : "#8eea72"}/>)}</Bar></BarChart></ResponsiveContainer></div><div className="axis-list">{axisOrder.map((a)=><div className="axis-row" key={a}><span>e{a}</span><b>{fmt(fp[a])}</b><i><em style={{width:`${Math.min(100,Number(fp[a]||0)*100)}%`}}/></i></div>)}</div></div><div className="stats-table"><div className="stats-head"><span>AXIS</span><span>BASELINE</span><span>OBSERVED</span><span>P-VALUE</span><span>TEST</span></div>{axisOrder.map((a)=>{const x=r?.axis_results?.[a]; return <div className="stats-row" key={a}><b>{a}</b><span>{x?fmt(x.baseline_rate):"—"}</span><span>{x?fmt(x.observed_rate):"—"}</span><span>{x?pFmt(x.p_value):"—"}</span><span className={x?(x.reject?"bad":"good"):"neutral"}>{x?(x.reject?"REJECT":"ACCEPT"):"—"}</span></div>})}</div></section>;
}

function HowToRead({ result }) {
  return <div className="how-read"><div><b>HOW TO READ THIS</b><span><strong>Baseline</strong> = calibrated honest-channel error floor.</span><span><strong>Observed</strong> = measured sentinel error rate.</span><span><strong>p-value</strong> = one-sided probability under the baseline hypothesis.</span><span><strong>Test</strong> = reject when p-value is below α; current prototype default is α = {defaults.alpha}.</span></div><div className="assumption"><b>ASSUMPTION</b><span>Detection is calibrated to the stated honest-channel baseline and is statistical evidence, not a formal security proof.</span></div></div>;
}

function EmptyState({ text, compact = false }) { return <div className={`empty-state ${compact ? "compact" : ""}`}><span>○</span><strong>{text}</strong></div>; }

function SecurityLog({ events, refreshEvents }) {
  const [eventFilter, setEventFilter] = useState("all");
  const [decisionFilter, setDecisionFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);

  const filtered = useMemo(() => events.filter((e) => {
    const eventOk = eventFilter === "all" || e.event === eventFilter;
    const decisionOk = decisionFilter === "all" || e.final_decision === decisionFilter;
    const hay = JSON.stringify(e).toLowerCase();
    return eventOk && decisionOk && hay.includes(search.toLowerCase());
  }), [events,eventFilter,decisionFilter,search]);

  const honest = events.filter((e) => e.attack === "none" || e.event === "simulation" && !e.attack);
  const honestRejects = honest.filter((e) => e.final_decision === "REJECT").length;
  const quantum = events.filter((e) => ["X","Y","Z","intercept_resend","z_measure_resend"].includes(e.attack));
  const detected = quantum.filter((e) => e.final_decision === "REJECT").length;
  const byAttack = [...new Set(quantum.map((e) => e.attack))].map((a) => ({a, total:quantum.filter((e)=>e.attack===a).length, detected:quantum.filter((e)=>e.attack===a&&e.final_decision==="REJECT").length}));

  const exportRows = events.map((e) => ({timestamp:new Date(e.timestamp*1000).toISOString(),event:e.event,attack:e.attack||"",attack_strength:e.attack_strength??"",noise_p:e.noise_p??"",sentinel_fraction:e.sentinel_fraction??"",decision:e.final_decision||"",eX:e.fingerprint?.X??"",eY:e.fingerprint?.Y??"",eZ:e.fingerprint?.Z??""}));

  return <main>
    <PageHero number="03" eyebrow="SECURITY LOG" dark title={<>KEEP<br /><em>RECEIPTS.</em></>} subtitle="Every verification, replay and simulation is recorded with its fingerprint and decision." />
    <section className="lime log-page">
      <SectionTitle eyebrow="01 / AUDIT TRAIL" title="THE LOGBOOK." />
      <div className="summary-strip"><div><small>TOTAL EVENTS</small><b>{events.length}</b></div><div><small>ACCEPT / VALID</small><b>{events.filter(e=>e.final_decision==="VALID").length}</b></div><div><small>REJECT</small><b>{events.filter(e=>e.final_decision==="REJECT").length}</b></div><div><small>INCONCLUSIVE</small><b>{events.filter(e=>e.final_decision==="INCONCLUSIVE").length}</b></div><div><small>HONEST OBSERVED FALSE-REJECT</small><b>{honest.length ? `${((honestRejects/honest.length)*100).toFixed(2)}%` : "—"}</b></div></div>
      <div className="detection-strip"><div><small>QUANTUM ATTACK DETECTION</small><b>{quantum.length ? `${((detected/quantum.length)*100).toFixed(1)}%` : "—"}</b><span>Observed across logged quantum attack runs.</span></div>{byAttack.map(({a,total,detected:d})=><div key={a}><small>{attackNames[a] || a}</small><b>{total ? `${((d/total)*100).toFixed(0)}%` : "—"}</b><span>{d}/{total} detected</span></div>)}</div>
      <div className="log-tools"><div className="filters"><select value={eventFilter} onChange={(e)=>setEventFilter(e.target.value)}><option value="all">All event types</option>{[...new Set(events.map(e=>e.event))].map(e=><option key={e} value={e}>{e.replaceAll("_"," ")}</option>)}</select><select value={decisionFilter} onChange={(e)=>setDecisionFilter(e.target.value)}><option value="all">All decisions</option>{["VALID","REJECT","INCONCLUSIVE","REPLAY","UNAUTHORIZED"].map(d=><option key={d} value={d}>{decisionText(d)}</option>)}</select><input placeholder="Search log" value={search} onChange={(e)=>setSearch(e.target.value)}/></div><div className="export-buttons"><button className="black-btn" onClick={refreshEvents}>REFRESH →</button><button className="outline-btn" onClick={()=>exportCSV(exportRows,"qsentinel-security-log.csv")}>EXPORT CSV</button><button className="outline-btn" onClick={()=>exportJSON(events,"qsentinel-security-log.json")}>EXPORT JSON</button></div></div>
      <div className="log-table"><div className="log-head"><span>DATE / TIME</span><span>EVENT</span><span>ATTACK</span><span>FINGERPRINT</span><span>DECISION</span></div>{filtered.length===0?<EmptyState text="No matching events."/>:filtered.map((e,i)=><div className={`log-entry ${expanded===i?"expanded":""}`} key={`${e.timestamp}-${i}`}><button className="log-row" onClick={()=>setExpanded(expanded===i?null:i)}><span>{new Date(e.timestamp*1000).toLocaleString([], {year:"numeric",month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"})}</span><span>{(e.event||"event").replaceAll("_"," ")}</span><span>{e.attack ? (attackNames[e.attack] || e.attack.replaceAll("_"," ")) : ""}</span><span className="fp-mini">{e.fingerprint ? <><i style={{width:`${Math.min(100,e.fingerprint.X*100)}%`}}/>X {fmt(e.fingerprint.X)} · Y {fmt(e.fingerprint.Y)} · Z {fmt(e.fingerprint.Z)}</> : reasonFor(e)}</span><strong className={decisionTone(e.final_decision)}>{decisionText(e.final_decision)}</strong></button>{expanded===i&&<div className="log-detail"><span><b>Attack strength</b>{e.attack_strength == null ? "—" : `${Math.round(e.attack_strength*100)}%`}</span><span><b>Noise</b>{e.noise_p == null ? "—" : e.noise_p}</span><span><b>Sentinel fraction</b>{e.sentinel_fraction == null ? "—" : e.sentinel_fraction}</span><span><b>Run ID</b>{e.run_id || e.session_id || "Not exposed by backend"}</span><span><b>p-values</b>{e.axis_results ? axisOrder.map(a=>`${a}: ${pFmt(e.axis_results[a]?.p_value)}`).join(" · ") : "Not logged"}</span><span><b>Reason</b>{reasonFor(e)}</span></div>}</div>)}</div>
    </section>
  </main>;
}

function HowItWorks({ navigate }) {
  return <main>
    <PageHero number="04" eyebrow="METHOD" dark title={<>HOW IT<br /><em>WORKS.</em></>} subtitle="A compact view of the detector pipeline, the statistical decision rule and the protocol checks around it." />
    <section className="white method-page">
      <div className="method-flow">{[["01","SECRET SCHEDULE","A session-bound HMAC schedule chooses hidden X/Y/Z sentinel states."],["02","TELEPORT","Sentinels share the teleportation path with the payload."],["03","MEASURE","Projective measurements produce eX, eY and eZ."],["04","CALIBRATE","An honest-channel noise floor supplies the baseline hypothesis."],["05","TEST","Exact one-sided binomial tests produce per-axis p-values."],["06","DECIDE","Quantum evidence is fused with nonce, verifier and Bell-outcome checks."]].map(([n,t,d])=><div key={n}><b>{n}</b><strong>{t}</strong><p>{d}</p></div>)}</div>
      <div className="equation-card"><small>DECISION MODEL</small><code>H₀: θ = θ₀</code><code>p = P(X ≥ observed errors | H₀)</code><code>reject axis if p &lt; α</code><code>REJECT if ≥ 2 axes reject; otherwise INCONCLUSIVE when evidence is insufficient.</code></div>
      <div className="method-grid"><div><small>QUANTUM EVIDENCE</small><h2>Axis-resolved fingerprints</h2><p>A single QBER value can hide which Pauli directions were disturbed. QSentinel keeps the three measured error rates separate.</p></div><div><small>PROTOCOL EVIDENCE</small><h2>Nonce + verifier checks</h2><p>Replay and unauthorized verification are stopped before quantum evaluation, so the dashboard can distinguish protocol events from channel attacks.</p></div><div><small>LIMITATION</small><h2>Statistical, not a proof</h2><p>Detection depends on the calibrated honest-channel model, finite samples and stated assumptions. Channels with identical measured diagonal Bloch action can be indistinguishable to these sentinel measurements.</p></div></div>
      <button className="black-btn" onClick={()=>navigate("/simulate")}>RUN THE PROTOTYPE →</button>
    </section>
  </main>;
}

export default App;
