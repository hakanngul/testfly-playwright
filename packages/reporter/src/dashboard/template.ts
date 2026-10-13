import { CLIENT_JS } from './client';
import { CSS } from './styles';
import type { DashboardModel } from './model';

/** Serializes data for safe embedding in a `<script>` element. */
export function escapeJsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** Assembles the dashboard HTML document. */
export function renderHtml(model: DashboardModel): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TestFly Report</title>
<style>${CSS}</style>
</head>
<body>
<header class="top">
  <div class="brand">TestFly <span class="muted">report</span></div>
  <nav id="tabs" role="tablist">
    <button role="tab" data-tab="overview">Overview</button>
    <button role="tab" data-tab="tests">Tests</button>
    <button role="tab" data-tab="radar">Flakiness Radar</button>
    <button role="tab" data-tab="history">History</button>
    <button role="tab" data-tab="heals">Heals</button>
  </nav>
  <button id="theme" class="ghost" title="Toggle light/dark theme" aria-label="Toggle theme">Theme</button>
</header>
<main>
  <section id="view-overview" class="view" role="tabpanel"></section>
  <section id="view-tests" class="view" role="tabpanel" hidden></section>
  <section id="view-radar" class="view" role="tabpanel" hidden></section>
  <section id="view-history" class="view" role="tabpanel" hidden></section>
  <section id="view-heals" class="view" role="tabpanel" hidden></section>
</main>
<script type="application/json" id="tf-data">${escapeJsonForScript(model)}</script>
<script>${CLIENT_JS}</script>
</body>
</html>
`;
}
