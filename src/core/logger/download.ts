/**
 * Save a blob to the user's disk. Uses the File System Access picker on desktop Chrome and
 * falls back to an <a download> link elsewhere (Android, Firefox, Safari).
 */
export async function saveBlob(blob: Blob, suggestedName: string): Promise<void> {
  const picker = (window as unknown as { showSaveFilePicker?: (o: unknown) => Promise<FileSystemFileHandle> })
    .showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({ suggestedName });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return; // user cancelled
      // fall through to the link method
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function timestampForFilename(d = new Date()): string {
  return d.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}
