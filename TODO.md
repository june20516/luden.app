# Luden — TODO

## 방향
- luden.app은 루덴의 "존재 증명" 페이지로 유지한다.
- 개별 서비스는 독립 브랜드로 운영하고, 서비스 쪽에서는 루덴을 드러내지 않는다. 약관·개인정보처리방침은 각 서비스 도메인에 둔다.
- 연결은 한 방향으로만 둔다: 루덴을 알게 된 사람은 luden.app에서 서비스를 찾아갈 수 있다.

## 할 일
- [ ] **서비스 목록(Roster)**: `[ ARCADE ROSTER ]`(데스크톱)과 `PRESS START`(모바일) 버튼을 누르면 서비스 목록 오버레이를 연다
  - 목록 데이터는 `public/roster.json`에 둔다 (서비스명, 한 줄 소개, 외부 링크)
  - 목록이 비어 있으면 `COMING SOON` 빈 슬롯을 보여 준다
  - Esc로 닫기, 포커스 가두기, 모션 줄이기 설정에서는 등장 애니메이션 생략
  - 외부 링크는 `rel="noopener"`. 유입 경로까지 숨길지 정해서 `noreferrer` 추가 여부 결정
- [ ] **404 처리**: `wrangler.jsonc`의 `not_found_handling`을 `404-page`로 바꾸고, 같은 CRT 스타일의 `404.html` 추가
- [ ] **폰트 직접 호스팅**: Google Fonts를 걷어내 외부 요청을 없앤다 (방문자 IP가 외부로 전송되지 않게)
- [ ] **문구 정돈**: 전체 카피 검토
  - `contact@luden.studio` → 실제로 받을 수 있는 주소로 확인·교체 (도메인이 luden.app과 다름)
- [ ] **공유 미리보기**: `og:image` 추가
- [x] **배포 자동화 시크릿 등록**: GitHub 저장소에 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` 추가 (`main` 푸시 시 `.github/workflows/deploy.yml`이 배포)
