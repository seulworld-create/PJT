export type AskErrorCode = 'no_key' | 'bad_key' | 'quota' | 'timeout' | 'failed' | 'bad_request' | 'network';

/** 서버(/api/ask)가 돌려주는 성공 응답 */
export interface AskSuccess {
  ok: true;
  answer: string;
  sites: string[];
  months: string[];
  fields: string[];
  /** 진짜 AI가 아닌 모의 응답이면 true */
  mock: boolean;
}

export interface AskFailure {
  ok: false;
  code: AskErrorCode;
  message: string;
}

export type AskResponse = AskSuccess | AskFailure;

export const ERROR_TITLES: Record<AskErrorCode, string> = {
  no_key: 'AI 연결 실패: API 키가 설정되지 않았습니다',
  bad_key: 'AI 연결 실패: API 키가 올바르지 않습니다',
  quota: 'AI 연결 실패: 사용 한도를 넘었습니다',
  timeout: 'AI 연결 실패: 응답 시간이 초과되었습니다',
  failed: 'AI 연결 실패: AI 서버에서 오류가 났습니다',
  bad_request: 'AI 연결 실패: 보낼 수 없는 질문입니다',
  network: 'AI 연결 실패: 서버에 연결하지 못했습니다',
};
