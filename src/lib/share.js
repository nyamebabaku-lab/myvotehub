import { toast } from '../components/ui';

export const publicUrl = (path) => `${location.origin}${location.pathname}#${path}`;

/** Native share sheet on phones, copy-to-clipboard elsewhere. */
export async function shareLink(url, title) {
  try {
    if (navigator.share) return await navigator.share({ title, url });
    await navigator.clipboard.writeText(url);
    toast.success('Link copied', 'Share it on WhatsApp, X or Instagram');
  } catch {
    /* user cancelled */
  }
}
