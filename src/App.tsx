import { Fragment, useState } from "react";
import sloth from "./icon-A.svg";
import { decode, parseInput, type Decoded } from "./lib/decode";
import { assess, type Assessment } from "./lib/rules";
import { gemmaExplain, templateExplanation, GEMMA_MODEL } from "./lib/explain";
import { SAMPLES } from "./samples";
import { formatArg, flagName } from "./lib/format";

const ADDR = /(0x[0-9a-fA-F]{4}…[0-9a-fA-F]{4})/;
const Headline = ({ t }: { t: string }) => <>{t.split(ADDR).map((p, i) => (i % 2 ? <span key={i} className="addr mono">{p}</span> : p))}</>;

type Phase = "idle" | "reading" | "done";
type Gemma = { state: "off" | "loading" | "writing" | "ready" | "failed"; progress: number; mb: number; note?: string };
const mbFrom = (t: string) => { const m = t.match(/(\d+(?:\.\d+)?)\s*MB/i); return m ? Number(m[1]) : null; };

export default function App() {
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [log, setLog] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const [res, setRes] = useState<{ d: Decoded; a: Assessment; explanation: string; by: string } | null>(null);
  const [useGemma, setUseGemma] = useState(true);
  const [gemma, setGemma] = useState<Gemma>({ state: "off", progress: 0, mb: 0 });
  const push = (s: string) => setLog((l) => [...l, s]);

  async function run() {
    setErr(""); setRes(null); setLog([]);
    let input;
    try { input = parseInput(text); } catch (e: any) { setErr(e.message); return; }
    setPhase("reading");
    const d = await decode(input);
    push(`✓ read selector ${d.selector}`);
    push(d.source === "builtin" ? `✓ matched ${d.signature}` : d.source === "4byte" ? `✓ 4byte guess: ${d.signature}` : d.source === "empty" ? "✓ no calldata, plain transfer" : d.lookupFailed ? "· couldn't reach 4byte" : "· selector not recognised");
    const a = assess(d);
    push(`✓ rules done: ${a.verdict}`);
    // Rule-based verdict shows right away; Gemma's words are added when ready.
    setRes({ d, a, explanation: templateExplanation(d, a), by: "template" });
    setPhase("done");
    if (!useGemma) return;
    setGemma((g) => ({ ...g, state: g.state === "ready" ? "writing" : "loading" }));
    try {
      const out = await gemmaExplain(d, a, (p) => {
        const mb = mbFrom(p.text);
        setGemma((g) => ({ state: "loading", progress: p.progress, mb: mb ?? g.mb }));
        if (p.progress >= 1) setGemma((g) => ({ ...g, state: "writing" }));
      });
      setGemma((g) => ({ ...g, state: "ready", progress: 1 }));
      if (out) setRes((r) => (r && r.d === d ? { ...r, explanation: out, by: `Gemma (${GEMMA_MODEL})` } : r));
    } catch (e: any) {
      setGemma((g) => ({ ...g, state: "failed", note: String(e?.message ?? e) }));
    }
  }

  return (
    <div className="page">
      <header><span className="brand"><img src={sloth} alt="" className="logo" width={40} height={40} /><span className="wordmark">SlothSigner</span></span><span className="muted small">Gemma, in your browser · v0.1</span></header>
      <h1>Read it slowly before you sign it.</h1>
      <p className="muted">Paste a transaction, calldata or an approval. You get one plain sentence back.</p>

      <div className="samples">{SAMPLES.map((s) => <button key={s.label} className="chip" onClick={() => { setText(s.value); setPhase("idle"); setRes(null); }}>{s.label}</button>)}</div>
      <textarea className="paste mono" value={text} onChange={(e) => setText(e.target.value)} placeholder={'0x095ea7b3…  or  {"to": "0x…", "data": "0x…", "value": "0x0"}'} spellCheck={false} />
      <div className="row">
        <button className="primary" onClick={run} disabled={phase === "reading"}>Explain this to me</button>
        <label className="small muted"><input type="checkbox" checked={useGemma} onChange={(e) => setUseGemma(e.target.checked)} /> Use Gemma (small 1B model, downloads once)</label>
      </div>
      <p className="small muted">No wallet needed. Nothing gets signed here.</p>
      {err && <p className="err">{err}</p>}

      {phase === "reading" && (
        <section className="thinking">
          <img src={sloth} alt="" className="sloth" width={96} height={96} />
          <h2 className="serif italic">Reading slowly…</h2>
          <p className="muted small">Going through it line by line. Take a sip of something.</p>
          <div className="dots" aria-hidden="true"><span /><span /><span /></div>
          <ul className="mono small">{log.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </section>
      )}

      {res && phase === "done" && (
        <section className="receipt">
          <div className="rhead mono small"><span>RECEIPT</span><span>{new Date().toLocaleString()}</span></div>
          <span className={`label ${res.a.verdict.toLowerCase()}`}>{res.a.verdict.toUpperCase()}</span>
          <p className="verdict serif"><Headline t={res.a.headline} /></p>
          <p className="explain">{res.explanation}</p>
          {gemma.state === "writing" && <p className="small muted">Gemma is writing its explanation…</p>}
          {gemma.state === "failed" && <p className="small muted">Gemma couldn't run here ({gemma.note}). This is the written explanation.</p>}
          <ul className="flags small">{res.a.flags.map((f) => <li key={f.code} title={f.text}><span className={`dot ${f.level.toLowerCase()}`} />{f.level} · {flagName(f.code)}</li>)}</ul>
          <details>
            <summary>Details</summary>
            <dl className="mono small">
              <dt>function</dt><dd>{res.d.signature ?? res.d.selector}</dd>
              {res.d.input.to && <><dt>contract</dt><dd>{res.d.input.to}</dd></>}
              <dt>value</dt><dd>{res.d.input.value.toString()} wei</dd>
              {res.d.args.map((x) => { const f = formatArg(x.name, x.value, res.d.input.to); return <Fragment key={x.name}><dt>{x.name}</dt><dd title={f.raw}>{f.text}{f.raw && f.raw !== f.text && <span className="raw">{f.raw}</span>}</dd></Fragment>; })}
            </dl>
            <ul className="notes small">{res.a.flags.map((f) => <li key={f.code}>{f.text}</li>)}</ul>
            <p className="small muted">Decoded via {res.d.source}. Explanation by {res.by}.</p>
          </details>
        </section>
      )}

      {res && phase === "done" && gemma.state === "loading" && (
        <section className="thinking download">
          <img src={sloth} alt="" className="sloth" width={96} height={96} />
          <p className="serif italic big">Fetching Gemma once. Slowly, like everything here.</p>
          <div className="bar" role="progressbar" aria-valuenow={Math.round(gemma.progress * 100)} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${Math.round(gemma.progress * 100)}%` }} /></div>
          <p className="mono small">{gemma.mb.toFixed(0)} MB · {Math.round(gemma.progress * 100)}%</p>
          <p className="small muted">After this it's cached in your browser, so next time it starts straight away. The verdict above is already final.</p>
        </section>
      )}
      <footer className="small muted"><span>Runs on your device. Nothing leaves your browser except the model download and a 4byte lookup.</span><span>Open source · Gemma via WebLLM</span></footer>
    </div>
  );
}
