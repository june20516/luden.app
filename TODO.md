# Luden — TODO

## 방향
- luden.app은 루덴의 "존재 증명" 페이지로 유지한다.
- 개별 서비스는 독립 브랜드로 운영하고, 서비스 쪽에서는 루덴을 드러내지 않는다. 약관·개인정보처리방침은 각 서비스 도메인에 둔다.
- 연결은 한 방향으로만 둔다: 루덴을 알게 된 사람은 luden.app에서 서비스를 찾아갈 수 있다.

## 할 일
- [x] **서비스 목록(Roster)**: 홈의 `PRESS START`(데스크톱·모바일)를 누르면 `/roster` 화면으로 CRT 채널 전환
  - 목록 데이터는 `public/roster.js`의 `ROSTER` 배열 (이름, 소개, 외부 링크, 아이콘은 `public/works/`)
  - 마지막 줄은 `NEW CHALLENGER APPROACHING` 빈 슬롯으로 채운다
  - Esc·BACK으로 복귀, 방향키로 카트리지 이동, 모션 줄이기 설정에서는 즉시 전환
  - 외부 링크는 새 탭, `rel="noopener noreferrer"` (서비스는 독립 브랜드로 운영하므로 유입 경로도 숨김)
- [x] **없는 주소 처리**: 서버 404 대신 클라이언트에서 `/`로 주소를 바꾸고 `<link rel="canonical">`을 화면별로 갱신
  - 서버 404는 Worker 스크립트나 빌드 단계가 필요해서 두지 않았다 (봇 요청이 Worker 과금 대상이 됨)
  - 화면 추가: `index.html`의 `<script id="routes">`에 한 줄 + `[data-view="<key>"]` 화면 마크업, 전환 후 포커스 대상에는 `data-route-focus`
- [ ] **폰트 직접 호스팅**: Google Fonts를 걷어내 외부 요청을 없앤다 (방문자 IP가 외부로 전송되지 않게)
- [ ] **문구 정돈**: 전체 카피 검토
  - `contact@luden.studio` → 실제로 받을 수 있는 주소로 확인·교체 (도메인이 luden.app과 다름)
- [ ] **공유 미리보기**: `og:image` 추가
- [x] **배포 자동화 시크릿 등록**: GitHub 저장소에 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` 추가 (`main` 푸시 시 `.github/workflows/deploy.yml`이 배포)
