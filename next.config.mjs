/** @type {import('next').NextConfig} */
const nextConfig = {
  // 같은 프로젝트에서 서버를 하나 더 띄워 볼 때(예: 키 없음 확인)만 다른 폴더를 쓴다
  distDir: process.env.NEXT_DIST_DIR || '.next',
};
export default nextConfig;