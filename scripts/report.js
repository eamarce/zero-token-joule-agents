// Renders a self-contained HTML report (inline SVG, no libraries) from the
// agent's ratio, runs and playbooks. Used by `npm run ctl -- report`.

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt = (x) => Number(x ?? 0).toLocaleString('en-US');
const TYPE_COLOR = { 1: 'var(--t1)', 2: 'var(--t2)', 3: 'var(--t3)' };

function tokensChart(runs) {
  const W = 920;
  const H = 220;
  const pad = { l: 56, r: 12, t: 12, b: 28 };
  const max = Math.max(1, ...runs.map((r) => r.tokens_input + r.tokens_output));
  const bw = (W - pad.l - pad.r) / Math.max(1, runs.length);
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const bars = runs
    .map((r, i) => {
      const v = r.tokens_input + r.tokens_output;
      const x = pad.l + i * bw;
      const h = Math.max(v === 0 ? 2 : 1, H - pad.b - y(v));
      return `<rect x="${x + 1}" y="${H - pad.b - h}" width="${Math.max(1, bw - 2)}" height="${h}" fill="${TYPE_COLOR[r.run_type]}"><title>${esc(r.ID)} ${esc(r.message_id)} · Type ${r.run_type} · ${esc(r.route)} · ${fmt(v)} tokens${r.wrong ? ' · WRONG' : ''}</title></rect>${r.wrong ? `<text x="${x + bw / 2}" y="${H - pad.b - h - 4}" text-anchor="middle" class="warn">!</text>` : ''}`;
    })
    .join('');
  const ticks = [0, 0.5, 1].map((f) => `<text x="${pad.l - 6}" y="${y(max * f) + 4}" text-anchor="end" class="axis">${fmt(Math.round(max * f))}</text><line x1="${pad.l}" x2="${W - pad.r}" y1="${y(max * f)}" y2="${y(max * f)}" class="grid"/>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Tokens per run">${ticks}${bars}<text x="${pad.l}" y="${H - 8}" class="axis">run 1</text><text x="${W - pad.r}" y="${H - 8}" text-anchor="end" class="axis">run ${runs.length}</text></svg>`;
}

function ratioChart(runs) {
  const W = 920;
  const H = 200;
  const pad = { l: 56, r: 12, t: 12, b: 28 };
  const counts = { 1: 0, 2: 0, 3: 0 };
  const pts = runs.map((r, i) => {
    counts[r.run_type]++;
    const total = i + 1;
    return { s1: counts[1] / total, s2: counts[2] / total };
  });
  const x = (i) => pad.l + ((W - pad.l - pad.r) * i) / Math.max(1, pts.length - 1);
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v);
  const area = (lo, hi, color) => {
    if (!pts.length) return '';
    const top = pts.map((p, i) => `${x(i)},${y(hi(p))}`).join(' ');
    const bottom = pts.map((p, i) => `${x(i)},${y(lo(p))}`).reverse().join(' ');
    return `<polygon points="${top} ${bottom}" fill="${color}" opacity="0.9"/>`;
  };
  const ticks = [0, 0.5, 1].map((f) => `<text x="${pad.l - 6}" y="${y(f) + 4}" text-anchor="end" class="axis">${f * 100}%</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Share of runs by type, cumulative">${ticks}
    ${area(() => 0, (p) => p.s1, TYPE_COLOR[1])}
    ${area((p) => p.s1, (p) => p.s1 + p.s2, TYPE_COLOR[2])}
    ${area((p) => p.s1 + p.s2, () => 1, TYPE_COLOR[3])}
    <text x="${pad.l}" y="${H - 8}" class="axis">run 1</text><text x="${W - pad.r}" y="${H - 8}" text-anchor="end" class="axis">run ${pts.length}</text></svg>`;
}

export function renderReport({ ratio, runs, playbooks }) {
  const rows = ratio.rows
    .map((r) => `<tr><td><span class="sw" style="background:${TYPE_COLOR[r.type]}"></span>Type ${r.type}</td><td>${r.runs}</td><td>${r.pct}%</td><td>${fmt(r.tokens)}</td><td>${Math.round(r.tokenShare * 100)}%</td><td>${fmt(r.meanTokens)}</td></tr>`)
    .join('');
  const pbs = playbooks
    .map((p) => `<tr><td>${esc(p.subject_key)} v${p.version}</td><td>${esc(p.status)}</td><td>${p.backtest_matched ?? '–'}/${p.backtest_compared ?? '–'}</td><td>${p.streak}/${p.streak_needed}</td><td>${p.frozen_runs}</td><td>${p.recheck_failures}/${p.max_disagreements}</td><td>${esc(p.signed_by ?? '–')}</td></tr>`)
    .join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Agent Run Report</title>
<style>
:root{--bg:#f7f7f9;--card:#fff;--ink:#16162a;--dim:#5b5b78;--line:#dcdce8;--t1:#0f8a5f;--t2:#d98a00;--t3:#6c3ce0;--warn:#c62828}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0e0e1a;--card:#17172b;--ink:#ececf6;--dim:#a0a0c0;--line:#2c2c4a;--t1:#34c38f;--t2:#f2b84b;--t3:#9b7bff;--warn:#ff6b6b}}
:root[data-theme="dark"]{--bg:#0e0e1a;--card:#17172b;--ink:#ececf6;--dim:#a0a0c0;--line:#2c2c4a;--t1:#34c38f;--t2:#f2b84b;--t3:#9b7bff;--warn:#ff6b6b}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif;padding:24px 16px}
main{max-width:960px;margin:0 auto}h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 8px}.dim{color:var(--dim)}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;overflow-x:auto}
.big{font-size:34px;font-weight:650;letter-spacing:-.5px}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line)}th{color:var(--dim);font-weight:600;font-size:12px;text-transform:uppercase}
.sw{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px}svg{width:100%;height:auto;display:block}.axis{fill:var(--dim);font-size:11px}.grid{stroke:var(--line)}.warn{fill:var(--warn);font-weight:700;font-size:12px}
.legend span{margin-right:14px}
</style></head><body><main>
<h1>Agent run report</h1>
<p class="dim">${ratio.total} runs · model ${esc(ratio.model)}${ratio.model === 'simulated' ? ' (tokens are estimates)' : ''} · profile ${esc(ratio.profile)}</p>
<div class="card"><div class="dim">Type 1 : 2 : 3</div><div class="big">${esc(ratio.ratio)}</div>
<p class="dim">${fmt(ratio.allTokens)} tokens in runs · ${fmt(ratio.proposalTokens)} tokens writing candidate code · ${ratio.wrongServed} wrong answers served (known only because the data is synthetic)</p>
<table><tr><th>Type</th><th>Runs</th><th>Share</th><th>Tokens</th><th>Token share</th><th>Mean / run</th></tr>${rows}</table></div>
<h2>Tokens per run</h2>
<div class="card"><div class="legend dim"><span><span class="sw" style="background:var(--t3)"></span>Type 3 explore</span><span><span class="sw" style="background:var(--t2)"></span>Type 2 playbook</span><span><span class="sw" style="background:var(--t1)"></span>Type 1 no model</span><span class="warn">! wrong answer</span></div>${tokensChart(runs)}</div>
<h2>Share of runs by type, cumulative</h2>
<div class="card">${ratioChart(runs)}</div>
<h2>Playbooks</h2>
<div class="card"><table><tr><th>Playbook</th><th>Status</th><th>Backtest</th><th>Gate 2 streak</th><th>Frozen runs</th><th>Failed re-checks</th><th>Signed by</th></tr>${pbs || '<tr><td colspan="7" class="dim">none yet</td></tr>'}</table></div>
</main></body></html>`;
}
