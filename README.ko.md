# slack-pane

[English](README.md) | 한국어

Claude Code 대화 옆 pane에 Slack을 띄우는 mod다. 터미널을 벗어나지 않고 채널과 스레드를 읽고, 메시지와 이미지를 보내고, Slack 메시지를 스레드와 함께 다음 프롬프트에 인용해 Claude가 읽게 할 수 있다.

Claude Code에 이미 연결한 Slack MCP 서버를 통해 Slack과 통신한다. 별도의 Slack 앱이나 토큰이 필요 없다.

## 기능

- **두 열.** 왼쪽 열에는 내가 속한 모든 채널, 비공개 채널, DM, 그룹 DM이 있다. 채널이 먼저, DM이 나중에 오고, 각각 이름순이다. 열린 채널은 `>`와 강조색으로 표시한다. 메시지 검색도 왼쪽 열에 있다. 오른쪽 열에는 열린 채널이나 스레드가 있다.
- **열별 스크롤.** 두 열은 따로 스크롤한다. 마우스 휠은 포인터 아래의 열을 움직인다. 스크롤 키는 메시지를 움직인다. 위로 스크롤한 동안에는 새 메시지가 와도 화면이 움직이지 않는다. 입력창 위의 `▼ Latest · N newer`를 누르면 최신 메시지로 돌아가고, 다시 새 메시지를 따라간다.
- **검색.** 검색어를 입력하고 Enter를 누른다. Slack 검색 문법(`in:`, `from:`, `after:`)을 쓸 수 있다. `☐ From me`는 필터다. 켜면(`☑`) 검색어와 함께, 또는 검색어 없이 내 메시지만 찾는다. 결과마다 채널과 시간, 작성자와 본문을 보여 준다. 결과를 누르면 스레드 화면으로 열리고, `← #channel`을 누르면 채널에서 그 메시지 위치로 간다.
- **Slack 서식.** `*굵게*`, `_기울임_`, `~취소선~`, `` `코드` ``, 코드 블록, `>` 인용은 기호를 빼고 스타일로 그린다. 사람 멘션은 이름으로 보인다.
- **실시간 보기.** 열린 채널이나 스레드만 다시 읽는다. 기본 주기는 10초다. 머리글에 새로고침 상태(`↻ 10s · 14:05:12`, `↻ updating…`, `⏸ paused`, `⚠ failed …`)를 표시한다.
- **보내기.** 빈 입력창에 메시지가 갈 곳(`Message #general`, `Reply in thread · #general`)을 표시한다. Enter를 누르면 바로 보낸다.
- **이미지.** `Attach file`은 파일 경로를 받는다. 파일을 터미널로 끌어다 놓으면 경로가 입력된다. `Paste image`는 클립보드의 이미지를 보낸다(macOS 전용). 메시지 입력창에 입력하거나 붙여넣은 경로가 실제 이미지 파일(`/…` 또는 `~/…`, png, jpg, gif, webp)이면, 그 경로는 글에서 빠지고 첨부로 바뀐다. 그래서 클립보드 이미지를 임시 파일 경로로 붙여넣는 터미널에서도 이미지가 첨부된다.
- **Claude에 인용.** 메시지를 선택하고(다시 누르면 선택이 풀린다) `Quote`를 누른다. 프롬프트 입력창에 짧은 인용 표시가 들어간다. 프롬프트를 보내면 mod가 그 메시지의 스레드 전체를 맥락으로 붙이고, 인용한 메시지 줄에 `▶`를 붙인다. 인용한 내용은 신뢰할 수 없는 데이터로 표시한다.
- **Copy link · Slack ↗.** 선택한 메시지 머리글 오른쪽에 있다. `Copy link`는 메시지의 Slack 링크를 복사한다. `Slack ↗`는 Slack에서 그 메시지를 연다(macOS `open`). 메시지 수정과 삭제는 Slack에서 한다. Slack MCP는 둘 다 지원하지 않는다.

## 요구 사항

- Claude Code 2.1.316 이상.
- Slack MCP 서버 연결(`/mcp` 목록에 보여야 한다. 기본 이름은 `plugin:slack:slack`).
- 대화 옆에 pane을 두려면 전체 화면 모드와 110열 이상의 터미널이 필요하다. 더 좁으면 pane이 프롬프트 위에 놓인다.
- 이미지 업로드에 `curl`, `Paste image`에 `osascript`(macOS)가 필요하다.

## 설치

```
/plugin install slack-pane --marketplace jo-minjun/claude-slack-pane
```

마켓플레이스를 추가할지 물으면 `y`로 답하고, 설치 범위를 고른다.

저장소를 직접 받아 실행하려면 다음과 같이 한다.

```
claude --plugin-dir /path/to/claude-slack-pane
```

## 명령어

| 명령어 | 동작 |
| --- | --- |
| `/slack-pane [#channel \| @user \| channel ID \| message link]` | 인자가 없으면 pane을 열거나 닫는다. 채널이나 DM을 주면 그곳으로 pane을 연다. Slack 메시지 링크를 주면 채널의 그 메시지 위치로 열고, 답글이면 그 스레드를 연다. |
| `/slack-pane-refresh [seconds]` | 새로고침 주기를 보여 주거나 정한다(5–300초). 정한 값은 세션이 바뀌어도 유지된다. |
| `/slack-pane-search <query>` | pane을 열고 메시지를 검색한다. |

## 설정

| 옵션 | 기본값 | 뜻 |
| --- | --- | --- |
| `mcpServer` | `plugin:slack:slack` | `/mcp` 목록에 보이는 Slack MCP 서버 이름. |

## 제한 사항

- Slack MCP는 사람이 읽는 형식의 글을 돌려준다. mod는 이 글을 해석하므로, 글 형식이 바뀌면 해석에 실패할 수 있다. 그때 pane에 `Unrecognized Slack response`가 표시되고, 디버그 로그(`claude --debug`)에 응답의 앞부분이 남는다.
- 읽지 않음 표시, 이모지 그림, 반응(reaction)은 없다.
- 사람 멘션은 Slack이 함께 보내 준 이름으로 표시한다. 그룹 멘션과 이름 없이 온 사람 멘션은 ID(`@subteam^S…`, `@U…`)로 표시한다. Slack MCP로는 그룹 이름을 조회할 수 없다.
- 메시지 입력창과 검색창에서 칸보다 긴 줄은 `…`로 잘리고 줄바꿈되지 않는다. 커서가 칸 밖에 보일 수도 있다. Claude Code 입력창이 그렇게 그린다.
- pane에서는 메시지를 수정하거나 삭제할 수 없다. `Slack ↗`로 그 메시지로 갈 수 있다.
- 보내기 전에 확인 단계가 없다. Enter를 누르기 전에 머리글의 채널을 확인한다.

## 개발

```
claude plugin validate .
claude plugin test .
```

`tsconfig.json`은 Claude Code가 mod를 처음 불러올 때 `.claude-plugin/types/`에 쓰는 타입을 확장한다. 처음 `claude --plugin-dir .` 세션을 연 뒤에 `tsc -p .`를 실행한다.

## 라이선스

MIT
