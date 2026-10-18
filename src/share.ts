/**
 * Share a result. The Web Share API and the async clipboard both need HTTPS,
 * so plain-HTTP hosting falls back to the old copy command.
 * Resolves to what happened, for the button label.
 */
export async function share(text: string): Promise<'shared' | 'copied' | 'failed'> {
  const url = new URL(import.meta.env.BASE_URL, location.origin).href;
  if (navigator.share) {
    try {
      await navigator.share({ title: document.title, text, url });
      return 'shared';
    } catch (e) {
      // The user closed the share sheet: that's an answer, not a reason to copy instead.
      if ((e as Error).name === 'AbortError') return 'failed';
    }
  }
  const full = `${text} ${url}`;
  try {
    await navigator.clipboard.writeText(full);
    return 'copied';
  } catch {
    /* insecure context or no permission */
  }
  const ta = document.createElement('textarea');
  ta.value = full;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.append(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  return ok ? 'copied' : 'failed';
}
