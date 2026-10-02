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

const attackHelp = {
  none: "No attacker. Run this first to see what a clean channel looks like.",
  X: "Flips qubits on the channel (bit-flip). Disturbs the Y and Z axes, leaves X clean.",
  Y: "Disturbs the X and Z axes, leaves Y clean.",
  Z: "Flips phase on the channel. Disturbs the X and Y axes, leaves Z clean.",
  intercept_resend: "An eavesdropper measures every qubit and sends a copy on. Adds errors on all three axes.",
  z_measure_resend: "An eavesdropper measures only in the Z direction and resends. Z looks clean; X and Y are disturbed.",
};

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
  const params = new URLSearchParams(window.location.search);
  const redirectedRoute = params.get("route");

  if (redirectedRoute) {
    return redirectedRoute.replace(/\/$/, "") || "/";
  }

  let current = window.location.pathname;

  if (current.startsWith(BASE_PATH)) {
    current = current.slice(BASE_PATH.length);
  }

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
  return ({
    VALID: "Error rates look like normal channel noise — no sign of tampering.",
    ACCEPT: "Error rates look like normal channel noise — no sign of tampering.",
    REJECT: "Error rates are too high to be normal noise, so tampering is likely. The table below shows which axes failed.",
    INCONCLUSIVE: "Error rates are slightly elevated, but not enough to be sure it isn't just noise. Try running the test again.",
    REPLAY: "This signature session was already used once, so it was blocked immediately as a replay. No quantum check was needed.",
    UNAUTHORIZED: "The verifier ID doesn't match the registered verifier, so the request was blocked before any quantum check.",
    MESSAGE_MISMATCH: "The message that arrived is different from the message that was signed.",
    PROTOCOL_ANOMALY: "The teleportation measurement results failed a built-in consistency check.",
    FORGED_SIGNATURE: "The signature doesn't match the secret key, so it looks forged.",
    SIGNER_ID_MISMATCH: "The signature claims to come from a different signer than the registered one.",
  }[d]) || "Run a verification or simulation to see the verdict and the evidence behind it.";
}

function friendlyError(e) {
  const msg = String(e?.message || "");
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return "Couldn't reach the QSentinel server. It may be starting up. Wait a few seconds and try again.";
  }
  return msg || "Something went wrong. Please try again.";
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

/* ---------- VISUAL FX (additive, no effect on app logic) ---------- */
const TILT_SELECTOR = ".move-card, .method-flow > div, .quick-start > div";

function FX() {
  const ringRef = useRef(null);
  const dotRef = useRef(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fine = window.matchMedia("(pointer: fine)").matches;
    if (reduce || !fine) return undefined;

    const root = document.documentElement;
    const ring = ringRef.current;
    const dot = dotRef.current;
    const HOT = "button, a, select, input, label, summary, [role='button'], .ticker-row span";
    let raf = 0;
    let x = -100, y = -100;   // real pointer
    let rx = -100, ry = -100; // trailing ring

    const tick = () => {
      rx += (x - rx) * 0.2;
      ry += (y - ry) * 0.2;
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
      root.style.setProperty("--mx", (x / window.innerWidth).toFixed(3));
      root.style.setProperty("--my", (y / window.innerHeight).toFixed(3));
      raf = Math.abs(x - rx) + Math.abs(y - ry) > 0.3 ? requestAnimationFrame(tick) : 0;
    };

    const onMove = (e) => {
      x = e.clientX;
      y = e.clientY;
      ring.style.opacity = "1";
      dot.style.opacity = "1";
      dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      if (!raf) raf = requestAnimationFrame(tick);

      const card = e.target.closest ? e.target.closest(TILT_SELECTOR) : null;
      if (card) {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        card.style.setProperty("--rx", `${((0.5 - py) * 8).toFixed(2)}deg`);
        card.style.setProperty("--ry", `${((px - 0.5) * 10).toFixed(2)}deg`);
        card.style.setProperty("--gx", `${(px * 100).toFixed(1)}%`);
        card.style.setProperty("--gy", `${(py * 100).toFixed(1)}%`);
      }
    };

    const onOver = (e) => {
      const hot = e.target.closest ? e.target.closest(HOT) : null;
      ring.classList.toggle("is-hot", !!hot && !hot.disabled);
    };

    const onOut = (e) => {
      const card = e.target.closest ? e.target.closest(TILT_SELECTOR) : null;
      if (card && !card.contains(e.relatedTarget)) {
        card.style.setProperty("--rx", "0deg");
        card.style.setProperty("--ry", "0deg");
      }
    };

    const onDown = () => ring.classList.add("is-down");
    const onUp = () => ring.classList.remove("is-down");
    const onLeaveWindow = () => { ring.style.opacity = "0"; dot.style.opacity = "0"; };

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);
    document.documentElement.addEventListener("mouseleave", onLeaveWindow);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
      document.documentElement.removeEventListener("mouseleave", onLeaveWindow);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <>
      <div className="cursor-ring" ref={ringRef} aria-hidden="true"><i /></div>
      <div className="cursor-dot" ref={dotRef} aria-hidden="true" />
    </>
  );
}

// Text that "decrypts" into place whenever it changes.
function Scramble({ text }) {
  const [out, setOut] = useState(text);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setOut(text);
      return undefined;
    }
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ01#/<>";
    const total = 18;
    let frame = 0;
    const id = setInterval(() => {
      frame += 1;
      const reveal = Math.floor((frame / total) * text.length);
      setOut(
        text
          .split("")
          .map((c, i) => (c === " " || i < reveal ? c : chars[Math.floor(Math.random() * chars.length)]))
          .join("")
      );
      if (frame >= total) {
        clearInterval(id);
        setOut(text);
      }
    }, 35);
    return () => clearInterval(id);
  }, [text]);

  return <>{out}</>;
}

function Ticker({ navigate }) {
  const top = [
    ["SIGN A MESSAGE", "/verify"],
    ["ATTACK IT ON PURPOSE", "/simulate"],
    ["READ THE FINGERPRINT", "/simulate"],
    ["GET A CLEAR VERDICT", "/verify"],
    ["EXPORT JSON & CSV", "/log"],
  ];
  const bottom = [
    ["NO MACHINE LEARNING", "/how-it-works"],
    ["6 ATTACK TYPES", "/simulate"],
    ["REPLAY & FORGERY CHECKS", "/verify"],
    ["EVERY TEST LOGGED", "/log"],
    ["UNSURE? WE SAY INCONCLUSIVE", "/how-it-works"],
  ];
  const row = (items, cls) => (
    <div className={`ticker-row ${cls}`}>
      {[...items, ...items].map(([w, to], i) => (
        <span key={`${w}-${i}`} onClick={() => navigate(to)} title="Open">{w}</span>
      ))}
    </div>
  );
  return <div className="ticker">{row(top, "")}{row(bottom, "rev")}</div>;
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
  const [lastAction, setLastAction] = useState("Nothing run yet");
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
    setTimeout(
      () => (document.getElementById("verify-results") || document.querySelector(".lab-result"))?.scrollIntoView({ behavior: "smooth", block: "start" }),
      120
    );
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
      setError(friendlyError(e));
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
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  const runVerification = async (verificationAttack = "none") => {
    if (!signature) {
      setError("Create a signature first (Step 1), then run a test.");
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
        noise_p: noise,
        verifier_id: verifierId,
      });
      showResult(data, `${attackNames[verificationAttack] || verificationAttack} verification`);
      await refreshEvents();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  const fingerprint = fingerprintOf(result);
  const chartData = axisOrder.map((axis) => ({ axis, value: Number(fingerprint[axis] || 0) }));

  return (
    <div className="site">
      <div className="noise-overlay" />
      <FX />
      <div className={`load-bar ${loading ? "on" : ""}`} aria-hidden="true" />
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
      <div className="verdict-main"><Scramble text={decisionText(d)} /></div>
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
          <p className="hero-lede">QSentinel checks whether a quantum digital signature has been forged, replayed or tampered with, using statistics, not machine learning. Run an attack and watch what it leaves behind.</p>
          <div className="hero-actions"><button className="lime-btn" onClick={() => navigate("/simulate")}>RUN A THREAT TEST</button><button className="text-btn" onClick={() => navigate("/verify")}>VERIFY A SIGNATURE →</button></div>
        </div>
        <div className="hero-badge"><span>Q</span><b>AXIS<br />SENTINEL</b></div>
      </section>

      <Ticker navigate={navigate} />

      <section className="lime intro">
        <SectionTitle eyebrow="01 / THE IDEA" title="A SIGNAL YOU CAN READ." />
        <div className="intro-grid">
          <div className="huge-number">01</div>
          <div>
            <p>QSentinel hides a few secret "tripwire" quantum states (called <b>sentinels</b>) inside the real transmission. Tampering disturbs them. Counting how often each tripwire type (X, Y, Z) gets disturbed gives a three-number <b>fingerprint: eX / eY / eZ</b>, and every attack leaves a different one.</p>
            <p>A clean channel always has a little noise, so QSentinel first learns what "normal" looks like, then raises an alarm only when errors are too high to be noise. When the evidence is borderline, it says <b>INCONCLUSIVE</b> rather than guessing.</p>
          </div>
        </div>
        <div className="idea-chart-card">
          <div>
            <small>EXAMPLE / INTERCEPT-RESEND ATTACK</small>
            <strong>Error rate on each axis</strong>
            <p className="caption">Red dashed line = alert threshold. Bars above it mean tampering.</p>
          </div>
          <MiniFingerprint data={axisOrder.map((axis) => ({ axis, value: sample[axis] }))} showThreshold />
        </div>
      </section>

      <section className="white sample-section">
        <SectionTitle eyebrow="02 / OBSERVED ATTACK FINGERPRINTS" title="WHAT EACH ATTACK LOOKS LIKE." />
        <div className="attack-table">
          <div className="attack-row attack-head"><span>SCENARIO</span><span>eX</span><span>eY</span><span>eZ</span><span>VERDICT</span></div>
          {attacks.map(([id, name]) => {
            const d = DEMO_RESULTS[id];
            return <div className="attack-row" key={id}><span>{name}</span><span>{fmt(d.X)}</span><span>{fmt(d.Y)}</span><span>{fmt(d.Z)}</span><strong className={id === "none" ? "good" : "bad"}>{id === "none" ? "ACCEPT" : "REJECT"}</strong></div>;
          })}
        </div>
        <p className="caption">eX, eY and eZ are the error rates measured on each axis (lower is cleaner). These are example results from our test runs. Exact numbers change every run because quantum measurements are random.</p>
      </section>

      <section className="black inconclusive-section">
        <div className="inconclusive-copy"><small>WHY THREE STATES?</small><h2>INCONCLUSIVE IS NOT A FAILURE.</h2><p><b>INCONCLUSIVE</b> means errors are a bit higher than normal, but not high enough to be sure something is wrong. Instead of forcing a yes/no answer, QSentinel tells you honestly that it can't be certain.</p></div>
        <div className="three-state"><div><b>ACCEPT</b><span>Errors look like normal channel noise. No sign of tampering.</span></div><div><b>INCONCLUSIVE</b><span>Errors are slightly elevated, but not enough to be sure.</span></div><div><b>REJECT</b><span>Errors are too high to be noise. Tampering detected.</span></div></div>
      </section>

      <section className="white overview">
        <SectionTitle eyebrow="03 / CONTROL ROOM" title="FOUR MOVES. ONE CLEAR READ." />
        <div className="move-grid">
          {[["01", "VERIFY", "Create a signature for a message, then check it, either cleanly or under attack.", "/verify"],["02", "THREAT LAB", "Launch a simulated attack on the quantum channel and see the fingerprint it leaves.", "/simulate"],["03", "READ", "See the verdict and the numbers behind it, axis by axis.", "/simulate"],["04", "LOG", "Browse a record of every test you've run.", "/log"]].map(([n,t,d,p]) => <button className="move-card" key={n} onClick={() => navigate(p)}><span>{n}</span><h3>{t}</h3><p>{d}</p><b>OPEN →</b></button>)}
        </div>
        <div className="review-links"><button onClick={() => window.open("https://github.com/Dwibon/QSentinel", "_blank", "noopener,noreferrer")}>GITHUB ↗</button><button onClick={() => navigate("/how-it-works")}>HOW IT WORKS →</button></div>
      </section>

      <section className="scope-note"><b>NOTE</b><span>This is a simulation, not a real quantum network. Results are statistical evidence, not a formal security proof.</span></section>
      <section className="black status-band"><div><small>LAST ACTION</small><strong>{lastAction}</strong></div><div><small>SYSTEM</small><strong>{online ? "ONLINE" : "OFFLINE"}</strong></div><div><small>EVENTS LOGGED</small><strong>{String(events.length).padStart(2,"0")}</strong></div></section>
    </main>
  );
}

function PageHero({ number, eyebrow, title, subtitle, dark = false }) {
  return <section className={`page-head ${dark ? "black" : "lime"}`}><Geom variant={dark ? "hero-geom" : "page-geom"}/><div><small>{number} / {eyebrow}</small><h1>{title}</h1><p>{subtitle}</p></div></section>;
}

function VerifyPage(p) {
  return (
    <main>
      <PageHero number="01" eyebrow="SIGNATURE VERIFICATION" dark title={<>CHECK THE<br /><em>QUANTUM.</em></>} subtitle="Sign a message, then verify it. You can verify it cleanly or simulate an attack along the way, and see whether the detector catches it." />
      <section className="white two-col verify-layout">
        <div className="form-block">
          <SectionTitle eyebrow="01 / STEP 1" title="Create a signature." />
          <label>MESSAGE TO SIGN<input value={p.message} onChange={(e) => p.setMessage(e.target.value)} /><small className="helper">The text being signed. Verification checks that it hasn't changed.</small></label>
          <label>SECRET KEY (NUMBERS ONLY)<input type="text" inputMode="numeric" autoComplete="off" value={p.secretKey} onChange={(e) => p.setSecretKey(e.target.value.replace(/\D/g, ""))} /><small className="helper">A demo key is prefilled so you can try things right away. In real use, this is a shared secret exchanged privately.</small></label>
          <Slider label="SENTINEL FRACTION" value={p.sentinelFraction} min=".05" max=".4" step=".05" set={p.setSentinelFraction} helper="How much of the transmission is used as hidden tripwires. Higher values make tampering easier to detect." />
          <button className="black-btn" onClick={p.makeSignature} disabled={p.loading}>{p.loading ? "CREATING…" : "CREATE SIGNATURE →"}</button>
          {p.signature && <div className="signature-chip"><b>SIGNATURE CREATED ✓</b><span>Session ID: {p.signature.session_id}</span><span>Now choose a test →</span></div>}
        </div>

        <div className="form-block dark-card" id="verification-tools">
          <SectionTitle eyebrow="02 / STEP 2" title="Put it to the test." dark />
          <label>VERIFIER ID<input value={p.verifierId} onChange={(e) => p.setVerifierId(e.target.value)} /><small className="helper dark-helper">Who is verifying. The default is the registered verifier. Try changing it to see how an unregistered verifier is handled.</small></label>
          <Slider label="CHANNEL NOISE" value={p.noise} min="0" max=".2" step=".01" set={p.setNoise} helper="Random disturbance on the channel, like static on a phone line. A small amount is normal." dark />
          <Slider label="ATTACK STRENGTH" value={p.strength} min="0" max="1" step=".01" set={p.setStrength} helper="How aggressive the simulated attacker is: 0% = no attack, 100% = full attack. Only affects the attack tests." dark />
          <div className="verify-buttons">
            <button className="lime-btn" onClick={() => p.runVerification("none")} disabled={p.loading || !p.signature} title={!p.signature ? "Create a signature first" : "Verify with no injected quantum attack"}>VERIFY (NO ATTACK)</button>
            <button className="outline-btn" onClick={() => p.runVerification("X")} disabled={p.loading || !p.signature} title="Apply an X-Pauli channel attack during verification">TEST X-PAULI ATTACK</button>
            <button className="outline-btn" onClick={() => p.runVerification("intercept_resend")} disabled={p.loading || !p.signature} title="Apply an intercept-resend eavesdropper during verification">TEST INTERCEPT-RESEND</button>
            <button className="outline-btn" onClick={p.runReplay} disabled={p.loading || !p.signature} title="Submit the same signed session a second time, like an attacker re-sending an old message.">TEST REPLAY</button>
            <button className="outline-btn" onClick={p.runForgery} disabled={p.loading} title="Check a signature made with the wrong secret key.">TEST FORGERY</button>
            <button className="outline-btn" onClick={p.runImpersonation} disabled={p.loading} title="Simulate someone pretending to be the real signer.">TEST IMPERSONATION</button>
          </div>
          {!p.signature && <div className="disabled-hint">Create a signature in Step 1 to enable these tests. (Forgery and impersonation work without one.)</div>}
          <button className="tool-link" onClick={() => p.navigate("/simulate")} style={{ display: "block", background: "none", border: 0, padding: 0, color: "inherit", textAlign: "left" }}>Need more scenarios? Open Threat Lab →</button>
          {p.error && <div className="error">{p.error}</div>}
        </div>
      </section>
      <section className="white result-anchor" id="verify-results">
        {!p.result ? <EmptyState text="Results will appear here. Create a signature, then pick a test." /> : <VerificationResults result={p.result} />}
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
      <PageHero number="02" eyebrow="THREAT LAB" dark title={<>FIND THE<br /><em>FINGERPRINT.</em></>} subtitle="Simulate an attack on the quantum channel, or a protocol attack like replay, and see how QSentinel reacts." />
      <section className="lime lab">
        <div className="lab-controls">
          <SectionTitle eyebrow="01 / SCENARIO" title="Inject the threat." />
          <label>ATTACK TYPE<select value={p.attack} onChange={(e) => p.setAttack(e.target.value)}>{attacks.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select><small className="helper">{attackHelp[p.attack]}</small></label>
          <Slider label="ATTACK STRENGTH" value={p.strength} min="0" max="1" step=".01" set={p.setStrength} disabled={p.attack === "none"} helper={p.attack === "none" ? "Disabled for Honest transmission." : "0% means no injected attack; 100% means full attack strength."} />
          <Slider label="CHANNEL NOISE" value={p.noise} min="0" max=".2" step=".01" set={p.setNoise} helper="Random background noise on the channel. Real channels are never perfect, so the detector expects a little." />
          <Slider label="SENTINEL FRACTION" value={p.sentinelFraction} min=".05" max=".4" step=".05" set={p.setSentinelFraction} helper="How much of the transmission is used as hidden tripwires. Higher values make tampering easier to detect." />
          <button className="black-btn wide" onClick={() => p.runSimulation()} disabled={p.loading || !p.online}>{p.loading ? "RUNNING…" : "RUN SIMULATION →"}</button>
          {!p.online && <div className="error">The server is offline right now, so simulations are paused. This page reconnects automatically.</div>}
          <div className="quick-label">QUICK RUN: ONE-CLICK PRESETS</div>
          <small className="helper">Replay, Unauthorized, Forgery and Impersonation test the protocol checks rather than the quantum channel.</small>
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
          <div className={`result-orbit ${decisionTone(d)}`}><span/><span/><span/><b><Scramble text={r ? decisionText(d) : "READY"} /></b></div>
          <p className="result-caption">{r ? reasonFor(r) : "Run a scenario to reveal the channel fingerprint."}</p>
          {r?.fingerprint ? <div className="three-readings">{axisOrder.map((a) => <div key={a}><small>e{a}</small><strong>{fmt(fingerprintOf(r)[a])}</strong><i><em style={{width:`${Math.min(100, Number(fingerprintOf(r)[a] || 0)*100)}%`}}/></i></div>)}</div> : <EmptyState text={r ? "No error rates for this result. It was stopped by a protocol check before any quantum measurement." : "No run yet. Results will appear here."} compact/>}
        </div>
      </section>
      {r && <section className="white result-detail"><Evidence result={r}/><HowToRead result={r}/><div className="result-actions"><button className="black-btn" onClick={() => exportJSON(r, "qsentinel-result.json")}>DOWNLOAD JSON</button><button className="outline-btn dark-outline" onClick={() => exportCSV(axisOrder.map((axis) => ({axis, baseline:r.axis_results?.[axis]?.baseline_rate ?? "", observed:r.axis_results?.[axis]?.observed_rate ?? "", p_value:r.axis_results?.[axis]?.p_value ?? "", reject:r.axis_results?.[axis]?.reject ?? ""})), "qsentinel-result.csv")}>DOWNLOAD CSV</button><span>Saved to Security Log ✓</span></div></section>}
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
  return (
    <section className="evidence">
      <SectionTitle eyebrow="03 / QUANTUM EVIDENCE" title="READ THE FINGERPRINT.">
        <span className={`decision-pill ${decisionTone(resultDecision(r))}`}>{decisionText(resultDecision(r))}</span>
      </SectionTitle>
      {!r?.axis_results && <p className="caption">No quantum measurement was taken for this result. A protocol check stopped it first, so there are no error rates to show.</p>}
      <div className="evidence-grid">
        <div className="chart-card">
          <ResponsiveContainer width="100%" height={330}>
            <BarChart data={data} margin={{top:28,right:20,left:4,bottom:8}}>
              <CartesianGrid stroke="#dedede" vertical={false}/>
              <XAxis dataKey="axis" tick={{fill:"#000",fontSize:14,fontWeight:800}} axisLine={false} tickLine={false}/>
              <YAxis domain={[0,1]} label={{value:"Sentinel error rate",angle:-90,position:"insideLeft",fill:"#000",fontSize:12}} tick={{fill:"#555",fontSize:12}} axisLine={false} tickLine={false}/>
              <ReferenceLine y={0.02} stroke="#888" strokeDasharray="5 5" label={{value:"baseline",position:"insideTopRight",fill:"#666",fontSize:11}}/>
              <ReferenceLine y={threshold} stroke="#000" strokeDasharray="2 4" label={{value:"decision threshold",position:"insideTopRight",fill:"#000",fontSize:11}}/>
              <Tooltip formatter={(v)=>[Number(v).toFixed(3),"error rate"]} contentStyle={{border:"2px solid #000",borderRadius:0}}/>
              <Bar dataKey="value" radius={0} maxBarSize={90}>{data.map((d)=><Cell key={d.axis} fill={d.value > threshold ? "#111" : "#8eea72"}/>)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="axis-list">
          {axisOrder.map((a)=><div className="axis-row" key={a}><span>e{a}</span><b>{fmt(fp[a])}</b><i><em style={{width:`${Math.min(100,Number(fp[a]||0)*100)}%`}}/></i></div>)}
        </div>
      </div>
      <p className="caption">Green bars are within the normal range. Black bars are above the decision threshold.</p>
      <div className="stats-table">
        <div className="stats-head"><span>AXIS</span><span>BASELINE</span><span>OBSERVED</span><span>P-VALUE</span><span>TEST</span></div>
        {axisOrder.map((a)=>{
          const x=r?.axis_results?.[a];
          return <div className="stats-row" key={a}><b>{a}</b><span>{x?fmt(x.baseline_rate):"—"}</span><span>{x?fmt(x.observed_rate):"—"}</span><span>{x?pFmt(x.p_value):"—"}</span><span className={x?(x.reject?"bad":"good"):"neutral"}>{x?(x.reject?"REJECT":"ACCEPT"):"—"}</span></div>;
        })}
      </div>
    </section>
  );
}

function HowToRead({ result }) {
  return (
    <div className="how-read">
      <div>
        <b>HOW TO READ THIS</b>
        <span><strong>Baseline</strong> = the error rate expected on a clean channel.</span>
        <span><strong>Observed</strong> = the error rate actually measured in this run.</span>
        <span><strong>p-value</strong> = the chance of seeing this many errors from normal noise alone. A very small p-value means it's probably not noise.</span>
        <span><strong>Test</strong> = an axis is flagged (REJECT) when its p-value falls below the cutoff α (currently {defaults.alpha}).</span>
      </div>
      <div className="assumption">
        <b>ASSUMPTION</b>
        <span>Results assume the clean-channel baseline is accurate. They are statistical evidence, not a formal security proof.</span>
      </div>
    </div>
  );
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

  const decisionOptions = ["VALID","REJECT","INCONCLUSIVE","REPLAY","UNAUTHORIZED","FORGED_SIGNATURE","SIGNER_ID_MISMATCH","MESSAGE_MISMATCH","PROTOCOL_ANOMALY"];

  return <main>
    <PageHero number="03" eyebrow="SECURITY LOG" dark title={<>KEEP<br /><em>RECEIPTS.</em></>} subtitle="Every verification, replay and simulation is recorded with its fingerprint and decision." />
    <section className="lime log-page">
      <SectionTitle eyebrow="01 / ALL EVENTS" title="THE LOGBOOK." />
      <div className="summary-strip"><div><small>TOTAL EVENTS</small><b>{events.length}</b></div><div><small>ACCEPTED</small><b>{events.filter(e=>e.final_decision==="VALID").length}</b></div><div><small>REJECT</small><b>{events.filter(e=>e.final_decision==="REJECT").length}</b></div><div><small>INCONCLUSIVE</small><b>{events.filter(e=>e.final_decision==="INCONCLUSIVE").length}</b></div><div><small>FALSE ALARMS (CLEAN RUNS)</small><b>{honest.length ? `${((honestRejects/honest.length)*100).toFixed(2)}%` : "—"}</b></div></div>
      <div className="detection-strip"><div><small>QUANTUM ATTACK DETECTION</small><b>{quantum.length ? `${((detected/quantum.length)*100).toFixed(1)}%` : "—"}</b><span>Observed across logged quantum attack runs.</span></div>{byAttack.map(({a,total,detected:d})=><div key={a}><small>{attackNames[a] || a}</small><b>{total ? `${((d/total)*100).toFixed(0)}%` : "—"}</b><span>{d}/{total} detected</span></div>)}</div>
      <div className="log-tools"><div className="filters"><select value={eventFilter} onChange={(e)=>setEventFilter(e.target.value)}><option value="all">All event types</option>{[...new Set(events.map(e=>e.event))].map(e=><option key={e} value={e}>{e.replaceAll("_"," ")}</option>)}</select><select value={decisionFilter} onChange={(e)=>setDecisionFilter(e.target.value)}><option value="all">All decisions</option>{decisionOptions.map(d=><option key={d} value={d}>{decisionText(d)}</option>)}</select><input placeholder="Search events (e.g. replay, intercept)" value={search} onChange={(e)=>setSearch(e.target.value)}/></div><div className="export-buttons"><button className="black-btn" onClick={refreshEvents}>REFRESH →</button><button className="outline-btn" onClick={()=>exportCSV(exportRows,"qsentinel-security-log.csv")}>EXPORT CSV</button><button className="outline-btn" onClick={()=>exportJSON(events,"qsentinel-security-log.json")}>EXPORT JSON</button></div></div>
      <p className="caption">Click any row for details. This page refreshes automatically every few seconds.</p>
      <div className="log-table"><div className="log-head"><span>DATE / TIME</span><span>EVENT</span><span>ATTACK</span><span>ERROR RATES (X · Y · Z)</span><span>DECISION</span></div>{filtered.length===0?<EmptyState text={events.length===0 ? "No events yet. Run a test in Threat Lab or Verify and it will appear here automatically." : "No events match your filters."}/>:filtered.map((e,i)=><div className={`log-entry ${expanded===i?"expanded":""}`} key={`${e.timestamp}-${i}`}><button className="log-row" onClick={()=>setExpanded(expanded===i?null:i)}><span>{new Date(e.timestamp*1000).toLocaleString([], {year:"numeric",month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"})}</span><span>{(e.event||"event").replaceAll("_"," ")}</span><span>{e.attack ? (attackNames[e.attack] || e.attack.replaceAll("_"," ")) : ""}</span><span className="fp-mini">{e.fingerprint ? <><i style={{width:`${Math.min(100,e.fingerprint.X*100)}%`}}/>X {fmt(e.fingerprint.X)} · Y {fmt(e.fingerprint.Y)} · Z {fmt(e.fingerprint.Z)}</> : reasonFor(e)}</span><strong className={decisionTone(e.final_decision)}>{decisionText(e.final_decision)}</strong></button>{expanded===i&&<div className="log-detail"><span><b>Attack strength</b>{e.attack_strength == null ? "—" : `${Math.round(e.attack_strength*100)}%`}</span><span><b>Noise</b>{e.noise_p == null ? "—" : `${Math.round(e.noise_p*100)}%`}</span><span><b>Sentinel fraction</b>{e.sentinel_fraction == null ? "—" : `${Math.round(e.sentinel_fraction*100)}%`}</span><span><b>Run ID</b>{e.run_id || e.session_id || "Not recorded"}</span><span><b>p-values</b>{e.axis_results ? axisOrder.map(a=>`${a}: ${pFmt(e.axis_results[a]?.p_value)}`).join(" · ") : "Not recorded for this event"}</span><span><b>Reason</b>{reasonFor(e)}</span></div>}</div>)}</div>
    </section>
  </main>;
}

function HowItWorks({ navigate }) {
  return <main>
    <PageHero number="04" eyebrow="METHOD" dark title={<>HOW IT<br /><em>WORKS.</em></>} subtitle="From message to verdict in six steps: what happens behind the scenes." />
    <section className="white method-page">
      <div className="method-flow">{[["01","SECRET SCHEDULE","Using the secret key, QSentinel secretly decides which positions carry hidden X, Y or Z \"tripwire\" states."],["02","TELEPORT","The tripwires travel through the same quantum teleportation path as the real message, so they feel the same tampering."],["03","MEASURE","The verifier measures the tripwires and counts the errors on each axis: eX, eY, eZ."],["04","CALIBRATE","QSentinel knows the normal error rate of a clean channel. This is the baseline to compare against."],["05","TEST","For each axis, a statistical test asks: could this many errors be just noise? The answer is the p-value."],["06","DECIDE","The statistical result is combined with protocol checks (replay, verifier identity, message integrity) to give the final verdict."]].map(([n,t,d])=><div key={n}><b>{n}</b><strong>{t}</strong><p>{d}</p></div>)}</div>
      <div className="equation-card"><small>DECISION MODEL</small><code>H₀: θ = θ₀</code><code>p = P(X ≥ observed errors | H₀)</code><code>reject axis if p &lt; α</code><code>REJECT if ≥ 2 axes reject; otherwise INCONCLUSIVE when evidence is insufficient.</code><code>In plain words: assume the channel is clean. If seeing this many errors would be very unlikely, flag the axis.</code></div>
      <div className="method-grid"><div><small>QUANTUM EVIDENCE</small><h2>Axis-resolved fingerprints</h2><p>A single overall error rate can't tell you how the channel was disturbed. Keeping X, Y and Z separate can.</p></div><div><small>PROTOCOL EVIDENCE</small><h2>Nonce + verifier checks</h2><p>Replay and unauthorized-verifier attempts are blocked before any quantum check, so you can tell protocol attacks apart from channel attacks. (A nonce is a one-time session number.)</p></div><div><small>LIMITATION</small><h2>Statistical, not a proof</h2><p>Detection relies on the assumed clean-channel baseline and a finite number of measurements. Some different attacks can look identical to these measurements, so an ACCEPT is not a guarantee.</p></div></div>
      <div className="method-grid">
        <div><small>GLOSSARY</small><h2>Sentinel</h2><p>A hidden "tripwire" quantum state mixed in with the real data. Tampering disturbs it.</p></div>
        <div><small>GLOSSARY</small><h2>Fingerprint</h2><p>The three error rates (eX, eY, eZ). Different attacks leave different fingerprints.</p></div>
        <div><small>GLOSSARY</small><h2>Baseline</h2><p>The error rate expected on a clean channel. Anything well above it is suspicious.</p></div>
        <div><small>GLOSSARY</small><h2>p-value</h2><p>The chance of seeing this many errors from noise alone. Smaller means more suspicious.</p></div>
        <div><small>GLOSSARY</small><h2>Replay</h2><p>Re-sending an old, valid signature session. Blocked because each session number can only be used once.</p></div>
        <div><small>GLOSSARY</small><h2>Forgery / impersonation</h2><p>Signing with the wrong key, or pretending to be the registered signer.</p></div>
      </div>
      <button className="black-btn" onClick={()=>navigate("/simulate")}>TRY IT IN THREAT LAB →</button>
    </section>
  </main>;
}

export default App;