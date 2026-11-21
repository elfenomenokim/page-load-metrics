<div align="center">

<img src="https://raw.githubusercontent.com/elfenomenokim/page-load-metrics/main/docs/logo.svg" width="96" height="96" alt="페이지 위의 계기판">

# page-load-metrics

페이지 로딩 속도를 차가운 상태로 세 번 재고, 지난번보다 무엇이 달라졌는지 보여 줍니다.

[English](README.md) · Node 22 이상 · Chrome · 의존성 없음

[![tests](https://github.com/elfenomenokim/page-load-metrics/actions/workflows/tests.yml/badge.svg)](https://github.com/elfenomenokim/page-load-metrics/actions/workflows/tests.yml)
[![npm](https://img.shields.io/npm/v/page-load-metrics)](https://www.npmjs.com/package/page-load-metrics)
[![license](https://img.shields.io/github/license/elfenomenokim/page-load-metrics)](LICENSE)

[설치](#설치) · [빠르게 써 보기](#빠르게-써-보기) · [로그인한 페이지](#로그인한-페이지) · [참고](#참고) · [한계](#한계)

</div>

```console
$ npx page-load-metrics https://example.com
https://example.com  ·  median of 3 cold loads  ·  1350x940

metric              median  rating  change          runs
------------------  ------  ------  --------------  ----
ttfb                117 ms  good    -8 ms (-6%)     3/3
fcp                 188 ms  good    -52 ms (-22%)   3/3
lcp                 236 ms  good    -116 ms (-33%)  3/3
cls                 0       good    0               3/3
blocking            0 ms    good    0 ms            3/3
dom_content_loaded  163 ms          -11 ms (-6%)    3/3
load                164 ms          -11 ms (-6%)    3/3
transfer            1.6 kB          0 kB (0%)       3/3
requests            1               0 (0%)          3/3

LCP element: p "Данный домен предназначен для "
change: against 2026-11-21T03:55:58.056Z
```

<sub>2026-11-21 맥 미니에서 두 번 잰 것 중 두 번째 실행입니다. `change`는 첫 번째와 비교한 값입니다. example.com이 이 기기에 러시아어 문구를 보내서 LCP 문단이 러시아어로 나왔습니다.</sub>

## 필요한 이유

페이지를 고친 뒤 느려졌는지 알고 싶을 때가 있습니다. Lighthouse는 전체 감사와 점수로 답하고,
[web-vitals](https://github.com/GoogleChrome/web-vitals)는 페이지에 심어 배포한 뒤 실제 방문자
기록으로 답합니다. page-load-metrics는 "느려졌나?"라는 좁은 질문에 몇 초 만에 답합니다.

- **매번 차가운 상태.** 실행마다 새 브라우저 공간을 써서 캐시·쿠키·서비스 워커가 남지 않습니다.
  세 번의 중앙값이라 한 번 튀는 값에 흔들리지 않습니다.
- **지난번과 비교.** 결과를 주소와 화면 크기별로 저장하고, 다음 실행에서 차이를 보여 줍니다.
  배포 전후에 한 번씩 돌리면 됩니다.
- **모르는 값은 모름.** 브라우저가 알려 주지 못한 지표는 `n/a`로 나옵니다. 안심되는 0으로
  바꾸지 않습니다.
- **점수가 아니라 원인.** LCP 요소와 그 로딩·그리기 시간, 흔들린 요소, 메인 스레드를 막은
  스크립트, 가장 무거운 파일까지 보여 줍니다.
- **명령이 못 가는 곳에서도.** 측정 코드는 브라우저 스니펫 파일 하나입니다. 로그인한 세션을
  포함해 JavaScript를 실행할 수 있는 곳이면 붙여 넣어 재고, 결과만 요약하면 됩니다.

| | page-load-metrics | Lighthouse | web-vitals |
|---|---|---|---|
| 질문 | 이 페이지가 느려졌나? | 이 페이지는 전체적으로 어떤가? | 실제 방문자에게 얼마나 빠른가? |
| 실행 | 차가운 로딩 3번, 중앙값 | 감사 1번 | 모든 실제 방문 |
| 지난번과 비교 | 됨 | 안 됨(직접 비교) | 분석 도구에서 |
| 페이지 코드 수정 필요 | 아니오 | 아니오 | 예 |
| 느린 휴대폰·회선 흉내 | `--throttle`(Lighthouse 모바일 기준) | 됨 | 실제 기기 |

## 설치

```sh
npx page-load-metrics https://example.com      # 또는: npm install -g page-load-metrics
```

Node 22 이상과 Google Chrome 또는 Chromium이 필요합니다. macOS와 Linux의 흔한 설치 위치에서
Chrome을 찾고, 못 찾으면 `--chrome PATH`나 `CHROME_PATH`로 알려 주면 됩니다.

## 빠르게 써 보기

```sh
page-load-metrics https://example.com              # 1350x940에서 차가운 로딩 3번
page-load-metrics https://example.com --mobile     # 412x915, 모바일 브라우저 정보
page-load-metrics https://example.com --mobile --throttle   # 느린 4G와 CPU 4배 감속, 보급형 휴대폰 수준
page-load-metrics https://example.com --runs 5     # 더 많이 재서 중앙값 안정
page-load-metrics https://example.com --json       # 요약, 직전 실행, 원본 결과 전부
```

기록은 `~/.local/state/page-load-metrics/history.jsonl`에 쌓입니다. 프로젝트별로 따로 두려면
`--store DIR`, 한 번만 재고 남기지 않으려면 `--no-save`를 씁니다.

## 로그인한 페이지

명령은 로그인하지 않은 새 브라우저를 띄웁니다. 로그인이 필요한 페이지는 내 세션에서 스니펫을
돌리고, 명령으로 요약합니다.

1. 로그인한 브라우저에서 페이지를 열고 강력 새로고침합니다.
2. 개발자 도구 콘솔(또는 자동화 도구의 evaluate 명령)에서 `page_load_metrics.js`를 실행합니다.
   JSON 하나가 나오면 파일로 저장합니다.
3. 두 번 더 반복한 뒤 요약합니다.

```sh
page-load-metrics summarize run1.json run2.json run3.json
```

`summarize`도 같은 표를 보여 주고 같은 기록에 남깁니다.

## 동작 방식

```mermaid
flowchart LR
    A[새 브라우저 공간] --> B[페이지 열고 load 대기]
    B --> C[스니펫이 성능 기록을 읽음]
    C --> D[JSON 결과 하나]
    D --> E{3번 했나?}
    E -- 아니오 --> A
    E -- 예 --> F[지표마다 중앙값과 등급]
    F --> G[직전 저장 결과와 비교]
```

명령은 버리는 프로필로 헤드리스 Chrome을 띄우고, Node 내장 WebSocket으로 DevTools Protocol을
씁니다. 스니펫은 `load`를 기다린 뒤 늦은 그리기와 흔들림을 위해 2초 더 기다리고, 브라우저 자신의
성능 기록을 읽습니다.

## 참고

```
page-load-metrics URL [--runs 3] [--mobile | --viewport WxH] [--throttle] [--cpu N] [--settle 2000]
                      [--json] [--no-save] [--store DIR] [--chrome PATH] [--timeout 60000]
page-load-metrics summarize FILE... [--json] [--no-save] [--store DIR]
```

| 지표 | 뜻 | 좋음 / 개선 필요 / 나쁨 |
|---|---|---|
| `ttfb` | 문서의 첫 바이트가 오기까지 | ≤ 800 / ≤ 1800 / 초과 (ms) |
| `fcp` | 첫 내용이 그려지기까지 | ≤ 1800 / ≤ 3000 / 초과 (ms) |
| `lcp` | 가장 큰 내용이 그려지기까지, 그 요소 포함 | ≤ 2500 / ≤ 4000 / 초과 (ms) |
| `cls` | 화면 흔들림 누적(가장 큰 구간) | ≤ 0.1 / ≤ 0.25 / 초과 |
| `blocking` | 첫 그리기 뒤 메인 스레드가 막힌 시간, 총 차단 시간의 근사 | ≤ 200 / ≤ 600 / 초과 (ms) |
| `dom_content_loaded`, `load` | 내비게이션 시간 기록 | 등급 없음 |
| `transfer`, `requests` | 받은 바이트와 요청 수 | 등급 없음 |

등급 기준은 web.dev와 Lighthouse 실험실 기준을 따릅니다. `runs`는 그 지표를 알려 준 실행 수입니다.
스니펫 결과(`--json`의 `results`)에는 LCP 로딩·그리기 분해, 흔들린 요소 상위 목록, 막은 스크립트
상위 목록, 렌더링을 막는 파일, 가장 무거운 파일 8개도 들어 있습니다.

## 한계

- `--throttle` 없이 빠른 기기와 빠른 회선에서 잰 숫자는 낙관적입니다. `--throttle`은 Lighthouse
  모바일 기준을 DevTools Protocol로 적용합니다: 요청 지연 562.5ms, 내려받기 1474.56Kbps, 올리기
  675Kbps, CPU 4배 감속(`--cpu N`으로 배수 변경). CPU 감속은 재는 기기 기준이라 같은 기기에서 잰
  결과끼리 비교하세요. 기록은 감속한 실행과 안 한 실행을 따로 비교합니다.
- 페이지 로딩만 잽니다. 클릭 반응(INP)은 실제 입력이 필요해서 재지 않습니다.
- 스니펫이 도는 페이지만 읽습니다. 다른 출처의 iframe과 워커는 빠집니다.
- `blocking`은 Chrome이 지원하면 긴 애니메이션 프레임을, 아니면 긴 작업을 씁니다. 둘 다 지원하지
  않는 브라우저에서는 `n/a`입니다.
- `load` 뒤 2초만 기다리므로, 그 뒤에도 계속 움직이는 페이지의 흔들림은 덜 잡힐 수 있습니다.

## 기여

이슈와 풀 리퀘스트를 환영합니다. [CONTRIBUTING.md](CONTRIBUTING.md)를 보세요.

## 라이선스

[MIT](LICENSE)
