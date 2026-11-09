# 내 곡 서랍 — 배포 안내서

유튜브 링크만 붙여넣으면 곡 제목·가수·노래방 번호를 찾아 저장하는 개인 곡 목록 웹앱이에요.
GitHub Pages(호스팅)와 Firebase(로그인·저장)를 써서 **비용 0원**으로 운영해요.

## 파일 구성

| 파일 | 역할 |
|---|---|
| `index.html` | 앱 화면과 동작 (Firebase 설정값을 여기에 넣어요) |
| `songtools.js` | 유튜브 제목 가져오기, 제목 정리, iTunes 검증, 노래방 번호 조회 |
| `firestore.rules` | "본인만 자기 곡을 읽고 쓸 수 있다"는 보안 규칙 |

---

## 1단계. GitHub에 올리기

1. GitHub 로그인 → 오른쪽 위 **+** → **New repository**
2. Repository name: `song-box` / **Public** 선택 → **Create repository**
   - 무료 계정은 Public 저장소만 GitHub Pages를 쓸 수 있어요. 코드만 공개되고, 곡 목록은 Firebase에 비공개로 저장돼요.
3. **uploading an existing file** 링크 클릭 → `index.html`, `songtools.js`, `firestore.rules`, `README.md` 끌어다 놓기 → **Commit changes**

## 2단계. GitHub Pages 켜기

1. 저장소 → **Settings** → 왼쪽 **Pages**
2. Branch: `main`, 폴더 `/ (root)` → **Save**
3. 1~2분 뒤 위쪽에 주소가 떠요: `https://<GitHub아이디>.github.io/song-box/`
   - 지금 열면 "Firebase 설정값을 아직 넣지 않았어요"가 보이는 게 정상이에요.

## 3단계. Firebase 프로젝트 만들고 설정값 넣기

1. https://console.firebase.google.com 접속 → 평소 쓰는 구글 계정으로 로그인
2. **프로젝트 만들기** → 이름 `song-box` → Google 애널리틱스는 **사용 안 함** → 만들기
3. 프로젝트 첫 화면에서 **웹 아이콘 `</>`** 클릭 → 앱 닉네임 `song-box` → **앱 등록** (Hosting 체크 안 함)
4. 화면에 나온 `const firebaseConfig = { ... }` 안의 값 6개를 복사
5. GitHub 저장소에서 `index.html` 열기 → 연필 아이콘(Edit) → `firebaseConfig` 부분의 `"여기에_붙여넣기"`를 실제 값으로 바꾸기 → **Commit changes**

> apiKey가 공개 저장소에 올라가도 괜찮아요. Firebase의 웹용 키는 원래 공개되는 값이고, 실제 보호는 4단계 보안 규칙이 해요.

## 4단계. 데이터베이스 만들기 (Firestore)

1. Firebase 왼쪽 메뉴 **빌드 → Firestore Database** → **데이터베이스 만들기**
2. 위치: **asia-northeast3 (서울)** → **프로덕션 모드로 시작** → 만들기
3. 위쪽 **규칙** 탭 → 내용을 전부 지우고 `firestore.rules` 내용 붙여넣기 → **게시**

## 5단계. 구글 로그인 켜기

1. 왼쪽 메뉴 **빌드 → Authentication** → **시작하기**
2. **Google** 선택 → **사용 설정** 켜기 → 지원 이메일 선택 → **저장**
3. Authentication 안의 **설정** 탭 → **승인된 도메인** → **도메인 추가** → `<GitHub아이디>.github.io` 입력 → 추가

## 6단계. 써보기

1. `https://<GitHub아이디>.github.io/song-box/` 접속 → **구글 계정으로 시작하기**
2. **+ 곡 추가** → 유튜브 공유 링크 붙여넣기 → 제목·가수가 자동으로 채워지는지 확인
3. 카테고리 **노래방** 선택 → 번호가 자동으로 찾아지는지 확인
4. 폰에서는 브라우저 공유 메뉴의 **홈 화면에 추가**를 하면 앱처럼 쓸 수 있어요.

---

## 자동 찾기는 이렇게 동작해요

1. **유튜브 링크 → 영상 제목·채널명**: noembed, 유튜브 oEmbed (무료, 키 없음)
2. **제목 정리**: `[MV]`, `(Official Video)`, `가사` 같은 표기를 떼고 "가수 - 제목" 패턴을 나눠요.
3. **음원 정보로 검증**: Apple iTunes 검색 API(한국 스토어)에서 공식 곡 제목·가수를 찾아요. 후보가 여러 개면 탭해서 고를 수 있어요.
4. **노래방 번호**: 무료 비공식 API(api.manana.kr)로 TJ·금영 번호를 조회해요. 비공식이라 언젠가 막힐 수 있고, 그때는 "번호를 찾지 못했어요" 안내와 검색 링크가 대신 떠요.

## 문제가 생기면

| 증상 | 확인할 곳 |
|---|---|
| 로그인 창이 뜨다 오류 (`auth/unauthorized-domain`) | 5단계 3번, 승인된 도메인 |
| "곡 목록을 불러오지 못했어요" | 4단계 3번, 보안 규칙 게시 여부 |
| 제목이 안 채워짐 | 유튜브 링크가 비공개·연령제한 영상인지 확인 |
| 노래방 번호가 안 찾아짐 | 최신곡은 아직 등록 전일 수 있어요. 검색 링크로 확인 |
