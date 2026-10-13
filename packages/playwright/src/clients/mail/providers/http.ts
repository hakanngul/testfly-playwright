import { TestFlyError } from '../../../core/errors';

/** JSON/text fetch helper that maps failures to TF_MAIL_PROVIDER_ERROR. @internal */
export async function providerFetch(provider: string, url: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (cause) {
    throw new TestFlyError('TF_MAIL_PROVIDER_ERROR', `${provider}: request to ${url} failed: ${(cause as Error).message}`, { cause });
  }
  if (!res.ok) {
    throw new TestFlyError('TF_MAIL_PROVIDER_ERROR', `${provider}: ${init.method ?? 'GET'} ${url} answered ${res.status} ${res.statusText}.`, {
      details: { status: res.status },
    });
  }
  return res;
}
