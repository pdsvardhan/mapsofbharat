// tests/e2e/feature-verify/oracles/index.ts — mapsofbharat's HELD-OUT oracle registry (ottomate #717, 2026-09-07).
//
// Moved verbatim out of the shared run-matrix.feature-verify.spec.ts, where this project's single oracle sat
// among 350 screenroom ones. No imports on purpose: this repo carries no harness copy, so the runner passes
// what the oracle needs (`rt.harness.ActionLog`) and types stay local. The matrix references oracles by
// NAME only (harness/project-oracles.ts in the shared runner) — it can never inject assertion logic.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Page = any;
type APIRequestContext = any;
type Check = { ok: boolean; detail: string; observed?: unknown; action_log?: unknown };
type OracleFn = (page: Page, api: APIRequestContext, params: any) => Promise<Check>;
interface Runtime { cfg: { instanceUrl: string; projectSlug: string }; matrix: unknown; harness: { ActionLog: new () => any; expect: (...args: any[]) => any } }
interface ProjectOracles { REGISTRY: Record<string, OracleFn>; setApi?: (api: APIRequestContext) => void; setMatrix?: (m: any) => void }

export default function mapsofbharatOracles(rt: Runtime): ProjectOracles {
const cfg = rt.cfg;
const ActionLog = rt.harness.ActionLog;
const expect = rt.harness.expect;
let api: APIRequestContext;
let m: any;
void api; void m;

const REGISTRY: Record<string, OracleFn> = {
  'mob.indicator-switch-verified': async (page, api, params) => {
    const log = new ActionLog();
    const A = params.from, B = params.to;
    const fetchM = async (id: string) => (await (await api.get(`${cfg.instanceUrl}/api/metrics/${id}?level=district`)).json()) as { name: string; stats_count: number };
    const dA = await fetchM(A); const dB = await fetchM(B);
    const legendSum = async () => {
      const c = page.locator('[data-legend-count]'); const n = await c.count();
      if (!n) return null; let s = 0;
      for (let i = 0; i < n; i++) { const t = (await c.nth(i).innerText()).replace(/[^\d]/g, ''); if (t) s += Number(t); }
      return s;
    };
    const errs: string[] = [];
    page.on('pageerror', (e) => errs.push(e.message));
    page.on('console', (mm) => { if (mm.type() === 'error') errs.push(mm.text()); });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    log.step('goto', { url: `/?m=${A}&lvl=district` });
    await page.goto(`/?m=${A}&lvl=district`);
    await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
    await expect(page.getByText(dA.name).first()).toBeVisible({ timeout: 20_000 });
    log.step('click', { role: 'button', name: 'change indicator' });
    await page.getByRole('button', { name: /change indicator|browse indicators/i }).click();
    const dlg = page.getByRole('dialog', { name: /choose an indicator/i });
    await expect(dlg).toBeVisible();
    log.step('pick-category', { category: params.category });
    await dlg.getByRole('button', { name: new RegExp(params.category, 'i') }).first().click();
    log.step('pick-indicator', { indicator: dB.name });
    await dlg.getByRole('button', { name: new RegExp(dB.name, 'i') }).first().click();
    await expect(page).toHaveURL(new RegExp(`[?&]m=${B}(&|$)`), { timeout: 20_000 });
    await expect(page.getByText(dB.name).first()).toBeVisible();
    const sumB = await legendSum();
    log.step('assert-legend-sum', { sumB, stats_count: dB.stats_count });
    const ok = sumB === dB.stats_count && errs.length === 0;
    return { ok, detail: `switch ${A}→${B}: legend sum ${sumB} vs api stats_count ${dB.stats_count}; console errors ${errs.length}`, observed: { sumB, stats_count: dB.stats_count, errors: errs }, action_log: log.toJSON() };
  },
};

return {
  REGISTRY,
  setApi: (a: APIRequestContext) => { api = a; },
  setMatrix: (mm: any) => { m = mm; },
};
}
