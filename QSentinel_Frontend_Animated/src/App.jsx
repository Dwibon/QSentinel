import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  createSignature,
  defaults,
  getEvents,
  health,
  replay,
  simulate,
  unauthorized,
  verifySignature
} from "./api";

const BASE_PATH = "/QSentinel";

const routes = [
  ["/", "Home"],
  ["/verify", "Verify"],
  ["/simulate", "Threat Lab"],
  ["/log", "Security Log"]
];

const attacks = [
  ["none", "Honest transmission"],
  ["X", "X-Pauli attack"],
  ["Y", "Y-Pauli attack"],
  ["Z", "Z-Pauli attack"],
  ["intercept_resend", "Intercept-resend"],
  ["z_measure_resend", "Z-measure / resend"]
];

const attackNames = Object.fromEntries(attacks);

function path() {
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
  return value == null ? "—" : Number(value).toFixed(digits);
}

function pFmt(value) {
  if (value == null) return "—";
  if (value === 0) return "0";
  if (value < 0.001) return Number(value).toExponential(2);
  return Number(value).toFixed(3);
}

function decisionText(d) {
  return (
    {
      VALID: "VALID",
      REJECT: "REJECT",
      INCONCLUSIVE: "INCONCLUSIVE",
      REPLAY: "REPLAY DETECTED",
      UNAUTHORIZED: "UNAUTHORIZED",
      PROTOCOL_ANOMALY: "PROTOCOL ANOMALY"
    }[d] ||
    d ||
    "WAITING"
  );
}

function decisionTone(d) {
  if (d === "VALID") return "good";
  if (d === "REJECT") return "bad";
  if (d === "REPLAY" || d === "UNAUTHORIZED") return "warn";
  return "neutral";
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
  const [key, setKey] = useState(String(defaults.key));
  const [verifierId, setVerifierId] = useState("verifier");
  const [lastAction, setLastAction] = useState("No run yet");

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
      setEvents((await getEvents(100)).events || []);
    } catch {
      /* UI remains usable */
    }
  };

  useEffect(() => {
    const checkHealth = () => {
      health()
        .then(() => setOnline(true))
        .catch(() => setOnline(false));
    };

    checkHealth();
    refreshEvents();

    const t = setInterval(() => {
      checkHealth();
      refreshEvents();
    }, 5000);

    return () => clearInterval(t);
  }, []);

  const execute = async (fn, label) => {
    setLoading(true);
    setError("");
    setLastAction(label);

    try {
      const data = await fn();
      setResult(data.result || data);
      await refreshEvents();
      return data;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const runSimulation = (selected = attack) =>
    execute(
      () =>
        simulate(selected, {
          noise_p: Number(noise),
          sentinel_fraction: Number(sentinelFraction),
          attack_strength: Number(strength),
          message
        }),
      `${attackNames[selected] || selected} simulation`
    );

  const runReplay = () => execute(() => replay(), "Replay test");

  const runUnauthorized = () =>
    execute(() => unauthorized(), "Unauthorized verifier test");

  const makeSignature = async () => {
    setLoading(true);
    setError("");
    setLastAction("Creating signature");

    try {
      const data = await createSignature({
        message,
        key,
        sentinel_fraction: sentinelFraction
      });

      setSignature(data.signature);
      setResult(null);
      await refreshEvents();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const runVerification = async (verificationAttack = "none") => {
    if (!signature) {
      setError("Create a signature first.");
      return;
    }

    setLoading(true);
    setError("");
    setLastAction(
      `${attackNames[verificationAttack] || verificationAttack} verification`
    );

    try {
      const data = await verifySignature({
        signature,
        message,
        key,
        attack: verificationAttack,
        attack_strength: strength,
        noise_p: noise,
        verifier_id: verifierId
      });

      setResult(data);
      await refreshEvents();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const fingerprint = result?.fingerprint || {
    X: 0,
    Y: 0,
    Z: 0
  };

  const chartData = useMemo(
    () =>
      ["X", "Y", "Z"].map((axis) => ({
        axis,
        value: Number(fingerprint[axis] || 0)
      })),
    [fingerprint]
  );

  return (
    <div className="site">
      <div className="noise-overlay" />

      <Header
        route={route}
        navigate={navigate}
        online={online}
      />

      <div className="page-transition" key={route}>
        {route === "/" && (
          <Home
            navigate={navigate}
            online={online}
            result={result}
            events={events}
            lastAction={lastAction}
          />
        )}

        {route === "/verify" && (
          <VerifyPage
            {...{
              message,
              setMessage,
              key,
              setKey,
              verifierId,
              setVerifierId,
              signature,
              setSignature,
              loading,
              makeSignature,
              runVerification,
              result,
              error,
              navigate,
              strength,
              setStrength,
              noise,
              setNoise
            }}
          />
        )}

        {route === "/simulate" && (
          <ThreatLab
            {...{
              attack,
              setAttack,
              noise,
              setNoise,
              sentinelFraction,
              setSentinelFraction,
              strength,
              setStrength,
              loading,
              runSimulation,
              runReplay,
              runUnauthorized,
              result,
              error,
              online
            }}
          />
        )}

        {route === "/log" && (
          <SecurityLog
            events={events}
            refreshEvents={refreshEvents}
          />
        )}
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
      <button
        className="wordmark"
        onClick={() => navigate("/")}
      >
        <span className="mark">Q</span>
        <span>QSENTINEL</span>
      </button>

      <nav>
        {routes.map(([p, label]) => (
          <button
            key={p}
            className={route === p ? "active" : ""}
            onClick={() => navigate(p)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="online">
        <i className={online ? "on" : ""} />
        {online ? "ONLINE" : "OFFLINE"}
      </div>
    </header>
  );
}

function Geom({ variant = "grid" }) {
  return (
    <div
      className={`geom ${variant}`}
      aria-hidden="true"
    >
      <span />
      <span />
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}

function SectionTitle({
  eyebrow,
  title,
  dark = false,
  children
}) {
  return (
    <div className={`section-title ${dark ? "dark" : ""}`}>
      <div>
        <small>{eyebrow}</small>
        <h2>{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Home({
  navigate,
  online,
  result,
  events,
  lastAction
}) {
  const decision = result?.final_decision;

  return (
    <main>
      <section className="hero-home black">
        <Geom variant="hero-geom" />

        <div className="hero-copy">
          <p className="kicker">
            NON-ML / TELEPORTATION-BASED QDS
          </p>

          <h1>
            WATCH THE
            <br />
            <em>QUANTUM.</em>
            <br />
            CATCH THE THREAT.
          </h1>

          <p className="hero-lede">
            QSentinel turns hidden Pauli-axis sentinels
            into an observable security fingerprint —
            then lets statistics decide what the channel
            is telling you.
          </p>

          <div className="hero-actions">
            <button
              className="lime-btn"
              onClick={() => navigate("/simulate")}
            >
              RUN A THREAT TEST
            </button>

            <button
              className="text-btn"
              onClick={() => navigate("/verify")}
            >
              VERIFY A SIGNATURE →
            </button>
          </div>
        </div>

        <div className="hero-badge">
          <span>Q</span>
          <b>
            AXIS
            <br />
            SENTINEL
          </b>
        </div>
      </section>

      <section className="lime intro">
        <SectionTitle
          eyebrow="01 / THE IDEA"
          title="A SIGNAL YOU CAN READ."
        />

        <div className="intro-grid">
          <div className="huge-number">01</div>

          <p>
            Secret X, Y and Z eigenstate sentinels travel
            through the same teleportation path as the
            payload. Their error rates form a three-axis
            fingerprint: <b>eX / eY / eZ.</b>
            <br />
            <br />
            Calibrate the honest noise floor, run the exact
            one-sided test, and keep a deliberate
            INCONCLUSIVE tier when the evidence is not
            strong enough.
          </p>
        </div>

        <div className="geo-strip">
          <Geom variant="strip" />
        </div>
      </section>

      <section className="white overview">
        <SectionTitle
          eyebrow="02 / CONTROL ROOM"
          title="FOUR MOVES. ONE CLEAR READ."
        />

        <div className="move-grid">
          {[
            [
              "01",
              "VERIFY",
              "Create or load a QDS signature and check its session-bound sentinel schedule.",
              "/verify"
            ],
            [
              "02",
              "SIMULATE",
              "Inject a quantum-channel attack or protocol scenario and watch the detector respond.",
              "/simulate"
            ],
            [
              "03",
              "READ",
              "Inspect eX, eY, eZ, exact p-values and the multi-axis decision.",
              "/simulate"
            ],
            [
              "04",
              "LOG",
              "Review every replay, unauthorized verification and simulation event in one audit trail.",
              "/log"
            ]
          ].map(([n, t, d, p]) => (
            <button
              className="move-card"
              key={n}
              onClick={() => navigate(p)}
            >
              <span>{n}</span>
              <h3>{t}</h3>
              <p>{d}</p>
              <b>OPEN →</b>
            </button>
          ))}
        </div>
      </section>

      <section className="black status-band">
        <div>
          <small>LAST ACTION</small>
          <strong>{lastAction}</strong>
        </div>

        <div>
          <small>DETECTOR STATE</small>
          <strong className={decisionTone(decision)}>
            {decisionText(decision)}
          </strong>
        </div>

        <div>
          <small>EVENTS</small>
          <strong>
            {events.length.toString().padStart(2, "0")}
          </strong>
        </div>
      </section>
    </main>
  );
}

function VerifyPage(p) {
  const r = p.result;

  const fp = r?.fingerprint || {
    X: 0,
    Y: 0,
    Z: 0
  };

  return (
    <main>
      <section className="page-head lime">
        <Geom variant="page-geom" />

        <div>
          <small>01 / SIGNATURE VERIFICATION</small>

          <h1>
            CHECK THE
            <br />
            <span>QUANTUM.</span>
          </h1>

          <p>
            Create a research-prototype signature,
            then verify it through the same statistical
            detector used by the threat simulator.
          </p>
        </div>
      </section>

      <section className="white two-col">
        <div className="form-block">
          <SectionTitle
            eyebrow="SIGNATURE"
            title="Build the payload."
          />

          <label>
            MESSAGE
            <input
              value={p.message}
              onChange={(e) =>
                p.setMessage(e.target.value)
              }
            />
          </label>

          <label>
            SECRET KEY
            <input
              value={p.key}
              onChange={(e) =>
                p.setKey(e.target.value)
              }
            />
          </label>

          <label>
            SENTINEL FRACTION
            <input
              type="range"
              min=".05"
              max=".4"
              step=".05"
              value={0.2}
              onChange={() => {}}
              disabled
            />
            <span className="range-read">20%</span>
          </label>

          <button
            className="black-btn"
            onClick={p.makeSignature}
            disabled={p.loading}
          >
            {p.loading
              ? "CREATING…"
              : "CREATE SIGNATURE →"}
          </button>

          {p.signature && (
            <div className="signature-chip">
              <b>SESSION CREATED</b>
              <span>
                {p.signature.session_id ||
                  "session-bound"}
              </span>
            </div>
          )}
        </div>

        <div className="form-block dark-card">
          <SectionTitle
            eyebrow="VERIFY"
            title="Put it to the test."
            dark
          />

          <label>
            VERIFIER ID
            <input
              value={p.verifierId}
              onChange={(e) =>
                p.setVerifierId(e.target.value)
              }
            />
          </label>

          <div className="mini-grid">
            <label>
              NOISE
              <input
                type="number"
                min="0"
                max="1"
                step=".01"
                value={p.noise}
                onChange={(e) =>
                  p.setNoise(e.target.value)
                }
              />
            </label>

            <label>
              ATTACK STRENGTH
              <input
                type="number"
                min="0"
                max="1"
                step=".05"
                value={p.strength}
                onChange={(e) =>
                  p.setStrength(e.target.value)
                }
              />
            </label>
          </div>

          <div className="verify-buttons">
            <button
              className="lime-btn"
              onClick={() =>
                p.runVerification("none")
              }
              disabled={p.loading}
            >
              VERIFY CLEAN
            </button>

            <button
              className="outline-btn"
              onClick={() =>
                p.runVerification("X")
              }
              disabled={p.loading}
            >
              TEST X ATTACK
            </button>

            <button
              className="outline-btn"
              onClick={() =>
                p.runVerification(
                  "intercept_resend"
                )
              }
              disabled={p.loading}
            >
              TEST INTERCEPT
            </button>
          </div>

          {p.error && (
            <div className="error">{p.error}</div>
          )}
        </div>
      </section>

      <Evidence result={r} />
    </main>
  );
}

function ThreatLab(p) {
  const r = p.result;

  const fp = r?.fingerprint || {
    X: 0,
    Y: 0,
    Z: 0
  };

  return (
    <main>
      <section className="page-head black">
        <Geom variant="hero-geom" />

        <div>
          <small>02 / THREAT SIMULATOR</small>

          <h1>
            TURN IT
            <br />
            <em>UP.</em>
          </h1>

          <p>
            Choose the disturbance. Set the channel.
            Let the sentinel fingerprint answer.
          </p>
        </div>
      </section>

      <section className="lime lab">
        <div className="lab-controls">
          <SectionTitle
            eyebrow="SCENARIO"
            title="Inject the threat."
          />

          <label>
            ATTACK TYPE
            <select
              value={p.attack}
              onChange={(e) =>
                p.setAttack(e.target.value)
              }
            >
              {attacks.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>

          <Slider
            label="ATTACK STRENGTH"
            value={p.strength}
            min="0"
            max="1"
            step=".01"
            set={p.setStrength}
          />

          <Slider
            label="CHANNEL NOISE"
            value={p.noise}
            min="0"
            max=".2"
            step=".01"
            set={p.setNoise}
          />

          <Slider
            label="SENTINEL FRACTION"
            value={p.sentinelFraction}
            min=".05"
            max=".4"
            step=".05"
            set={p.setSentinelFraction}
          />

          <button
            className="black-btn wide"
            onClick={() => p.runSimulation()}
            disabled={p.loading || !p.online}
          >
            {p.loading
              ? "RUNNING…"
              : "RUN SIMULATION →"}
          </button>

          <div className="quick-grid">
            <button
              onClick={() => {
                p.setAttack("none");
                p.runSimulation("none");
              }}
            >
              HONEST
            </button>

            <button
              onClick={() => {
                p.setAttack("X");
                p.runSimulation("X");
              }}
            >
              X-PAULI
            </button>

            <button onClick={() => p.runReplay()}>
              REPLAY
            </button>

            <button
              onClick={() => p.runUnauthorized()}
            >
              UNAUTHORIZED
            </button>
          </div>
        </div>

        <div className="lab-result">
          <div className="result-orbit">
            <span />
            <span />
            <span />

            <b>
              {r
                ? decisionText(r.final_decision)
                : "READY"}
            </b>
          </div>

          <p className="result-caption">
            {r
              ? attackNames[r.attack] ||
                r.attack ||
                "Protocol event"
              : "Run a scenario to reveal the channel fingerprint."}
          </p>

          <div className="three-readings">
            {["X", "Y", "Z"].map((a) => (
              <div key={a}>
                <small>e{a}</small>

                <strong>{fmt(fp[a])}</strong>

                <i
                  style={{
                    width: `${Math.min(
                      100,
                      fp[a] * 100
                    )}%`
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      <Evidence result={r} />
    </main>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  set
}) {
  return (
    <label className="slider">
      <span>
        {label}
        <b>{Math.round(Number(value) * 100)}%</b>
      </span>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) =>
          set(Number(e.target.value))
        }
      />
    </label>
  );
}

function Evidence({ result }) {
  const r = result;

  const fp = r?.fingerprint || {
    X: 0,
    Y: 0,
    Z: 0
  };

  const data = ["X", "Y", "Z"].map((axis) => ({
    axis,
    value: Number(fp[axis] || 0)
  }));

  return (
    <section className="white evidence">
      <SectionTitle
        eyebrow="03 / QUANTUM EVIDENCE"
        title="READ THE FINGERPRINT."
      >
        <span
          className={`decision-pill ${decisionTone(
            r?.final_decision
          )}`}
        >
          {decisionText(r?.final_decision)}
        </span>
      </SectionTitle>

      <div className="evidence-grid">
        <div className="chart">
          <ResponsiveContainer
            width="100%"
            height={310}
          >
            <BarChart
              data={data}
              margin={{
                top: 20,
                right: 20,
                left: -15,
                bottom: 0
              }}
            >
              <CartesianGrid
                stroke="#e9e9e9"
                vertical={false}
              />

              <XAxis
                dataKey="axis"
                tick={{
                  fill: "#000",
                  fontSize: 15,
                  fontWeight: 800
                }}
                axisLine={false}
                tickLine={false}
              />

              <YAxis
                domain={[0, 1]}
                tick={{ fill: "#666" }}
                axisLine={false}
                tickLine={false}
              />

              <Tooltip
                contentStyle={{
                  border: "2px solid #000",
                  borderRadius: 0,
                  background: "#70ef5d",
                  color: "#000"
                }}
                formatter={(v) => [
                  Number(v).toFixed(3),
                  "error rate"
                ]}
              />

              <Bar
                dataKey="value"
                radius={0}
                maxBarSize={100}
              >
                {data.map((d) => (
                  <Cell
                    key={d.axis}
                    fill={
                      d.value > 0.7
                        ? "#04cb7a"
                        : "#000"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="axis-list">
          {["X", "Y", "Z"].map((a) => (
            <div className="axis-row" key={a}>
              <span>{a}</span>
              <b>{fmt(fp[a])}</b>

              <i>
                <em
                  style={{
                    width: `${Math.min(
                      100,
                      fp[a] * 100
                    )}%`
                  }}
                />
              </i>
            </div>
          ))}
        </div>
      </div>

      <div className="stats-table">
        <div className="stats-head">
          <span>AXIS</span>
          <span>BASELINE</span>
          <span>OBSERVED</span>
          <span>P-VALUE</span>
          <span>TEST</span>
        </div>

        {["X", "Y", "Z"].map((a) => {
          const x = r?.axis_results?.[a];

          return (
            <div className="stats-row" key={a}>
              <b>{a}</b>

              <span>
                {x
                  ? fmt(x.baseline_rate)
                  : "—"}
              </span>

              <span>
                {x
                  ? fmt(x.observed_rate)
                  : "—"}
              </span>

              <span>
                {x ? pFmt(x.p_value) : "—"}
              </span>

              <span
                className={
                  x?.reject ? "bad" : "good"
                }
              >
                {x
                  ? x.reject
                    ? "REJECT"
                    : "ACCEPT"
                  : "—"}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SecurityLog({
  events,
  refreshEvents
}) {
  return (
    <main>
      <section className="page-head black">
        <Geom variant="hero-geom" />

        <div>
          <small>04 / SECURITY LOG</small>

          <h1>
            KEEP
            <br />
            <em>RECEIPTS.</em>
          </h1>

          <p>
            Every meaningful security event belongs
            in the record: simulation, replay,
            unauthorized verification and signature
            checks.
          </p>
        </div>
      </section>

      <section className="lime log-page">
        <SectionTitle
          eyebrow="AUDIT TRAIL"
          title="THE LOGBOOK."
        />

        <div className="log-tools">
          <span>
            {events.length} EVENTS LOADED
          </span>

          <button
            className="black-btn"
            onClick={refreshEvents}
          >
            REFRESH →
          </button>
        </div>

        <div className="log-table">
          <div className="log-head">
            <span>TIME</span>
            <span>EVENT</span>
            <span>ATTACK</span>
            <span>FINGERPRINT</span>
            <span>DECISION</span>
          </div>

          {events.length === 0 ? (
            <div className="empty-log">
              No events yet. Run a simulation or
              verification.
            </div>
          ) : (
            events.map((e, i) => (
              <div
                className="log-row"
                key={`${e.timestamp}-${i}`}
              >
                <span>
                  {new Date(
                    e.timestamp * 1000
                  ).toLocaleString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit"
                  })}
                </span>

                <span>
                  {(e.event || "event").replaceAll(
                    "_",
                    " "
                  )}
                </span>

                <span>
                  {attackNames[e.attack] ||
                    e.attack ||
                    "—"}
                </span>

                <span className="fp-mini">
                  {e.fingerprint
                    ? `X ${fmt(
                        e.fingerprint.X
                      )} · Y ${fmt(
                        e.fingerprint.Y
                      )} · Z ${fmt(
                        e.fingerprint.Z
                      )}`
                    : "—"}
                </span>

                <strong
                  className={decisionTone(
                    e.final_decision
                  )}
                >
                  {decisionText(
                    e.final_decision
                  )}
                </strong>
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}

export default App;