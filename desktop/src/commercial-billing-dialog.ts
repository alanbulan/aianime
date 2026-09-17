import { app, dialog, type BrowserWindow, type MessageBoxOptions } from "electron";
import { formatMicroPoints, type CommercialMeteredQuote } from "./commercial-metered-billing.js";

let confirmationTail: Promise<void> = Promise.resolve();

// Native, main-process confirmation cannot be spoofed by content in a model
// response. Cancellation is the default. No merchant credentials reach Renderer.
export async function confirmMeteredBudget(quote: CommercialMeteredQuote, signal: AbortSignal, window: BrowserWindow | null): Promise<boolean> {
  const previous = confirmationTail;
  let release!: () => void;
  confirmationTail = new Promise<void>((resolve) => { release = resolve; });
  try {
    await previous;
    if (signal.aborted || Date.parse(quote.expiresAt) <= Date.now()) return false;
    const zh = app.getLocale().toLowerCase().startsWith("zh");
    const model = quote.publicModelName.replace(/[\u0000-\u001f\u007f]/gu, " ").slice(0, 180);
    const options: MessageBoxOptions = {
      type: "question", title: zh ? "确认本次云端模型消费" : "Confirm this cloud model budget",
      message: model,
      detail: zh
        ? `预计预占：${formatMicroPoints(quote.estimatedMicroPoints)} 积分\n本次最高授权：${formatMicroPoints(quote.maximumMicroPoints)} 积分\n冻结价格版本：v${quote.policyVersion}\n冻结租户倍率：${quote.tenantMultiplier}\n\n按实际用量结算，未使用部分释放。取消不会提交生成；重试不会自动提高预算。`
        : `Estimated hold: ${formatMicroPoints(quote.estimatedMicroPoints)} points\nMaximum authorized charge: ${formatMicroPoints(quote.maximumMicroPoints)} points\nFrozen price version: v${quote.policyVersion}\nFrozen tenant multiplier: ${quote.tenantMultiplier}\n\nFinal billing uses actual usage; unused holds are released. Cancel submits no generation. Retries never increase this budget automatically.`,
      buttons: zh ? ["取消", "确认本次预算"] : ["Cancel", "Authorize this budget"],
      defaultId: 0, cancelId: 0, noLink: true, signal,
    };
    const result = window && !window.isDestroyed() ? await dialog.showMessageBox(window, options) : await dialog.showMessageBox(options);
    return result.response === 1 && !signal.aborted && Date.parse(quote.expiresAt) > Date.now();
  } finally { release(); }
}
