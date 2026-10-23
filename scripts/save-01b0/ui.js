import { createProbeZip, syntheticProbeEntries } from './zip.js';
const byId = id => document.getElementById(id);
const prepare = byId('prepare'), share = byId('share'), cancel = byId('cancel'), link = byId('download'), status = byId('status');
let ready = null, url = null, controller;
const supported = () => {
  try { return Boolean(ready && navigator.share && navigator.canShare?.({ files: [ready] })); }
  catch { return false; }
};
prepare.onclick = async () => {
  controller = new AbortController(); ready = null; share.disabled = true;
  if (url) URL.revokeObjectURL(url); url = null; link.hidden = true;
  prepare.disabled = true; cancel.hidden = false; byId('size').disabled = true; byId('metrics').textContent = '';
  try {
    const result = await createProbeZip({ entries: syntheticProbeEntries(Number(byId('size').value) * 1024 * 1024),
      signal: controller.signal, onProgress: data => { status.textContent = `${Math.round(data.inputBytes / 1024)} KiB 準備中…`; } });
    ready = result.file; url = URL.createObjectURL(ready); link.href = url; link.hidden = false;
    share.disabled = !supported(); status.textContent = supported()
      ? 'ファイル準備完了。保存・共有をタップしてください。'
      : 'ファイル準備完了。ZIPをダウンロードして保存先を確認してください。';
    byId('metrics').textContent = JSON.stringify(result.metrics, null, 2);
  } catch (error) { status.textContent = error.name === 'AbortError' ? '準備をキャンセルしました。' : `準備に失敗しました: ${error.message}`; }
  finally { prepare.disabled = false; cancel.hidden = true; byId('size').disabled = false; }
};
cancel.onclick = () => controller?.abort();
share.onclick = async () => {
  if (!ready || !supported()) return;
  share.disabled = true; prepare.disabled = true;
  try {
    // No ZIP generation or await before this invocation: a fresh explicit tap.
    await navigator.share({ files: [ready] });
    status.textContent = '共有先へ受け渡しました。ファイルの保存先を確認してください。';
  } catch (error) {
    status.textContent = error.name === 'AbortError'
      ? '共有をキャンセルしました。もう一度タップするかダウンロードできます。'
      : '共有できませんでした。ZIPをダウンロードできます。';
  } finally { share.disabled = !supported(); prepare.disabled = false; }
};
