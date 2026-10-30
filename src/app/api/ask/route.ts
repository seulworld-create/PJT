import { handleAsk } from '@/lib/ask-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Gemini 호출은 이 서버 코드에서만 한다. API 키는 브라우저로 나가지 않는다. */
export async function POST(req: Request) {
  return handleAsk(req);
}